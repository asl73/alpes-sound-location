// Reçoit la confirmation de paiement de Stripe.
// La décision est prise en base (confirm_payment), sous verrou : un paiement en double, tardif ou
// arrivé après une annulation ne confirme rien et ne prend le matériel de personne ; il est remboursé
// automatiquement, et le client comme l'admin sont prévenus.
import { admin, env, loadBooking, loadSettings, stripeApi } from '../_shared/common.ts'
import { adminEmail, mails, send } from '../_shared/emails.ts'

const enc = new TextEncoder()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Vérifie l'en-tête Stripe-Signature (HMAC SHA-256, tolérance de 5 minutes). */
async function verify(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]))
  const t = parts['t']
  const signatures = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3))
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)))
  const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  return signatures.some((s) => s.length === expected.length && timingSafeEqual(s, expected))
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Rembourse intégralement un paiement Stripe. Renvoie true si Stripe a accepté. */
async function refund(paymentIntent: string, bookingId: string): Promise<boolean> {
  if (!paymentIntent.startsWith('pi_')) return false
  try {
    const r = await stripeApi('refunds', {
      method: 'POST',
      params: { payment_intent: paymentIntent, 'metadata[booking_id]': bookingId },
      idempotencyKey: `remboursement-${paymentIntent}`,
    })
    if (!r.ok) console.error('Remboursement Stripe', r.status, r.data?.error?.message)
    return r.ok
  } catch (e) {
    console.error('Remboursement Stripe', e)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Méthode non autorisée', { status: 405 })
  const payload = await req.text()
  if (!(await verify(payload, req.headers.get('Stripe-Signature'), env('STRIPE_WEBHOOK_SECRET')))) {
    return new Response('Signature invalide', { status: 400 })
  }
  const event = JSON.parse(payload)
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return new Response('ignoré', { status: 200 })
  }
  const session = event.data.object
  if (session.payment_status !== 'paid') return new Response('en attente', { status: 200 })

  const bookingId = String(session.metadata?.booking_id ?? session.client_reference_id ?? '')
  if (!UUID.test(bookingId)) return new Response('réservation inconnue', { status: 200 })
  const amount = Number(session.amount_total ?? 0) / 100
  const ref = String(session.payment_intent ?? session.id)

  const { data, error } = await admin.rpc('confirm_payment', { p_booking: bookingId, p_amount: amount, p_ref: ref })
  if (error) {
    console.error('confirm_payment', error)
    return new Response('erreur', { status: 500 }) // Stripe réessaiera
  }
  const outcome = String(data)

  // Les e-mails et le remboursement ne doivent jamais faire renvoyer l'événement par Stripe.
  try {
    if (outcome === 'confirmee') {
      const [settings, b] = await Promise.all([loadSettings(), loadBooking(bookingId)])
      if (b) await Promise.all([send(mails.paidClient(b, settings)), send(mails.paidAdmin(b, settings, adminEmail(settings)))])
    } else if (outcome.startsWith('rembourser_')) {
      const reason = outcome.slice('rembourser_'.length)
      const refunded = await refund(ref, bookingId)
      if (refunded) {
        const { error: e } = await admin.from('payments').update({ status: 'rembourse' }).eq('provider_ref', ref)
        if (e) console.error('Paiement remboursé', e)
      }
      const [settings, b] = await Promise.all([loadSettings(), loadBooking(bookingId)])
      if (b) {
        await Promise.all([
          send(mails.refundClient(b, settings, amount, reason, refunded)),
          send(mails.refundAdmin(b, settings, adminEmail(settings), amount, reason, refunded)),
        ])
      }
    }
  } catch (e) {
    console.error('Suites du paiement', e)
  }
  return new Response(outcome, { status: 200 })
})

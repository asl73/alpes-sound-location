// Ouvre une page de paiement Stripe pour une réservation : l'acompte, ou la totalité si le client le choisit.
// Réservation directe : le matériel est réservé au client pendant toute la durée de la page de paiement
// (une heure, renouvelable trois fois si le matériel est toujours libre). Devis validé par l'admin : jusqu'à sa date de validité.
import { SITE_URL, admin, callerOf, cors, json, loadBooking, stripeApi, todayParis } from '../_shared/common.ts'
import { range } from '../_shared/emails.ts'

const RETRY = 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.'
const ALREADY_PAID = 'Votre paiement a bien été reçu : la confirmation de la réservation arrive dans quelques instants.'

/** État d'une page de paiement Stripe : open, complete ou expired (null si Stripe ne répond pas). */
async function sessionStatus(id: string): Promise<string | null> {
  const r = await stripeApi(`checkout/sessions/${encodeURIComponent(id)}`)
  return r.ok ? String(r.data.status ?? '') : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  try {
    const caller = await callerOf(req)
    if (!caller) return json({ error: 'Connectez-vous pour régler l’acompte.' }, 401)
    const { booking_id, full } = (await req.json().catch(() => ({}))) as { booking_id?: string; full?: boolean }
    const b = booking_id ? await loadBooking(String(booking_id)) : null
    if (!b || b.user_id !== caller.id) return json({ error: 'Réservation introuvable.' }, 404)
    if (b.status === 'confirmee') return json({ error: 'L’acompte de cette réservation est déjà réglé.' }, 409)
    if (b.status !== 'validee') return json({ error: 'L’acompte ne peut pas être réglé pour cette réservation.' }, 400)
    // Totalité ou acompte (le solde se règle alors le jour de la location)
    const payAll = full === true
    const amount = Math.round(Number((payAll ? b.total : b.deposit_amount) ?? 0) * 100)
    if (amount < 50) return json({ error: 'Le montant à régler n’est pas défini. Contactez-nous.' }, 400)
    const today = todayParis()
    if (b.start_date < today) return json({ error: 'La date de début de la location est passée. Contactez-nous.' }, 400)
    if (!b.hold_until && b.valid_until && b.valid_until < today) return json({ error: 'Ce devis a expiré. Contactez-nous pour le renouveler.' }, 400)

    // Une seule page de paiement à la fois : la précédente est fermée. Si elle vient d'être payée
    // (la confirmation de Stripe n'est pas encore arrivée), on n'en ouvre pas une seconde.
    if (b.stripe_session_id) {
      const prev = await sessionStatus(b.stripe_session_id)
      if (prev === 'complete') return json({ error: ALREADY_PAID }, 409)
      if (prev === 'open') {
        const closed = await stripeApi(`checkout/sessions/${encodeURIComponent(b.stripe_session_id)}/expire`, { method: 'POST' })
        if (!closed.ok && (await sessionStatus(b.stripe_session_id)) === 'complete') return json({ error: ALREADY_PAID }, 409)
      }
    }

    let expiresAt = Math.floor(Date.now() / 1000) + 60 * 60
    if (b.hold_until) {
      // Vérifie que le matériel est toujours libre et le réserve pour la durée du paiement
      const { data, error } = await admin.rpc('refresh_hold', { p_id: b.id })
      if (error) return json({ error: error.code === 'P0001' ? error.message : RETRY }, error.code === 'P0001' ? 409 : 500)
      expiresAt = Math.floor(Date.parse(String(data)) / 1000)
    }

    const session = await stripeApi('checkout/sessions', {
      method: 'POST',
      params: {
        mode: 'payment',
        locale: 'fr',
        // Carte uniquement (Apple Pay et Google Pay compris) : le paiement est immédiat, la réservation est
        // confirmée aussitôt. Depuis la version d'API 2026-09-30 de Stripe, payment_method_types est refusé.
        'allowed_payment_method_types[0]': 'card',
        success_url: `${SITE_URL}/espace-client/reservations/${b.id}?paiement=ok`,
        cancel_url: `${SITE_URL}/espace-client/reservations/${b.id}?paiement=annule`,
        customer_email: b.client_email || caller.email || '',
        client_reference_id: b.id,
        'metadata[booking_id]': b.id,
        'metadata[paiement]': payAll ? 'totalite' : 'acompte',
        'payment_intent_data[metadata][booking_id]': b.id,
        'payment_intent_data[description]': `${payAll ? 'Paiement' : 'Acompte'} ${b.reference}`,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(amount),
        'line_items[0][price_data][product_data][name]': payAll ? `Location ${b.reference}, totalité` : `Acompte réservation ${b.reference}`,
        'line_items[0][price_data][product_data][description]': `Location ${range(b.start_date, b.end_date)}${
          payAll ? '' : `, solde à régler le jour de la location`
        }`,
        expires_at: String(expiresAt),
      },
    })
    if (!session.ok) {
      console.error('Stripe', session.data?.error?.message)
      return json({ error: RETRY }, 502)
    }
    const { error: saveError } = await admin.from('bookings').update({ stripe_session_id: session.data.id }).eq('id', b.id)
    if (saveError) console.error('Enregistrement de la page de paiement', saveError)
    return json({ url: session.data.url })
  } catch (e) {
    console.error(e)
    return json({ error: RETRY }, 500)
  }
})

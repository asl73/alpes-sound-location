// Envoie les e-mails liés aux demandes, réservations et messages de contact.
// Appelée par le site après une action ; vérifie que l'appelant a le droit de la déclencher.
import { admin, callerOf, cors, expireCheckout, isAdmin, json, loadBooking, loadSettings } from '../_shared/common.ts'
import { adminEmail, mails, send } from '../_shared/emails.ts'

const FRESH_MS = 15 * 60 * 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  try {
    const { type, id } = (await req.json()) as { type?: string; id?: string }
    if (!type || !id) return json({ error: 'Requête incomplète' }, 400)
    const settings = await loadSettings()
    const to = adminEmail(settings)

    // Message de contact : envoyé une seule fois, peu après sa création
    if (type === 'contact') {
      const { data: m } = await admin.from('messages').select('*').eq('id', id).maybeSingle()
      if (!m || m.notified || Date.now() - new Date(m.created_at).getTime() > FRESH_MS) return json({ ok: true })
      await admin.from('messages').update({ notified: true }).eq('id', id)
      await send(mails.contactAdmin(m, settings, to))
      return json({ ok: true })
    }

    const caller = await callerOf(req)
    if (!caller) return json({ error: 'Connectez-vous.' }, 401)
    const b = await loadBooking(id)
    if (!b) return json({ error: 'Réservation introuvable' }, 404)
    const callerIsAdmin = await isAdmin(caller.id)
    const done = new Set(b.notified ?? [])
    const mark = (key: string) => admin.from('bookings').update({ notified: [...done, key] }).eq('id', id)

    switch (type) {
      case 'booking_created': {
        // Seules les demandes de devis sont annoncées ici ; une réservation directe l'est au paiement.
        if (caller.id !== b.user_id || b.status !== 'demande' || done.has('created')) break
        if (Date.now() - new Date(b.created_at).getTime() > FRESH_MS) break
        await mark('created')
        await Promise.all([send(mails.createdClient(b, settings)), send(mails.createdAdmin(b, settings, to))])
        break
      }
      case 'booking_cancelled': {
        if ((caller.id !== b.user_id && !callerIsAdmin) || b.status !== 'annulee') break
        // La page de paiement éventuellement ouverte est fermée : plus rien ne peut être payé.
        await expireCheckout(b.stripe_session_id)
        // Annulation par l'admin : pas d'e-mail à lui-même
        if (caller.id !== b.user_id || done.has('cancelled')) break
        await mark('cancelled')
        await send(mails.cancelledAdmin(b, settings, to))
        break
      }
      case 'booking_validated':
        if (callerIsAdmin && b.status === 'validee') await send(mails.validated(b, settings))
        break
      case 'booking_refused':
        if (callerIsAdmin && b.status === 'refusee') {
          await expireCheckout(b.stripe_session_id)
          await send(mails.refused(b, settings))
        }
        break
      case 'booking_paid':
        if (callerIsAdmin && b.status === 'confirmee') await send(mails.paidClient(b, settings))
        break
      default:
        return json({ error: 'Type inconnu' }, 400)
    }
    return json({ ok: true })
  } catch (e) {
    console.error(e)
    return json({ error: 'Envoi impossible pour le moment' }, 500)
  }
})

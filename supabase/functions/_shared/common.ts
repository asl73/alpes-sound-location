// Outils communs aux fonctions serveur (Supabase Edge Functions, Deno).
import { createClient, type User } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name) ?? fallback
  if (!v) throw new Error(`Variable d'environnement ${name} manquante`)
  return v
}

/**
 * Clé serveur fournie automatiquement par Supabase aux fonctions : la nouvelle clé secrète
 * (SUPABASE_SECRET_KEYS, au format JSON) si le projet en a une, sinon l'ancienne clé service_role.
 */
function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const k = keys.default ?? Object.values(keys)[0]
    if (k) return k
  } catch {
    /* format inattendu : on se rabat sur l'ancienne clé */
  }
  return env('SUPABASE_SERVICE_ROLE_KEY')
}

/** Client avec tous les droits : à n'utiliser que côté serveur. */
export const admin = createClient(env('SUPABASE_URL'), serverKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})

export const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://alpes-sound-location.fr').replace(/\/$/, '')

/** Date du jour en France (AAAA-MM-JJ). */
export function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

// Version de l'API Stripe fixée : le mode test et la production se comportent pareil, quelle que soit
// la version par défaut de chaque compte (celle du compte de production refuse payment_method_types).
const STRIPE_VERSION = '2026-10-28.endive'

/** Appel à l'API Stripe avec la clé secrète du site. */
export async function stripeApi(
  path: string,
  init: { method?: 'GET' | 'POST'; params?: Record<string, string>; idempotencyKey?: string } = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> & { error?: { message?: string } } }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(init.params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.params ? new URLSearchParams(init.params) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** Ferme une page de paiement Stripe encore ouverte (sans effet si elle est déjà payée ou expirée). */
export async function expireCheckout(sessionId: string | null | undefined): Promise<void> {
  if (!sessionId) return
  try {
    await stripeApi(`checkout/sessions/${encodeURIComponent(sessionId)}/expire`, { method: 'POST' })
  } catch (e) {
    console.error('Fermeture de la page de paiement', e)
  }
}

/** Utilisateur connecté qui appelle la fonction, d'après son jeton. */
export async function callerOf(req: Request): Promise<User | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user
}

export async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!userId) return false
  const { data } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return !!data?.is_admin
}

export interface CompanySettings {
  name: string
  owner: string
  phone: string
  email: string
  address: string
  postal_code: string
  city: string
  vat_note: string
  mediator_name?: string
  mediator_url?: string
  /** Lien « Laisser un avis » de la fiche Google */
  review_url?: string
}

/** Lien d'avis utilisable (adresse https uniquement), ou null. */
export function reviewUrl(s: Settings): string | null {
  const url = String(s.company.review_url ?? '').trim()
  return /^https:\/\/[^\s"<>]+$/i.test(url) ? url : null
}

export interface Settings {
  company: CompanySettings
  booking: {
    deposit_percent: number
    caution_amount: number
    caution_method: string
    response_delay: string
    balance_note: string
  }
}

export async function loadSettings(): Promise<Settings> {
  const { data, error } = await admin.from('settings').select('data').eq('id', 1).single()
  if (error) throw error
  return data.data as Settings
}

export interface BookingRow {
  id: string
  reference: string
  user_id: string | null
  status: string
  formula: string
  start_date: string
  end_date: string
  delivery_mode: string
  address: string
  technician_evenings: number
  event_type: string
  guests: number | null
  venue: string
  message: string
  client_name: string
  client_email: string
  client_phone: string
  total: number | null
  deposit_amount: number | null
  deposit_paid_amount: number | null
  balance_paid_at: string | null
  caution_amount: number | null
  valid_until: string | null
  hold_until: string | null
  stripe_session_id: string | null
  client_note: string
  notified: string[]
  created_at: string
  booking_items: { name: string; quantity: number; unit_price: number | null; sort: number }[]
}

/** Réservation et ses lignes ; null si elle n'existe pas. Lève une erreur si la base ne répond pas. */
export async function loadBooking(id: string): Promise<BookingRow | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  const { data, error } = await admin.from('bookings').select('*, booking_items(name, quantity, unit_price, sort)').eq('id', id).maybeSingle()
  if (error) throw new Error(`Lecture de la réservation impossible : ${error.message}`)
  if (!data) return null
  data.booking_items.sort((a: { sort: number }, b: { sort: number }) => a.sort - b.sort)
  return data as BookingRow
}

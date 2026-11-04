// Version en ligne : données, comptes et paiements via Supabase et Stripe.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { round2, uid } from '../format'
import type {
  Block,
  Booking,
  BookingItem,
  BookingStatus,
  Catalog,
  ClientSummary,
  ContactMessage,
  Pack,
  Payment,
  Product,
  Profile,
  Service,
  Settings,
  Zone,
} from '../types'
import { compressImage, type Api } from './types'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '')

let client: SupabaseClient | null = null
function sb(): SupabaseClient {
  if (!client) {
    if (!url || !key) throw new Error('Le site n’est pas encore relié à sa base de données (variables VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY).')
    client = createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  }
  return client
}

/** Transforme une erreur technique en message lisible. */
function fail(error: { message?: string; code?: string } | null | undefined, fallback = 'Une erreur est survenue. Réessayez dans un instant.'): never {
  const msg = error?.message ?? ''
  if (/Invalid login credentials/i.test(msg)) throw new Error('E-mail ou mot de passe incorrect.')
  if (/Email not confirmed/i.test(msg)) throw new Error('Confirmez d’abord votre adresse e-mail grâce au lien reçu.')
  if (/User already registered/i.test(msg)) throw new Error('Un compte existe déjà avec cet e-mail. Connectez-vous.')
  if (/Password should be at least/i.test(msg)) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
  if (/rate limit/i.test(msg)) throw new Error('Trop de tentatives. Patientez quelques minutes.')
  if (/Failed to fetch|NetworkError/i.test(msg)) throw new Error('Connexion impossible. Vérifiez votre réseau.')
  // Les messages levés par nos fonctions SQL sont déjà rédigés pour le client.
  if (msg && error?.code && /^P0001$/.test(error.code)) throw new Error(msg)
  throw new Error(msg && /[éèàùç]/.test(msg) ? msg : fallback)
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

function mapItem(r: Record<string, unknown>): BookingItem {
  return {
    id: r.id as string,
    kind: r.kind as BookingItem['kind'],
    ref_id: (r.ref_id as string) ?? null,
    name: r.name as string,
    quantity: Number(r.quantity),
    unit_price: num(r.unit_price),
    sort: Number(r.sort ?? 0),
    components: (r.components as BookingItem['components']) ?? null,
  }
}

function mapBooking(r: Record<string, unknown>): Booking {
  const items = ((r.booking_items as Record<string, unknown>[]) ?? []).map(mapItem).sort((a, b) => a.sort - b.sort)
  const payments = ((r.payments as Record<string, unknown>[]) ?? [])
    .map((p) => ({ ...(p as unknown as Payment), amount: Number(p.amount) }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return {
    ...(r as unknown as Booking),
    admin_note: (r.admin_note as string) ?? '',
    payments,
    caution_amount: num(r.caution_amount),
    total: num(r.total),
    deposit_amount: num(r.deposit_amount),
    deposit_paid_amount: num(r.deposit_paid_amount),
    guests: num(r.guests),
    technician_evenings: Number(r.technician_evenings ?? 0),
    items,
  }
}

function mapProduct(r: Record<string, unknown>): Product {
  return { ...(r as unknown as Product), price_24h: num(r.price_24h), price_weekend: num(r.price_weekend), caution: num(r.caution) }
}

function mapPack(r: Record<string, unknown>): Pack {
  const items = ((r.pack_items as { product_id: string; quantity: number }[]) ?? []).map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }))
  const { pack_items: _ignored, ...rest } = r
  return { ...(rest as unknown as Pack), price_24h: num(r.price_24h), price_weekend: num(r.price_weekend), caution: num(r.caution), items }
}

const BOOKING_SELECT = '*, booking_items(*), payments(id, amount, provider, status, created_at)'

async function notify(type: string, id: string) {
  try {
    await sb().functions.invoke('notify', { body: { type, id } })
  } catch {
    /* l'e-mail est un plus : son échec ne bloque jamais l'action */
  }
}

export const supabaseApi: Api = {
  mode: 'live',

  async loadCatalog() {
    const c = sb()
    const { data: session } = await c.auth.getSession()
    const [cat, prod, packs, serv, zones, settings, priv] = await Promise.all([
      c.from('categories').select('*').order('sort'),
      c.from('products').select('*').order('sort'),
      c.from('packs').select('*, pack_items(product_id, quantity)').order('sort'),
      c.from('services').select('*').order('sort'),
      c.from('zones').select('*').order('sort'),
      c.from('settings').select('data').eq('id', 1).single(),
      // Réglages privés (plafond de chiffre d'affaires) : seul l'admin les reçoit
      session.session ? c.from('admin_settings').select('data').eq('id', 1).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])
    for (const r of [cat, prod, packs, serv, zones, settings]) if (r.error) fail(r.error, 'Le catalogue n’a pas pu être chargé.')
    const privateData = (priv.data?.data ?? {}) as { annual_target?: number | null }
    return {
      categories: cat.data ?? [],
      products: (prod.data ?? []).map(mapProduct),
      packs: (packs.data ?? []).map(mapPack),
      services: (serv.data ?? []).map((s) => ({ ...s, price: num(s.price) })),
      zones: (zones.data ?? []).map((z) => ({ ...z, price: num(z.price) })),
      settings: { ...(settings.data!.data as Settings), annual_target: num(privateData.annual_target) },
    } satisfies Catalog
  },

  async availability(start, end, excludeBookingId) {
    const { data, error } = await sb().rpc('product_availability', { p_start: start, p_end: end, p_exclude: excludeBookingId ?? null })
    if (error) fail(error, 'Les disponibilités n’ont pas pu être vérifiées.')
    const out: Record<string, number> = {}
    for (const row of data as { product_id: string; available: number }[]) out[row.product_id] = Number(row.available)
    return out
  },

  async sendContact(m) {
    const { data, error } = await sb().rpc('submit_contact', { payload: m })
    if (error) fail(error, 'Votre message n’a pas pu être envoyé.')
    if (data) await notify('contact', data as string)
  },

  async currentUser() {
    const { data } = await sb().auth.getSession()
    const user = data.session?.user
    if (!user) return null
    const { data: profile, error } = await sb().from('profiles').select('*').eq('id', user.id).maybeSingle()
    if (error) fail(error)
    return (profile as Profile) ?? { id: user.id, email: user.email ?? '', full_name: '', phone: '', company: '', address: '', is_admin: false, created_at: user.created_at }
  },

  onAuthChange(cb) {
    const { data } = sb().auth.onAuthStateChange(() => setTimeout(cb, 0))
    return () => data.subscription.unsubscribe()
  },

  async signIn(email, password) {
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password })
    if (error) fail(error)
  },

  async signUp({ email, password, full_name, phone }) {
    const { data, error } = await sb().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: full_name.trim(), phone: phone.trim() }, emailRedirectTo: `${SITE_URL}/espace-client` },
    })
    if (error) fail(error)
    return { needsConfirmation: !data.session }
  },

  async signOut() {
    await sb().auth.signOut()
  },

  async requestPasswordReset(email) {
    const { error } = await sb().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${SITE_URL}/nouveau-mot-de-passe` })
    if (error) fail(error)
  },

  async verifyRecovery(tokenHash) {
    // Lien « mot de passe oublié » : fonctionne aussi s'il est ouvert sur un autre appareil que celui de la demande.
    const { error } = await sb().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error) throw new Error('Ce lien n’est plus valable.')
  },

  async updatePassword(password) {
    const { error } = await sb().auth.updateUser({ password })
    if (error) fail(error)
  },

  async updateProfile(patch) {
    const { data: s } = await sb().auth.getSession()
    const id = s.session?.user.id
    if (!id) throw new Error('Connectez-vous pour continuer.')
    const { data, error } = await sb().from('profiles').update(patch).eq('id', id).select('*').single()
    if (error) fail(error)
    return data as Profile
  },

  async createBooking(input) {
    const { data, error } = await sb().rpc('create_booking_request', { payload: input })
    if (error) fail(error, 'Votre demande n’a pas pu être envoyée.')
    const row = (data as { id: string; reference: string; status: BookingStatus }[])[0]
    // Une demande de devis est annoncée tout de suite ; une réservation directe l'est au paiement de l'acompte.
    if (row.status === 'demande') await notify('booking_created', row.id)
    return row
  },

  async myBookings() {
    const { data, error } = await sb().from('bookings').select(BOOKING_SELECT).order('created_at', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(mapBooking)
  },

  async myBooking(id) {
    const { data, error } = await sb().from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
    if (error) fail(error)
    return data ? mapBooking(data) : null
  },

  async cancelBooking(id) {
    const { error } = await sb().rpc('cancel_my_booking', { p_id: id })
    if (error) fail(error)
    await notify('booking_cancelled', id)
  },

  async payDeposit(id, full = false) {
    const { data, error } = await sb().functions.invoke('create-deposit-checkout', { body: { booking_id: id, full } })
    if (error) {
      let msg = 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.'
      try {
        const body = await (error as { context?: Response }).context?.json()
        if (body?.error) msg = body.error
      } catch {
        /* réponse illisible : message générique */
      }
      throw new Error(msg)
    }
    return data as { url: string }
  },

  admin: {
    async bookings() {
      const { data, error } = await sb().from('bookings').select(BOOKING_SELECT).order('created_at', { ascending: false })
      if (error) fail(error)
      return (data ?? []).map(mapBooking)
    },

    async booking(id) {
      const [b, note] = await Promise.all([supabaseApi.myBooking(id), sb().from('booking_notes').select('admin_note').eq('booking_id', id).maybeSingle()])
      if (note.error) fail(note.error)
      return b ? { ...b, admin_note: note.data?.admin_note ?? '' } : null
    },

    async saveBooking(id, patch) {
      const { error } = await sb().rpc('admin_save_booking', { p_id: id, p_patch: patch })
      if (error) fail(error)
    },

    async action(id, action) {
      const { error } = await sb().rpc('admin_booking_action', { p_id: id, p_action: action })
      if (error) fail(error)
      if (action === 'valider') await notify('booking_validated', id)
      if (action === 'refuser') await notify('booking_refused', id)
      if (action === 'annuler') await notify('booking_cancelled', id) // ferme la page de paiement éventuellement ouverte
      if (action === 'acompte_recu') await notify('booking_paid', id)
    },

    async blocks() {
      const { data, error } = await sb().from('blocks').select('*').order('start_date')
      if (error) fail(error)
      return (data ?? []).map((b) => ({ ...b, quantity: num(b.quantity) })) as Block[]
    },

    async saveBlock(b) {
      const row = { product_id: b.product_id, quantity: b.quantity, start_date: b.start_date, end_date: b.end_date, note: b.note.trim().slice(0, 200) }
      const q = b.id ? sb().from('blocks').update(row).eq('id', b.id) : sb().from('blocks').insert(row)
      const { data, error } = await q.select('*').single()
      if (error) fail(error, 'L’indisponibilité n’a pas pu être enregistrée.')
      return { ...data, quantity: num(data.quantity) } as Block
    },

    async deleteBlock(id) {
      const { error } = await sb().from('blocks').delete().eq('id', id)
      if (error) fail(error)
    },

    async saveProduct(p) {
      const { data, error } = await sb().from('products').upsert(p).select('*').single()
      if (error) fail(error, error.code === '23505' ? 'Un autre article utilise déjà cette adresse.' : undefined)
      return mapProduct(data)
    },

    async deleteProduct(id) {
      const { count } = await sb().from('pack_items').select('*', { count: 'exact', head: true }).eq('product_id', id)
      if (count) throw new Error('Cet article fait partie d’un pack. Retirez-le du pack ou masquez-le plutôt.')
      const { error } = await sb().from('products').delete().eq('id', id)
      if (error) fail(error)
    },

    async savePack(p) {
      const { items, ...pack } = p
      const { data, error } = await sb().rpc('admin_save_pack', { p_pack: pack, p_items: items })
      if (error) fail(error, error.code === '23505' ? 'Un autre pack utilise déjà cette adresse.' : undefined)
      return { ...p, id: (data as string) ?? p.id }
    },

    async deletePack(id) {
      const { error } = await sb().from('packs').delete().eq('id', id)
      if (error) fail(error)
    },

    async saveService(s: Service) {
      const { error } = await sb().from('services').upsert(s)
      if (error) fail(error)
    },

    async saveZone(z: Zone) {
      const row = { ...z, id: z.id || uid() }
      const { data, error } = await sb().from('zones').upsert(row).select('*').single()
      if (error) fail(error)
      return { ...data, price: num(data.price) } as Zone
    },

    async deleteZone(id) {
      const { error } = await sb().from('zones').delete().eq('id', id)
      if (error) fail(error)
    },

    async saveSettings(s) {
      // Le plafond de chiffre d'affaires est rangé à part, hors des réglages publics.
      const { annual_target, ...publicSettings } = s
      const [pub, priv] = await Promise.all([
        sb().from('settings').update({ data: publicSettings }).eq('id', 1),
        sb().from('admin_settings').upsert({ id: 1, data: { annual_target } }),
      ])
      if (pub.error) fail(pub.error)
      if (priv.error) fail(priv.error)
    },

    async uploadPhoto(file) {
      const blob = await compressImage(file)
      const path = `catalogue/${uid()}.jpg`
      const { error } = await sb().storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
      if (error) fail(error, 'La photo n’a pas pu être envoyée.')
      return sb().storage.from('photos').getPublicUrl(path).data.publicUrl
    },

    async clients() {
      const [profiles, bookings] = await Promise.all([
        sb().from('profiles').select('*').eq('is_admin', false).order('created_at', { ascending: false }),
        sb().from('bookings').select('user_id, status, total'),
      ])
      if (profiles.error) fail(profiles.error)
      if (bookings.error) fail(bookings.error)
      return (profiles.data as Profile[]).map((p): ClientSummary => {
        const mine = (bookings.data ?? []).filter((b) => b.user_id === p.id)
        const revenue = mine.filter((b) => b.status === 'confirmee' || b.status === 'terminee').reduce((s, b) => s + Number(b.total ?? 0), 0)
        return { ...p, bookings: mine.length, revenue: round2(revenue) }
      })
    },

    async messages() {
      const { data, error } = await sb().from('messages').select('*').order('created_at', { ascending: false })
      if (error) fail(error)
      return data as ContactMessage[]
    },

    async markMessage(id, read) {
      const { error } = await sb().from('messages').update({ read }).eq('id', id)
      if (error) fail(error)
    },

    async deleteMessage(id) {
      const { error } = await sb().from('messages').delete().eq('id', id)
      if (error) fail(error)
    },

    async markRefunded(paymentId) {
      const { error } = await sb().from('payments').update({ status: 'rembourse' }).eq('id', paymentId)
      if (error) fail(error)
    },
  },
}

// Mode démonstration : tout est simulé dans le navigateur (aucun serveur, aucun paiement réel).
import seed from '../../data/seed.json'
import { addDays, isoWeekday, round2, todayParis, uid } from '../format'
import { HOLD_MINUTES, buildQuote, cautionFor, computeAvailability, depositFor, isDirect, isExpired, itemsTotal, needsFor, validateDates } from '../rules'
import type {
  Block,
  Booking,
  BookingItem,
  BookingRequestInput,
  Catalog,
  ContactMessage,
  Profile,
} from '../types'
import { compressImage, type Api } from './types'

interface DemoUser extends Profile {
  password: string
}

interface DemoDB {
  version: 12
  catalog: Catalog
  users: DemoUser[]
  bookings: Booking[]
  blocks: Block[]
  messages: ContactMessage[]
  session: string | null
}

const KEY = 'asl-demo-db'
let memory: DemoDB | null = null
const listeners = new Set<() => void>()

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms))
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const now = () => new Date().toISOString()

function nextFriday(from: string, weeksAhead: number): string {
  let d = addDays(from, 7 * weeksAhead)
  while (isoWeekday(d) !== 5) d = addDays(d, 1)
  return d
}

function makeBooking(
  catalog: Catalog,
  user: DemoUser,
  ref: string,
  partial: Partial<Booking> & Pick<Booking, 'formula' | 'start_date' | 'end_date' | 'delivery_mode' | 'status'>,
  lines: BookingRequestInput['lines'],
): Booking & { quoteReasons: string[] } {
  const q = buildQuote(
    {
      formula: partial.formula,
      lines,
      delivery_mode: partial.delivery_mode,
      zone_id: partial.zone_id ?? null,
      technician_evenings: partial.technician_evenings ?? 0,
    },
    catalog,
  )
  const created = partial.created_at ?? now()
  return {
    quoteReasons: q.quoteReasons,
    id: uid(),
    reference: ref,
    user_id: user.id,
    zone_id: null,
    address: '',
    technician_evenings: 0,
    event_type: '',
    guests: null,
    venue: '',
    message: '',
    client_name: user.full_name,
    client_email: user.email,
    client_phone: user.phone,
    total: q.total,
    deposit_amount: q.deposit,
    deposit_paid_at: null,
    deposit_paid_amount: null,
    balance_paid_at: null,
    caution_amount: q.caution,
    caution_status: 'a_recevoir',
    valid_until: null,
    hold_until: null,
    client_note: '',
    admin_note: '',
    created_at: created,
    updated_at: created,
    items: q.items,
    ...partial,
  }
}

/** Devis chiffré par l'admin : prix de chaque ligne, puis total et acompte. */
function priced(b: Booking, prices: number[], percent: number): Booking {
  b.items = b.items.map((it, i) => ({ ...it, unit_price: prices[i] ?? it.unit_price }))
  b.total = itemsTotal(b.items)
  b.deposit_amount = depositFor(b.total, percent)
  return b
}

function freshDB(): DemoDB {
  const catalog = clone(seed) as unknown as Catalog
  const today = todayParis()
  const year = today.slice(0, 4)
  const P = (slug: string) => catalog.products.find((p) => p.slug === slug)!.id
  const K = (slug: string) => catalog.packs.find((p) => p.slug === slug)!.id
  const zone = (i: number) => catalog.zones[i].id
  const settings = catalog.settings

  const admin: DemoUser = {
    id: 'demo-admin',
    email: 'admin@demo.fr',
    password: 'demo',
    full_name: 'Rémi Aguettaz',
    phone: '07 67 70 64 53',
    company: 'Alpes & Sound Location',
    address: '',
    is_admin: true,
    created_at: now(),
  }
  const camille: DemoUser = {
    id: 'demo-client',
    email: 'client@demo.fr',
    password: 'demo',
    full_name: 'Camille Martin (démo)',
    phone: '06 12 34 56 78',
    company: '',
    address: '12 rue de la Paix, 73000 Chambéry',
    is_admin: false,
    created_at: now(),
  }
  const julien: DemoUser = { ...camille, id: 'demo-julien', email: 'julien@demo.fr', full_name: 'Julien Robert (démo)', phone: '06 98 76 54 32', address: '' }
  const sophie: DemoUser = { ...camille, id: 'demo-sophie', email: 'sophie@demo.fr', full_name: 'Sophie Bernard (démo)', phone: '07 11 22 33 44', address: '' }

  const wedding = nextFriday(today, 3)
  const party = nextFriday(today, 1)
  const past = addDays(nextFriday(today, -5), 0)

  const drafts: Booking[] = [
    makeBooking(catalog, camille, `WEB-${year}-002`, {
      status: 'confirmee',
      formula: 'weekend',
      start_date: wedding,
      end_date: addDays(wedding, 3),
      delivery_mode: 'livraison_installation',
      zone_id: zone(1),
      address: 'Château de Candie, Chambéry',
      event_type: 'Mariage',
      guests: 140,
      venue: 'Château de Candie',
      message: 'Dîner dans la grande salle puis soirée dansante.',
      deposit_paid_at: now(),
      caution_status: 'a_recevoir',
      created_at: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    }, [{ kind: 'pack', ref_id: K('pack-mariage'), quantity: 1 }]),
    priced(
      makeBooking(catalog, camille, `WEB-${year}-003`, {
        status: 'validee',
        formula: 'sur_mesure',
        start_date: addDays(party, 4),
        end_date: addDays(party, 6),
        delivery_mode: 'livraison',
        zone_id: zone(1),
        address: 'Salle de réunion, 73000 Chambéry',
        event_type: 'Événement d’entreprise',
        guests: 60,
        valid_until: addDays(today, 5),
        client_note: 'Bonjour Camille, voici le prix pour vos deux jours de séminaire. Réglez l’acompte pour bloquer les dates.',
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      }, [{ kind: 'pack', ref_id: K('pack-entreprise-ceremonie'), quantity: 1 }]),
      [150, 50],
      settings.booking.deposit_percent,
    ),
    makeBooking(catalog, julien, `WEB-${year}-004`, {
      status: 'demande',
      formula: 'sur_mesure',
      start_date: addDays(party, -1),
      end_date: addDays(party, 3),
      delivery_mode: 'retrait',
      event_type: 'Soirée privée',
      guests: 90,
      message: 'Soirée pour mes 30 ans dans une grange. Je voudrais récupérer le matériel dès le jeudi pour tout installer la veille.',
      created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    }, [
      { kind: 'pack', ref_id: K('pack-soiree'), quantity: 1 },
      { kind: 'product', ref_id: P('uplight-led'), quantity: 4 },
    ]),
    makeBooking(catalog, sophie, `WEB-${year}-001`, {
      status: 'terminee',
      formula: 'weekend',
      start_date: past,
      end_date: addDays(past, 3),
      delivery_mode: 'livraison',
      zone_id: zone(1),
      address: 'Aix-les-Bains',
      event_type: 'Anniversaire',
      deposit_paid_at: new Date(Date.now() - 45 * 86_400_000).toISOString(),
      balance_paid_at: new Date(Date.now() - 34 * 86_400_000).toISOString(),
      caution_status: 'restituee',
      created_at: new Date(Date.now() - 50 * 86_400_000).toISOString(),
    }, [
      { kind: 'product', ref_id: P('sono-1600w-elokance'), quantity: 1 },
      { kind: 'product', ref_id: P('table-de-mixage-2-voies'), quantity: 1 },
      { kind: 'product', ref_id: P('pied-4-par-led'), quantity: 1 },
    ]),
  ]
  const bookings: Booking[] = drafts.map((d) => {
    const { quoteReasons: _q, ...b } = d as Booking & { quoteReasons?: string[] }
    if (b.deposit_paid_at) b.deposit_paid_amount = b.deposit_amount
    return b
  })

  // Indisponibilités posées par Rémi dans le planning
  const blocks: Block[] = [
    { id: uid(), product_id: P('machine-a-fumee-500w'), quantity: null, start_date: addDays(today, 9), end_date: addDays(today, 11), note: 'Révision', created_at: now() },
    { id: uid(), product_id: P('uplight-led'), quantity: 4, start_date: nextFriday(today, 2), end_date: addDays(nextFriday(today, 2), 3), note: 'Location prise par téléphone', created_at: now() },
  ]

  return {
    version: 12,
    catalog,
    users: [admin, camille, julien, sophie],
    bookings,
    blocks,
    messages: [
      {
        id: uid(),
        name: 'Association Les Amis du Lac (démo)',
        email: 'asso@demo.fr',
        phone: '',
        subject: 'Fête du village',
        body: 'Bonjour, louez-vous du matériel pour une fête en extérieur en juillet ? Nous serions environ 300 personnes.',
        read: false,
        created_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
      },
    ],
    session: null,
  }
}

function load(): DemoDB {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw) as DemoDB
      if (db.version === 12) return (memory = db)
    }
  } catch {
    /* stockage indisponible : on reste en mémoire */
  }
  return (memory = freshDB())
}

function save(db: DemoDB) {
  memory = db
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    /* quota ou stockage bloqué : la démo continue en mémoire */
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function currentUserOf(db: DemoDB): DemoUser | null {
  return db.users.find((u) => u.id === db.session) ?? null
}

function requireUser(db: DemoDB): DemoUser {
  const u = currentUserOf(db)
  if (!u) throw new Error('Connectez-vous pour continuer.')
  return u
}

function requireAdmin(db: DemoDB): DemoUser {
  const u = requireUser(db)
  if (!u.is_admin) throw new Error('Accès réservé à l’administrateur.')
  return u
}

const publicProfile = ({ password: _p, ...rest }: DemoUser): Profile => rest

function nextReference(db: DemoDB): string {
  const year = todayParis().slice(0, 4)
  const max = db.bookings
    .filter((b) => b.reference.startsWith(`WEB-${year}-`))
    .reduce((m, b) => Math.max(m, Number(b.reference.slice(9)) || 0), 0)
  return `WEB-${year}-${String(max + 1).padStart(3, '0')}`
}

export const demoApi: Api = {
  mode: 'demo',

  async loadCatalog() {
    await wait(120)
    const db = load()
    const admin = currentUserOf(db)?.is_admin
    const c = clone(db.catalog)
    if (!admin) {
      c.products = c.products.filter((p) => p.visible)
      c.packs = c.packs.filter((p) => p.visible)
      c.services = c.services.filter((s) => s.visible)
    }
    const order = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort
    c.products.sort(order)
    c.packs.sort(order)
    c.services.sort(order)
    c.zones.sort(order)
    c.categories.sort(order)
    return c
  },

  async availability(start, end, excludeBookingId) {
    await wait(150)
    const db = load()
    return computeAvailability(db.catalog.products, db.bookings, db.blocks, start, end, todayParis(), excludeBookingId)
  },

  async sendContact(m) {
    await wait()
    const db = load()
    db.messages.unshift({ id: uid(), ...m, read: false, created_at: now() })
    save(db)
  },

  async currentUser() {
    const u = currentUserOf(load())
    return u ? publicProfile(u) : null
  },

  onAuthChange(cb) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  },

  async signIn(email, password) {
    await wait()
    const db = load()
    const u = db.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.password !== password) throw new Error('E-mail ou mot de passe incorrect.')
    db.session = u.id
    save(db)
    emit()
  },

  async signUp({ email, password, full_name, phone }) {
    await wait()
    const db = load()
    if (db.users.some((x) => x.email.toLowerCase() === email.trim().toLowerCase()))
      throw new Error('Un compte existe déjà avec cet e-mail. Connectez-vous.')
    if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
    const u: DemoUser = {
      id: uid(),
      email: email.trim(),
      password,
      full_name: full_name.trim(),
      phone: phone.trim(),
      company: '',
      address: '',
      is_admin: false,
      created_at: now(),
    }
    db.users.push(u)
    db.session = u.id
    save(db)
    emit()
    return { needsConfirmation: false }
  },

  async signOut() {
    const db = load()
    db.session = null
    save(db)
    emit()
  },

  async requestPasswordReset() {
    await wait()
  },

  async verifyRecovery() {
    await wait()
  },

  async updatePassword(password) {
    await wait()
    const db = load()
    const u = requireUser(db)
    if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.')
    u.password = password
    save(db)
  },

  async updateProfile(patch) {
    await wait()
    const db = load()
    const u = requireUser(db)
    Object.assign(u, patch)
    save(db)
    return publicProfile(u)
  },

  async createBooking(input) {
    await wait(400)
    const db = load()
    const u = requireUser(db)
    const today = todayParis()
    const err = validateDates(input.formula, input.start_date, input.end_date, db.catalog.settings, today)
    if (err) throw new Error(err)
    if (!input.lines.length) throw new Error('Votre devis est vide.')
    if (input.delivery_mode !== 'retrait' && !input.zone_id) throw new Error('Choisissez une zone de livraison.')
    const pending = db.bookings.filter((b) => b.user_id === u.id && (b.status === 'demande' || (b.status === 'validee' && isDirect(b) && !isExpired(b, today)))).length
    if (pending >= db.catalog.settings.booking.max_pending_per_client)
      throw new Error('Vous avez déjà plusieurs demandes ou paiements en attente. Finalisez-les depuis votre espace client.')
    const avail = computeAvailability(db.catalog.products, db.bookings, db.blocks, input.start_date, input.end_date, today)
    for (const [id, needed] of needsFor(input.lines, db.catalog.packs)) {
      if (needed > (avail[id] ?? 0)) {
        const p = db.catalog.products.find((x) => x.id === id)
        throw new Error(`Plus assez de « ${p?.name ?? 'article'} » disponible à ces dates.`)
      }
    }
    if (input.contact.full_name) u.full_name = input.contact.full_name
    if (input.contact.phone) u.phone = input.contact.phone
    const reference = nextReference(db)
    const b = makeBooking(db.catalog, u, reference, {
      status: 'demande',
      formula: input.formula,
      start_date: input.start_date,
      end_date: input.end_date,
      delivery_mode: input.delivery_mode,
      zone_id: input.delivery_mode === 'retrait' ? null : input.zone_id,
      address: input.address,
      technician_evenings: input.technician_evenings,
      event_type: input.event_type,
      guests: input.guests,
      venue: input.venue,
      message: input.message,
    }, input.lines)
    if (b.quoteReasons.length === 0) {
      b.status = 'validee'
      b.hold_until = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
    }
    const { quoteReasons: _r, ...row } = b
    db.bookings.unshift(row)
    save(db)
    return { id: row.id, reference, status: row.status }
  },

  async myBookings() {
    await wait(150)
    const db = load()
    const u = requireUser(db)
    return clone(db.bookings.filter((b) => b.user_id === u.id)).sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async myBooking(id) {
    await wait(120)
    const db = load()
    const u = requireUser(db)
    const b = db.bookings.find((x) => x.id === id && (x.user_id === u.id || u.is_admin))
    return b ? clone(b) : null
  },

  async cancelBooking(id) {
    await wait()
    const db = load()
    const u = requireUser(db)
    const b = db.bookings.find((x) => x.id === id && x.user_id === u.id)
    if (!b || !['demande', 'validee'].includes(b.status)) throw new Error('Cette demande ne peut plus être annulée en ligne. Contactez-nous.')
    b.status = 'annulee'
    b.updated_at = now()
    save(db)
  },

  async payDeposit(id, full = false) {
    await wait()
    const db = load()
    const u = requireUser(db)
    const b = db.bookings.find((x) => x.id === id && x.user_id === u.id)
    if (!b || b.status !== 'validee') throw new Error('L’acompte ne peut pas être réglé pour cette réservation.')
    const today = todayParis()
    if (b.start_date < today) throw new Error('La date de début de la location est passée. Contactez-nous.')
    if (isDirect(b)) {
      if (Date.parse(b.hold_until!) < Date.now() + 35 * 60_000) {
        if ((b.hold_renewals ?? 0) >= 3)
          throw new Error('Le délai pour régler l’acompte est dépassé. Refaites votre réservation : le matériel vous sera de nouveau réservé s’il est libre.')
        const avail = computeAvailability(db.catalog.products, db.bookings, db.blocks, b.start_date, b.end_date, today, b.id)
        const lines = b.items.filter((i) => i.kind === 'product' || i.kind === 'pack').map((i) => ({ kind: i.kind as 'product' | 'pack', ref_id: i.ref_id!, quantity: i.quantity }))
        const packs = db.catalog.packs.map((k) => {
          const item = b.items.find((i) => i.kind === 'pack' && i.ref_id === k.id)
          return item?.components ? { ...k, items: item.components } : k
        })
        for (const [pid, needed] of needsFor(lines, packs)) {
          if (needed > (avail[pid] ?? 0)) {
            const p = db.catalog.products.find((x) => x.id === pid)
            throw new Error(`Plus assez de « ${p?.name ?? 'article'} » disponible à ces dates : le matériel a été réservé entre-temps.`)
          }
        }
        b.hold_until = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
        b.hold_renewals = (b.hold_renewals ?? 0) + 1
        save(db)
      }
    } else if (b.valid_until && b.valid_until < today) throw new Error('Ce devis a expiré. Contactez-nous pour le renouveler.')
    return { url: `/paiement-demo/${id}${full ? '?totalite=1' : ''}` }
  },

  admin: {
    async bookings() {
      await wait(150)
      const db = load()
      requireAdmin(db)
      return clone(db.bookings).sort((a, b) => b.created_at.localeCompare(a.created_at))
    },

    async booking(id) {
      await wait(120)
      const db = load()
      requireAdmin(db)
      const b = db.bookings.find((x) => x.id === id)
      return b ? clone(b) : null
    },

    async saveBooking(id, patch) {
      await wait()
      const db = load()
      requireAdmin(db)
      const b = db.bookings.find((x) => x.id === id)
      if (!b) throw new Error('Réservation introuvable.')
      const items: BookingItem[] = patch.items.map((it, i) => ({
        ...it,
        sort: i,
        components:
          it.kind === 'pack'
            ? it.components ?? db.catalog.packs.find((k) => k.id === it.ref_id)?.items ?? []
            : null,
      }))
      const total = itemsTotal(items)
      Object.assign(b, {
        ...patch,
        items,
        total,
        caution_amount: cautionFor(items, db.catalog),
        deposit_amount: patch.deposit_amount ?? depositFor(total, db.catalog.settings.booking.deposit_percent),
        updated_at: now(),
      })
      save(db)
    },

    async action(id, action) {
      await wait()
      const db = load()
      requireAdmin(db)
      const b = db.bookings.find((x) => x.id === id)
      if (!b) throw new Error('Réservation introuvable.')
      const today = todayParis()
      const settings = db.catalog.settings
      switch (action) {
        case 'valider': {
          if (!['demande', 'validee'].includes(b.status)) throw new Error('Seule une demande en attente peut être validée.')
          if (b.total === null || b.items.some((i) => i.unit_price === null))
            throw new Error('Indiquez un prix pour chaque ligne avant de valider.')
          b.status = 'validee'
          b.hold_until = null
          if (!b.valid_until || b.valid_until < today) b.valid_until = addDays(today, settings.booking.quote_validity_days)
          if (b.deposit_amount === null) b.deposit_amount = depositFor(b.total, settings.booking.deposit_percent)
          break
        }
        case 'refuser':
          if (!['demande', 'validee'].includes(b.status)) throw new Error('Cette réservation ne peut plus être refusée.')
          b.status = 'refusee'
          break
        case 'acompte_recu':
          if (!['demande', 'validee'].includes(b.status)) throw new Error('Action impossible pour ce statut.')
          b.status = 'confirmee'
          b.deposit_paid_at = now()
          b.deposit_paid_amount = b.deposit_amount
          break
        case 'solde_regle':
          b.balance_paid_at = now()
          break
        case 'caution_recue':
          b.caution_status = 'recue'
          break
        case 'caution_restituee':
          b.caution_status = 'restituee'
          break
        case 'terminer':
          if (b.status !== 'confirmee') throw new Error('Seule une réservation confirmée peut être terminée.')
          b.status = 'terminee'
          break
        case 'annuler':
          if (!['demande', 'validee', 'confirmee'].includes(b.status)) throw new Error('Cette réservation ne peut plus être annulée.')
          b.status = 'annulee'
          break
        case 'rouvrir':
          if (!['refusee', 'annulee'].includes(b.status)) throw new Error('Action impossible pour ce statut.')
          b.status = 'demande'
          b.hold_until = null
          break
      }
      b.updated_at = now()
      save(db)
    },

    async blocks() {
      await wait(120)
      const db = load()
      requireAdmin(db)
      return clone(db.blocks).sort((a, b) => a.start_date.localeCompare(b.start_date))
    },

    async saveBlock(bl) {
      await wait()
      const db = load()
      requireAdmin(db)
      if (bl.end_date < bl.start_date) throw new Error('La date de fin doit suivre la date de début.')
      const row: Block = { ...bl, id: bl.id || uid(), note: bl.note.trim().slice(0, 200), created_at: bl.created_at || now() }
      const i = db.blocks.findIndex((x) => x.id === row.id)
      if (i >= 0) db.blocks[i] = row
      else db.blocks.push(row)
      save(db)
      return clone(row)
    },

    async deleteBlock(id) {
      await wait()
      const db = load()
      requireAdmin(db)
      db.blocks = db.blocks.filter((x) => x.id !== id)
      save(db)
    },

    async saveProduct(p) {
      await wait()
      const db = load()
      requireAdmin(db)
      if (db.catalog.products.some((x) => x.slug === p.slug && x.id !== p.id)) throw new Error('Un autre article utilise déjà cette adresse.')
      const i = db.catalog.products.findIndex((x) => x.id === p.id)
      if (i >= 0) db.catalog.products[i] = clone(p)
      else db.catalog.products.push(clone(p))
      save(db)
      return clone(p)
    },

    async deleteProduct(id) {
      await wait()
      const db = load()
      requireAdmin(db)
      if (db.catalog.packs.some((k) => k.items.some((it) => it.product_id === id)))
        throw new Error('Cet article fait partie d’un pack. Retirez-le du pack ou masquez-le plutôt.')
      db.catalog.products = db.catalog.products.filter((x) => x.id !== id)
      save(db)
    },

    async savePack(p) {
      await wait()
      const db = load()
      requireAdmin(db)
      if (db.catalog.packs.some((x) => x.slug === p.slug && x.id !== p.id)) throw new Error('Un autre pack utilise déjà cette adresse.')
      const i = db.catalog.packs.findIndex((x) => x.id === p.id)
      if (i >= 0) db.catalog.packs[i] = clone(p)
      else db.catalog.packs.push(clone(p))
      save(db)
      return clone(p)
    },

    async deletePack(id) {
      await wait()
      const db = load()
      requireAdmin(db)
      db.catalog.packs = db.catalog.packs.filter((x) => x.id !== id)
      save(db)
    },

    async saveService(s) {
      await wait()
      const db = load()
      requireAdmin(db)
      const i = db.catalog.services.findIndex((x) => x.id === s.id)
      if (i >= 0) db.catalog.services[i] = clone(s)
      save(db)
    },

    async saveZone(z) {
      await wait()
      const db = load()
      requireAdmin(db)
      const zone = { ...z, id: z.id || uid() }
      const i = db.catalog.zones.findIndex((x) => x.id === zone.id)
      if (i >= 0) db.catalog.zones[i] = zone
      else db.catalog.zones.push(zone)
      save(db)
      return clone(zone)
    },

    async deleteZone(id) {
      await wait()
      const db = load()
      requireAdmin(db)
      db.catalog.zones = db.catalog.zones.filter((x) => x.id !== id)
      save(db)
    },

    async saveSettings(s) {
      await wait()
      const db = load()
      requireAdmin(db)
      db.catalog.settings = clone(s)
      save(db)
    },

    async uploadPhoto(file) {
      const blob = await compressImage(file, 1000, 0.75)
      return new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('Impossible de lire cette image.'))
        r.readAsDataURL(blob)
      })
    },

    async clients() {
      await wait(150)
      const db = load()
      requireAdmin(db)
      return db.users
        .filter((u) => !u.is_admin)
        .map((u) => {
          const mine = db.bookings.filter((b) => b.user_id === u.id)
          const revenue = mine
            .filter((b) => b.status === 'confirmee' || b.status === 'terminee')
            .reduce((s, b) => s + (b.total ?? 0), 0)
          return { ...publicProfile(u), bookings: mine.length, revenue: round2(revenue) }
        })
    },

    async messages() {
      await wait(120)
      const db = load()
      requireAdmin(db)
      return clone(db.messages)
    },

    async markMessage(id, read) {
      const db = load()
      requireAdmin(db)
      const m = db.messages.find((x) => x.id === id)
      if (m) m.read = read
      save(db)
    },

    async deleteMessage(id) {
      const db = load()
      requireAdmin(db)
      db.messages = db.messages.filter((x) => x.id !== id)
      save(db)
    },

    async markRefunded(paymentId) {
      const db = load()
      requireAdmin(db)
      for (const b of db.bookings) for (const p of b.payments ?? []) if (p.id === paymentId) p.status = 'rembourse'
      save(db)
    },
  },

  demo: {
    async loginAs(role) {
      const db = load()
      db.session = role === 'admin' ? 'demo-admin' : 'demo-client'
      save(db)
      emit()
    },
    async completePayment(id, full = false) {
      await wait(600)
      const db = load()
      const b = db.bookings.find((x) => x.id === id)
      if (!b || b.status !== 'validee') throw new Error('Cette réservation n’attend pas de paiement.')
      const amount = (full ? b.total : b.deposit_amount) ?? 0
      b.status = 'confirmee'
      b.deposit_paid_at = now()
      b.deposit_paid_amount = amount
      if (full) b.balance_paid_at = now() // totalité payée : plus rien à encaisser le jour J
      b.payments = [...(b.payments ?? []), { id: uid(), amount, provider: 'stripe', status: 'paid', created_at: now() }]
      b.updated_at = now()
      save(db)
    },
    async reset() {
      memory = freshDB()
      save(memory)
      emit()
    },
  },
}

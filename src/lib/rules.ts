// Règles métier partagées par le site et le mode démo.
// Elles reproduisent celles de la base de données (supabase/migrations) :
// si vous modifiez l'une, modifiez l'autre.
import { addDays, diffDays, isoWeekday, round2 } from './format'
import type {
  Block,
  Booking,
  BookingItem,
  BookingStatus,
  CartLine,
  Catalog,
  DeliveryMode,
  Formula,
  LineKind,
  Pack,
  PackItem,
  Product,
  Settings,
} from './types'

export const FORMULAS: Record<Formula, { label: string; short: string }> = {
  '24h': { label: 'Forfait 24 h', short: '24 h' },
  weekend: { label: 'Forfait week-end', short: 'Week-end' },
  sur_mesure: { label: 'Durée sur mesure', short: 'Sur mesure' },
}

export function deliveryLabel(mode: DeliveryMode, settings?: Settings): string {
  switch (mode) {
    case 'retrait':
      return `Retrait à ${settings?.company.city ?? 'La Chavanne'}`
    case 'livraison':
      return 'Livraison et reprise'
    case 'livraison_installation':
      return 'Livraison, installation et démontage'
  }
}

export const DELIVERY_HELP: Record<DeliveryMode, string> = {
  retrait: 'Vous venez chercher le matériel et le rapportez à la fin de la location.',
  livraison: 'Nous déposons le matériel sur place et revenons le chercher.',
  livraison_installation: 'Nous livrons, installons et réglons le matériel, puis le démontons après l’événement.',
}

export type Tone = 'info' | 'warn' | 'ok' | 'muted' | 'bad'

export const STATUS: Record<BookingStatus, { client: string; admin: string; tone: Tone }> = {
  demande: { client: 'Devis en préparation', admin: 'Demande de devis', tone: 'info' },
  validee: { client: 'Paiement à régler', admin: 'Paiement attendu', tone: 'warn' },
  confirmee: { client: 'Réservation confirmée', admin: 'Confirmée', tone: 'ok' },
  terminee: { client: 'Terminée', admin: 'Terminée', tone: 'muted' },
  refusee: { client: 'Non retenue', admin: 'Refusée', tone: 'bad' },
  annulee: { client: 'Annulée', admin: 'Annulée', tone: 'muted' },
}

/** La réservation a été payée en totalité dès la réservation. */
export function isPaidInFull(b: Pick<Booking, 'total' | 'deposit_paid_amount'>): boolean {
  return b.total !== null && b.deposit_paid_amount !== null && b.deposit_paid_amount >= b.total
}

/**
 * Caution demandée : la caution habituelle, ou celle d'un article ou d'un pack loué si elle est
 * plus élevée (comme la base de données).
 */
export function cautionFor(
  lines: { kind: string; ref_id: string | null; components?: PackItem[] | null }[],
  catalog: Pick<Catalog, 'products' | 'packs' | 'settings'>,
): number {
  const ofProduct = (id: string | null) => catalog.products.find((p) => p.id === id)?.caution ?? 0
  let caution = catalog.settings.booking.caution_amount ?? 0
  for (const l of lines) {
    if (l.kind === 'product') caution = Math.max(caution, ofProduct(l.ref_id))
    if (l.kind === 'pack') {
      const pack = catalog.packs.find((k) => k.id === l.ref_id)
      caution = Math.max(caution, pack?.caution ?? 0)
      for (const it of l.components ?? pack?.items ?? []) caution = Math.max(caution, ofProduct(it.product_id))
    }
  }
  return caution
}

/** Délai laissé au client pour payer l'acompte d'une réservation directe (comme dans la base). */
export const HOLD_MINUTES = 60

type Holdable = Pick<Booking, 'status' | 'valid_until' | 'hold_until'>

/** Réservation directe (tous les prix connus, payée en ligne sans validation). */
export const isDirect = (b: Pick<Booking, 'hold_until'>): boolean => !!b.hold_until

/** Le délai de paiement (réservation directe) ou la validité du devis est dépassé. */
export function isExpired(b: Holdable, today: string, nowMs = Date.now()): boolean {
  if (b.status !== 'validee') return false
  if (b.hold_until) return Date.parse(b.hold_until) <= nowMs
  return !!b.valid_until && b.valid_until < today
}

export function statusView(b: Holdable, today: string) {
  if (isExpired(b, today)) {
    return isDirect(b)
      ? { client: 'Paiement non finalisé', admin: 'Paiement non finalisé', tone: 'muted' as Tone }
      : { client: 'Devis expiré', admin: 'Devis expiré', tone: 'muted' as Tone }
  }
  if (b.status === 'validee' && isDirect(b)) return { client: 'Paiement à régler', admin: 'Paiement en cours', tone: 'warn' as Tone }
  return STATUS[b.status]
}

/** Une réservation bloque le matériel si elle est confirmée, en cours de paiement, ou un devis validé non expiré. */
export function blocksStock(b: Holdable, today: string): boolean {
  return b.status === 'confirmee' || (b.status === 'validee' && !isExpired(b, today))
}

// ---------------------------------------------------------------- Dates

export function endFor(formula: Formula, start: string, customEnd?: string | null): string | null {
  if (formula === '24h') return addDays(start, 1)
  if (formula === 'weekend') return addDays(start, 3)
  return customEnd ?? null
}

export function firstBookableDay(settings: Settings, today: string): string {
  return addDays(today, settings.booking.min_notice_days)
}

/** Message d'erreur en français, ou null si les dates sont valides. */
export function validateDates(
  formula: Formula,
  start: string | null,
  end: string | null,
  settings: Settings,
  today: string,
): string | null {
  if (!start || !end) return 'Choisissez vos dates.'
  const first = firstBookableDay(settings, today)
  if (start < first) return `La location peut commencer au plus tôt ${settings.booking.min_notice_days} jours après aujourd’hui.`
  if (formula === '24h' && end !== addDays(start, 1)) return 'Le forfait 24 h dure une journée.'
  if (formula === 'weekend' && (isoWeekday(start) !== 5 || end !== addDays(start, 3)))
    return 'Le forfait week-end commence un vendredi et se termine le lundi.'
  if (formula === 'sur_mesure') {
    if (end <= start) return 'La date de retour doit suivre la date de retrait.'
    if (diffDays(start, end) > settings.booking.max_custom_days)
      return `Pour plus de ${settings.booking.max_custom_days} jours, contactez-nous directement.`
  }
  return null
}

// ---------------------------------------------------------------- Prix

export function unitPrice(item: { price_24h: number | null; price_weekend: number | null }, formula: Formula): number | null {
  if (formula === '24h') return item.price_24h
  if (formula === 'weekend') return item.price_weekend
  return null
}

export function itemsTotal(items: Pick<BookingItem, 'quantity' | 'unit_price'>[]): number | null {
  let total = 0
  for (const it of items) {
    if (it.unit_price === null || it.unit_price === undefined) return null
    total += it.unit_price * it.quantity
  }
  return round2(total)
}

export function depositFor(total: number | null, percent: number): number | null {
  if (total === null) return null
  return round2((total * percent) / 100)
}

/** Valeur au détail d'un pack, pour afficher l'économie réalisée. */
export function packRetailValue(pack: Pack, products: Product[], formula: Formula): number | null {
  let sum = 0
  for (const it of pack.items) {
    const p = products.find((x) => x.id === it.product_id)
    if (!p) continue
    const u = unitPrice(p, formula)
    if (u === null) return null
    sum += u * it.quantity
  }
  return round2(sum)
}

// ---------------------------------------------------------------- Stock

/** Quantité nécessaire de chaque article, packs dépliés. */
export function needsFor(lines: CartLine[], packs: Pack[]): Map<string, number> {
  const need = new Map<string, number>()
  const add = (id: string, q: number) => need.set(id, (need.get(id) ?? 0) + q)
  for (const l of lines) {
    if (l.kind === 'product') add(l.ref_id, l.quantity)
    else {
      const pack = packs.find((p) => p.id === l.ref_id)
      pack?.items.forEach((it) => add(it.product_id, it.quantity * l.quantity))
    }
  }
  return need
}

/** Nombre de packs complets disponibles. */
export function packStock(pack: Pack, available: (productId: string) => number): number {
  if (pack.items.length === 0) return 0
  return Math.min(...pack.items.map((it) => Math.floor(available(it.product_id) / it.quantity)))
}

export interface Shortage {
  product: Product
  needed: number
  available: number
}

export function shortages(lines: CartLine[], catalog: Catalog, availability: Record<string, number> | null): Shortage[] {
  if (!availability) return []
  const out: Shortage[] = []
  needsFor(lines, catalog.packs).forEach((needed, id) => {
    const product = catalog.products.find((p) => p.id === id)
    const available = availability[id] ?? product?.quantity ?? 0
    if (product && needed > available) out.push({ product, needed, available })
  })
  return out
}

/** Un blocage du planning (du premier au dernier jour inclus) touche-t-il une location [start, end) ? */
export const blockOverlaps = (bl: Pick<Block, 'start_date' | 'end_date'>, start: string, end: string) => bl.start_date < end && bl.end_date >= start

/** Calcule la disponibilité de chaque article : réservations qui bloquent le stock et indisponibilités du planning. */
export function computeAvailability(
  products: Product[],
  bookings: Booking[],
  blocks: Block[],
  start: string,
  end: string,
  today: string,
  excludeId?: string,
): Record<string, number> {
  const reserved = new Map<string, number>()
  const add = (id: string, q: number) => reserved.set(id, (reserved.get(id) ?? 0) + q)
  for (const b of bookings) {
    if (b.id === excludeId || !blocksStock(b, today)) continue
    if (!(b.start_date < end && b.end_date > start)) continue
    for (const it of b.items) {
      if (it.kind === 'product' && it.ref_id) add(it.ref_id, it.quantity)
      if (it.kind === 'pack') (it.components ?? []).forEach((c) => add(c.product_id, c.quantity * it.quantity))
    }
  }
  const out: Record<string, number> = {}
  for (const p of products) {
    const blocked = blocks
      .filter((bl) => (bl.product_id === null || bl.product_id === p.id) && blockOverlaps(bl, start, end))
      .reduce((sum, bl) => sum + (bl.quantity ?? p.quantity), 0)
    out[p.id] = Math.max(p.quantity - (reserved.get(p.id) ?? 0) - blocked, 0)
  }
  return out
}

// ---------------------------------------------------------------- Devis

export interface QuoteDraft {
  formula: Formula
  lines: CartLine[]
  delivery_mode: DeliveryMode
  zone_id: string | null
  technician_evenings: number
}

export interface QuoteView {
  items: BookingItem[]
  total: number | null
  deposit: number | null
  /** Caution demandée à la remise du matériel. */
  caution: number
  hasOnRequest: boolean
  /** Ce qui empêche de réserver directement (la demande part alors en devis). Vide : réservation directe. */
  quoteReasons: string[]
}

/** Pourquoi une demande ne peut pas être payée tout de suite (mêmes règles que la base de données). */
export function quoteReasonsFor(d: QuoteDraft, catalog: Catalog, total: number | null): string[] {
  const reasons: string[] = []
  if (d.formula === 'sur_mesure') reasons.push('une durée sur mesure')
  const zone = catalog.zones.find((z) => z.id === d.zone_id)
  if (d.delivery_mode !== 'retrait' && zone && zone.price === null) reasons.push('une livraison sur devis')
  needsFor(d.lines, catalog.packs).forEach((_, id) => {
    const p = catalog.products.find((x) => x.id === id)
    if (p?.rental_mode === 'sur_demande') reasons.push(`« ${p.name} », loué sur demande`)
  })
  if (!reasons.length && total === null) reasons.push('un prix à confirmer')
  const deposit = depositFor(total, catalog.settings.booking.deposit_percent)
  if (!reasons.length && deposit !== null && deposit < 0.5) reasons.push('du matériel prêté sans frais')
  return reasons
}

/**
 * Pack sur mesure : dès N articles différents loués à l'unité (prix connu, non offerts),
 * remise de X % sur ces articles. Les packs, déjà remisés, n'entrent pas dans le calcul.
 */
export function customDiscount(items: Pick<BookingItem, 'kind' | 'ref_id' | 'quantity' | 'unit_price'>[], settings: Settings) {
  const percent = Math.round(settings.booking.custom_discount_percent ?? 0)
  const minItems = Math.max(1, Math.round(settings.booking.custom_discount_min_items ?? 3))
  const eligible = items.filter((it) => it.kind === 'product' && it.unit_price !== null && it.unit_price > 0)
  const distinct = new Set(eligible.map((it) => it.ref_id)).size
  const base = eligible.reduce((sum, it) => sum + (it.unit_price ?? 0) * it.quantity, 0)
  const reached = percent > 0 && distinct >= minItems
  return {
    percent,
    minItems,
    distinct,
    missing: Math.max(minItems - distinct, 0),
    amount: reached ? round2((base * percent) / 100) : 0,
    label: `Remise pack sur mesure (\u2212${percent}\u00a0%)`,
  }
}

/** Construit les lignes du devis exactement comme la base de données le fera à l'envoi. */
export function buildQuote(d: QuoteDraft, catalog: Catalog): QuoteView {
  const items: BookingItem[] = []
  let sort = 0
  const push = (kind: LineKind, ref_id: string | null, name: string, quantity: number, unit_price: number | null, components?: BookingItem['components']) =>
    items.push({ kind, ref_id, name, quantity, unit_price, sort: sort++, components: components ?? null })

  for (const l of d.lines) {
    if (l.kind === 'product') {
      const p = catalog.products.find((x) => x.id === l.ref_id)
      if (p) push('product', p.id, p.name, l.quantity, unitPrice(p, d.formula))
    } else {
      const k = catalog.packs.find((x) => x.id === l.ref_id)
      if (k) push('pack', k.id, k.name, l.quantity, unitPrice(k, d.formula), k.items)
    }
  }
  const custom = customDiscount(items, catalog.settings)
  if (custom.amount > 0) push('autre', null, custom.label, 1, -custom.amount)
  if (d.delivery_mode !== 'retrait') {
    const z = catalog.zones.find((x) => x.id === d.zone_id)
    push('livraison', z?.id ?? null, z ? `Livraison et reprise (${z.name.toLowerCase()})` : 'Livraison et reprise', 1, z ? z.price : null)
  }
  if (d.delivery_mode === 'livraison_installation') {
    const s = catalog.services.find((x) => x.id === 'installation')
    push('installation', null, s?.name ?? 'Installation et démontage', 1, s?.price ?? null)
  }
  if (d.technician_evenings > 0) {
    const s = catalog.services.find((x) => x.id === 'technicien')
    push('technicien', null, s?.name ?? 'Présence technique sur place', d.technician_evenings, s?.price ?? null)
  }
  const total = items.length ? itemsTotal(items) : 0
  return {
    items,
    total,
    deposit: depositFor(total, catalog.settings.booking.deposit_percent),
    caution: cautionFor(items, catalog),
    hasOnRequest: total === null,
    quoteReasons: quoteReasonsFor(d, catalog, total),
  }
}

export const EVENT_TYPES = ['Mariage', 'Anniversaire', 'Soirée privée', 'Événement d’entreprise', 'Cérémonie', 'Association', 'Autre']

export type Formula = '24h' | 'weekend' | 'sur_mesure'
export type DeliveryMode = 'retrait' | 'livraison' | 'livraison_installation'
export type BookingStatus = 'demande' | 'validee' | 'confirmee' | 'terminee' | 'refusee' | 'annulee'
export type RentalMode = 'libre' | 'sur_demande' | 'pack_uniquement'
export type CautionStatus = 'a_recevoir' | 'recue' | 'restituee'
export type LineKind = 'product' | 'pack' | 'livraison' | 'installation' | 'technicien' | 'autre'

export interface Category {
  id: string
  name: string
  description: string
  icon: string
  sort: number
}

export interface Spec {
  label: string
  value: string
}

export interface Product {
  id: string
  slug: string
  category_id: string
  name: string
  brand: string | null
  model: string | null
  summary: string
  description: string
  specs: Spec[]
  included: string[]
  quantity: number
  price_24h: number | null
  price_weekend: number | null
  unit_label: string
  rental_mode: RentalMode
  caution: number | null
  photos: string[]
  visible: boolean
  featured: boolean
  sort: number
}

export interface PackItem {
  product_id: string
  quantity: number
}

export interface Pack {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  audience: string
  items: PackItem[]
  price_24h: number | null
  price_weekend: number | null
  /** Caution propre au pack (vide : caution habituelle). */
  caution: number | null
  photos: string[]
  visible: boolean
  featured: boolean
  sort: number
}

export interface Service {
  id: string
  name: string
  description: string
  price: number | null
  unit_label: string
  visible: boolean
  sort: number
}

export interface Zone {
  id: string
  name: string
  description: string
  price: number | null
  sort: number
}

export interface CompanySettings {
  name: string
  owner: string
  status: string
  siret: string
  address: string
  postal_code: string
  city: string
  phone: string
  email: string
  vat_note: string
  area: string
  /** Médiateur de la consommation (obligatoire pour vendre aux particuliers) */
  mediator_name?: string
  mediator_url?: string
}

export interface BookingSettings {
  deposit_percent: number
  caution_amount: number
  caution_method: string
  quote_validity_days: number
  min_notice_days: number
  max_custom_days: number
  max_pending_per_client: number
  day_label: string
  weekend_label: string
  response_delay: string
  balance_note: string
  cancellation_early: string
  cancellation_late: string
  /** Pack sur mesure : remise en % sur le matériel loué à l'unité (0 : pas de remise). */
  custom_discount_percent?: number
  /** … dès ce nombre d'articles différents. */
  custom_discount_min_items?: number
}

/** Une photo de la galerie « Nos installations » de l'accueil. */
export interface GalleryPhoto {
  src: string
  caption: string
  /** Vignette deux fois plus large (photos à l'horizontale). */
  wide?: boolean
}

export interface Settings {
  company: CompanySettings
  booking: BookingSettings
  annual_target: number | null
  gallery?: GalleryPhoto[]
}

export interface Catalog {
  categories: Category[]
  products: Product[]
  packs: Pack[]
  services: Service[]
  zones: Zone[]
  settings: Settings
}

/** Une ligne du devis en cours de composition par le client. */
export interface CartLine {
  kind: 'product' | 'pack'
  ref_id: string
  quantity: number
}

export interface BookingRequestInput {
  formula: Formula
  start_date: string
  end_date: string
  lines: CartLine[]
  delivery_mode: DeliveryMode
  zone_id: string | null
  address: string
  technician_evenings: number
  event_type: string
  guests: number | null
  venue: string
  message: string
  contact: { full_name: string; phone: string }
}

export interface BookingItem {
  id?: string
  kind: LineKind
  ref_id: string | null
  name: string
  quantity: number
  unit_price: number | null
  sort: number
  components?: PackItem[] | null
}

export interface Booking {
  id: string
  reference: string
  user_id: string | null
  status: BookingStatus
  formula: Formula
  start_date: string
  end_date: string
  delivery_mode: DeliveryMode
  zone_id: string | null
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
  deposit_paid_at: string | null
  /** Montant payé à la réservation : l'acompte, ou la totalité si le client l'a choisi. */
  deposit_paid_amount: number | null
  balance_paid_at: string | null
  /** Caution demandée pour cette réservation (la plus élevée du matériel loué). */
  caution_amount?: number | null
  caution_status: CautionStatus
  /** Devis établi par l'admin : valable jusqu'à cette date incluse. */
  valid_until: string | null
  /** Réservation directe : matériel réservé au client jusqu'à cette heure, le temps de payer l'acompte. */
  hold_until: string | null
  /** Nombre de fois où ce délai a été renouvelé (trois au plus). */
  hold_renewals?: number
  client_note: string
  /** Note privée de l'admin (vide côté client : elle est rangée à part en base). */
  admin_note: string
  created_at: string
  updated_at: string
  items: BookingItem[]
  /** Paiements en ligne reçus pour cette réservation. */
  payments?: Payment[]
}

/**
 * Paiement reçu. « a_rembourser » : arrivé alors que la réservation ne pouvait plus être confirmée
 * (annulée, déjà payée, matériel repris entre-temps) ; il est remboursé automatiquement, sinon par l'admin.
 */
export interface Payment {
  id: string
  amount: number
  provider: string
  status: 'paid' | 'a_rembourser' | 'rembourse'
  created_at: string
}

/** Indisponibilité posée par l'admin dans le planning. */
export interface Block {
  id: string
  /** null : tout le matériel */
  product_id: string | null
  /** null : toutes les unités de l'article */
  quantity: number | null
  start_date: string
  /** Dernier jour indisponible, inclus. */
  end_date: string
  note: string
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string
  phone: string
  company: string
  address: string
  is_admin: boolean
  created_at: string
}

export interface ClientSummary extends Profile {
  bookings: number
  revenue: number
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  phone: string
  subject: string
  body: string
  read: boolean
  created_at: string
}

export type AdminAction =
  | 'valider'
  | 'refuser'
  | 'acompte_recu'
  | 'solde_regle'
  | 'caution_recue'
  | 'caution_restituee'
  | 'terminer'
  | 'annuler'
  | 'rouvrir'

/** Champs modifiables d'une réservation par l'admin (hors statut). */
export interface BookingPatch {
  formula: Formula
  start_date: string
  end_date: string
  delivery_mode: DeliveryMode
  zone_id: string | null
  address: string
  technician_evenings: number
  event_type: string
  guests: number | null
  venue: string
  client_name: string
  client_phone: string
  client_note: string
  admin_note: string
  valid_until: string | null
  deposit_amount: number | null
  items: BookingItem[]
}

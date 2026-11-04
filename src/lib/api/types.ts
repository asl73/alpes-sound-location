import type {
  AdminAction,
  Block,
  Booking,
  BookingPatch,
  BookingRequestInput,
  BookingStatus,
  Catalog,
  ClientSummary,
  ContactMessage,
  Pack,
  Product,
  Profile,
  Service,
  Settings,
  Zone,
} from '../types'

export interface ContactInput {
  name: string
  email: string
  phone: string
  subject: string
  body: string
}

export interface SignUpInput {
  email: string
  password: string
  full_name: string
  phone: string
}

export interface Api {
  mode: 'demo' | 'live'

  // Public
  loadCatalog(): Promise<Catalog>
  availability(start: string, end: string, excludeBookingId?: string): Promise<Record<string, number>>
  sendContact(m: ContactInput): Promise<void>

  // Compte
  currentUser(): Promise<Profile | null>
  onAuthChange(cb: () => void): () => void
  signIn(email: string, password: string): Promise<void>
  signUp(input: SignUpInput): Promise<{ needsConfirmation: boolean }>
  signOut(): Promise<void>
  requestPasswordReset(email: string): Promise<void>
  /** Ouvre la session à partir du lien reçu par e-mail (paramètre token_hash). */
  verifyRecovery(tokenHash: string): Promise<void>
  updatePassword(password: string): Promise<void>
  updateProfile(patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'company' | 'address'>>): Promise<Profile>

  // Espace client
  /** Statut « validee » : réservation directe, à payer tout de suite. « demande » : devis à établir par l'admin. */
  createBooking(input: BookingRequestInput): Promise<{ id: string; reference: string; status: BookingStatus }>
  myBookings(): Promise<Booking[]>
  myBooking(id: string): Promise<Booking | null>
  cancelBooking(id: string): Promise<void>
  /** Ouvre la page de paiement : l'acompte, ou la totalité si full. */
  payDeposit(id: string, full?: boolean): Promise<{ url: string }>

  // Administration
  admin: {
    bookings(): Promise<Booking[]>
    booking(id: string): Promise<Booking | null>
    saveBooking(id: string, patch: BookingPatch): Promise<void>
    action(id: string, action: AdminAction): Promise<void>
    blocks(): Promise<Block[]>
    saveBlock(b: Block): Promise<Block>
    deleteBlock(id: string): Promise<void>
    saveProduct(p: Product): Promise<Product>
    deleteProduct(id: string): Promise<void>
    savePack(p: Pack): Promise<Pack>
    deletePack(id: string): Promise<void>
    saveService(s: Service): Promise<void>
    saveZone(z: Zone): Promise<Zone>
    deleteZone(id: string): Promise<void>
    saveSettings(s: Settings): Promise<void>
    uploadPhoto(file: File): Promise<string>
    clients(): Promise<ClientSummary[]>
    messages(): Promise<ContactMessage[]>
    markMessage(id: string, read: boolean): Promise<void>
    deleteMessage(id: string): Promise<void>
    /** Paiement remboursé à la main depuis Stripe. */
    markRefunded(paymentId: string): Promise<void>
  }

  /** Raccourcis disponibles uniquement dans l'aperçu de démonstration. */
  demo?: {
    loginAs(role: 'client' | 'admin'): Promise<void>
    completePayment(id: string, full?: boolean): Promise<void>
    reset(): Promise<void>
  }
}

/** Réduit une photo avant envoi : 1600 px max, JPEG qualité 0,82. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Impossible de lire cette image.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Impossible de lire cette image.'))), 'image/jpeg', quality),
  )
}

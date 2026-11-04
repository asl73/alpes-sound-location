const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1 234 € ou 12,50 € ; null = prix à définir. */
export function eur(n: number | null | undefined, empty = 'Sur devis'): string {
  if (n === null || n === undefined || Number.isNaN(n)) return empty
  return Number.isInteger(n) ? eur0.format(n) : eur2.format(n)
}

/**
 * Arrondi au centime, exactement comme la base de données : 13,605 € donne 13,61 €
 * (les calculs en virgule flottante donneraient 13,60 €), et la moitié s'éloigne de zéro.
 */
export function round2(n: number): number {
  const cents = Math.round(Number((Math.abs(n) * 100).toPrecision(12)))
  return (Math.sign(n) * cents) / 100 || 0
}

const pad = (n: number) => String(n).padStart(2, '0')

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date du jour en France, au format AAAA-MM-JJ. */
export function todayParis(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000)
}

export const isoWeekday = (iso: string) => {
  const day = parseISO(iso).getDay()
  return day === 0 ? 7 : day
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

export const monthName = (m: number) => MONTHS[m]
export const monthShort = (m: number) => MONTHS_SHORT[m]
const dayNum = (d: number) => (d === 1 ? '1er' : String(d))

/** vendredi 12 juin 2026 */
export function dateLong(iso: string): string {
  const d = parseISO(iso)
  return `${DAYS[d.getDay()]} ${dayNum(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** ven. 12 juin */
export function dateShort(iso: string, withYear = false): string {
  const d = parseISO(iso)
  return `${DAYS_SHORT[d.getDay()]} ${dayNum(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`
}

/** 12/06/2026 */
export function dateNum(iso: string): string {
  const d = parseISO(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Du vendredi 12 au lundi 15 juin 2026 */
export function rangeLabel(start: string, end: string): string {
  const a = parseISO(start)
  const b = parseISO(end)
  const sameYear = a.getFullYear() === b.getFullYear()
  const sameMonth = sameYear && a.getMonth() === b.getMonth()
  const left = `${DAYS[a.getDay()]} ${dayNum(a.getDate())}${sameMonth ? '' : ' ' + MONTHS[a.getMonth()]}${sameYear ? '' : ' ' + a.getFullYear()}`
  const right = `${DAYS[b.getDay()]} ${dayNum(b.getDate())} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`
  return `Du ${left} au ${right}`
}

/** 2 nov. 2026 à 14 h 05 */
export function dateTime(ts: string): string {
  const d = new Date(ts)
  return `${dayNum(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} à ${d.getHours()} h ${pad(d.getMinutes())}`
}

/** Heure d'un horodatage, à la française : « 15 h 42 ». */
export function timeOf(ts: string): string {
  const d = new Date(ts)
  return `${d.getHours()} h ${pad(d.getMinutes())}`
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}

export function phoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits.startsWith('0') ? `tel:+33${digits.slice(1)}` : `tel:${digits}`
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

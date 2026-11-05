// Titres et descriptions des pages, pour Google et les aperçus de liens (WhatsApp, Facebook…).
// Ce module ne dépend pas du navigateur : le build l'utilise aussi pour écrire l'en-tête de chaque page
// et le plan du site (voir scripts/seo-prerender.ts).
import type { Pack, Product, Settings } from './types'

export const SITE_NAME = 'Alpes & Sound Location'
export const DEFAULT_SITE_URL = 'https://alpes-sound-location.fr'

export interface Meta {
  /** Titre de la page, sans le nom du site (ajouté automatiquement). */
  title: string
  /** Résumé affiché sous le titre dans Google : 160 caractères au plus. */
  description: string
  /** Photo des aperçus de liens (chemin du site ou adresse complète). */
  image?: string
  /** Page à ne pas montrer dans Google (compte, connexion, page introuvable…). */
  noindex?: boolean
}

export const fullTitle = (title: string) => (title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`)

/** Coupe un texte au dernier mot entier avant `n` caractères. */
export function clip(text: string, n = 160): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  const cut = t.slice(0, n - 1)
  const space = cut.lastIndexOf(' ')
  return (space > n / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?–-]+$/, '') + '…'
}

/** Adresse complète d'une page ou d'une image du site. */
export function absUrl(pathOrUrl: string, site = DEFAULT_SITE_URL): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return site.replace(/\/+$/, '') + (pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`)
}

const price = (n: number | null | undefined) => (n ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)} €` : '')

// ------------------------------------------------------------------ Pages par type d'événement

export interface EventPage {
  path: string
  /** Nom court, pour les liens. */
  label: string
  /** Pour une phrase : « Vous préparez aussi un mariage ? » */
  phrase: string
  /** Une phrase d'accroche, pour la carte sur l'accueil. */
  teaser: string
  kicker: string
  heading: string
  meta: Meta
  /** Photo d'en-tête (une installation de Rémi). */
  photo: string
  /** Packs conseillés, dans l'ordre (slugs du catalogue). */
  packs: string[]
  /** Articles utiles pour ce type d'événement (slugs du catalogue). */
  products: string[]
}

export const EVENT_PAGES: EventPage[] = [
  {
    path: '/mariage',
    label: 'Mariage',
    phrase: 'un mariage',
    teaser: 'Cérémonie, discours, dîner et piste de danse : le son et la lumière de toute la journée.',
    kicker: 'Mariage',
    heading: 'Sono et éclairage pour votre mariage',
    meta: {
      title: 'Location sono et éclairage pour mariage en Savoie',
      description:
        'Sono, micros et éclairage pour votre mariage en Savoie, Isère et Haute-Savoie : cérémonie, discours, dîner et piste de danse. Livraison et installation.',
      image: '/photos/terrasse-montagnes.jpg',
    },
    photo: '/photos/terrasse-montagnes.jpg',
    packs: ['pack-mariage', 'pack-soiree'],
    products: ['paire-micros-sans-fil-jbl', 'enceinte-jbl-partybox-on-the-go', 'uplight-led', 'pied-effets-lyre-laser-strobes', 'machine-a-fumee-500w'],
  },
  {
    path: '/anniversaire',
    label: 'Anniversaire',
    phrase: 'un anniversaire',
    teaser: 'À la maison, en salle ou en plein air : une sono simple à brancher et de quoi éclairer la piste.',
    kicker: 'Anniversaire',
    heading: 'Sono et lumière pour un anniversaire',
    meta: {
      title: 'Location sono et lumière pour anniversaire en Savoie',
      description:
        'Une sono simple à brancher, un micro et des jeux de lumière pour un anniversaire à la maison, en salle ou en plein air. Retrait ou livraison en Savoie.',
      image: '/photos/anniversaire-18-ans.jpg',
    },
    photo: '/photos/anniversaire-18-ans.jpg',
    packs: ['pack-anniversaire', 'pack-soiree'],
    products: ['table-de-mixage-2-voies', 'enceinte-jbl-partybox-on-the-go', 'micro-sans-fil', 'pied-4-par-led-effets-disco', 'pioneer-dj-xdj-rr'],
  },
  {
    path: '/soiree-entreprise',
    label: 'Soirée d’entreprise',
    phrase: 'une soirée d’entreprise',
    teaser: 'Réunions, séminaires, remises de prix : une voix claire pour les intervenants, puis la fête.',
    kicker: 'Entreprises',
    heading: 'Sono et éclairage pour vos événements d’entreprise',
    meta: {
      title: 'Sono pour séminaire et soirée d’entreprise en Savoie',
      description:
        'Micros sans fil, enceintes et éclairage pour réunions, séminaires, remises de prix et soirées d’entreprise en Savoie. Technicien sur place en option.',
      image: '/photos/sono-1600w-reception.jpg',
    },
    photo: '/photos/sono-1600w-reception.jpg',
    packs: ['pack-entreprise-ceremonie', 'pack-soiree'],
    products: ['paire-micros-sans-fil-jbl', 'paire-micros-sans-fil', 'enceinte-alto-ts410', 'uplight-led'],
  },
]

/** Page événement qui correspond le mieux à un pack (lien « Conseils pour… » sur la page du pack). */
export const eventForPack = (slug: string) => EVENT_PAGES.find((e) => e.packs[0] === slug) ?? null

// ------------------------------------------------------------------ Pages fixes

export const PAGES: Record<string, Meta> = {
  '/': {
    title: 'Location sono et éclairage en Savoie',
    description:
      'Location de sono et d’éclairage pour mariages, anniversaires et soirées d’entreprise en Savoie, Isère et Haute-Savoie. Réservation en ligne et livraison.',
  },
  '/materiel': {
    title: 'Matériel de sono, DJ et éclairage à louer',
    description:
      'Enceintes, caissons, tables de mixage, régie DJ, micros sans fil, uplights et effets lumineux à louer en Savoie, pour 24 h ou un week-end.',
  },
  '/packs': {
    title: 'Packs sono et lumière à louer',
    description:
      'Packs anniversaire, soirée, mariage et entreprise : sono, micros et éclairage déjà assortis, moins chers qu’à l’unité. Location en Savoie.',
  },
  '/packs/sur-mesure': {
    title: 'Composez votre pack sono et lumière',
    description:
      'Choisissez enceintes, micros et éclairages pour composer un pack adapté à votre événement, avec les disponibilités en direct.',
  },
  '/prestations': {
    title: 'Livraison et installation de sono en Savoie',
    description:
      'Livraison, installation et technicien sur place pour votre sono et votre éclairage, depuis La Chavanne, entre Chambéry et Albertville. Tarifs selon la distance.',
  },
  '/contact': {
    title: 'Contact',
    description: 'Une question sur la location de sono ou d’éclairage pour votre événement en Savoie ? Appelez-nous ou écrivez-nous.',
  },
  '/devis': {
    title: 'Réserver en ligne',
    description:
      'Choisissez vos dates et votre matériel de sono et d’éclairage : les disponibilités s’affichent en direct, la réservation se confirme en ligne.',
  },
  '/cgv': {
    title: 'Conditions de location',
    description: 'Conditions générales de location du matériel de sonorisation et d’éclairage : réservation, paiement, caution, durée, annulation.',
  },
  '/mentions-legales': {
    title: 'Mentions légales',
    description: 'Mentions légales du site Alpes & Sound Location : éditeur, hébergement et propriété intellectuelle.',
  },
  '/confidentialite': {
    title: 'Confidentialité',
    description: 'Comment Alpes & Sound Location utilise et protège vos données personnelles, et comment exercer vos droits.',
  },
  ...Object.fromEntries(EVENT_PAGES.map((e) => [e.path, e.meta])),
}

/** Page sans intérêt pour Google : titre seul, pas d'indexation. */
export const privateMeta = (title: string): Meta => ({ title, description: PAGES['/'].description, noindex: true })

// ------------------------------------------------------------------ Pages du catalogue

/** Met en minuscule le premier mot d'une phrase, sauf un sigle ou une marque (JBL, DJ…). */
const lowerWord = (t: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

export function productMeta(p: Product): Meta {
  const lead = lowerWord((p.summary || p.description || '').trim().replace(/[\s.…]+$/, ''))
  const from = price(p.price_24h)
  return {
    title: `${p.name} à louer en Savoie`,
    description: clip(`${p.name} à louer${from ? ` dès ${from} les 24 h` : ''} en Savoie${lead ? ` : ${lead}.` : '.'}`),
    image: p.photos[0],
  }
}

export function packMeta(k: Pack): Meta {
  const prices = [k.price_weekend ? `${price(k.price_weekend)} le week-end` : '', k.price_24h ? `${price(k.price_24h)} les 24 h` : '']
    .filter(Boolean)
    .join(', ')
  const sentence = (t: string) => (t.trim() ? ` ${t.trim().replace(/[\s.]+$/, '')}.` : '')
  return {
    title: `${k.name} : sono et lumière à louer`,
    description: clip(`${sentence(k.tagline)}${sentence(k.audience)}${prices ? ` ${prices}.` : ''} Livraison en Savoie.`),
    image: k.photos[0],
  }
}

// ------------------------------------------------------------------ Fiche de l'entreprise pour Google

export function localBusinessJsonLd(s: Settings, site = DEFAULT_SITE_URL) {
  const c = s.company
  const phone = c.phone.replace(/[\s.]/g, '').replace(/^0(?=\d{9}$)/, '+33')
  const areas = c.area
    .split(/,\s*|\s+et\s+/)
    .map((a) => a.trim())
    .filter(Boolean)
  const logo = absUrl('/brand/logo-horizontal-couleur.png', site)
  const images = (s.gallery ?? []).map((g) => absUrl(g.src, site)).slice(0, 6)
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${site.replace(/\/+$/, '')}/#entreprise`,
    name: c.name,
    description: 'Location de sonorisation et d’éclairage pour mariages, anniversaires et événements',
    url: site.replace(/\/+$/, ''),
    telephone: phone,
    email: c.email,
    logo,
    image: images.length ? images : [logo],
    address: {
      '@type': 'PostalAddress',
      streetAddress: c.address,
      postalCode: c.postal_code,
      addressLocality: c.city,
      addressCountry: 'FR',
    },
    areaServed: areas,
  }
}

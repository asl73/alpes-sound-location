import { ArrowRight, Phone } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { DatesBar, PackCard, ProductCard } from '../../components/catalog'
import { PageHead } from '../../components/layout'
import { useMeta } from '../../components/seo'
import { ProductVisual } from '../../components/ui'
import { eur, phoneHref } from '../../lib/format'
import { EVENT_PAGES, type EventPage } from '../../lib/seo'
import { useCatalog } from '../../lib/store'
import type { Catalog, Pack, Product } from '../../lib/types'
import NotFound from './NotFound'

// Pages « mariage », « anniversaire » et « soirée d'entreprise » : le matériel conseillé, les tarifs et les
// questions fréquentes pour chaque type d'événement. Les prix, packs et zones viennent du catalogue :
// ils suivent automatiquement les changements faits dans l'administration.

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
const noDot = (t: string) => t.trim().replace(/[.\s]+$/, '')

interface Moment {
  title: string
  text: string
  /** Articles ou packs cités, en liens (slugs du catalogue). */
  links?: string[]
}

interface Content {
  intro: string
  momentsTitle: string
  moments: Moment[]
  faq: Array<[string, string]>
}

function contentFor(e: EventPage, cat: Catalog): Content {
  const { settings, services, zones } = cat
  const c = settings.company
  const b = settings.booking
  const pack = (slug: string): Pack | undefined => cat.packs.find((k) => k.slug === slug)
  const aud = (k: Pack | undefined) => (k?.audience ? lowerFirst(noDot(k.audience)) : '')
  const install = services.find((s) => s.id === 'installation' && s.visible !== false)
  const tech = services.find((s) => s.id === 'technicien' && s.visible !== false)
  const onQuote = zones.some((z) => z.price === null)

  const installAnswer = install
    ? `Oui, avec la prestation « ${install.name} » (${eur(install.price)} ${install.unit_label}) : ${lowerFirst(noDot(install.description))}.${
        tech ? ` ${noDot(tech.description)} (${eur(tech.price)} ${tech.unit_label}).` : ''
      }`
    : `Oui : contactez-nous au ${c.phone} pour organiser l’installation.`
  const delivery = `Vous pouvez retirer le matériel gratuitement à ${c.city}, ou le faire livrer : le prix dépend de la distance (voir le tableau) et couvre la livraison et la reprise.${
    onQuote ? ` Pour les stations et les longues distances, nous vous envoyons un devis ${b.response_delay}.` : ''
  }`
  const howToBook = `Les disponibilités s’affichent en direct sur le site. Votre date est réservée dès le paiement en ligne de l’acompte de ${b.deposit_percent} % ou de la totalité, au moins ${b.min_notice_days} jours avant l’événement.`
  const caution = (k: Pack | undefined) =>
    `Oui, par ${b.caution_method}. Son montant est indiqué sur la page de chaque pack et de chaque article${
      k?.caution ? ` : ${eur(k.caution)} pour le ${k.name}` : ''
    }.`
  const noTech = 'Non. Le matériel est réglé et testé avant chaque location, et nous vous montrons les branchements au retrait. Avec l’installation, tout est prêt quand vous arrivez.'

  if (e.path === '/mariage') {
    const wedding = pack('pack-mariage')
    const party = pack('pack-soiree')
    return {
      intro: `Cérémonie laïque, vin d’honneur, discours et piste de danse : nous fournissons le son et la lumière de votre mariage, livrés et installés dans votre salle en ${c.area}.`,
      momentsTitle: 'Une journée, plusieurs ambiances',
      moments: [
        {
          title: 'Cérémonie et vin d’honneur',
          text: 'Un micro sans fil pour les vœux, et une musique d’ambiance pour l’apéritif. En plein air, l’enceinte JBL PartyBox fonctionne sur batterie, sans prise à proximité.',
          links: ['micro-sans-fil', 'enceinte-jbl-partybox-on-the-go'],
        },
        {
          title: 'Dîner et discours',
          text: 'Une paire de micros sans fil pour les témoins, une musique douce pendant le repas, et des uplights le long des murs pour habiller la salle : huit suffisent pour une salle de mariage.',
          links: ['paire-micros-sans-fil-jbl', 'uplight-led'],
        },
        {
          title: 'Ouverture de bal et soirée',
          text: 'Le caisson de basses donne du corps à la musique, la lyre, le laser et les stroboscopes animent la piste, et quelques secondes de fumée révèlent les faisceaux.',
          links: ['caisson-alto-ts15s', 'pied-effets-lyre-laser-strobes', 'machine-a-fumee-500w'],
        },
        {
          title: 'Un DJ parmi vos proches ?',
          text: 'La régie Pioneer DJ XDJ-RR réunit deux lecteurs et un mixeur, sans ordinateur. Elle se loue sur demande, pour les DJ expérimentés ou avec notre présence technique sur place.',
          links: ['pioneer-dj-xdj-rr'],
        },
      ],
      faq: [
        ...(wedding
          ? ([
              [
                'Quel pack pour combien d’invités ?',
                `Le ${wedding.name} convient ${aud(wedding)}.${party ? ` Pour un mariage plus intime, le ${party.name} suffit (${aud(party)}).` : ''} Vous pouvez ajouter des articles à chaque pack, ou composer le vôtre.`,
              ],
            ] as Array<[string, string]>)
          : []),
        ['Installez-vous le matériel dans notre salle ?', installAnswer],
        ['Combien de temps à l’avance réserver ?', `${howToBook} Pour un mariage en juin, réservez plusieurs mois à l’avance.`],
        ['Livrez-vous sur le lieu de la réception ?', delivery],
        ['Y a-t-il une caution ?', caution(wedding)],
      ],
    }
  }

  if (e.path === '/anniversaire') {
    const small = pack('pack-anniversaire')
    const party = pack('pack-soiree')
    return {
      intro: `À la maison, en salle ou en plein air : une sono simple à brancher, un micro pour les discours et quelques jeux de lumière pour la piste. Le matériel se retire à ${c.city} ou se fait livrer.`,
      momentsTitle: 'Bien choisir',
      moments: [
        ...(small && party
          ? [
              {
                title: `${small.name} ou ${party.name} ?`,
                text: `Le ${small.name} convient ${aud(small)} ; le ${party.name}, ${aud(party)} : ${lowerFirst(noDot(party.tagline))}.`,
                links: [small.slug, party.slug],
              },
            ]
          : []),
        {
          title: 'Votre playlist sur votre téléphone',
          text: 'La table de mixage se branche en Bluetooth, avec une clé USB ou un câble jack : chacun peut passer sa musique, et vous réglez le volume de chaque source.',
          links: ['table-de-mixage-2-voies'],
        },
        {
          title: 'Une fête en plein air',
          text: 'L’enceinte JBL PartyBox fonctionne sur batterie, avec des lumières qui suivent la musique et un micro sans fil fourni : idéale pour un apéritif, un pique-nique ou un karaoké.',
          links: ['enceinte-jbl-partybox-on-the-go'],
        },
        {
          title: 'De la lumière sur la piste',
          text: 'Le pied de PAR LED et effets disco colore la piste et la fait bouger ; ajoutez la machine à fumée pour révéler les faisceaux.',
          links: ['pied-4-par-led-effets-disco', 'machine-a-fumee-500w'],
        },
      ],
      faq: [
        ['24 heures ou week-end ?', `La formule 24 h couvre ${lowerFirst(noDot(b.day_label))} ; la formule week-end va ${lowerFirst(noDot(b.weekend_label))}. Pour une autre durée, choisissez « Durée sur mesure » : nous vous envoyons le prix ${b.response_delay}.`],
        ['Faut-il des connaissances techniques ?', noTech],
        ['Faut-il venir chercher le matériel ?', delivery],
        ['Le matériel peut-il aller dehors ?', 'Oui, à condition qu’il reste à l’abri de la pluie et de l’humidité : prévoyez une tonnelle ou un barnum, et une prise électrique à proximité. L’enceinte JBL PartyBox, elle, fonctionne sur batterie.'],
        ['Comment réserver ?', howToBook],
      ],
    }
  }

  // Soirée d'entreprise
  const corporate = pack('pack-entreprise-ceremonie')
  const party = pack('pack-soiree')
  return {
    intro: `Réunion, séminaire, remise de prix, cérémonie ou soirée du personnel : une voix claire pour vos intervenants et, si vous le souhaitez, de quoi faire danser ensuite. Livraison et installation en ${c.area}.`,
    momentsTitle: 'Ce que nous apportons',
    moments: [
      {
        title: 'Plusieurs intervenants',
        text: `${corporate ? `${corporate.name} : ${lowerFirst(noDot(corporate.tagline))}. ` : ''}Une deuxième paire de micros sans fil peut s’ajouter pour les tables rondes et les remises de prix.`,
        links: [...(corporate ? [corporate.slug] : []), 'paire-micros-sans-fil'],
      },
      ...(tech
        ? [
            {
              title: 'Un technicien sur place',
              text: `${noDot(tech.description)} : vos équipes se concentrent sur l’événement (${eur(tech.price)} ${tech.unit_label}).`,
            },
          ]
        : []),
      {
        title: 'Une salle mise en valeur',
        text: 'Posés au sol, les uplights mettent en couleur les murs, les colonnes et le décor de la salle de réception.',
        links: ['uplight-led'],
      },
      ...(party
        ? [
            {
              title: 'Puis la soirée',
              text: `Le ${party.name} prend le relais pour la partie dansante : ${lowerFirst(noDot(party.tagline))}.`,
              links: [party.slug],
            },
          ]
        : []),
    ],
    faq: [
      ['Pouvez-vous rester pendant l’événement ?', tech ? `Oui : ${lowerFirst(noDot(tech.description))} (${eur(tech.price)} ${tech.unit_label}).` : `Contactez-nous au ${c.phone} pour en parler.`],
      ['Installez-vous le matériel ?', installAnswer],
      ['La TVA s’applique-t-elle ?', `${noDot(c.vat_note)} : les prix affichés sont les prix à payer.`],
      ['Jusqu’où livrez-vous ?', delivery],
      ['Comment réserver ?', howToBook],
    ],
  }
}

/** Liens vers les articles et packs cités dans un paragraphe. */
function CatalogLinks({ slugs, cat }: { slugs: string[]; cat: Catalog }) {
  const items = slugs
    .map((s) => {
      const p = cat.products.find((x) => x.slug === s && x.visible !== false)
      if (p) return { to: `/materiel/${p.slug}`, name: p.name, price: p.price_24h }
      const k = cat.packs.find((x) => x.slug === s && x.visible !== false)
      if (k) return { to: `/packs/${k.slug}`, name: k.name, price: k.price_24h }
      return null
    })
    .filter((x): x is { to: string; name: string; price: number | null } => !!x)
  if (!items.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {items.map((it) => (
        <li key={it.to}>
          <Link to={it.to} className="inline-flex items-center gap-1.5 rounded-full border border-line-2 bg-white px-3 py-1 text-[14px] font-semibold hover:border-bordeaux/50 hover:text-bordeaux">
            {it.name}
            {it.price ? <span className="tabular font-normal whitespace-nowrap text-muted">dès {eur(it.price)}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function EventPageView() {
  const { pathname } = useLocation()
  const event = EVENT_PAGES.find((e) => e.path === pathname.replace(/\/+$/, ''))
  const cat = useCatalog()
  useMeta(event ? event.meta : { title: 'Page introuvable', description: '', noindex: true })
  if (!event) return <NotFound />

  const { settings, zones, products, packs } = cat
  const c = settings.company
  const content = contentFor(event, cat)
  const shownPacks = event.packs.map((s) => packs.find((k) => k.slug === s && k.visible !== false)).filter((k): k is Pack => !!k)
  const shownProducts = event.products.map((s) => products.find((p) => p.slug === s && p.visible !== false)).filter((p): p is Product => !!p)
  const others = EVENT_PAGES.filter((e) => e.path !== event.path)

  return (
    <>
      <PageHead
        kicker={event.kicker}
        title={event.heading}
        actions={
          <>
            <Link to="/devis" className="btn btn-gold">
              Réserver en ligne
            </Link>
            <a href={phoneHref(c.phone)} className="btn btn-dark">
              <Phone className="size-4" /> {c.phone}
            </a>
          </>
        }
      >
        {content.intro}
      </PageHead>

      <div className="wrap -mt-6">
        <DatesBar />
      </div>

      {shownPacks.length > 0 && (
        <section className="wrap mt-12" aria-labelledby="packs-conseilles">
          <h2 id="packs-conseilles" className="display text-[34px] md:text-[42px]">
            {shownPacks.length > 1 ? 'Les packs conseillés' : 'Le pack conseillé'}
          </h2>
          <p className="mt-2 max-w-2xl text-muted">Le matériel déjà assorti, moins cher qu’à l’unité. Choisissez vos dates pour voir s’il est disponible.</p>
          <div className="mt-6 space-y-6">
            {shownPacks.map((k) => (
              <PackCard key={k.id} pack={k} large />
            ))}
          </div>
        </section>
      )}

      <section className="wrap mt-16" aria-labelledby="moments">
        <h2 id="moments" className="display text-[34px] md:text-[42px]">
          {content.momentsTitle}
        </h2>
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="panel overflow-hidden lg:sticky lg:top-24">
            <div className="aspect-[4/3]">
              <ProductVisual photo={event.photo} icon="speaker" label={event.heading} />
            </div>
          </div>
          <ol className="space-y-6">
            {content.moments.map((m) => (
              <li key={m.title} className="border-l-2 border-or pl-5">
                <h3 className="text-[19px] font-bold">{m.title}</h3>
                <p className="mt-1 text-[16px] text-ink/80">{m.text}</p>
                {m.links && <CatalogLinks slugs={m.links} cat={cat} />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {shownProducts.length > 0 && (
        <section className="wrap mt-16" aria-labelledby="materiel-utile">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="materiel-utile" className="display text-[34px] md:text-[42px]">
              Le matériel utile
            </h2>
            <Link to="/materiel" className="link inline-flex items-center gap-1.5">
              Tout le catalogue <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shownProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 bg-creme" aria-labelledby="livraison">
        <div className="wrap grid gap-10 py-12 md:grid-cols-2 md:py-16">
          <div>
            <h2 id="livraison" className="display text-[34px] md:text-[42px]">
              Livraison et installation
            </h2>
            <p className="mt-3 max-w-lg text-[16px] text-ink/80">
              Nous partons de {c.city}, entre Chambéry et Albertville. Le prix de la livraison couvre l’aller et la reprise du matériel ; ajoutez l’installation pour
              tout trouver prêt en arrivant.
            </p>
            <Link to="/prestations" className="link mt-4 inline-flex items-center gap-1.5">
              Livraison, installation et conditions <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="panel overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only">Tarifs de livraison et de reprise</caption>
              <thead className="bg-nuit text-[13px] text-creme">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Distance depuis {c.city}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Livraison et reprise</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="px-4 py-3 font-semibold">Retrait sur place</td>
                  <td className="px-4 py-3 text-right font-bold">Gratuit</td>
                </tr>
                {zones.map((z) => (
                  <tr key={z.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{z.name}</p>
                      <p className="text-[13px] text-muted">{z.description}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold whitespace-nowrap">{z.price === null ? 'Sur devis' : eur(z.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="wrap mt-16" aria-labelledby="questions">
        <h2 id="questions" className="display text-[34px] md:text-[42px]">
          Questions fréquentes
        </h2>
        <div className="mt-5 divide-y divide-line rounded-[8px] border border-line bg-white">
          {content.faq.map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-xl text-or transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-[15px] text-ink/80">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="wrap mt-16">
        <div className="flex flex-col items-start gap-6 rounded-[10px] bg-nuit px-6 py-10 text-creme md:flex-row md:items-center md:justify-between md:px-12">
          <div>
            <h2 className="display text-[32px] md:text-[42px]">Votre date est-elle libre ?</h2>
            <p className="mt-2 max-w-lg text-creme/80">Réservez en ligne en quelques minutes, ou appelez-nous au {c.phone}.</p>
          </div>
          <Link to="/devis" className="btn btn-gold">
            Réserver en ligne
          </Link>
        </div>
        <p className="mt-6 text-[15px] text-muted">
          Vous préparez aussi{' '}
          {others.map((o, i) => (
            <span key={o.path}>
              {i > 0 && (i === others.length - 1 ? ' ou ' : ', ')}
              <Link to={o.path} className="link">
                {o.phrase}
              </Link>
            </span>
          ))}
          {'\u00a0?'}
        </p>
      </section>
    </>
  )
}

import { ArrowRight, CalendarCheck, ShieldCheck, Truck } from 'lucide-react'
import { Link } from 'react-router'
import { useMeta } from '../../components/seo'
import { DatesBar } from '../../components/catalog'
import { PhotoMosaic } from '../../components/gallery'
import { CategoryIcon, ProductVisual } from '../../components/ui'
import { eur } from '../../lib/format'
import { packStock } from '../../lib/rules'
import { EVENT_PAGES, PAGES } from '../../lib/seo'
import { useCatalog, useQuote } from '../../lib/store'

/** Une crête alpine qui se change en onde sonore : le motif du logo, à l'échelle de la page. */
function RidgeWave() {
  return (
    <svg viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" className="pointer-events-none absolute inset-x-0 bottom-0 h-[170px] w-full md:h-[220px]" aria-hidden="true">
      <defs>
        <linearGradient id="ridge-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#b98a34" stopOpacity="0.15" />
          <stop offset="0.35" stopColor="#b98a34" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d4aa5a" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="ridge-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7a2540" stopOpacity="0.35" />
          <stop offset="1" stopColor="#2a0e1a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 205 L70 170 L120 182 L190 118 L240 150 L300 86 L355 132 L410 104 L470 160 L520 138 L585 64 L640 120 L690 98 L760 168 L820 150 L870 176 L1440 176 L1440 220 L0 220 Z"
        fill="url(#ridge-fill)"
      />
      <path
        className="ridge-line"
        d="M0 205 L70 170 L120 182 L190 118 L240 150 L300 86 L355 132 L410 104 L470 160 L520 138 L585 64 L640 120 L690 98 L760 168 L820 150 L870 176 L905 176"
        fill="none"
        stroke="url(#ridge-fade)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        className="ridge-wave"
        d="M905 176 L935 176 L950 140 L968 206 L986 104 L1006 214 L1024 150 L1040 190 L1056 166 L1072 182 L1090 176 L1440 176"
        fill="none"
        stroke="#d4aa5a"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Le geste le plus utile d'un loueur : vérifier sa date. */
function HeroAvailability() {
  const { packs } = useCatalog()
  const { state, end, datesError, availability, available } = useQuote()
  const ready = !!state.start && !!end && !datesError && !!availability
  const formula = state.formula === '24h' ? '24h' : 'weekend'
  return (
    <div className="hidden rounded-[10px] border border-nuit-3 bg-nuit-2/80 p-5 backdrop-blur lg:block">
      <p className="display text-[26px] text-creme">Votre date est-elle libre ?</p>
      <p className="mt-1 text-[14px] text-creme/70">Choisissez vos dates : les disponibilités s’affichent aussitôt.</p>
      <div className="mt-4">
        <DatesBar dark />
      </div>
      <ul className="mt-4 divide-y divide-nuit-3">
        {packs.slice(0, 4).map((k) => {
          const stock = ready ? packStock(k, available) : null
          return (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link to={`/packs/${k.slug}`} className="min-w-0 hover:text-white">
                <span className="block truncate font-semibold text-creme">{k.name}</span>
                <span className="tabular text-[13px] text-creme/60">
                  {eur(formula === '24h' ? k.price_24h : k.price_weekend)} {formula === '24h' ? 'les 24 h' : 'le week-end'}
                </span>
              </Link>
              {stock === null ? (
                <span className="text-[13px] text-creme/50">Dates à choisir</span>
              ) : stock > 0 ? (
                <span className="rounded-full bg-ok/25 px-2.5 py-0.5 text-[13px] font-semibold text-[#9fd8b5]">Disponible</span>
              ) : (
                <span className="rounded-full bg-bad/30 px-2.5 py-0.5 text-[13px] font-semibold text-[#f2b4ad]">Déjà réservé</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function Home() {
  const { packs, products, categories, zones, settings } = useCatalog()
  useMeta(PAGES['/'])
  const featured = packs.filter((p) => p.featured).slice(0, 3)
  const shown = featured.length ? featured : packs.slice(0, 3)
  const deposit = settings.booking.deposit_percent
  const gallery = settings.gallery ?? []

  return (
    <>
      <section className="relative overflow-hidden bg-nuit text-creme">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_80%_0%,rgb(185_138_52/0.18),transparent_60%)]" aria-hidden="true" />
        <div className="wrap relative grid gap-10 pt-12 pb-[190px] md:pt-16 md:pb-[240px] lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          <div>
          <p className="kicker text-or-2">Sono et éclairage à louer en Savoie</p>
          <h1 className="display mt-4 max-w-[13ch] text-[56px] text-creme sm:text-[76px] lg:text-[104px]">Le son et l’éclairage de votre événement</h1>
          <p className="mt-6 max-w-xl text-[18px] text-creme/80">Mariages, anniversaires, soirées d’entreprise : réservez en ligne, selon les disponibilités du moment.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/devis" className="btn btn-gold">
              Réserver en ligne
            </Link>
            <Link to="/packs" className="btn btn-dark">
              Voir les packs
            </Link>
          </div>
          <ul className="mt-10 flex flex-col gap-x-8 gap-y-3 text-[15px] text-creme/80 sm:flex-row sm:flex-wrap">
            <li className="flex items-center gap-2.5">
              <Truck className="size-5 shrink-0 text-or-2" strokeWidth={1.6} /> Livraison et installation
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-5 shrink-0 text-or-2" strokeWidth={1.6} /> Paiement en ligne sécurisé
            </li>
            <li className="flex items-center gap-2.5">
              <CalendarCheck className="size-5 shrink-0 text-or-2" strokeWidth={1.6} /> Disponibilités en direct
            </li>
          </ul>
          </div>
          <HeroAvailability />
        </div>
        <RidgeWave />
      </section>

      <section className="wrap mt-16 md:mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="display text-[40px] md:text-[54px]">Un pack pour chaque fête</h2>
            <p className="mt-2 max-w-xl text-muted">Le matériel est déjà assorti et moins cher qu’à l’unité. Vous pouvez y ajouter des articles.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/packs/sur-mesure" className="link inline-flex items-center gap-1.5">
              Composer mon pack <ArrowRight className="size-4" />
            </Link>
            <Link to="/packs" className="link inline-flex items-center gap-1.5">
              Tous les packs <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {shown.map((p) => (
            <Link key={p.id} to={`/packs/${p.slug}`} className="group panel flex flex-col overflow-hidden transition-colors hover:border-bordeaux/40">
              <div className="aspect-[16/8] overflow-hidden md:aspect-[16/10]">
                <ProductVisual photo={p.photos[0]} icon="speaker" label={p.name} className="object-[50%_30%]" />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <p className="text-[13px] font-semibold text-or">{p.audience}</p>
                <h3 className="display text-[28px] group-hover:text-bordeaux">{p.name}</h3>
                <p className="text-[15px] text-muted">{p.tagline}</p>
                <p className="tabular mt-auto pt-3 text-[15px]">
                  <span className="font-bold">{eur(p.price_weekend)}</span> <span className="text-muted">le week-end</span>
                  <span className="mx-2 text-line-2">|</span>
                  <span className="font-bold">{eur(p.price_24h)}</span> <span className="text-muted">les 24 h</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap mt-20 md:mt-28" aria-labelledby="evenements">
        <h2 id="evenements" className="display text-[40px] md:text-[54px]">
          Votre événement
        </h2>
        <p className="mt-2 max-w-xl text-muted">Le matériel conseillé, les tarifs et nos réponses aux questions fréquentes, selon votre fête.</p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {EVENT_PAGES.map((e) => (
            <Link key={e.path} to={e.path} className="group panel flex flex-col overflow-hidden transition-colors hover:border-bordeaux/40">
              <div className="aspect-[16/9] overflow-hidden">
                <ProductVisual photo={e.photo} icon="speaker" label={e.heading} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <p className="text-[13px] font-semibold text-or">{e.kicker}</p>
                <h3 className="display text-[26px] group-hover:text-bordeaux">{e.heading}</h3>
                <p className="text-[15px] text-muted">{e.teaser}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[15px] font-semibold text-bordeaux">
                  Nos conseils <ArrowRight className="size-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap mt-20 md:mt-28">
        <h2 className="display text-[40px] md:text-[54px]">Comment réserver</h2>
        <ol className="mt-8 grid gap-px overflow-hidden rounded-[8px] border border-line bg-line md:grid-cols-3">
          {[
            ['Choisissez dates et matériel', 'Les disponibilités s’affichent en direct. Ajoutez la livraison et l’installation si besoin.'],
            ['Payez en ligne', `L’acompte de ${deposit} % ou la totalité, par carte : la réservation est confirmée aussitôt.`],
            ['Profitez de la fête', 'Retrait ou livraison avec installation. Le solde éventuel se règle le jour J.'],
          ].map(([t, d], i) => (
            <li key={t} className="bg-white p-5 md:p-6">
              <span className="display text-[44px] text-or">{i + 1}</span>
              <p className="mt-2 font-bold">{t}</p>
              <p className="mt-1 text-[15px] text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[14px] text-muted">
          Durée sur mesure, livraison en station ou matériel loué sur demande : nous vous envoyons un devis {settings.booking.response_delay}.
        </p>
      </section>

      {gallery.length > 0 && (
        <section className="mt-20 bg-nuit text-creme md:mt-28" aria-labelledby="installations">
          <div className="wrap py-14 md:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="kicker text-or-2">En situation</p>
                <h2 id="installations" className="display mt-3 text-[40px] text-creme md:text-[54px]">
                  Nos installations
                </h2>
                <p className="mt-2 max-w-xl text-creme/75">Quelques soirées que nous avons équipées, de la terrasse à la salle des fêtes.</p>
              </div>
              <Link to="/prestations" className="inline-flex items-center gap-1.5 font-semibold text-or-2 underline-offset-4 hover:underline">
                Livraison et installation <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="mt-8">
              <PhotoMosaic photos={gallery} />
            </div>
          </div>
        </section>
      )}

      <section className="wrap mt-20 md:mt-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="display text-[40px] md:text-[54px]">Le matériel</h2>
          <Link to="/materiel" className="link inline-flex items-center gap-1.5">
            Tout le catalogue <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {categories.map((c) => {
            const n = products.filter((p) => p.category_id === c.id).length
            return (
              <Link key={c.id} to={`/materiel?categorie=${c.id}`} className="panel group flex items-start gap-4 p-4 transition-colors hover:border-bordeaux/40 lg:flex-col">
                <span className="grid size-11 shrink-0 place-items-center rounded-[6px] bg-nuit text-or-2">
                  <CategoryIcon icon={c.icon} className="size-5" />
                </span>
                <span>
                  <span className="block font-bold group-hover:text-bordeaux">{c.name}</span>
                  <span className="block text-[14px] text-muted">{c.description}</span>
                  <span className="mt-1 block text-[13px] text-muted">{n > 1 ? `${n} articles` : `${n} article`}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="mt-20 bg-creme md:mt-28">
        <div className="wrap grid gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="display text-[40px] md:text-[54px]">Livré, installé, réglé</h2>
            <p className="mt-4 max-w-lg text-[17px] text-ink/80">
              Nous partons de {settings.company.city}, entre Chambéry et Albertville. Ajoutez l’installation pour trouver le matériel prêt à l’emploi en
              arrivant, ou la présence d’un technicien pendant toute la soirée.
            </p>
            <Link to="/prestations" className="btn btn-primary mt-6">
              Livraison et installation
            </Link>
          </div>
          <div className="panel overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <caption className="sr-only">Tarifs de livraison et de reprise</caption>
              <thead className="bg-nuit text-[13px] text-creme">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Distance depuis {settings.company.city}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Livraison et reprise</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{z.name}</p>
                      <p className="text-[13px] text-muted">{z.description}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold whitespace-nowrap">{eur(z.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="wrap mt-20 md:mt-28">
        <div className="flex flex-col items-start gap-6 rounded-[10px] bg-nuit px-6 py-10 text-creme md:flex-row md:items-center md:justify-between md:px-12">
          <div>
            <h2 className="display text-[36px] md:text-[46px]">Une date en tête ?</h2>
            <p className="mt-2 max-w-lg text-creme/80">Réservez en ligne en quelques minutes, ou appelez-nous au {settings.company.phone}.</p>
          </div>
          <Link to="/devis" className="btn btn-gold">
            Réserver en ligne
          </Link>
        </div>
      </section>
    </>
  )
}

import { ArrowRight, ChevronRight, Expand } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AddControl, DatesBar, PackCard, PriceLine, ProductCard, StockNote } from '../../components/catalog'
import { PageHead } from '../../components/layout'
import { useMeta } from '../../components/seo'
import { PhotoStrip } from '../../components/gallery'
import { CategoryIcon, Lightbox, Notice, Photo, ProductVisual } from '../../components/ui'
import { eur } from '../../lib/format'
import { packStock } from '../../lib/rules'
import { PAGES, eventForPack, packMeta, privateMeta, productMeta } from '../../lib/seo'
import { useCatalog, useQuote } from '../../lib/store'
import { useState } from 'react'
import NotFound from './NotFound'

export function CatalogPage() {
  const { categories, products } = useCatalog()
  const [params, setParams] = useSearchParams()
  const active = params.get('categorie')
  const shown = active ? categories.filter((c) => c.id === active) : categories
  useMeta(PAGES['/materiel'])

  return (
    <>
      <PageHead kicker="Catalogue" title="Le matériel">
        Tout notre matériel se loue à l’unité, au forfait 24 h ou week-end. Indiquez vos dates pour voir ce qui est disponible.
      </PageHead>
      <div className="wrap -mt-6">
        <DatesBar />
        <div className="no-scrollbar -mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Catégories">
          {[{ id: null as string | null, name: 'Tout le matériel' }, ...categories].map((c) => {
            const on = (c.id ?? null) === active
            return (
              <button
                key={c.id ?? 'tout'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setParams(c.id ? { categorie: c.id } : {}, { replace: true })}
                className={`shrink-0 rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors ${on ? 'border-nuit bg-nuit text-creme' : 'border-line-2 bg-white hover:border-muted'}`}
              >
                {c.name}
              </button>
            )
          })}
        </div>
        <div className="mt-8 space-y-14">
          {shown.map((c) => {
            const list = products.filter((p) => p.category_id === c.id)
            if (!list.length) return null
            return (
              <section key={c.id} aria-labelledby={`cat-${c.id}`}>
                <div className="mb-5 flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-[6px] bg-nuit text-or-2">
                    <CategoryIcon icon={c.icon} />
                  </span>
                  <div>
                    <h2 id={`cat-${c.id}`} className="display text-[30px]">
                      {c.name}
                    </h2>
                    <p className="text-[14px] text-muted">{c.description}</p>
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
        <div className="mt-14 flex flex-col items-start gap-4 rounded-[8px] bg-creme p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-lg font-bold">Vous ne savez pas quoi choisir ?</p>
            <p className="text-muted">Les packs réunissent le bon matériel pour chaque type de fête, à un prix plus doux.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/packs" className="btn btn-primary">
              Voir les packs <ArrowRight className="size-4" />
            </Link>
            <Link to="/packs/sur-mesure" className="btn btn-outline">
              Composer mon pack
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}

export function ProductPage() {
  const { slug } = useParams()
  const { products, categories, packs, settings } = useCatalog()
  const { availability, available, state } = useQuote()
  const product = products.find((p) => p.slug === slug)
  const [photo, setPhoto] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)
  useMeta(product ? productMeta(product) : privateMeta('Article introuvable'))
  if (!product) return <NotFound />
  const cat = categories.find((c) => c.id === product.category_id)
  const inPacks = packs.filter((k) => k.items.some((it) => it.product_id === product.id))
  const avail = availability ? available(product.id) : null
  const current = Math.min(photo, Math.max(0, product.photos.length - 1))

  return (
    <div className="wrap pt-6">
      <nav className="flex items-center gap-1.5 text-[14px] text-muted" aria-label="Fil d’Ariane">
        <Link to="/materiel" className="hover:text-ink">
          Matériel
        </Link>
        <ChevronRight className="size-4" />
        <Link to={`/materiel?categorie=${cat?.id ?? ''}`} className="hover:text-ink">
          {cat?.name}
        </Link>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="min-w-0">
          {product.photos.length > 0 ? (
            <button
              type="button"
              onClick={() => setViewer(current)}
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-[8px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-bordeaux"
              aria-label={`Agrandir la photo : ${product.name}`}
            >
              <ProductVisual photo={product.photos[current]} icon={cat?.icon ?? 'box'} label={product.name} size="lg" />
              <span className="absolute right-3 bottom-3 inline-flex items-center gap-1.5 rounded-full bg-nuit/75 px-3 py-1.5 text-[13px] font-semibold text-creme backdrop-blur">
                <Expand className="size-3.5" /> Agrandir
              </span>
            </button>
          ) : (
            <div className="aspect-[4/3] overflow-hidden rounded-[8px]">
              <ProductVisual icon={cat?.icon ?? 'box'} label={product.name} size="lg" />
            </div>
          )}
          {product.photos.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {product.photos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setPhoto(i)}
                  className={`size-20 shrink-0 overflow-hidden rounded-[6px] border-2 ${i === current ? 'border-bordeaux' : 'border-transparent'}`}
                  aria-label={`Afficher la photo ${i + 1}`}
                  aria-pressed={i === current}
                >
                  <Photo src={src} alt="" sizes="80px" />
                </button>
              ))}
            </div>
          )}
          {product.photos.length > 0 && <p className="mt-2 text-[13px] text-muted">Photos non contractuelles.</p>}
          <Lightbox photos={product.photos.map((src) => ({ src, caption: product.name }))} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
        </div>

        <div>
          {(product.brand || product.model) && <p className="text-muted">{[product.brand, product.model].filter(Boolean).join(' ')}</p>}
          <h1 className="display mt-1 text-[44px] md:text-[56px]">{product.name}</h1>
          <p className="mt-3 text-[17px] text-ink/80">{product.summary}</p>

          <div className="mt-6 rounded-[8px] border border-line bg-white p-5">
            <PriceLine item={product} unit={`Prix ${product.unit_label}`} />
            <p className="mt-2 text-[14px] text-muted">Plus long ou en semaine : tarif sur devis.</p>
            <div className="mt-4">
              <DatesBar />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <StockNote available={avail} total={product.quantity} />
              <AddControl
                kind="product"
                id={product.id}
                name={product.name}
                max={avail ?? product.quantity}
                disabled={product.rental_mode === 'pack_uniquement'}
                disabledLabel="Uniquement en pack"
              />
            </div>
          </div>

          {product.rental_mode === 'sur_demande' && (
            <div className="mt-4">
              <Notice tone="warn" title="Location sur demande">
                Nous validons chaque location de cet article avant de confirmer.{product.caution ? ` Caution spécifique : ${eur(product.caution)}.` : ''}
              </Notice>
            </div>
          )}

          {product.included.length > 0 && (
            <div className="mt-6">
              <p className="font-bold">Fourni avec</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink/85 marker:text-or">
                {product.included.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <section>
          <h2 className="display text-[30px]">Fiche technique</h2>
          <dl className="mt-4 divide-y divide-line overflow-hidden rounded-[8px] border border-line bg-white">
            {product.specs.map((s) => (
              <div key={s.label} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-4 px-4 py-3 text-[15px]">
                <dt className="text-muted">{s.label}</dt>
                <dd className="tabular font-semibold">{s.value}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,10rem)_1fr] gap-4 px-4 py-3 text-[15px]">
              <dt className="text-muted">En stock</dt>
              <dd className="tabular font-semibold">{product.quantity}</dd>
            </div>
          </dl>
          {product.description && <p className="mt-6 max-w-prose text-[16px] text-ink/85">{product.description}</p>}
        </section>
        <section>
          {inPacks.length > 0 && (
            <>
              <h2 className="display text-[30px]">Inclus dans</h2>
              <ul className="mt-4 space-y-2">
                {inPacks.map((k) => {
                  const stock = availability ? packStock(k, available) : null
                  return (
                    <li key={k.id}>
                      <Link to={`/packs/${k.slug}`} className="panel flex items-center justify-between gap-4 px-4 py-3 hover:border-bordeaux/40">
                        <span>
                          <span className="block font-bold">{k.name}</span>
                          <span className="block text-[14px] text-muted">{k.audience}</span>
                        </span>
                        <span className="tabular text-right text-[14px]">
                          <span className="block font-bold">{eur(state.formula === '24h' ? k.price_24h : k.price_weekend)}</span>
                          <span className="text-muted">{stock === 0 ? 'indisponible' : state.formula === '24h' ? 'les 24 h' : 'le week-end'}</span>
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          <div className="mt-6 rounded-[8px] bg-creme p-5 text-[15px]">
            <p className="font-bold">Paiement et caution</p>
            <p className="mt-1 text-ink/80">
              Acompte de {settings.booking.deposit_percent} % ou totalité à la réservation, payé en ligne. Caution de {eur(product.caution ?? settings.booking.caution_amount)} par{' '}
              {settings.booking.caution_method}.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

/** Encart vers le pack sur mesure. */
function CustomPackBanner() {
  const { settings } = useCatalog()
  const pct = Math.round(settings.booking.custom_discount_percent ?? 0)
  const min = settings.booking.custom_discount_min_items ?? 3
  return (
    <div className="mt-8 flex flex-col items-start gap-4 rounded-[10px] bg-nuit p-6 text-creme md:flex-row md:items-center md:justify-between md:p-8">
      <div>
        <p className="display text-[30px]">Aucun pack ne vous correspond ?</p>
        <p className="mt-1 max-w-xl text-creme/80">
          Composez le vôtre : le son, les micros et la lumière, article par article.{pct > 0 && ` Dès ${min} articles différents, ${pct} % de remise.`}
        </p>
      </div>
      <Link to="/packs/sur-mesure" className="btn btn-gold shrink-0">
        Composer mon pack <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

export function PacksPage() {
  const { packs } = useCatalog()
  useMeta(PAGES['/packs'])
  return (
    <>
      <PageHead
        kicker="Packs"
        title="Les packs"
        actions={
          <Link to="/packs/sur-mesure" className="btn btn-gold">
            Composer mon pack <ArrowRight className="size-4" />
          </Link>
        }
      >
        Le matériel assorti pour chaque type d’événement, moins cher qu’à l’unité. Vous pouvez aussi composer le vôtre, article par article.
      </PageHead>
      <div className="wrap -mt-6">
        <DatesBar />
        <div className="mt-8 space-y-6">
          {packs.map((p) => (
            <PackCard key={p.id} pack={p} large />
          ))}
        </div>
        <CustomPackBanner />
      </div>
    </>
  )
}

export function PackPage() {
  const { slug } = useParams()
  const { packs, settings } = useCatalog()
  const pack = packs.find((p) => p.slug === slug)
  useMeta(pack ? packMeta(pack) : privateMeta('Pack introuvable'))
  if (!pack) return <NotFound />
  const others = packs.filter((p) => p.id !== pack.id)
  const event = eventForPack(pack.slug)
  return (
    <div className="wrap pt-6">
      <nav className="flex items-center gap-1.5 text-[14px] text-muted" aria-label="Fil d’Ariane">
        <Link to="/packs" className="hover:text-ink">
          Packs
        </Link>
        <ChevronRight className="size-4" />
        <span>{pack.name}</span>
      </nav>
      <p className="mt-6 text-[13px] font-semibold text-or">{pack.audience}</p>
      <h1 className="display mt-1 text-[48px] md:text-[64px]">{pack.name}</h1>
      <p className="mt-3 max-w-3xl text-[17px] text-ink/80">{pack.description}</p>
      {event && (
        <Link to={event.path} className="link mt-3 inline-flex items-center gap-1.5 text-[15px]">
          {event.heading} : nos conseils <ArrowRight className="size-4" />
        </Link>
      )}
      <div className="mt-6">
        <DatesBar />
      </div>
      <div className="mt-6">
        <PackCard pack={pack} large />
      </div>
      <div className="mt-6 rounded-[8px] bg-creme p-5 text-[15px]">
        <p className="font-bold">Paiement et caution</p>
        <p className="mt-1 text-ink/80">
          Acompte de {settings.booking.deposit_percent} % ou totalité à la réservation, payé en ligne. Caution de {eur(pack.caution ?? settings.booking.caution_amount)} par{' '}
          {settings.booking.caution_method}.
        </p>
      </div>
      {pack.photos.length > 1 && (
        <section className="mt-10" aria-labelledby="pack-photos">
          <h2 id="pack-photos" className="display text-[30px]">
            En situation
          </h2>
          <div className="mt-4">
            <PhotoStrip photos={pack.photos.slice(1)} label={pack.name} note="Photos non contractuelles : le contenu exact du pack est détaillé ci-dessus." />
          </div>
        </section>
      )}
      {others.length > 0 && (
        <section className="mt-14">
          <h2 className="display text-[30px]">Les autres packs</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {others.map((p) => (
              <Link key={p.id} to={`/packs/${p.slug}`} className="panel flex items-center justify-between gap-3 px-4 py-3 hover:border-bordeaux/40">
                <span>
                  <span className="block font-bold">{p.name}</span>
                  <span className="text-[14px] text-muted">{p.audience}</span>
                </span>
                <ChevronRight className="size-5 text-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

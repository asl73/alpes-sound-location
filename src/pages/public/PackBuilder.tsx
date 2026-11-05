import { ArrowRight, CircleCheck, Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AddControl, DatesBar, StockNote } from '../../components/catalog'
import { PageHead } from '../../components/layout'
import { useMeta } from '../../components/seo'
import { ProductVisual } from '../../components/ui'
import { eur, plural } from '../../lib/format'
import { customDiscount, itemsTotal, unitPrice } from '../../lib/rules'
import { PAGES } from '../../lib/seo'
import { useCatalog, useQuote, useToast } from '../../lib/store'
import type { Product } from '../../lib/types'

type Size = 's' | 'm' | 'l' | 'xl'

/** La sono conseillée selon le nombre d'invités (articles repérés par leur adresse, ignorés s'ils n'existent plus). */
const ADVICE: Record<Size, { label: string; hint: string; lines: [slug: string, qty: number][] }> = {
  s: { label: 'Jusqu’à 30', hint: 'Apéritif, fête à la maison', lines: [['enceinte-jbl-partybox-on-the-go', 1]] },
  m: { label: '30 à 60', hint: 'Anniversaire, fête de famille', lines: [['enceinte-alto-ts410', 2], ['pied-enceinte', 2]] },
  l: { label: '60 à 120', hint: 'Grande soirée, association', lines: [['sono-1600w-elokance', 1]] },
  xl: { label: 'Plus de 120', hint: 'Mariage, grande réception', lines: [['enceinte-alto-ts410', 4], ['caisson-alto-ts15s', 1], ['pied-enceinte', 4]] },
}

function priceText(p: Product, formula: ReturnType<typeof useQuote>['state']['formula']) {
  const u = unitPrice(p, formula)
  if (u === null) return 'Prix sur devis'
  if (u === 0) return 'Offert'
  return `${eur(u)} ${formula === '24h' ? 'les 24 h' : 'le week-end'}`
}

/** Conseil de sono selon la taille de l'événement. */
function SoundAdvice() {
  const { products } = useCatalog()
  const q = useQuote()
  const toast = useToast()
  const [size, setSize] = useState<Size | null>(null)
  const advice = size ? ADVICE[size] : null
  const lines = (advice?.lines ?? [])
    .map(([slug, qty]) => ({ product: products.find((p) => p.slug === slug), qty }))
    .filter((l): l is { product: Product; qty: number } => !!l.product)
  const apply = () => {
    for (const { product, qty } of lines) {
      const max = q.availability ? q.available(product.id) : product.quantity
      q.setQty('product', product.id, Math.min(Math.max(q.qtyOf('product', product.id), qty), max))
    }
    toast('Sono ajoutée à votre pack')
  }
  return (
    <section className="panel p-5 md:p-6" aria-labelledby="pb-guests">
      <h2 id="pb-guests" className="flex items-center gap-2 text-lg font-bold">
        <Users className="size-5 text-or" /> Combien serez-vous ?
      </h2>
      <p className="mt-1 text-[15px] text-muted">Nous vous conseillons la sono adaptée. Vous pouvez ensuite tout ajuster.</p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Nombre d’invités">
        {(Object.keys(ADVICE) as Size[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={size === k}
            onClick={() => setSize(k)}
            className={`rounded-[6px] border px-3 py-2.5 text-left transition-colors ${size === k ? 'border-bordeaux bg-bordeaux/[0.06]' : 'border-line-2 bg-white hover:border-bordeaux/50'}`}
          >
            <span className="block font-semibold">{ADVICE[k].label}</span>
            <span className="block text-[13px] text-muted">{ADVICE[k].hint}</span>
          </button>
        ))}
      </div>
      {advice && lines.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 rounded-[6px] bg-creme p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px]">
            <span className="font-semibold">Notre conseil : </span>
            {lines.map((l) => `${l.qty > 1 ? `${l.qty} × ` : ''}${l.product.name}`).join(', ')}
          </p>
          <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={apply}>
            <Sparkles className="size-4" /> Ajouter cette sono
          </button>
        </div>
      )}
    </section>
  )
}

/** Le pack en cours : matériel, remise, total, et suite de la réservation. */
function PackSummary({ onContinue }: { onContinue: () => void }) {
  const { settings } = useCatalog()
  const q = useQuote()
  const items = q.quote.items.filter((i) => i.kind === 'product' || i.kind === 'pack' || i.kind === 'autre')
  const total = itemsTotal(items)
  const custom = customDiscount(items, settings)
  return (
    <div className="panel overflow-hidden">
      <div className="bg-nuit px-5 py-4 text-creme">
        <p className="font-bold">Votre pack</p>
        <p className="text-[14px] text-creme/75">{plural(q.count, 'article', 'articles')}</p>
      </div>
      <div className="p-5">
        {items.length === 0 ? (
          <p className="text-[15px] text-muted">Ajoutez du matériel : il apparaît ici.</p>
        ) : (
          <ul className="space-y-2 text-[15px]">
            {items.map((it, i) => (
              <li key={i} className={`flex justify-between gap-3 ${it.kind === 'autre' ? 'font-semibold text-ok' : ''}`}>
                <span className="min-w-0">
                  {it.quantity > 1 && <span className="tabular font-semibold">{it.quantity} × </span>}
                  {it.name}
                </span>
                <span className="tabular shrink-0 font-semibold">{it.unit_price === null ? 'Sur devis' : it.unit_price === 0 ? 'Offert' : eur(it.unit_price * it.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        {custom.percent > 0 && q.state.formula !== 'sur_mesure' && (
          <div className={`mt-4 rounded-[6px] p-3 text-[14px] ${custom.missing === 0 ? 'bg-ok-bg text-ok' : 'bg-creme text-ink/85'}`}>
            {custom.missing === 0 ? (
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-4 shrink-0" /> Vous économisez {eur(custom.amount)} grâce au pack sur mesure
              </p>
            ) : (
              <>
                <p>
                  Encore <strong>{plural(custom.missing, 'article différent', 'articles différents')}</strong> pour profiter de {custom.percent} % de remise sur le
                  matériel à l’unité.
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white" aria-hidden="true">
                  <div className="h-full rounded-full bg-or" style={{ width: `${Math.min((custom.distinct / custom.minItems) * 100, 100)}%` }} />
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4">
          <span className="font-bold">Matériel</span>
          <span className="tabular text-[22px] font-bold">{items.length ? eur(total, 'Sur devis') : eur(0)}</span>
        </div>
        <p className="mt-1 text-[13px] text-muted">Livraison et installation se choisissent à l’étape suivante.</p>
        <button type="button" className="btn btn-primary mt-4 w-full" disabled={items.length === 0} onClick={onContinue}>
          Continuer ma réservation <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  )
}

export default function PackBuilderPage() {
  const { categories, products, settings } = useCatalog()
  useMeta(PAGES['/packs/sur-mesure'])
  const q = useQuote()
  const navigate = useNavigate()
  const formula = q.state.formula
  const items = q.quote.items.filter((i) => i.kind === 'product' || i.kind === 'pack' || i.kind === 'autre')
  const custom = customDiscount(items, settings)
  const total = itemsTotal(items)
  const go = () => navigate('/devis?etape=3')
  const shown = products.filter((p) => p.rental_mode !== 'pack_uniquement')

  return (
    <div className="pb-28 md:pb-0">
      <PageHead kicker="Pack sur mesure" title="Composez votre pack">
        Choisissez le son, les micros et la lumière, article par article.
        {custom.percent > 0 && (
          <>
            {' '}
            Dès {custom.minItems} articles différents loués à l’unité, {custom.percent} % de remise s’applique automatiquement.
          </>
        )}
      </PageHead>

      <div className="wrap -mt-6">
        <DatesBar />
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-6">
            <SoundAdvice />
            {categories.map((c, ci) => {
              const list = shown.filter((p) => p.category_id === c.id)
              if (!list.length) return null
              return (
                <section key={c.id} className="panel p-5 md:p-6" aria-labelledby={`pb-${c.id}`}>
                  <h2 id={`pb-${c.id}`} className="flex items-baseline gap-3">
                    <span className="display text-[28px] text-or">{ci + 1}</span>
                    <span className="text-lg font-bold">{c.name}</span>
                  </h2>
                  <ul className="mt-2 divide-y divide-line">
                    {list.map((p) => {
                      const avail = q.availability ? q.available(p.id) : null
                      return (
                        <li key={p.id} className="flex items-center gap-3 py-3">
                          <Link to={`/materiel/${p.slug}`} className="block h-14 w-[74px] shrink-0 overflow-hidden rounded-[6px] border border-line" tabIndex={-1} aria-hidden="true">
                            <ProductVisual photo={p.photos[0]} icon={c.icon} label={p.name} size="sm" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link to={`/materiel/${p.slug}`} className="block leading-snug font-semibold hover:text-bordeaux">
                              {p.name}
                            </Link>
                            <p className="tabular text-[13px] text-muted">
                              {priceText(p, formula)}
                              {p.rental_mode === 'sur_demande' && ' · soumis à validation'}
                            </p>
                            {avail !== null && avail < p.quantity && (
                              <div className="mt-1">
                                <StockNote available={avail} total={p.quantity} />
                              </div>
                            )}
                          </div>
                          <AddControl kind="product" id={p.id} name={p.name} max={avail ?? p.quantity} disabled={avail === 0} disabledLabel="Indisponible" />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
            <p className="text-[14px] text-muted">
              Vous préférez un pack tout prêt ?{' '}
              <Link to="/packs" className="link">
                Voir nos packs
              </Link>
            </p>
          </div>
          <aside className="hidden lg:block">
            <div className="sticky top-[92px]">
              <PackSummary onContinue={go} />
            </div>
          </aside>
        </div>
        <div className="mt-8 lg:hidden">
          <PackSummary onContinue={go} />
        </div>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pt-3 shadow-[0_-8px_24px_rgb(42_14_26/0.08)] lg:hidden">
        <div className="wrap">
          {custom.percent > 0 && formula !== 'sur_mesure' && q.count > 0 && (
            <p className={`mb-2 text-[13px] ${custom.missing === 0 ? 'font-semibold text-ok' : 'text-muted'}`}>
              {custom.missing === 0
                ? `Remise de ${custom.percent} % appliquée : −${eur(custom.amount)}`
                : `Encore ${plural(custom.missing, 'article différent', 'articles différents')} pour −${custom.percent} %`}
            </p>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">{plural(q.count, 'article', 'articles')}</p>
              <p className="tabular font-bold">{items.length ? eur(total, 'Sur devis') : eur(0)}</p>
            </div>
            <button type="button" className="btn btn-primary min-h-11 px-4" disabled={items.length === 0} onClick={go}>
              Continuer <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

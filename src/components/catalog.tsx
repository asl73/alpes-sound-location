import { CalendarDays, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { addDays, dateLong, eur, isoWeekday, rangeLabel, todayParis } from '../lib/format'
import { FORMULAS, firstBookableDay, packRetailValue, packStock, unitPrice } from '../lib/rules'
import { useCatalog, useQuote, useToast } from '../lib/store'
import type { Formula, Pack, Product } from '../lib/types'
import { Calendar, Modal, Pill, ProductVisual, QtyStepper, nextFridayFrom } from './ui'

// ------------------------------------------------------------------ Prix

export function PriceLine({ item, unit, compact = false }: { item: { price_24h: number | null; price_weekend: number | null }; unit?: string; compact?: boolean }) {
  const { state } = useQuote()
  const cells: { f: Formula; label: string; v: number | null }[] = [
    { f: '24h', label: '24 h', v: item.price_24h },
    { f: 'weekend', label: 'Week-end', v: item.price_weekend },
  ]
  return (
    <div className={`flex items-end gap-5 ${compact ? '' : 'flex-wrap'}`}>
      {cells.map((c) => {
        const active = state.formula === c.f
        return (
          <div key={c.f} className="leading-tight">
            <p className={`text-[12px] font-medium ${active ? 'text-bordeaux' : 'text-muted'}`}>{c.label}</p>
            <p className={`tabular text-[18px] font-bold ${active ? 'text-ink' : 'text-ink/70'}`}>{c.v === 0 ? 'Offert' : eur(c.v)}</p>
          </div>
        )
      })}
      {unit && !compact && <p className="pb-0.5 text-[13px] text-muted">{unit}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ Disponibilité

export function StockNote({ available, total }: { available: number | null; total: number }) {
  if (available === null) return <span className="text-[13px] text-muted">{total > 1 ? `${total} en stock` : 'En stock'}</span>
  if (available <= 0) return <Pill tone="bad">Indisponible à vos dates</Pill>
  if (available < total) return <Pill tone="warn">{available > 1 ? `${available} disponibles` : '1 disponible'} à vos dates</Pill>
  return <Pill tone="ok">Disponible à vos dates</Pill>
}

// ------------------------------------------------------------------ Ajout au devis

export function AddControl({ kind, id, name, max, disabled, disabledLabel }: { kind: 'product' | 'pack'; id: string; name: string; max: number; disabled?: boolean; disabledLabel?: string }) {
  const { qtyOf, setQty, add } = useQuote()
  const toast = useToast()
  const qty = qtyOf(kind, id)
  if (disabled)
    return (
      <button type="button" className="btn btn-outline btn-sm" disabled>
        {disabledLabel ?? 'Indisponible'}
      </button>
    )
  if (qty > 0) return <QtyStepper value={qty} onChange={(n) => setQty(kind, id, n)} max={Math.max(max, qty)} label={name} size="sm" />
  return (
    <button
      type="button"
      className="btn btn-primary btn-sm"
      disabled={max <= 0}
      onClick={() => {
        add(kind, id)
        toast(`${name} ajouté à votre devis`)
      }}
    >
      <Plus className="size-4" /> Ajouter
    </button>
  )
}

// ------------------------------------------------------------------ Cartes

export function ProductCard({ product }: { product: Product }) {
  const { categories } = useCatalog()
  const { availability, available } = useQuote()
  const cat = categories.find((c) => c.id === product.category_id)
  const avail = availability ? available(product.id) : null
  const packOnly = product.rental_mode === 'pack_uniquement'
  return (
    <article className="panel flex flex-col overflow-hidden">
      <Link to={`/materiel/${product.slug}`} className="block aspect-[4/3] overflow-hidden" tabIndex={-1} aria-hidden="true">
        <ProductVisual photo={product.photos[0]} icon={cat?.icon ?? 'box'} label={product.name} />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          {(product.brand || product.model) && <p className="text-[13px] text-muted">{[product.brand, product.model].filter(Boolean).join(' ')}</p>}
          <h3 className="text-[17px] leading-snug font-bold">
            <Link to={`/materiel/${product.slug}`} className="hover:text-bordeaux">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-[14px] text-muted">{product.summary}</p>
        </div>
        <PriceLine item={product} compact />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <StockNote available={avail} total={product.quantity} />
          <AddControl
            kind="product"
            id={product.id}
            name={product.name}
            max={avail ?? product.quantity}
            disabled={packOnly}
            disabledLabel="Uniquement en pack"
          />
        </div>
        {product.rental_mode === 'sur_demande' && <p className="text-[13px] text-warn">Location soumise à validation.</p>}
      </div>
    </article>
  )
}

export function PackContents({ pack }: { pack: Pack }) {
  const { products } = useCatalog()
  return (
    <ul className="space-y-1.5 text-[15px]">
      {pack.items.map((it) => {
        const p = products.find((x) => x.id === it.product_id)
        if (!p) return null
        return (
          <li key={it.product_id} className="flex gap-2.5">
            <Check className="mt-1 size-4 shrink-0 text-or" strokeWidth={2.4} />
            <span>
              <span className="tabular font-semibold">{it.quantity} ×</span>{' '}
              <Link to={`/materiel/${p.slug}`} className="hover:text-bordeaux hover:underline">
                {p.name}
              </Link>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function PackCard({ pack, large = false }: { pack: Pack; large?: boolean }) {
  const { products } = useCatalog()
  const { state, availability, available } = useQuote()
  const formula = state.formula === 'sur_mesure' ? 'weekend' : state.formula
  const retail = packRetailValue(pack, products, formula)
  const price = unitPrice(pack, formula)
  const stock = availability ? packStock(pack, available) : null
  return (
    <article className={`panel flex flex-col overflow-hidden ${large ? 'md:flex-row' : ''}`}>
      <div className={`relative ${large ? 'aspect-[16/10] md:aspect-auto md:w-[42%]' : 'aspect-[16/9]'} overflow-hidden`}>
        <ProductVisual photo={pack.photos[0]} icon="speaker" label={pack.name} size={large ? 'lg' : 'md'} className="object-[50%_30%]" />
        <p className="absolute top-3 left-3 rounded-[4px] bg-nuit/85 px-2.5 py-1 text-[13px] font-semibold text-or-2">{pack.audience}</p>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5 md:p-6">
        <div>
          <h3 className="display text-[30px] text-ink">
            <Link to={`/packs/${pack.slug}`} className="hover:text-bordeaux">
              {pack.name}
            </Link>
          </h3>
          <p className="mt-2 text-[15px] text-muted">{pack.tagline}</p>
        </div>
        <PackContents pack={pack} />
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
          <div>
            <PriceLine item={pack} compact />
            {retail !== null && price !== null && retail > price && (
              <p className="mt-1 text-[13px] text-ok">
                Soit {eur(retail - price)} d’économie sur le {formula === '24h' ? 'forfait 24 h' : 'week-end'}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            {stock !== null && (stock > 0 ? <Pill tone="ok">Disponible à vos dates</Pill> : <Pill tone="bad">Indisponible à vos dates</Pill>)}
            <AddControl kind="pack" id={pack.id} name={pack.name} max={stock ?? 1} />
          </div>
        </div>
      </div>
    </article>
  )
}

// ------------------------------------------------------------------ Choix des dates

export function DatesEditor({ stacked = false }: { stacked?: boolean }) {
  const { state, update, end, datesError } = useQuote()
  const { settings } = useCatalog()
  const today = todayParis()
  const min = firstBookableDay(settings, today)

  const setFormula = (f: Formula) => {
    if (f === state.formula) return
    let start = state.start
    let customEnd = state.customEnd
    if (f === 'weekend' && start) start = isoWeekday(start) === 5 ? start : nextFridayFrom(start)
    if (f === 'sur_mesure' && start && end) customEnd = end
    update({ formula: f, start, customEnd })
  }

  const pick = (iso: string) => {
    if (state.formula !== 'sur_mesure') return update({ start: iso, customEnd: null })
    if (!state.start || state.customEnd || iso <= state.start) return update({ start: iso, customEnd: null })
    update({ customEnd: iso })
  }

  const options: { f: Formula; help: string }[] = [
    { f: '24h', help: settings.booking.day_label },
    { f: 'weekend', help: settings.booking.weekend_label },
    { f: 'sur_mesure', help: 'Plusieurs jours en semaine ou plus long, tarif sur devis' },
  ]

  return (
    <div className={`grid gap-6 ${stacked ? '' : 'md:grid-cols-[1fr_minmax(0,340px)] md:gap-8'}`}>
      <div>
        <p className="label">Durée de location</p>
        <div className="grid gap-2" role="radiogroup" aria-label="Durée de location">
          {options.map((o) => {
            const active = state.formula === o.f
            return (
              <button
                key={o.f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormula(o.f)}
                className={`flex items-start gap-3 rounded-[6px] border px-4 py-3 text-left transition-colors ${active ? 'border-bordeaux bg-bordeaux/[0.04]' : 'border-line-2 bg-white hover:border-muted'}`}
              >
                <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-bordeaux' : 'border-line-2'}`}>
                  {active && <span className="size-2 rounded-full bg-bordeaux" />}
                </span>
                <span>
                  <span className="block font-semibold">{FORMULAS[o.f].label}</span>
                  <span className="block text-[14px] text-muted">{o.help}</span>
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-5 rounded-[6px] bg-creme px-4 py-3">
          <p className="text-[13px] font-semibold text-muted">Vos dates</p>
          {state.start && end && !datesError ? (
            <p className="font-semibold">{rangeLabel(state.start, end)}</p>
          ) : state.formula === 'sur_mesure' && state.start ? (
            <p className="font-semibold">Retrait le {dateLong(state.start)}. Choisissez le jour du retour.</p>
          ) : (
            <p className="text-muted">
              {state.formula === 'weekend' ? 'Choisissez le vendredi de votre week-end.' : state.formula === '24h' ? 'Choisissez le jour du retrait.' : 'Choisissez le jour du retrait, puis celui du retour.'}
            </p>
          )}
          {datesError && state.start && <p className="mt-1 text-[14px] font-medium text-bad">{datesError}</p>}
        </div>
      </div>
      <div className="panel p-4">
        <Calendar
          key={state.formula}
          value={state.start}
          rangeEnd={state.start && end ? end : null}
          onPick={pick}
          min={state.formula === 'weekend' ? nextFridayFrom(min) : min}
          mode={state.formula === 'weekend' ? 'friday' : 'day'}
        />
        {state.formula === 'weekend' && <p className="mt-3 text-center text-[13px] text-muted">Seuls les vendredis sont proposés : le week-end va jusqu’au lundi.</p>}
      </div>
    </div>
  )
}

/** Résumé des dates choisies, avec ouverture du sélecteur. Sert sur le catalogue et les fiches. */
export function DatesBar({ dark = false }: { dark?: boolean }) {
  const { state, end, datesError, availabilityLoading } = useQuote()
  const [open, setOpen] = useState(false)
  const ok = state.start && end && !datesError
  return (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[8px] px-4 py-3 ${dark ? 'bg-nuit-2 text-creme' : 'border border-line bg-white'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <CalendarDays className={`size-5 shrink-0 ${dark ? 'text-or-2' : 'text-bordeaux'}`} strokeWidth={1.7} />
          <div className="min-w-0">
            <p className={`text-[13px] ${dark ? 'text-creme/70' : 'text-muted'}`}>{FORMULAS[state.formula].label}</p>
            <p className="font-semibold">
              {ok ? rangeLabel(state.start!, end!) : 'Indiquez vos dates pour voir les disponibilités'}
              {availabilityLoading && <span className="ml-2 text-[13px] font-normal opacity-70">vérification…</span>}
            </p>
          </div>
        </div>
        <button type="button" className={`btn btn-sm ${dark ? 'btn-gold' : 'btn-outline'}`} onClick={() => setOpen(true)}>
          {ok ? 'Modifier les dates' : 'Choisir mes dates'}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Vos dates de location"
        footer={
          <button type="button" className="btn btn-primary mb-1 w-full" onClick={() => setOpen(false)}>
            {ok ? 'Voir les disponibilités' : 'Fermer'}
          </button>
        }
      >
        <DatesEditor stacked />
      </Modal>
    </>
  )
}

export const weekendOf = (iso: string) => ({ start: iso, end: addDays(iso, 3) })

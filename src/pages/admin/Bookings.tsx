import { ArrowLeft, Phone, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AdminTitle } from '../../components/layout'
import { CopyText, Empty, Field, Loading, Modal, Notice, Pill, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { addDays, dateLong, dateTime, eur, phoneHref, round2, timeOf, todayParis } from '../../lib/format'
import { DELIVERY_HELP, FORMULAS, deliveryLabel, depositFor, isDirect, isExpired, isPaidInFull, itemsTotal, statusView, unitPrice } from '../../lib/rules'
import { useCatalog, useToast } from '../../lib/store'
import type { AdminAction, Booking, BookingItem, BookingPatch, DeliveryMode, Formula } from '../../lib/types'
import { BookingRow, useAdminBookings } from './Dashboard'

const FILTERS: { key: string; label: string; test: (b: Booking, today: string) => boolean }[] = [
  { key: 'demande', label: 'Devis à faire', test: (b) => b.status === 'demande' },
  { key: 'validee', label: 'Paiement attendu', test: (b, t) => b.status === 'validee' && !isExpired(b, t) },
  { key: 'confirmee', label: 'Confirmées', test: (b) => b.status === 'confirmee' },
  { key: 'terminee', label: 'Terminées', test: (b) => b.status === 'terminee' },
  { key: 'autres', label: 'Refusées, annulées, non payées', test: (b, t) => b.status === 'refusee' || b.status === 'annulee' || isExpired(b, t) },
  { key: 'toutes', label: 'Toutes', test: () => true },
]

export function BookingsPage() {
  const { list, error } = useAdminBookings()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const today = todayParis()
  const filter = FILTERS.find((f) => f.key === params.get('statut')) ?? FILTERS[0]

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (list ?? [])
      .filter((b) => filter.test(b, today))
      .filter((b) => !q || [b.reference, b.client_name, b.client_email, b.client_phone].some((v) => v?.toLowerCase().includes(q)))
  }, [list, filter, search, today])

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list) return <Loading />

  return (
    <>
      <AdminTitle title="Réservations" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {FILTERS.map((f) => {
            const n = list.filter((b) => f.test(b, today)).length
            const on = f.key === filter.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setParams({ statut: f.key }, { replace: true })}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-semibold ${on ? 'border-nuit bg-nuit text-creme' : 'border-line-2 bg-white hover:border-muted'}`}
              >
                {f.label} <span className="tabular opacity-70">{n}</span>
              </button>
            )
          })}
        </div>
        <label className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <span className="sr-only">Rechercher</span>
          <input className="input pl-9" placeholder="Nom, e-mail, référence…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>
      <ul className="mt-5 space-y-2">
        {shown.map((b) => (
          <BookingRow key={b.id} b={b} today={today} />
        ))}
      </ul>
      {shown.length === 0 && (
        <div className="mt-5">
          <Empty title="Rien ici">Aucune réservation ne correspond à ce filtre.</Empty>
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Fiche réservation

const toPatch = (b: Booking): BookingPatch => ({
  formula: b.formula,
  start_date: b.start_date,
  end_date: b.end_date,
  delivery_mode: b.delivery_mode,
  zone_id: b.zone_id,
  address: b.address,
  technician_evenings: b.technician_evenings,
  event_type: b.event_type,
  guests: b.guests,
  venue: b.venue,
  client_name: b.client_name,
  client_phone: b.client_phone,
  client_note: b.client_note,
  admin_note: b.admin_note,
  valid_until: b.valid_until,
  deposit_amount: b.deposit_amount,
  items: b.items.map((i) => ({ ...i })),
})

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function BookingEditPage() {
  const { id } = useParams()
  const catalog = useCatalog()
  const toast = useToast()
  const today = todayParis()
  const pct = catalog.settings.booking.deposit_percent

  const [b, setB] = useState<Booking | null | undefined>(undefined)
  const [draft, setDraft] = useState<BookingPatch | null>(null)
  const [customDeposit, setCustomDeposit] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Record<string, number> | null>(null)
  const [refuseOpen, setRefuseOpen] = useState(false)
  // Valider ou confirmer malgré un manque de stock : on demande confirmation d'abord.
  const [stockCheck, setStockCheck] = useState<{ action: AdminAction; done: string } | null>(null)

  const load = useCallback(async () => {
    const booking = await api.admin.booking(id!)
    setB(booking)
    if (booking) {
      setDraft(toPatch(booking))
      const auto = depositFor(booking.total, pct)
      setCustomDeposit(booking.deposit_amount !== null && auto !== null && Math.abs(booking.deposit_amount - auto) > 0.009)
    }
  }, [id, pct])

  useEffect(() => {
    load().catch(() => setB(null))
  }, [load])

  useEffect(() => {
    if (!draft || draft.end_date <= draft.start_date) return
    api.availability(draft.start_date, draft.end_date, id).then(setAvailability).catch(() => setAvailability(null))
  }, [draft?.start_date, draft?.end_date, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = draft ? itemsTotal(draft.items) : null
  const deposit = draft ? (customDeposit ? draft.deposit_amount : depositFor(total, pct)) : null

  const conflicts = useMemo(() => {
    if (!draft || !availability) return []
    const need = new Map<string, number>()
    const add = (pid: string, q: number) => need.set(pid, (need.get(pid) ?? 0) + q)
    for (const it of draft.items) {
      if (it.kind === 'product' && it.ref_id) add(it.ref_id, it.quantity)
      if (it.kind === 'pack') {
        const comps = it.components ?? catalog.packs.find((k) => k.id === it.ref_id)?.items ?? []
        comps.forEach((c) => add(c.product_id, c.quantity * it.quantity))
      }
    }
    const out: string[] = []
    need.forEach((n, pid) => {
      const p = catalog.products.find((x) => x.id === pid)
      const a = availability[pid] ?? 0
      if (p && n > a) out.push(`${p.name} : ${n} demandé(s), ${a} disponible(s)`)
    })
    return out
  }, [draft, availability, catalog])

  if (b === undefined) return <Loading />
  if (b === null || !draft)
    return (
      <Empty title="Réservation introuvable" action={<Link to="/admin/reservations" className="btn btn-outline">Retour à la liste</Link>} />
    )

  const set = (patch: Partial<BookingPatch>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setItem = (i: number, patch: Partial<BookingItem>) => set({ items: draft.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) })
  const dirty = JSON.stringify(draft) !== JSON.stringify(toPatch(b)) || (customDeposit ? false : b.deposit_amount !== depositFor(total, pct))
  const v = statusView(b, today)
  const expired = isExpired(b, today)

  const save = async (quiet = false) => {
    setError(null)
    if (draft.end_date <= draft.start_date) {
      setError('La date de retour doit suivre la date de début.')
      return false
    }
    try {
      await api.admin.saveBooking(b.id, { ...draft, deposit_amount: customDeposit ? draft.deposit_amount : depositFor(total, pct) })
      if (!quiet) toast('Modifications enregistrées')
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  const markRefunded = async (paymentId: string) => {
    setBusy('refund')
    try {
      await api.admin.markRefunded(paymentId)
      toast('Paiement noté comme remboursé')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const run = async (action: AdminAction, message: string) => {
    setBusy(action)
    try {
      if (dirty && !(await save(true))) return
      await api.admin.action(b.id, action)
      toast(message)
      if (api.mode === 'demo' && ['valider', 'refuser'].includes(action)) toast('En ligne, le client reçoit aussi un e-mail.', 'info')
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const repriceFromCatalog = () => {
    const items = draft.items.map((it) => {
      if (it.kind === 'product') {
        const p = catalog.products.find((x) => x.id === it.ref_id)
        return p ? { ...it, unit_price: unitPrice(p, draft.formula) } : it
      }
      if (it.kind === 'pack') {
        const k = catalog.packs.find((x) => x.id === it.ref_id)
        return k ? { ...it, unit_price: unitPrice(k, draft.formula) } : it
      }
      if (it.kind === 'livraison') {
        const z = catalog.zones.find((x) => x.id === draft.zone_id)
        return z ? { ...it, name: `Livraison et reprise (${z.name.toLowerCase()})`, ref_id: z.id, unit_price: z.price } : it
      }
      return it
    })
    set({ items })
    toast('Prix du catalogue appliqués')
  }

  const addLine = (kind: BookingItem['kind'], refId?: string) => {
    let line: BookingItem = { kind, ref_id: null, name: 'Nouvelle ligne', quantity: 1, unit_price: null, sort: draft.items.length }
    if (kind === 'product') {
      const p = catalog.products.find((x) => x.id === refId)
      if (!p) return
      line = { ...line, ref_id: p.id, name: p.name, unit_price: unitPrice(p, draft.formula) }
    }
    if (kind === 'pack') {
      const k = catalog.packs.find((x) => x.id === refId)
      if (!k) return
      line = { ...line, ref_id: k.id, name: k.name, unit_price: unitPrice(k, draft.formula), components: k.items }
    }
    if (kind === 'autre' && refId === 'remise') line = { ...line, name: 'Remise commerciale', unit_price: -10 }
    set({ items: [...draft.items, line] })
  }

  const actions: { action: AdminAction; label: string; done: string; primary?: boolean }[] = []
  if (b.status === 'demande') actions.push({ action: 'valider', label: 'Valider et envoyer au client', done: 'Devis validé et envoyé', primary: true })
  if (b.status === 'validee') {
    actions.push({ action: 'acompte_recu', label: 'Acompte reçu hors ligne', done: 'Réservation confirmée' })
    if (isDirect(b)) actions.push({ action: 'valider', label: 'Envoyer comme devis (7 jours pour payer)', done: 'Devis envoyé', primary: expired })
    else actions.push({ action: 'valider', label: expired ? 'Renouveler le devis' : 'Renvoyer le devis', done: 'Devis renvoyé', primary: expired })
  }
  if (b.status === 'confirmee') {
    if (!b.balance_paid_at) actions.push({ action: 'solde_regle', label: 'Solde encaissé', done: 'Solde noté comme réglé' })
    if (b.caution_status === 'a_recevoir') actions.push({ action: 'caution_recue', label: 'Caution reçue', done: 'Caution notée comme reçue' })
    actions.push({ action: 'terminer', label: 'Marquer comme terminée', done: 'Réservation terminée', primary: true })
  }
  if ((b.status === 'terminee' || b.status === 'confirmee') && b.caution_status === 'recue')
    actions.push({ action: 'caution_restituee', label: 'Caution rendue', done: 'Caution notée comme rendue' })
  if (b.status === 'refusee' || b.status === 'annulee') actions.push({ action: 'rouvrir', label: 'Rouvrir la demande', done: 'Demande rouverte' })

  return (
    <div className="pb-20">
      <Link to="/admin/reservations" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Toutes les réservations
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <AdminTitle title={b.reference}>
            {b.client_name} · reçue le {dateTime(b.created_at)}
          </AdminTitle>
        </div>
        <Pill tone={v.tone}>{v.admin}</Pill>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-5">
          <Notice tone="bad" title="Conflit de stock avec d’autres réservations">
            <ul className="mt-1 list-disc pl-5">
              {conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="panel p-5">
            <h2 className="text-lg font-bold">Dates et logistique</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Formule" htmlFor="e-formula">
                <select id="e-formula" className="input" value={draft.formula} onChange={(e) => set({ formula: e.target.value as Formula })}>
                  {(Object.keys(FORMULAS) as Formula[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMULAS[f].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Début" htmlFor="e-start">
                <input id="e-start" type="date" className="input" value={draft.start_date} onChange={(e) => set({ start_date: e.target.value })} />
              </Field>
              <Field label="Retour" htmlFor="e-end">
                <input id="e-end" type="date" className="input" value={draft.end_date} onChange={(e) => set({ end_date: e.target.value })} />
              </Field>
              <Field label="Logistique" htmlFor="e-mode" hint={DELIVERY_HELP[draft.delivery_mode]}>
                <select id="e-mode" className="input" value={draft.delivery_mode} onChange={(e) => set({ delivery_mode: e.target.value as DeliveryMode })}>
                  {(['retrait', 'livraison', 'livraison_installation'] as DeliveryMode[]).map((m) => (
                    <option key={m} value={m}>
                      {deliveryLabel(m, catalog.settings)}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.delivery_mode !== 'retrait' && (
                <>
                  <Field label="Zone" htmlFor="e-zone">
                    <select id="e-zone" className="input" value={draft.zone_id ?? ''} onChange={(e) => set({ zone_id: e.target.value || null })}>
                      <option value="">Choisir…</option>
                      {catalog.zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({eur(z.price)})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Adresse" htmlFor="e-address">
                    <input id="e-address" className="input" value={draft.address} onChange={(e) => set({ address: e.target.value })} />
                  </Field>
                </>
              )}
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Lignes du devis</h2>
              <button type="button" className="btn btn-quiet btn-sm" onClick={repriceFromCatalog}>
                <RotateCcw className="size-4" /> Appliquer les prix du catalogue
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {draft.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 rounded-[6px] border border-line p-3 sm:grid-cols-[minmax(0,1fr)_76px_110px_96px_40px] sm:items-end">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="text-[12px] text-muted" htmlFor={`l-name-${i}`}>
                      {it.kind === 'pack' ? 'Pack' : it.kind === 'product' ? 'Article' : it.kind === 'livraison' ? 'Livraison' : it.kind === 'installation' ? 'Installation' : it.kind === 'technicien' ? 'Technicien' : 'Ligne libre'}
                    </label>
                    <input id={`l-name-${i}`} className="input min-h-10" value={it.name} onChange={(e) => setItem(i, { name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted" htmlFor={`l-qty-${i}`}>
                      Qté
                    </label>
                    <input id={`l-qty-${i}`} className="input tabular min-h-10" type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                  </div>
                  <div>
                    <label className="text-[12px] text-muted" htmlFor={`l-price-${i}`}>
                      Prix unitaire
                    </label>
                    <input
                      id={`l-price-${i}`}
                      className="input tabular min-h-10"
                      inputMode="decimal"
                      placeholder="À définir"
                      value={it.unit_price ?? ''}
                      onChange={(e) => setItem(i, { unit_price: numOrNull(e.target.value) })}
                    />
                  </div>
                  <p className="tabular pb-2.5 text-right font-semibold sm:text-right">{it.unit_price === null ? '—' : eur(round2(it.unit_price * it.quantity))}</p>
                  <button type="button" className="grid size-10 place-items-center self-end rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => set({ items: draft.items.filter((_, k) => k !== i) })} aria-label={`Supprimer ${it.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <select className="input w-auto min-h-9 text-[14px]" value="" onChange={(e) => addLine('product', e.target.value)} aria-label="Ajouter un article">
                <option value="">+ Article…</option>
                {catalog.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="input w-auto min-h-9 text-[14px]" value="" onChange={(e) => addLine('pack', e.target.value)} aria-label="Ajouter un pack">
                <option value="">+ Pack…</option>
                {catalog.packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addLine('autre')}>
                <Plus className="size-4" /> Ligne libre
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => addLine('autre', 'remise')}>
                <Plus className="size-4" /> Remise
              </button>
            </div>

            <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <div>
                <p className="text-[14px] text-muted">Total</p>
                <p className="tabular text-[26px] font-bold">{eur(total, 'Prix à compléter')}</p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-[14px] text-muted">
                  <input type="checkbox" className="accent-bordeaux" checked={customDeposit} onChange={(e) => {
                    setCustomDeposit(e.target.checked)
                    if (e.target.checked) set({ deposit_amount: depositFor(total, pct) })
                  }} />
                  Acompte personnalisé (sinon {pct} %)
                </label>
                {customDeposit ? (
                  <input className="input tabular mt-1 max-w-40" inputMode="decimal" value={draft.deposit_amount ?? ''} onChange={(e) => set({ deposit_amount: numOrNull(e.target.value) })} aria-label="Montant de l’acompte" />
                ) : (
                  <p className="tabular mt-1 text-[22px] font-bold">{eur(deposit, '—')}</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-bold">Message au client</h2>
            <p className="mt-1 text-[14px] text-muted">Visible dans son espace et repris dans l’e-mail de validation ou de refus.</p>
            <textarea className="input mt-3 min-h-24" value={draft.client_note} onChange={(e) => set({ client_note: e.target.value })} placeholder="Bonjour, tout est disponible à vos dates…" aria-label="Message au client" />
            <h2 className="mt-6 text-lg font-bold">Note privée</h2>
            <textarea className="input mt-3 min-h-20" value={draft.admin_note} onChange={(e) => set({ admin_note: e.target.value })} placeholder="Visible uniquement par vous" aria-label="Note privée" />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-5 text-[15px]">
            <h2 className="font-bold">Client</h2>
            <p className="mt-2 font-semibold">{b.client_name}</p>
            <p className="break-all">
              <CopyText text={b.client_email} />
            </p>
            {b.client_phone && (
              <a href={phoneHref(b.client_phone)} className="mt-1 inline-flex items-center gap-2 font-semibold text-bordeaux">
                <Phone className="size-4" /> {b.client_phone}
              </a>
            )}
          </section>
          <section className="panel p-5 text-[15px]">
            <h2 className="font-bold">Événement</h2>
            <p className="mt-2">{[b.event_type, b.guests && `${b.guests} invités`, b.venue].filter(Boolean).join(', ') || 'Non précisé'}</p>
            {b.technician_evenings > 0 && <p className="mt-1">Technicien demandé : {b.technician_evenings} soirée(s)</p>}
            {b.message && <p className="mt-3 rounded-[6px] bg-creme p-3 whitespace-pre-line">{b.message}</p>}
          </section>
          <section className="panel p-5 text-[15px]">
            <h2 className="font-bold">Paiement</h2>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Payé à la réservation</dt>
                <dd className="tabular text-right">
                  {b.deposit_paid_at ? `${eur(b.deposit_paid_amount)} (${isPaidInFull(b) ? 'totalité' : 'acompte'})` : 'rien pour l’instant'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Solde</dt>
                <dd className="tabular text-right">
                  {b.balance_paid_at ? 'réglé' : b.total !== null ? `${eur(Math.max(round2(b.total - (b.deposit_paid_amount ?? 0)), 0))} à encaisser` : 'à encaisser'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Caution</dt>
                <dd className="tabular text-right">
                  {eur(b.caution_amount ?? catalog.settings.booking.caution_amount)} ·{' '}
                  {b.caution_status === 'a_recevoir' ? 'à recevoir' : b.caution_status === 'recue' ? 'reçue' : 'rendue'}
                </dd>
              </div>
              {b.status === 'validee' && isDirect(b) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Matériel réservé</dt>
                  <dd className={`text-right ${expired ? 'text-bad' : ''}`}>{expired ? 'délai de paiement dépassé' : `jusqu’à ${timeOf(b.hold_until!)}, le temps du paiement`}</dd>
                </div>
              )}
              {b.status === 'validee' && !isDirect(b) && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Devis valable</dt>
                  <dd className={`text-right ${expired ? 'text-bad' : ''}`}>{b.valid_until ? `jusqu’au ${dateLong(b.valid_until)}` : '—'}</dd>
                </div>
              )}
            </dl>
            {(b.payments ?? [])
              .filter((p) => p.status !== 'paid')
              .map((p) => (
                <div key={p.id} className={`mt-3 rounded-[6px] p-3 text-[14px] ${p.status === 'a_rembourser' ? 'bg-bad-bg' : 'bg-creme'}`}>
                  <p className={`font-semibold ${p.status === 'a_rembourser' ? 'text-bad' : ''}`}>
                    {eur(p.amount)} {p.status === 'a_rembourser' ? 'à rembourser' : 'remboursé'}
                  </p>
                  <p className="mt-0.5 text-ink/80">
                    Paiement du {dateTime(p.created_at)}, arrivé alors que la réservation ne pouvait plus être confirmée (annulée, déjà payée ou matériel repris).
                    {p.status === 'a_rembourser' ? ' Le remboursement automatique n’a pas fonctionné : faites-le depuis votre tableau de bord Stripe, puis :' : ' Le client a été remboursé.'}
                  </p>
                  {p.status === 'a_rembourser' && (
                    <button type="button" className="btn btn-outline btn-sm mt-2" disabled={busy !== null} onClick={() => markRefunded(p.id)}>
                      {busy === 'refund' && <Spinner className="size-4" />} Marquer comme remboursé
                    </button>
                  )}
                </div>
              ))}
          </section>
          <section className="panel space-y-2 p-5">
            <h2 className="font-bold">Actions</h2>
            {b.status === 'demande' && conflicts.length === 0 && total !== null && <p className="text-[14px] text-muted">Le client recevra un e-mail avec le devis et le lien pour payer l’acompte de {eur(deposit)} ou la totalité.</p>}
            {b.status === 'demande' && total === null && <p className="text-[14px] text-warn">Indiquez un prix pour chaque ligne avant de valider.</p>}
            {actions.map((a) => (
              <button key={a.action} type="button" className={`btn w-full ${a.primary ? 'btn-primary' : 'btn-outline'}`} disabled={busy !== null || (a.action === 'valider' && total === null)} onClick={() => (conflicts.length > 0 && (a.action === 'valider' || a.action === 'acompte_recu') ? setStockCheck(a) : run(a.action, a.done))}>
                {busy === a.action && <Spinner className="size-4" />} {a.label}
              </button>
            ))}
            {['demande', 'validee'].includes(b.status) && (
              <button type="button" className="btn btn-danger w-full" disabled={busy !== null} onClick={() => setRefuseOpen(true)}>
                Refuser la demande
              </button>
            )}
            {['confirmee'].includes(b.status) && (
              <button type="button" className="btn btn-danger w-full" disabled={busy !== null} onClick={() => run('annuler', 'Réservation annulée')}>
                Annuler la réservation
              </button>
            )}
          </section>
          {b.status === 'validee' && !isDirect(b) && (
            <Field label="Devis valable jusqu’au" htmlFor="e-valid">
              <input id="e-valid" type="date" className="input" value={draft.valid_until ?? ''} min={today} onChange={(e) => set({ valid_until: e.target.value || null })} />
            </Field>
          )}
        </aside>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pt-3 backdrop-blur">
        <div className="wrap flex items-center justify-between gap-3">
          <p className="text-[14px] text-muted">{dirty ? 'Modifications non enregistrées' : 'Tout est enregistré'}</p>
          <button type="button" className="btn btn-primary" disabled={!dirty || busy !== null} onClick={async () => {
            setBusy('save')
            if (await save()) await load()
            setBusy(null)
          }}>
            {busy === 'save' && <Spinner className="size-4" />} Enregistrer
          </button>
        </div>
      </div>

      <Modal
        open={stockCheck !== null}
        onClose={() => setStockCheck(null)}
        title="Stock insuffisant"
        footer={
          <div className="mb-1 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setStockCheck(null)}>
              Retour
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={async () => {
                const a = stockCheck
                setStockCheck(null)
                if (a) await run(a.action, a.done)
              }}
            >
              Continuer quand même
            </button>
          </div>
        }
      >
        <p>D’autres réservations utilisent déjà ce matériel à ces dates :</p>
        <ul className="mt-2 list-disc pl-5">
          {conflicts.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="mt-3 text-[15px] text-muted">Continuez seulement si vous avez du matériel en plus, ou modifiez d’abord les lignes du devis.</p>
      </Modal>

      <Modal
        open={refuseOpen}
        onClose={() => setRefuseOpen(false)}
        title="Refuser la demande"
        footer={
          <div className="mb-1 flex justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setRefuseOpen(false)}>
              Retour
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={async () => {
                setRefuseOpen(false)
                await run('refuser', 'Demande refusée')
              }}
            >
              Refuser et prévenir le client
            </button>
          </div>
        }
      >
        <Field label="Message au client" htmlFor="r-note" hint="Expliquez brièvement pourquoi, et proposez si possible une autre date ou un autre matériel.">
          <textarea id="r-note" className="input min-h-28" value={draft.client_note} onChange={(e) => set({ client_note: e.target.value })} />
        </Field>
      </Modal>
    </div>
  )
}

export const nextValidity = (days: number) => addDays(todayParis(), days)

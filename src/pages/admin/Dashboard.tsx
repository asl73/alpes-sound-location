import { Ban, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AdminTitle } from '../../components/layout'
import { Field, Loading, Modal, Notice, Pill, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { addDays, dateLong, dateShort, eur, monthName, monthShort, parseISO, plural, rangeLabel, toISO, todayParis } from '../../lib/format'
import { blockOverlaps, blocksStock, deliveryLabel, isExpired, statusView } from '../../lib/rules'
import { useCatalog, useToast } from '../../lib/store'
import type { Block, Booking, ContactMessage, Product } from '../../lib/types'

export function useAdminBookings() {
  const [list, setList] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.admin.bookings().then(setList).catch((e) => setError((e as Error).message))
  }, [])
  return { list, error }
}

function Kpi({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <>
      <p className="text-[14px] text-muted">{label}</p>
      <p className="tabular mt-1 text-[30px] leading-none font-bold">{value}</p>
      {sub && <p className="mt-2 text-[13px] text-muted">{sub}</p>}
    </>
  )
  return to ? (
    <Link to={to} className="panel block p-4 transition-colors hover:border-bordeaux/40">
      {body}
    </Link>
  ) : (
    <div className="panel p-4">{body}</div>
  )
}

export function DashboardPage() {
  const { settings } = useCatalog()
  const { list, error } = useAdminBookings()
  const [messages, setMessages] = useState<ContactMessage[]>([])
  useEffect(() => {
    api.admin.messages().then(setMessages).catch(() => setMessages([]))
  }, [])
  const today = todayParis()
  const year = today.slice(0, 4)

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list) return <Loading />

  const pending = list.filter((b) => b.status === 'demande')
  const awaiting = list.filter((b) => b.status === 'validee' && !isExpired(b, today))
  const upcoming = list
    .filter((b) => b.status === 'confirmee' && b.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const soon = upcoming.filter((b) => b.start_date <= addDays(today, 30))
  const revenue = list.filter((b) => (b.status === 'confirmee' || b.status === 'terminee') && b.start_date.startsWith(year)).reduce((s, b) => s + (b.total ?? 0), 0)
  const target = settings.annual_target
  const unread = messages.filter((m) => !m.read).length
  const toRefund = list.filter((b) => b.payments?.some((p) => p.status === 'a_rembourser'))

  return (
    <>
      <AdminTitle title="Tableau de bord">{dateShort(today, true)}</AdminTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Devis à faire" value={String(pending.length)} sub={pending.length ? 'Durée sur mesure, livraison lointaine…' : 'Tout est à jour'} to="/admin/reservations?statut=demande" />
        <Kpi
          label="Paiements attendus"
          value={String(awaiting.length)}
          sub={awaiting.length ? `Au moins ${eur(awaiting.reduce((s, b) => s + (b.deposit_amount ?? 0), 0))} d’acomptes` : undefined}
          to="/admin/reservations?statut=validee"
        />
        <Kpi label="Événements dans 30 jours" value={String(soon.length)} sub={upcoming.length > soon.length ? `${upcoming.length} confirmés au total` : undefined} to="/admin/planning" />
        <Kpi label={`Chiffre d’affaires ${year}`} value={eur(revenue)} sub="Réservations confirmées et terminées" />
      </div>

      {target ? (
        <div className="panel mt-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px]">
            <p className="font-semibold">Plafond annuel de chiffre d’affaires</p>
            <p className="tabular text-muted">
              {eur(revenue)} sur {eur(target)}
            </p>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={revenue}>
            <div className={`h-full rounded-full ${revenue / target > 0.85 ? 'bg-bad' : revenue / target > 0.6 ? 'bg-or' : 'bg-ok'}`} style={{ width: `${Math.min((revenue / target) * 100, 100)}%` }} />
          </div>
          {revenue / target > 0.85 && <p className="mt-2 text-[13px] text-bad">Vous approchez du plafond : pensez à anticiper un changement de statut.</p>}
        </div>
      ) : null}

      {!settings.company.mediator_name?.trim() && (
        <div className="mt-3">
          <Notice tone="warn" title="Avant d’ouvrir le site aux clients" action={<Link to="/admin/parametres" className="link">Paramètres</Link>}>
            Indiquez votre médiateur de la consommation : c’est obligatoire pour louer à des particuliers, et il apparaît dans vos conditions de location.
          </Notice>
        </div>
      )}

      {toRefund.length > 0 && (
        <div className="mt-3">
          <Notice tone="bad" title={plural(toRefund.length, 'paiement à rembourser', 'paiements à rembourser')}>
            Le remboursement automatique n’a pas fonctionné pour{' '}
            {toRefund.map((b, i) => (
              <Fragment key={b.id}>
                {i > 0 && ', '}
                <Link to={`/admin/reservations/${b.id}`} className="link">
                  {b.reference}
                </Link>
              </Fragment>
            ))}
            . Remboursez depuis votre tableau de bord Stripe, puis indiquez-le dans la réservation.
          </Notice>
        </div>
      )}

      {unread > 0 && (
        <div className="mt-3">
          <Notice tone="info" title={`${plural(unread, 'message non lu', 'messages non lus')}`} action={<Link to="/admin/messages" className="link">Lire les messages</Link>} />
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-lg font-bold">Demandes de devis</h2>
          {pending.length === 0 ? (
            <p className="mt-3 text-muted">Aucune demande de devis en attente. Les autres réservations se font et se paient directement en ligne.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {[...pending].reverse().map((b) => (
                <BookingRow key={b.id} b={b} today={today} />
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="text-lg font-bold">Prochains événements</h2>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-muted">Aucun événement confirmé à venir.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {upcoming.slice(0, 6).map((b) => (
                <li key={b.id}>
                  <Link to={`/admin/reservations/${b.id}`} className="panel flex items-start gap-4 p-4 hover:border-bordeaux/40">
                    <div className="w-14 shrink-0 text-center">
                      <p className="display text-[30px] leading-none text-bordeaux">{parseISO(b.start_date).getDate()}</p>
                      <p className="text-[12px] text-muted">{monthShort(parseISO(b.start_date).getMonth())}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{b.client_name}</p>
                      <p className="text-[14px] text-muted">
                        {deliveryLabel(b.delivery_mode, settings)}
                        {b.technician_evenings ? ', avec technicien' : ''}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        Solde {b.balance_paid_at ? 'réglé' : 'à encaisser'} · caution{' '}
                        {b.caution_status === 'a_recevoir' ? 'à recevoir' : b.caution_status === 'recue' ? 'reçue' : 'rendue'}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}

export function BookingRow({ b, today }: { b: Booking; today: string }) {
  const v = statusView(b, today)
  return (
    <li>
      <Link to={`/admin/reservations/${b.id}`} className="panel flex flex-wrap items-center justify-between gap-3 p-4 hover:border-bordeaux/40">
        <div className="min-w-0">
          <p className="tabular text-[13px] text-muted">
            {b.reference} · reçue le {dateShort(b.created_at.slice(0, 10))}
          </p>
          <p className="font-semibold">{b.client_name}</p>
          <p className="text-[14px] text-muted">{rangeLabel(b.start_date, b.end_date)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Pill tone={v.tone}>{v.admin}</Pill>
          <p className="tabular font-bold">{eur(b.total, 'Prix à fixer')}</p>
        </div>
      </Link>
    </li>
  )
}

// ------------------------------------------------------------------ Planning

const DOT: Record<string, string> = { confirmee: 'bg-bordeaux', validee: 'bg-or', demande: 'border border-info bg-white' }

const blockLabel = (bl: Block, products: Product[]) => {
  if (!bl.product_id) return 'Tout le matériel'
  const p = products.find((x) => x.id === bl.product_id)
  return `${p?.name ?? 'Article supprimé'}${bl.quantity ? ` × ${bl.quantity}` : p && p.quantity > 1 ? ' (toutes les unités)' : ''}`
}
const blockRange = (bl: Block) => (bl.start_date === bl.end_date ? `le ${dateShort(bl.start_date)}` : `du ${dateShort(bl.start_date)} au ${dateShort(bl.end_date)}`)

/** Le matériel d'une réservation touché par un blocage (tout le matériel ou un article précis). */
function usesProduct(b: Booking, productId: string | null): boolean {
  if (!productId) return b.items.some((i) => i.kind === 'product' || i.kind === 'pack')
  return b.items.some((i) => (i.kind === 'product' && i.ref_id === productId) || (i.kind === 'pack' && (i.components ?? []).some((c) => c.product_id === productId)))
}

function BlockModal({ draft, onClose, onSaved, bookings }: { draft: Block | null; onClose: () => void; onSaved: () => void; bookings: Booking[] }) {
  const { products } = useCatalog()
  const toast = useToast()
  const [b, setB] = useState<Block | null>(draft)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setB(draft)
    setError(null)
  }, [draft])
  if (!b) return null
  const today = todayParis()
  const product = products.find((p) => p.id === b.product_id)
  const set = (patch: Partial<Block>) => setB({ ...b, ...patch })
  const touched = bookings.filter((x) => blocksStock(x, today) && blockOverlaps(b, x.start_date, x.end_date) && usesProduct(x, b.product_id))

  const save = async () => {
    if (!b.start_date || !b.end_date) return setError('Indiquez les dates.')
    if (b.end_date < b.start_date) return setError('La date de fin doit suivre la date de début.')
    setBusy(true)
    setError(null)
    try {
      await api.admin.saveBlock(b)
      toast(b.id ? 'Indisponibilité modifiée' : 'Matériel bloqué')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    setBusy(true)
    try {
      await api.admin.deleteBlock(b.id)
      toast('Indisponibilité supprimée')
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={b.id ? 'Modifier l’indisponibilité' : 'Bloquer du matériel'}
      footer={
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          {b.id ? (
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              <Trash2 className="size-4" /> Supprimer
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy && <Spinner className="size-4" />} {b.id ? 'Enregistrer' : 'Bloquer'}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Matériel" htmlFor="bl-product">
            <select id="bl-product" className="input" value={b.product_id ?? ''} onChange={(e) => set({ product_id: e.target.value || null, quantity: null })}>
              <option value="">Tout le matériel</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.quantity > 1 ? ` (${p.quantity})` : ''}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {product && product.quantity > 1 && (
          <div className="sm:col-span-2">
            <Field label="Quantité bloquée" htmlFor="bl-qty">
              <select id="bl-qty" className="input" value={b.quantity ?? ''} onChange={(e) => set({ quantity: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Toutes les unités ({product.quantity})</option>
                {Array.from({ length: product.quantity - 1 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label="Du" htmlFor="bl-start">
          <input id="bl-start" type="date" className="input" value={b.start_date} onChange={(e) => set({ start_date: e.target.value, end_date: b.end_date < e.target.value ? e.target.value : b.end_date })} />
        </Field>
        <Field label="Au (inclus)" htmlFor="bl-end">
          <input id="bl-end" type="date" className="input" value={b.end_date} min={b.start_date} onChange={(e) => set({ end_date: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Motif (pour vous)" htmlFor="bl-note" hint="Il n’est pas montré aux clients.">
            <input id="bl-note" className="input" value={b.note} maxLength={200} placeholder="Ex. : réparation, location par téléphone, vacances" onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </div>
      </div>
      <p className="mt-4 text-[14px] text-muted">
        Pendant ces jours, le matériel n’apparaît plus comme disponible sur le site. Une location rendue le matin du premier jour reste possible.
      </p>
      {touched.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn" title={`${plural(touched.length, 'réservation utilise', 'réservations utilisent')} ce matériel à ces dates`}>
            {touched.map((x) => `${x.reference} (${x.client_name})`).join(', ')}. Elles restent valables : prévenez le client si besoin.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </Modal>
  )
}

export function PlanningPage() {
  const { products } = useCatalog()
  const { list, error } = useAdminBookings()
  const today = todayParis()
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [selected, setSelected] = useState<string>(today)
  const [blocks, setBlocks] = useState<Block[] | null>(null)
  const [draft, setDraft] = useState<Block | null>(null)
  const loadBlocks = useCallback(() => {
    api.admin.blocks().then(setBlocks).catch(() => setBlocks([]))
  }, [])
  useEffect(() => {
    loadBlocks()
  }, [loadBlocks])

  const active = useMemo(
    () => (list ?? []).filter((b) => b.status === 'confirmee' || b.status === 'demande' || (b.status === 'validee' && !isExpired(b, today))),
    [list, today],
  )
  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list || !blocks) return <Loading />

  const first = new Date(cursor.y, cursor.m, 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (string | null)[] = [...Array.from({ length: offset }, () => null)]
  for (let d = 1; d <= days; d++) cells.push(toISO(new Date(cursor.y, cursor.m, d)))
  const on = (iso: string) => active.filter((b) => b.start_date <= iso && b.end_date >= iso)
  const blockedOn = (iso: string) => blocks.filter((bl) => bl.start_date <= iso && bl.end_date >= iso)
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const dayList = on(selected).sort((a, b) => a.status.localeCompare(b.status))
  const dayBlocks = blockedOn(selected)
  const upcomingBlocks = blocks.filter((bl) => bl.end_date >= today)
  const newBlock = (): Block => ({ id: '', product_id: null, quantity: null, start_date: selected < today ? today : selected, end_date: selected < today ? today : selected, note: '', created_at: '' })

  const blockRow = (bl: Block) => (
    <li key={bl.id}>
      <button type="button" onClick={() => setDraft(bl)} className="panel flex w-full items-start justify-between gap-3 p-4 text-left hover:border-bordeaux/40">
        <span className="flex min-w-0 gap-3">
          <Ban className="mt-0.5 size-5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block font-semibold">{blockLabel(bl, products)}</span>
            <span className="block text-[14px] text-muted">
              Indisponible {blockRange(bl)}
              {bl.note ? ` · ${bl.note}` : ''}
            </span>
          </span>
        </span>
        <Pencil className="mt-0.5 size-4 shrink-0 text-muted" aria-label="Modifier" />
      </button>
    </li>
  )

  return (
    <>
      <AdminTitle
        title="Planning"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setDraft(newBlock())}>
            <Ban className="size-4" /> Bloquer du matériel
          </button>
        }
      >
        Réservations, devis en attente et indisponibilités. Le matériel bloqué n’est plus proposé sur le site à ces dates.
      </AdminTitle>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_1fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className="grid size-10 place-items-center rounded hover:bg-creme" onClick={() => move(-1)} aria-label="Mois précédent">
              <ChevronLeft className="size-5" />
            </button>
            <p className="font-bold capitalize">
              {monthName(cursor.m)} {cursor.y}
            </p>
            <button type="button" className="grid size-10 place-items-center rounded hover:bg-creme" onClick={() => move(1)} aria-label="Mois suivant">
              <ChevronRight className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <span key={d} className="pb-1 text-[12px] font-semibold text-muted">
                {d}
              </span>
            ))}
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e${i}`} />
              const items = on(iso)
              const blocked = blockedOn(iso)
              const all = blocked.some((bl) => !bl.product_id)
              const isSel = iso === selected
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelected(iso)}
                  className={`flex min-h-16 flex-col items-center gap-1 rounded-[5px] border p-1 text-[14px] ${isSel ? 'border-bordeaux bg-bordeaux/[0.05]' : 'border-transparent hover:bg-creme'} ${iso === today ? 'font-bold' : ''} ${all ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(108_90_97/0.12)_6px_8px)]' : ''}`}
                  aria-label={`${iso}, ${plural(items.length, 'réservation', 'réservations')}${blocked.length ? `, ${plural(blocked.length, 'indisponibilité', 'indisponibilités')}` : ''}`}
                >
                  <span className="tabular">{parseISO(iso).getDate()}</span>
                  <span className="flex flex-wrap justify-center gap-0.5">
                    {items.slice(0, 4).map((b) => (
                      <span key={b.id} className={`size-2 rounded-full ${DOT[b.status]}`} />
                    ))}
                    {blocked.slice(0, 2).map((bl) => (
                      <span key={bl.id} className="size-2 rounded-[2px] bg-muted/70" />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-bordeaux" /> Confirmée
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-or" /> Paiement attendu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border border-info bg-white" /> Devis à faire
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-muted/70" /> Indisponible
            </span>
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold first-letter:uppercase">{dateLong(selected)}</h2>
          {dayList.length === 0 && dayBlocks.length === 0 ? (
            <p className="mt-2 text-muted">Rien de prévu ce jour-là.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {dayBlocks.map(blockRow)}
              {dayList.map((b) => (
                <BookingRow key={b.id} b={b} today={today} />
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-outline btn-sm mt-3" onClick={() => setDraft(newBlock())}>
            <Ban className="size-4" /> Bloquer du matériel ce jour-là
          </button>

          <h2 className="mt-8 text-lg font-bold">Indisponibilités à venir</h2>
          {upcomingBlocks.length === 0 ? (
            <p className="mt-2 text-muted">Aucune. Bloquez du matériel quand vous l’utilisez vous-même, qu’il est en réparation ou loué en dehors du site.</p>
          ) : (
            <ul className="mt-3 space-y-2">{upcomingBlocks.map(blockRow)}</ul>
          )}
        </div>
      </div>
      <BlockModal
        draft={draft}
        bookings={list}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null)
          loadBlocks()
        }}
      />
    </>
  )
}

import { Check } from 'lucide-react'
import { eur, round2 } from '../lib/format'
import { isDirect, isPaidInFull } from '../lib/rules'
import type { Booking, BookingItem } from '../lib/types'

/** Choix du client : payer l'acompte (le solde le jour J) ou la totalité tout de suite. */
export function PaymentChoice({
  total,
  deposit,
  percent,
  full,
  onChange,
}: {
  total: number | null
  deposit: number | null
  percent: number
  full: boolean
  onChange: (full: boolean) => void
}) {
  const balance = total !== null && deposit !== null ? round2(total - deposit) : null
  const options = [
    { full: false, title: `Acompte de ${percent} %`, amount: deposit, hint: balance ? `puis ${eur(balance)} le jour de la location` : 'le solde le jour de la location' },
    { full: true, title: 'Totalité', amount: total, hint: 'plus rien à régler le jour J' },
  ]
  return (
    <fieldset>
      <legend className="font-semibold">Que souhaitez-vous payer maintenant ?</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={String(o.full)}
            className={`flex cursor-pointer items-start gap-3 rounded-[6px] border p-3 transition-colors ${
              full === o.full ? 'border-bordeaux bg-bordeaux/[0.06]' : 'border-line-2 bg-white hover:border-bordeaux/50'
            }`}
          >
            <input type="radio" name="paiement" className="mt-1 size-4 shrink-0 accent-bordeaux" checked={full === o.full} onChange={() => onChange(o.full)} />
            <span>
              <span className="block font-semibold">
                {o.title} : <span className="tabular">{eur(o.amount)}</span>
              </span>
              <span className="block text-[14px] text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function LinesTable({ items, total, deposit, depositPercent }: { items: BookingItem[]; total: number | null; deposit: number | null; depositPercent: number }) {
  return (
    <div className="overflow-x-auto rounded-[6px] border border-line">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-paper text-[13px] text-muted">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Désignation</th>
            <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Qté</th>
            <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Prix</th>
            <th className="px-4 py-2.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id ?? i} className="border-t border-line">
              <td className="px-4 py-2.5">
                {it.name}
                <span className="tabular block text-[13px] text-muted sm:hidden">
                  {it.quantity} × {it.unit_price === null ? 'à définir' : it.unit_price === 0 ? 'offert' : eur(it.unit_price)}
                </span>
              </td>
              <td className="tabular hidden px-3 py-2.5 text-right sm:table-cell">{it.quantity}</td>
              <td className="tabular hidden px-3 py-2.5 text-right whitespace-nowrap sm:table-cell">{it.unit_price === null ? 'À définir' : it.unit_price === 0 ? 'Offert' : eur(it.unit_price)}</td>
              <td className="tabular px-4 py-2.5 text-right font-semibold whitespace-nowrap">{it.unit_price === null ? '—' : eur(it.unit_price * it.quantity)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/80">
            <td className="px-4 py-3 font-bold sm:hidden">Total</td>
            <td colSpan={3} className="hidden px-4 py-3 font-bold sm:table-cell">
              Total
            </td>
            <td className="tabular px-4 py-3 text-right text-lg font-bold whitespace-nowrap">{total === null ? 'À définir' : eur(total)}</td>
          </tr>
          {deposit !== null && (
            <tr className="border-t border-line text-[14px]">
              <td className="px-4 py-2 text-muted sm:hidden">Acompte ({depositPercent} %)</td>
              <td colSpan={3} className="hidden px-4 py-2 text-muted sm:table-cell">
                Acompte ({depositPercent} %)
              </td>
              <td className="tabular px-4 py-2 text-right font-semibold whitespace-nowrap">{eur(deposit)}</td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  )
}

/** Les étapes d'une réservation, vues par le client : directe (3 étapes) ou sur devis (4 étapes). */
export function Timeline({ booking, expired }: { booking: Booking; expired: boolean }) {
  const s = booking.status
  if (s === 'refusee' || s === 'annulee') return null
  const paid = ['confirmee', 'terminee'].includes(s)
  const done = s === 'terminee'
  const paidLabel = paid ? (isPaidInFull(booking) ? 'Location réglée' : 'Acompte réglé') : 'Paiement'
  const steps = isDirect(booking)
    ? [
        { key: 'booked', label: 'Réservation', ok: true },
        { key: 'paid', label: paidLabel, ok: paid },
        { key: 'done', label: 'Événement passé', ok: done },
      ]
    : [
        { key: 'sent', label: 'Demande envoyée', ok: true },
        { key: 'validated', label: expired ? 'Devis expiré' : 'Devis reçu', ok: ['validee', 'confirmee', 'terminee'].includes(s) && !expired },
        { key: 'paid', label: paidLabel, ok: paid },
        { key: 'done', label: 'Événement passé', ok: done },
      ]
  return (
    <ol className={`grid gap-2 ${steps.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
      {steps.map((st, i) => (
        <li key={st.key} className="flex flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : st.ok ? 'bg-or' : 'bg-line-2'}`} />
            <span className={`grid size-8 shrink-0 place-items-center rounded-full border-2 ${st.ok ? 'border-or bg-or text-nuit' : 'border-line-2 bg-white text-muted'}`}>
              {st.ok ? <Check className="size-4" strokeWidth={3} /> : <span className="tabular text-[13px] font-bold">{i + 1}</span>}
            </span>
            <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : steps[i + 1].ok ? 'bg-or' : 'bg-line-2'}`} />
          </div>
          <span className={`mt-2 text-[12px] leading-tight sm:text-[13px] ${st.ok ? 'font-semibold text-ink' : 'text-muted'}`}>{st.label}</span>
        </li>
      ))}
    </ol>
  )
}

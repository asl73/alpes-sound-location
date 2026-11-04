import { ArrowLeft, ArrowRight, CircleCheck, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { PaymentChoice } from '../../components/booking'
import { AddControl, DatesEditor } from '../../components/catalog'
import { useTitle } from '../../components/layout'
import { Field, Notice, ProductVisual, QtyStepper, Spinner, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { eur, plural, rangeLabel } from '../../lib/format'
import { DELIVERY_HELP, EVENT_TYPES, FORMULAS, HOLD_MINUTES, deliveryLabel, unitPrice } from '../../lib/rules'
import { useAuth, useCatalog, useQuote } from '../../lib/store'
import type { DeliveryMode } from '../../lib/types'

const STEPS = ['Dates', 'Matériel', 'Livraison', 'Événement', 'Réservation'] as const

export default function QuotePage() {
  useTitle('Mon devis')
  const catalog = useCatalog()
  const q = useQuote()
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const s = q.state

  const datesOk = !!s.start && !!q.end && !q.datesError
  const materialOk = s.lines.length > 0 && q.shortages.length === 0
  const logisticsOk = s.delivery_mode === 'retrait' || (!!s.zone_id && s.address.trim().length > 4)
  const done = [datesOk, materialOk, logisticsOk, true]
  const maxStep = done.findIndex((d) => !d) === -1 ? 5 : done.findIndex((d) => !d) + 1
  const requested = Number(params.get('etape') ?? (s.lines.length && datesOk ? 2 : 1))
  const step = Math.min(Math.max(requested, 1), maxStep)
  // Tous les prix sont connus : le client réserve et paie l'acompte tout de suite. Sinon, demande de devis.
  const direct = q.quote.quoteReasons.length === 0

  const go = (n: number) => {
    setParams({ etape: String(n) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Envoi
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  const [contact, setContact] = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '', email: '', password: '' })
  const [accept, setAccept] = useState(false)
  // Paiement de l'acompte (par défaut) ou de la totalité
  const [payFull, setPayFull] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmMail, setConfirmMail] = useState(false)

  useEffect(() => {
    if (user) setContact((c) => ({ ...c, full_name: c.full_name || user.full_name, phone: c.phone || user.phone }))
  }, [user])

  const send = async () => {
    setError(null)
    if (!accept) return setError(direct ? 'Acceptez les conditions de location pour réserver.' : 'Acceptez les conditions de location pour envoyer votre demande.')
    if (!user || authMode === 'signup') {
      if (!contact.full_name.trim() || contact.phone.replace(/\D/g, '').length < 9) return setError('Indiquez votre nom et un numéro de téléphone pour que nous puissions vous joindre.')
    }
    setSending(true)
    try {
      if (!user) {
        if (authMode === 'signup') {
          const r = await api.signUp({ email: contact.email, password: contact.password, full_name: contact.full_name, phone: contact.phone })
          if (r.needsConfirmation) {
            setConfirmMail(true)
            return
          }
        } else {
          await api.signIn(contact.email, contact.password)
        }
        await refresh()
      }
      const res = await api.createBooking({
        formula: s.formula,
        start_date: s.start!,
        end_date: q.end!,
        lines: s.lines,
        delivery_mode: s.delivery_mode,
        zone_id: s.delivery_mode === 'retrait' ? null : s.zone_id,
        address: s.delivery_mode === 'retrait' ? '' : s.address.trim(),
        technician_evenings: s.technician_evenings,
        event_type: s.event_type,
        guests: s.guests ? Number(s.guests) : null,
        venue: s.venue.trim(),
        message: s.message.trim(),
        contact: { full_name: contact.full_name.trim() || user?.full_name || '', phone: contact.phone.trim() || user?.phone || '' },
      })
      q.clear()
      q.update({ start: null, customEnd: null, message: '', venue: '', guests: '', event_type: '', address: '', technician_evenings: 0 })
      if (res.status === 'validee') {
        // Réservation directe : direction la page de paiement (acompte ou totalité)
        try {
          const { url } = await api.payDeposit(res.id, payFull)
          if (url.startsWith('/')) navigate(url)
          else window.location.assign(url)
        } catch {
          navigate(`/espace-client/reservations/${res.id}?paiement=erreur`)
        }
        return
      }
      navigate(`/devis/envoye/${res.id}?ref=${encodeURIComponent(res.reference)}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  const sendLabel = direct ? `Réserver et payer ${eur(payFull ? q.quote.total : q.quote.deposit)}` : 'Envoyer ma demande'
  const nextLabel = step === 5 ? sendLabel : `Continuer : ${STEPS[step].toLowerCase()}`
  const canNext = step < 5 ? done[step - 1] : true

  return (
    <div className="pb-28 md:pb-0">
      <div className="bg-nuit text-creme">
        <div className="wrap pt-8 pb-6">
          <h1 className="display text-[42px] md:text-[56px]">Mon devis</h1>
          <ol className="no-scrollbar mt-5 flex gap-2 overflow-x-auto" aria-label="Étapes">
            {STEPS.map((label, i) => {
              const n = i + 1
              const reachable = n <= maxStep
              const current = n === step
              return (
                <li key={label} className="shrink-0">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => go(n)}
                    aria-current={current ? 'step' : undefined}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[14px] font-semibold transition-colors ${
                      current ? 'border-or bg-or text-nuit' : reachable ? 'border-nuit-3 text-creme hover:border-or-2' : 'border-nuit-3 text-creme/40'
                    }`}
                  >
                    <span className="tabular">{n}</span>
                    {label}
                    {n < 5 && done[i] && !current && <CircleCheck className="size-4 text-or-2" />}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      </div>

      <div className="wrap mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {step === 1 && (
            <StepCard title="Quand avez-vous besoin du matériel ?">
              <DatesEditor />
            </StepCard>
          )}
          {step === 2 && <MaterialStep />}
          {step === 3 && <LogisticsStep />}
          {step === 4 && <EventStep />}
          {step === 5 && (
            <StepCard title={direct ? 'Vérifiez et réservez' : 'Vérifiez et envoyez votre demande'}>
              <Recap />
              <div className="mt-8 border-t border-line pt-6">
                <h3 className="text-lg font-bold">Vos coordonnées</h3>
                {user ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Nom et prénom" htmlFor="q-name">
                      <input id="q-name" className="input" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} autoComplete="name" />
                    </Field>
                    <Field label="Téléphone" htmlFor="q-phone">
                      <input id="q-phone" className="input" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" />
                    </Field>
                    <p className="text-[14px] text-muted sm:col-span-2">
                      {direct ? 'La confirmation arrivera' : 'Notre réponse arrivera'} sur <strong className="text-ink">{user.email}</strong> et dans votre espace client.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="inline-flex rounded-[6px] border border-line-2 bg-paper p-1" role="tablist">
                      {(['signup', 'login'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          role="tab"
                          aria-selected={authMode === m}
                          onClick={() => setAuthMode(m)}
                          className={`rounded-[4px] px-3 py-1.5 text-[14px] font-semibold ${authMode === m ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                        >
                          {m === 'signup' ? 'Créer mon compte' : 'J’ai déjà un compte'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-[14px] text-muted">Votre compte vous permet de payer en ligne et de retrouver votre réservation.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {authMode === 'signup' && (
                        <>
                          <Field label="Nom et prénom" htmlFor="q-name">
                            <input id="q-name" className="input" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} autoComplete="name" />
                          </Field>
                          <Field label="Téléphone" htmlFor="q-phone">
                            <input id="q-phone" className="input" type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} autoComplete="tel" />
                          </Field>
                        </>
                      )}
                      <Field label="E-mail" htmlFor="q-email">
                        <input id="q-email" className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="email" />
                      </Field>
                      <Field label="Mot de passe" htmlFor="q-password" hint={authMode === 'signup' ? '8 caractères minimum' : undefined}>
                        <input
                          id="q-password"
                          className="input"
                          type="password"
                          value={contact.password}
                          onChange={(e) => setContact({ ...contact, password: e.target.value })}
                          autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                        />
                      </Field>
                    </div>
                    {authMode === 'login' && (
                      <Link to="/mot-de-passe-oublie" className="link mt-2 inline-block text-[14px] font-normal">
                        Mot de passe oublié
                      </Link>
                    )}
                  </div>
                )}
                <label className="mt-6 flex items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 size-5 accent-bordeaux" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                  <span>
                    J’accepte les{' '}
                    <Link to="/cgv" className="link" target={__DEMO__ ? undefined : '_blank'}>
                      conditions de location
                    </Link>{' '}
                    : acompte de {catalog.settings.booking.deposit_percent} % ou totalité à la réservation, solde éventuel le jour J, caution de {eur(q.quote.caution)}.
                  </span>
                </label>
                {confirmMail && (
                  <div className="mt-5">
                    <Notice tone="info" title="Confirmez votre adresse e-mail">
                      Nous venons de vous envoyer un lien. Cliquez dessus, puis revenez sur cette page : votre devis est gardé en mémoire.
                    </Notice>
                  </div>
                )}
                {error && (
                  <div className="mt-5">
                    <Notice tone="bad">{error}</Notice>
                  </div>
                )}
                {direct ? (
                  <div className="mt-6">
                    <PaymentChoice
                      total={q.quote.total}
                      deposit={q.quote.deposit}
                      percent={catalog.settings.booking.deposit_percent}
                      full={payFull}
                      onChange={setPayFull}
                    />
                    <p className="mt-3 text-[14px] text-muted">
                      Vous payez par carte sur la page sécurisée de Stripe : la réservation est confirmée aussitôt. Le matériel vous est réservé pendant{' '}
                      {HOLD_MINUTES === 60 ? 'une heure' : `${HOLD_MINUTES} minutes`}, le temps du paiement.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5">
                    <Notice tone="info" title="Demande de devis">
                      Votre demande comprend {q.quote.quoteReasons.join(', ')} : nous vous envoyons le prix {catalog.settings.booking.response_delay}. Rien à
                      payer d’ici là : vous réglerez ensuite en ligne l’acompte ou la totalité.
                    </Notice>
                  </div>
                )}
              </div>
            </StepCard>
          )}

          <div className="mt-6 hidden items-center justify-between gap-3 md:flex">
            {step > 1 ? (
              <button type="button" className="btn btn-outline" onClick={() => go(step - 1)}>
                <ArrowLeft className="size-4" /> Retour
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn-primary" disabled={!canNext || sending} onClick={() => (step === 5 ? send() : go(step + 1))}>
              {sending && <Spinner className="size-4" />}
              {nextLabel} {step < 5 && <ArrowRight className="size-4" />}
            </button>
          </div>
          {!canNext && step < 5 && <p className="mt-3 hidden text-right text-[14px] text-muted md:block">{blockReason(step, q, s)}</p>}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-[92px]">
            <Summary />
          </div>
        </aside>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pt-3 shadow-[0_-8px_24px_rgb(42_14_26/0.08)] md:hidden">
        <div className="wrap">
          {!canNext && step < 5 && <p className="mb-2 text-[13px] text-muted">{blockReason(step, q, s)}</p>}
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button type="button" className="btn btn-outline min-h-11 px-3" onClick={() => go(step - 1)} aria-label="Étape précédente">
                <ArrowLeft className="size-4" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">{plural(q.count, 'article', 'articles')}</p>
              <p className="tabular font-bold">{q.quote.total === null ? 'Sur devis' : eur(q.quote.total)}</p>
            </div>
            <button type="button" className="btn btn-primary min-h-11 px-4" disabled={!canNext || sending} onClick={() => (step === 5 ? send() : go(step + 1))}>
              {sending && <Spinner className="size-4" />}
              {step === 5 ? (direct ? 'Réserver' : 'Envoyer') : 'Continuer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function blockReason(step: number, q: ReturnType<typeof useQuote>, s: ReturnType<typeof useQuote>['state']): string {
  if (step === 1) return q.datesError ?? 'Choisissez vos dates pour continuer.'
  if (step === 2) return s.lines.length === 0 ? 'Ajoutez au moins un pack ou un article.' : 'Certains articles ne sont pas disponibles en quantité suffisante.'
  if (step === 3) return !s.zone_id ? 'Choisissez la zone de livraison.' : 'Indiquez l’adresse de livraison.'
  return ''
}

function StepCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-5 md:p-7">
      <h2 className="text-[22px] font-bold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------------ Étape 2

function MaterialStep() {
  const catalog = useCatalog()
  const q = useQuote()
  const s = q.state
  const formula = s.formula
  const lines = s.lines

  return (
    <div className="space-y-6">
      <StepCard title="Votre matériel">
        {lines.length === 0 ? (
          <div className="rounded-[6px] bg-creme px-5 py-6">
            <p className="font-semibold">Votre devis est vide.</p>
            <p className="mt-1 text-[15px] text-muted">Commencez par un pack ci-dessous, ou ajoutez des articles à l’unité.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((l) => {
              const item = l.kind === 'product' ? catalog.products.find((p) => p.id === l.ref_id) : catalog.packs.find((p) => p.id === l.ref_id)
              if (!item) return null
              const icon = l.kind === 'product' ? catalog.categories.find((c) => c.id === (item as { category_id: string }).category_id)?.icon ?? 'box' : 'speaker'
              const price = unitPrice(item, formula)
              const short = l.kind === 'product' ? q.shortages.find((x) => x.product.id === l.ref_id) : undefined
              return (
                <li key={l.kind + l.ref_id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="size-16 shrink-0 overflow-hidden rounded-[6px]">
                    <ProductVisual photo={item.photos[0]} icon={icon} label={item.name} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {l.kind === 'pack' && <span className="mr-2 rounded-[3px] bg-nuit px-1.5 py-0.5 align-[2px] text-[11px] font-bold text-or-2 uppercase">Pack</span>}
                        <Link to={`/${l.kind === 'pack' ? 'packs' : 'materiel'}/${item.slug}`} className="hover:text-bordeaux">
                          {item.name}
                        </Link>
                      </p>
                      <p className="tabular text-[14px] text-muted">{price === null ? 'Prix sur devis' : price === 0 ? 'Offert' : `${eur(price)} ${formula === '24h' ? 'les 24 h' : 'le week-end'}`}</p>
                      {short && <p className="text-[14px] font-medium text-bad">{short.available > 0 ? `Seulement ${short.available} disponible(s) à vos dates.` : 'Indisponible à vos dates.'}</p>}
                    </div>
                    <div className="mt-2 flex items-center gap-2 sm:mt-0">
                      <QtyStepper value={l.quantity} onChange={(n) => q.setQty(l.kind, l.ref_id, n)} min={1} max={l.kind === 'product' ? (item as { quantity: number }).quantity : 5} label={item.name} size="sm" />
                      <button type="button" className="grid size-9 place-items-center rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => q.remove(l.kind, l.ref_id)} aria-label={`Retirer ${item.name}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {q.shortages.length > 0 && (
          <div className="mt-5">
            <Notice tone="bad" title="Stock insuffisant à vos dates">
              Réduisez les quantités signalées ou changez de dates. Les packs utilisent aussi ce matériel.
            </Notice>
          </div>
        )}
      </StepCard>

      <section className="panel p-5 md:p-7">
        <h2 className="text-lg font-bold">Ajouter un pack</h2>
        <ul className="mt-4 divide-y divide-line">
          {catalog.packs.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-semibold">{k.name}</p>
                <p className="text-[14px] text-muted">
                  {k.audience} · <span className="tabular">{eur(unitPrice(k, formula))}</span>
                </p>
              </div>
              <AddControl kind="pack" id={k.id} name={k.name} max={5} />
            </li>
          ))}
        </ul>
      </section>

      <details className="panel group p-5 md:p-7">
        <summary className="cursor-pointer list-none text-lg font-bold marker:hidden">
          <span className="flex items-center justify-between">
            Ajouter un article à l’unité
            <span className="text-2xl text-or transition-transform group-open:rotate-45" aria-hidden="true">
              +
            </span>
          </span>
        </summary>
        <div className="mt-4 space-y-6">
          {catalog.categories.map((c) => {
            const list = catalog.products.filter((p) => p.category_id === c.id && p.rental_mode !== 'pack_uniquement')
            if (!list.length) return null
            return (
              <div key={c.id}>
                <p className="text-[13px] font-semibold text-or">{c.name}</p>
                <ul className="mt-1 divide-y divide-line">
                  {list.map((p) => {
                    const avail = q.availability ? q.available(p.id) : p.quantity
                    return (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-medium">{p.name}</p>
                          <p className="tabular text-[13px] text-muted">
                            {unitPrice(p, formula) === 0 ? 'Offert' : eur(unitPrice(p, formula))} {p.unit_label}
                            {q.availability && <span className={avail > 0 ? '' : 'text-bad'}> · {avail > 0 ? `${avail} disponible(s)` : 'indisponible'}</span>}
                          </p>
                        </div>
                        <AddControl kind="product" id={p.id} name={p.name} max={avail} />
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

// ------------------------------------------------------------------ Étape 3

function LogisticsStep() {
  const { zones, services, settings } = useCatalog()
  const { state: s, update } = useQuote()
  const install = services.find((x) => x.id === 'installation')
  const tech = services.find((x) => x.id === 'technicien')
  const modes: { m: DeliveryMode; price: string }[] = [
    { m: 'retrait', price: 'Gratuit' },
    { m: 'livraison', price: 'Selon la distance' },
    { m: 'livraison_installation', price: install ? `Distance + ${eur(install.price)}` : 'Selon la distance' },
  ]
  return (
    <div className="space-y-6">
      <StepCard title="Comment récupérez-vous le matériel ?">
        <div className="grid gap-2" role="radiogroup" aria-label="Retrait ou livraison">
          {modes.map(({ m, price }) => {
            const on = s.delivery_mode === m
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => update({ delivery_mode: m })}
                className={`flex items-start justify-between gap-4 rounded-[6px] border px-4 py-3 text-left ${on ? 'border-bordeaux bg-bordeaux/[0.04]' : 'border-line-2 bg-white hover:border-muted'}`}
              >
                <span className="flex items-start gap-3">
                  <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-bordeaux' : 'border-line-2'}`}>{on && <span className="size-2 rounded-full bg-bordeaux" />}</span>
                  <span>
                    <span className="block font-semibold">{deliveryLabel(m, settings)}</span>
                    <span className="block text-[14px] text-muted">{DELIVERY_HELP[m]}</span>
                  </span>
                </span>
                <span className="tabular shrink-0 text-[14px] font-semibold">{price}</span>
              </button>
            )
          })}
        </div>

        {s.delivery_mode === 'retrait' ? (
          <p className="mt-5 rounded-[6px] bg-creme px-4 py-3 text-[15px]">
            Retrait et retour au {settings.company.address}, {settings.company.postal_code} {settings.company.city}. Nous convenons ensemble des horaires.
          </p>
        ) : (
          <div className="mt-6 space-y-5">
            <div>
              <p className="label">Distance depuis {settings.company.city}</p>
              <div className="grid gap-2" role="radiogroup" aria-label="Zone de livraison">
                {zones.map((z) => {
                  const on = s.zone_id === z.id
                  return (
                    <button
                      key={z.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => update({ zone_id: z.id })}
                      className={`flex items-start justify-between gap-4 rounded-[6px] border px-4 py-3 text-left ${on ? 'border-bordeaux bg-bordeaux/[0.04]' : 'border-line-2 bg-white hover:border-muted'}`}
                    >
                      <span>
                        <span className="block font-semibold">{z.name}</span>
                        <span className="block text-[14px] text-muted">{z.description}</span>
                      </span>
                      <span className="tabular shrink-0 font-bold">{eur(z.price)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <Field label="Adresse de livraison" htmlFor="q-address" hint="Nom de la salle et adresse complète. Précisez les accès dans votre message si besoin.">
              <input id="q-address" className="input" value={s.address} onChange={(e) => update({ address: e.target.value })} placeholder="Salle des fêtes, 12 rue des Écoles, 73800 Montmélian" autoComplete="street-address" />
            </Field>
          </div>
        )}
      </StepCard>

      {tech && (
        <StepCard title="Présence technique">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <Toggle checked={s.technician_evenings > 0} onChange={(v) => update({ technician_evenings: v ? 1 : 0 })} label="Un technicien reste pendant l’événement" />
              <p className="mt-2 text-[14px] text-muted">
                {tech.description} <span className="tabular font-semibold text-ink">{eur(tech.price)}</span> {tech.unit_label}.
              </p>
            </div>
            {s.technician_evenings > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-[14px] text-muted">Soirées</span>
                <QtyStepper value={s.technician_evenings} onChange={(n) => update({ technician_evenings: n })} min={1} max={5} label="soirée" size="sm" />
              </div>
            )}
          </div>
        </StepCard>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Étape 4

function EventStep() {
  const { state: s, update } = useQuote()
  return (
    <StepCard title="Parlez-nous de votre événement">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type d’événement" htmlFor="q-type" optional>
          <select id="q-type" className="input" value={s.event_type} onChange={(e) => update({ event_type: e.target.value })}>
            <option value="">Choisir…</option>
            {EVENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre d’invités" htmlFor="q-guests" optional>
          <input id="q-guests" className="input" type="number" inputMode="numeric" min={1} value={s.guests} onChange={(e) => update({ guests: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Lieu" htmlFor="q-venue" optional hint="Salle, domaine, jardin, en intérieur ou en extérieur…">
            <input id="q-venue" className="input" value={s.venue} onChange={(e) => update({ venue: e.target.value })} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Votre message" htmlFor="q-message" optional hint="Horaires, accès, longueurs de câbles, besoins particuliers : tout ce qui nous aide à bien préparer.">
            <textarea id="q-message" className="input min-h-32" value={s.message} onChange={(e) => update({ message: e.target.value })} />
          </Field>
        </div>
      </div>
    </StepCard>
  )
}

// ------------------------------------------------------------------ Récapitulatifs

function Recap() {
  const { settings, zones } = useCatalog()
  const { state: s, end } = useQuote()
  const zone = zones.find((z) => z.id === s.zone_id)
  const rows: [string, string][] = [
    ['Dates', s.start && end ? `${rangeLabel(s.start, end)} (${FORMULAS[s.formula].label.toLowerCase()})` : '—'],
    ['Logistique', s.delivery_mode === 'retrait' ? deliveryLabel('retrait', settings) : `${deliveryLabel(s.delivery_mode, settings)}${zone ? `, ${zone.name.toLowerCase()}` : ''}`],
  ]
  if (s.delivery_mode !== 'retrait') rows.push(['Adresse', s.address])
  if (s.technician_evenings) rows.push(['Présence technique', plural(s.technician_evenings, 'soirée', 'soirées')])
  if (s.event_type || s.guests) rows.push(['Événement', [s.event_type, s.guests && `${s.guests} invités`].filter(Boolean).join(', ')])
  return (
    <div className="space-y-6">
      <dl className="divide-y divide-line rounded-[6px] border border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-[14px] text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="lg:hidden">
        <Summary flat />
      </div>
    </div>
  )
}

export function Summary({ flat = false }: { flat?: boolean }) {
  const { settings } = useCatalog()
  const { quote, state, end, datesError } = useQuote()
  return (
    <div className={flat ? '' : 'panel overflow-hidden'}>
      {!flat && (
        <div className="bg-nuit px-5 py-4 text-creme">
          <p className="font-bold">Récapitulatif</p>
          <p className="text-[14px] text-creme/75">{state.start && end && !datesError ? rangeLabel(state.start, end) : 'Dates à choisir'}</p>
        </div>
      )}
      <div className={flat ? '' : 'p-5'}>
        {quote.items.length === 0 ? (
          <p className="text-[15px] text-muted">Aucun article pour l’instant.</p>
        ) : (
          <ul className="space-y-2.5 text-[15px]">
            {quote.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {it.quantity > 1 && <span className="tabular font-semibold">{it.quantity} × </span>}
                  {it.name}
                </span>
                <span className="tabular shrink-0 font-semibold">{it.unit_price === null ? 'Sur devis' : it.unit_price === 0 ? 'Offert' : eur(it.unit_price * it.quantity)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold">Total estimé</span>
            <span className="tabular text-[22px] font-bold">{quote.items.length === 0 ? eur(0) : eur(quote.total)}</span>
          </div>
          {quote.total !== null && quote.items.length > 0 ? (
            <p className="mt-1 text-[14px] text-muted">
              Acompte de {settings.booking.deposit_percent} % : <span className="tabular font-semibold text-ink">{eur(quote.deposit)}</span> (ou la totalité),{' '}
              {quote.quoteReasons.length === 0 ? 'à régler en ligne pour réserver.' : 'à régler une fois votre demande acceptée.'}
            </p>
          ) : (
            quote.items.length > 0 && <p className="mt-1 text-[14px] text-muted">Certains prix seront fixés dans votre devis.</p>
          )}
          <p className="mt-2 text-[13px] text-muted">
            {settings.company.vat_note}. Caution de {eur(quote.items.length ? quote.caution : settings.booking.caution_amount)} à la remise du matériel.
          </p>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Confirmation

export function QuoteSentPage() {
  useTitle('Demande envoyée')
  const { id } = useParams()
  const [params] = useSearchParams()
  const { settings } = useCatalog()
  return (
    <div className="wrap max-w-2xl py-16 text-center">
      <CircleCheck className="mx-auto size-14 text-ok" strokeWidth={1.5} />
      <h1 className="display mt-4 text-[48px]">Demande envoyée</h1>
      <p className="mt-3 text-[17px] text-ink/80">
        Votre demande <strong className="tabular">{params.get('ref')}</strong> est bien arrivée. Nous préparons votre devis et vous l’envoyons{' '}
        {settings.booking.response_delay} par e-mail.
      </p>
      <ol className="mx-auto mt-8 max-w-md space-y-3 text-left text-[15px]">
        {[
          'Vous recevez le prix par e-mail et dans votre espace client.',
          `Vous réglez en ligne l’acompte de ${settings.booking.deposit_percent} % ou la totalité, depuis votre espace client.`,
          'La date est réservée : nous préparons votre matériel.',
        ].map((t, i) => (
          <li key={t} className="flex gap-3">
            <span className="display grid size-7 shrink-0 place-items-center rounded-full bg-nuit text-[15px] text-or-2">{i + 1}</span>
            <span className="pt-0.5">{t}</span>
          </li>
        ))}
      </ol>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to={`/espace-client/reservations/${id}`} className="btn btn-primary">
          Suivre ma demande
        </Link>
        <Link to="/" className="btn btn-outline">
          Retour à l’accueil
        </Link>
      </div>
    </div>
  )
}

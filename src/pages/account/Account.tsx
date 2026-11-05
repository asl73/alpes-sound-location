import { ArrowLeft, CreditCard, LogOut } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { LinesTable, PaymentChoice, Timeline } from '../../components/booking'
import { useTitle } from '../../components/layout'
import { Empty, Field, Loading, Modal, Notice, Pill, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { dateLong, dateTime, eur, plural, rangeLabel, timeOf, todayParis } from '../../lib/format'
import { FORMULAS, deliveryLabel, isDirect, isExpired, isPaidInFull, statusView } from '../../lib/rules'
import { useAuth, useCatalog, useToast } from '../../lib/store'
import type { Booking } from '../../lib/types'

function usePayment() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const pay = async (id: string, full = false) => {
    setBusy(true)
    setError(null)
    try {
      const { url } = await api.payDeposit(id, full)
      if (url.startsWith('/')) navigate(url)
      else window.location.assign(url)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return { pay, busy, error }
}

export function MyBookingsPage() {
  useTitle('Mes réservations')
  const [list, setList] = useState<Booking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const today = todayParis()

  useEffect(() => {
    api.myBookings().then(setList).catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list) return <Loading />
  if (!list.length)
    return (
      <Empty
        title="Aucune réservation pour l’instant"
        action={
          <Link to="/devis" className="btn btn-primary">
            Réserver en ligne
          </Link>
        }
      >
        Réservez en ligne en quelques minutes : vos réservations et demandes de devis apparaîtront ici.
      </Empty>
    )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Mes réservations</h1>
      {list.map((b) => {
        const v = statusView(b, today)
        const expired = isExpired(b, today)
        const names = b.items.filter((i) => i.kind === 'pack' || i.kind === 'product').map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name))
        return (
          <article key={b.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="tabular text-[13px] text-muted">{b.reference}</p>
                <h2 className="text-lg font-bold">{rangeLabel(b.start_date, b.end_date)}</h2>
                <p className="mt-1 text-[15px] text-muted">
                  {names.slice(0, 2).join(', ')}
                  {names.length > 2 && ` et ${plural(names.length - 2, 'autre article', 'autres articles')}`}
                </p>
              </div>
              <Pill tone={v.tone}>{v.client}</Pill>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="tabular">
                <span className="text-muted">Total </span>
                <strong>{eur(b.total, 'à définir')}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to={`/espace-client/reservations/${b.id}`} className="btn btn-outline btn-sm">
                  Voir le détail
                </Link>
                {b.status === 'validee' && (!expired || isDirect(b)) && (
                  <Link to={`/espace-client/reservations/${b.id}`} className="btn btn-primary btn-sm">
                    <CreditCard className="size-4" /> Régler ma réservation
                  </Link>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function MyBookingPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { settings, zones } = useCatalog()
  const toast = useToast()
  const [b, setB] = useState<Booking | null | undefined>(undefined)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [slow, setSlow] = useState(false)
  const [payFull, setPayFull] = useState(false)
  const payment = usePayment()
  const today = todayParis()
  const paymentReturn = params.get('paiement')
  useTitle(b ? b.reference : 'Ma réservation')

  const load = useCallback(async () => {
    try {
      setB(await api.myBooking(id!))
    } catch {
      setB(null)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Après le retour de Stripe, la confirmation du paiement peut prendre quelques secondes :
  // la page se met à jour toute seule (pendant 3 minutes au plus).
  const status = b?.status
  useEffect(() => {
    if (paymentReturn !== 'ok' || status !== 'validee') return
    let n = 0
    const t = setInterval(() => {
      n += 1
      if (n === 10) setSlow(true)
      if (n >= 60) clearInterval(t)
      void load()
    }, 3000)
    return () => clearInterval(t)
  }, [paymentReturn, status, load])

  if (b === undefined) return <Loading />
  if (b === null)
    return (
      <Empty title="Réservation introuvable" action={<Link to="/espace-client" className="btn btn-outline">Mes réservations</Link>}>
        Ce lien ne correspond à aucune de vos réservations.
      </Empty>
    )

  const v = statusView(b, today)
  const expired = isExpired(b, today)
  const direct = isDirect(b)
  // Le client revient de Stripe : on attend la confirmation, sans lui proposer de payer une seconde fois.
  const confirming = paymentReturn === 'ok' && b.status === 'validee'
  const refunds = (b.payments ?? []).filter((p) => p.status !== 'paid')
  const zone = zones.find((z) => z.id === b.zone_id)
  const payButton = (
    <div className="mt-4">
      <PaymentChoice total={b.total} deposit={b.deposit_amount} percent={settings.booking.deposit_percent} full={payFull} onChange={setPayFull} />
      <button type="button" className="btn btn-primary mt-4" onClick={() => payment.pay(b.id, payFull)} disabled={payment.busy}>
        {payment.busy ? <Spinner className="size-4" /> : <CreditCard className="size-4" />} Payer {eur(payFull ? b.total : b.deposit_amount)}
      </button>
    </div>
  )
  const payError = payment.error && (
    <div className="mt-3">
      <Notice tone="bad">{payment.error}</Notice>
    </div>
  )
  const balance = b.total !== null ? Math.max(b.total - (b.deposit_paid_amount ?? 0), 0) : null
  const paidAll = isPaidInFull(b)
  const caution = b.caution_amount ?? settings.booking.caution_amount

  return (
    <div className="space-y-6">
      <Link to="/espace-client" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Mes réservations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="tabular text-muted">{b.reference}</p>
          <h1 className="display mt-1 text-[34px] md:text-[44px]">{rangeLabel(b.start_date, b.end_date)}</h1>
          <p className="text-muted">
            {FORMULAS[b.formula].label} · {isDirect(b) ? 'réservation' : 'demande'} du {dateTime(b.created_at)}
          </p>
        </div>
        <Pill tone={v.tone}>{v.client}</Pill>
      </div>

      {paymentReturn === 'ok' && b.status === 'confirmee' && refunds.length === 0 && (
        <Notice tone="ok" title="Paiement reçu, merci !">
          Votre réservation est confirmée. Un e-mail récapitulatif vous a été envoyé.
        </Notice>
      )}
      {confirming && (
        <Notice tone="info" title="Paiement en cours de confirmation…">
          {slow ? (
            <>
              La confirmation prend plus de temps que prévu. Si votre paiement a été accepté, vous recevrez un e-mail de confirmation :{' '}
              <strong>ne payez pas une seconde fois</strong>. En cas de doute, appelez-nous au {settings.company.phone}.
            </>
          ) : (
            'Cette page se met à jour automatiquement dans quelques secondes.'
          )}
        </Notice>
      )}
      {refunds.map((p) => (
        <Notice key={p.id} tone="warn" title={p.status === 'rembourse' ? 'Paiement remboursé' : 'Paiement en cours de remboursement'}>
          Votre paiement de {eur(p.amount)} du {dateTime(p.created_at)} n’a pas pu {b.status === 'confirmee' || b.status === 'terminee' ? 'être pris en compte : la réservation était déjà réglée' : 'confirmer cette réservation'}.{' '}
          {p.status === 'rembourse'
            ? 'Il vous a été remboursé intégralement : le montant réapparaît sur votre compte sous 5 à 10 jours.'
            : 'Il vous sera remboursé intégralement dans les prochains jours.'}{' '}
          Pour trouver une autre solution, appelez-nous au {settings.company.phone}.
        </Notice>
      ))}
      {paymentReturn === 'annule' && (
        <Notice tone="warn" title="Paiement annulé" action={<button type="button" className="link" onClick={() => setParams({})}>Masquer</button>}>
          Aucun montant n’a été débité.{' '}
          {direct
            ? expired
              ? 'Vous pouvez réessayer tant que le matériel est disponible.'
              : `Le matériel reste réservé pour vous jusqu’à ${timeOf(b.hold_until!)}.`
            : 'Vous pouvez payer quand vous le souhaitez avant l’expiration du devis.'}
        </Notice>
      )}
      {paymentReturn === 'erreur' && b.status === 'validee' && (
        <Notice tone="warn" title="La page de paiement n’a pas pu s’ouvrir" action={<button type="button" className="link" onClick={() => setParams({})}>Masquer</button>}>
          Votre réservation est bien enregistrée : réglez-la avec le bouton ci-dessous.
        </Notice>
      )}

      <div className="panel p-5">
        <Timeline booking={b} expired={expired} />
      </div>

      {b.status === 'terminee' && /^https:\/\/\S+$/i.test(settings.company.review_url?.trim() ?? '') && (
        <Notice tone="info" title="Votre avis compte">
          Si votre événement s’est bien passé, un avis sur Google nous aide beaucoup à nous faire connaître.{' '}
          <a href={settings.company.review_url!.trim()} target="_blank" rel="noopener noreferrer" className="link font-semibold">
            Laisser un avis sur Google
          </a>
        </Notice>
      )}

      {b.status === 'demande' && (
        <Notice tone="info" title="Nous préparons votre devis">
          Nous vous envoyons le prix {settings.booking.response_delay}, par e-mail et ici. Vous réglerez ensuite en ligne l’acompte ou la totalité.
        </Notice>
      )}
      {b.status === 'validee' && !expired && !confirming && (
        <div className="rounded-[8px] border border-or/50 bg-warn-bg/60 p-5">
          <p className="text-lg font-bold">{direct ? 'Réglez votre réservation pour la confirmer' : 'Votre devis est prêt'}</p>
          <p className="mt-1 text-[15px]">
            {direct ? (
              <>
                Le matériel vous est réservé jusqu’à {timeOf(b.hold_until!)}. Payez par carte sur la page sécurisée de Stripe : la réservation est confirmée
                aussitôt.
              </>
            ) : (
              <>
                Réglez l’acompte ou la totalité pour confirmer la réservation{b.valid_until ? <> avant le {dateLong(b.valid_until)}</> : null}. Le paiement se fait
                par carte sur la page sécurisée de Stripe.
              </>
            )}
          </p>
          {payError}
          {payButton}
        </div>
      )}
      {expired && direct && !confirming && (
        <div className="rounded-[8px] border border-line bg-white p-5">
          <p className="text-lg font-bold">Paiement non finalisé</p>
          <p className="mt-1 text-[15px] text-ink/85">
            Le délai de paiement est dépassé : le matériel n’est plus bloqué pour vous. S’il est toujours disponible, vous pouvez payer maintenant.
          </p>
          {payError}
          {payButton}
        </div>
      )}
      {expired && !direct && !confirming && (
        <Notice tone="warn" title="Ce devis a expiré">
          La date n’est plus bloquée. <Link to="/contact" className="link">Contactez-nous</Link> pour le renouveler.
        </Notice>
      )}
      {b.status === 'confirmee' && (
        <Notice tone="ok" title="Réservation confirmée">
          {paidAll ? (
            <>Location entièrement réglée : {eur(b.deposit_paid_amount)} reçus. </>
          ) : (
            <>
              Acompte de {eur(b.deposit_paid_amount)} reçu. {balance !== null && balance > 0 ? `Solde de ${eur(balance)} à régler le jour de la remise du matériel. ` : ''}
            </>
          )}
          Caution de {eur(caution)} par {settings.booking.caution_method}.
        </Notice>
      )}
      {b.status === 'refusee' && (
        <Notice tone="bad" title="Nous ne pouvons pas assurer cette demande">
          {b.client_note || 'Le matériel n’est pas disponible à ces dates. Contactez-nous pour trouver une autre solution.'}
        </Notice>
      )}
      {b.client_note && b.status !== 'refusee' && (
        <div className="panel p-5">
          <p className="text-[13px] font-semibold text-or">Message d’Alpes & Sound Location</p>
          <p className="mt-1 whitespace-pre-line">{b.client_note}</p>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Détail</h2>
        <LinesTable items={b.items} total={b.total} deposit={paidAll ? null : b.deposit_amount} depositPercent={settings.booking.deposit_percent} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5 text-[15px]">
          <p className="font-bold">Logistique</p>
          <p className="mt-1">{deliveryLabel(b.delivery_mode, settings)}</p>
          {zone && <p className="text-muted">Zone : {zone.name}</p>}
          {b.address && <p className="text-muted">{b.address}</p>}
          {b.technician_evenings > 0 && <p className="mt-1">Présence technique : {plural(b.technician_evenings, 'soirée', 'soirées')}</p>}
        </div>
        <div className="panel p-5 text-[15px]">
          <p className="font-bold">Événement</p>
          <p className="mt-1">{[b.event_type, b.guests && `${b.guests} invités`, b.venue].filter(Boolean).join(', ') || 'Non précisé'}</p>
          {b.message && <p className="mt-2 whitespace-pre-line text-muted">« {b.message} »</p>}
        </div>
      </section>

      {['demande', 'validee'].includes(b.status) && !confirming && (
        <div className="border-t border-line pt-6">
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmCancel(true)}>
            {b.status === 'demande' ? 'Annuler cette demande' : 'Annuler cette réservation'}
          </button>
        </div>
      )}

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={b.status === 'demande' ? 'Annuler la demande ?' : 'Annuler la réservation ?'}
        footer={
          <div className="mb-1 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(false)}>
              {b.status === 'demande' ? 'Garder ma demande' : 'Garder ma réservation'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true)
                try {
                  await api.cancelBooking(b.id)
                  toast(b.status === 'demande' ? 'Demande annulée' : 'Réservation annulée')
                  setConfirmCancel(false)
                  await load()
                } catch (e) {
                  toast((e as Error).message, 'bad')
                } finally {
                  setCancelling(false)
                }
              }}
            >
              {cancelling && <Spinner className="size-4" />} Confirmer l’annulation
            </button>
          </div>
        }
      >
        <p>{b.reference} sera annulée. Rien n’ayant encore été payé, l’annulation est gratuite.</p>
      </Modal>
    </div>
  )
}

export function ProfilePage() {
  useTitle('Mon profil')
  const { user, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: user?.full_name ?? '', phone: user?.phone ?? '', company: user?.company ?? '', address: user?.address ?? '' })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('profile')
    setError(null)
    try {
      await api.updateProfile(form)
      await refresh()
      toast('Profil enregistré')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy('password')
    setError(null)
    try {
      await api.updatePassword(password)
      setPassword('')
      toast('Mot de passe modifié')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <h1 className="sr-only">Mon profil</h1>
      <form onSubmit={saveProfile} className="panel grid gap-4 p-5 md:p-6">
        <h2 className="text-lg font-bold">Mes coordonnées</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom et prénom" htmlFor="p-name">
            <input id="p-name" className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} autoComplete="name" />
          </Field>
          <Field label="Téléphone" htmlFor="p-phone">
            <input id="p-phone" className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" />
          </Field>
          <Field label="Société ou association" htmlFor="p-company" optional>
            <input id="p-company" className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} autoComplete="organization" />
          </Field>
          <Field label="E-mail" htmlFor="p-email">
            <input id="p-email" className="input" value={user?.email ?? ''} disabled />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Adresse" htmlFor="p-address" optional>
              <input id="p-address" className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} autoComplete="street-address" />
            </Field>
          </div>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy === 'profile' && <Spinner className="size-4" />} Enregistrer
          </button>
        </div>
      </form>
      <div className="space-y-6">
        <form onSubmit={savePassword} className="panel grid gap-4 p-5 md:p-6">
          <h2 className="text-lg font-bold">Mot de passe</h2>
          <Field label="Nouveau mot de passe" htmlFor="p-pass" hint="8 caractères minimum">
            <input id="p-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <div>
            <button type="submit" className="btn btn-outline" disabled={busy !== null || password.length < 8}>
              {busy === 'password' && <Spinner className="size-4" />} Modifier le mot de passe
            </button>
          </div>
        </form>
        <button
          type="button"
          className="btn btn-outline w-full"
          onClick={async () => {
            await api.signOut()
            navigate('/')
          }}
        >
          <LogOut className="size-4" /> Se déconnecter
        </button>
      </div>
    </div>
  )
}

/** Remplace la page de paiement Stripe dans l'aperçu de démonstration. */
export function DemoPaymentPage() {
  useTitle('Paiement simulé')
  const { id } = useParams()
  const [params] = useSearchParams()
  const full = params.get('totalite') === '1'
  const navigate = useNavigate()
  const [b, setB] = useState<Booking | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.myBooking(id!).then(setB).catch(() => setB(null))
  }, [id])
  if (!api.demo) return null
  const demo = api.demo
  return (
    <div className="wrap max-w-lg py-16">
      <div className="panel p-6">
        <p className="kicker">Mode démonstration</p>
        <h1 className="mt-1 text-2xl font-bold">Paiement simulé</h1>
        <p className="mt-2 text-[15px] text-muted">
          Sur le vrai site, le client est redirigé ici vers la page de paiement sécurisée de Stripe pour payer par carte. Dans cet aperçu, aucun paiement
          n’est effectué.
        </p>
        {b && (
          <dl className="mt-5 divide-y divide-line rounded-[6px] border border-line text-[15px]">
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">Réservation</dt>
              <dd className="tabular font-semibold">{b.reference}</dd>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">{full ? 'Totalité' : 'Acompte'}</dt>
              <dd className="tabular font-bold">{eur(full ? b.total : b.deposit_amount)}</dd>
            </div>
          </dl>
        )}
        {error && (
          <div className="mt-4">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !b}
            onClick={async () => {
              setBusy(true)
              try {
                await demo.completePayment(id!, full)
                navigate(`/espace-client/reservations/${id}?paiement=ok`, { replace: true })
              } catch (e) {
                setError((e as Error).message)
                setBusy(false)
              }
            }}
          >
            {busy && <Spinner className="size-4" />} Simuler le paiement
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(`/espace-client/reservations/${id}?paiement=annule`, { replace: true })}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

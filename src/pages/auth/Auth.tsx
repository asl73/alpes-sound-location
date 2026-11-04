import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useTitle } from '../../components/layout'
import { Field, Loading, Notice, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/store'

function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  useTitle(title)
  return (
    <div className="wrap flex justify-center py-12 md:py-16">
      <div className="w-full max-w-md">
        <h1 className="display text-center text-[44px]">{title}</h1>
        <div className="panel mt-6 p-6">{children}</div>
        {footer && <div className="mt-5 text-center text-[15px]">{footer}</div>}
      </div>
    </div>
  )
}

function useRedirectTarget() {
  const [params] = useSearchParams()
  const target = params.get('retour')
  // Une page du site uniquement (« //autre-site.fr » ou « /\autre-site.fr » mèneraient ailleurs)
  return target && /^\/(?![/\\])/.test(target) ? target : null
}

function DemoShortcuts() {
  const navigate = useNavigate()
  if (!__DEMO__ || !api.demo) return null
  const demo = api.demo
  return (
    <div className="mt-5 rounded-[6px] bg-creme p-4 text-[14px]">
      <p className="font-semibold">Aperçu de démonstration</p>
      <p className="mt-1 text-muted">Comptes d’essai : client@demo.fr ou admin@demo.fr, mot de passe « demo ».</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline btn-sm" onClick={async () => { await demo.loginAs('client'); navigate('/espace-client') }}>
          Entrer comme client
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={async () => { await demo.loginAs('admin'); navigate('/admin') }}>
          Entrer comme admin
        </button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const target = useRedirectTarget()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (user) return <Navigate to={target ?? (user.is_admin ? '/admin' : '/espace-client')} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signIn(email, password)
      await refresh()
      const u = await api.currentUser()
      navigate(target ?? (u?.is_admin ? '/admin' : '/espace-client'), { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Connexion"
      footer={
        <>
          Pas encore de compte ?{' '}
          <Link to={`/inscription${target ? `?retour=${encodeURIComponent(target)}` : ''}`} className="link">
            Créer un compte
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="E-mail" htmlFor="l-email">
          <input id="l-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Mot de passe" htmlFor="l-password">
          <input id="l-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4" />} Se connecter
        </button>
        <Link to="/mot-de-passe-oublie" className="link text-center text-[14px] font-normal">
          Mot de passe oublié
        </Link>
      </form>
      <DemoShortcuts />
    </AuthShell>
  )
}

export function RegisterPage() {
  const { user, refresh } = useAuth()
  const navigate = useNavigate()
  const target = useRedirectTarget()
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  if (user && !confirm) return <Navigate to={target ?? '/espace-client'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.full_name.trim()) return setError('Indiquez votre nom.')
    setBusy(true)
    try {
      const r = await api.signUp(form)
      if (r.needsConfirmation) setConfirm(true)
      else {
        await refresh()
        navigate(target ?? '/espace-client', { replace: true })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (confirm)
    return (
      <AuthShell title="Vérifiez vos e-mails">
        <p>
          Un lien de confirmation vient d’être envoyé à <strong>{form.email}</strong>. Cliquez dessus pour activer votre compte : vous serez redirigé vers votre espace
          client.
        </p>
      </AuthShell>
    )

  return (
    <AuthShell
      title="Créer un compte"
      footer={
        <>
          Déjà un compte ?{' '}
          <Link to={`/connexion${target ? `?retour=${encodeURIComponent(target)}` : ''}`} className="link">
            Se connecter
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Field label="Nom et prénom" htmlFor="r-name">
          <input id="r-name" className="input" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="Téléphone" htmlFor="r-phone">
          <input id="r-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="E-mail" htmlFor="r-email">
          <input id="r-email" className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mot de passe" htmlFor="r-password" hint="8 caractères minimum">
          <input id="r-password" className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy && <Spinner className="size-4" />} Créer mon compte
        </button>
      </form>
    </AuthShell>
  )
}

export function ForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <AuthShell title="Mot de passe oublié" footer={<Link to="/connexion" className="link">Retour à la connexion</Link>}>
      {sent ? (
        <p>Si un compte existe pour {email}, un e-mail vient de vous être envoyé avec un lien pour choisir un nouveau mot de passe.</p>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <p className="text-[15px] text-muted">Indiquez votre adresse : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
          <Field label="E-mail" htmlFor="f-email">
            <input id="f-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          {error && <Notice tone="bad">{error}</Notice>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy && <Spinner className="size-4" />} Envoyer le lien
          </button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPage() {
  const { user, ready, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tokenHash = params.get('token_hash')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [waited, setWaited] = useState(false)
  const [verifying, setVerifying] = useState(!!tokenHash)
  const [linkError, setLinkError] = useState(false)
  const verified = useRef<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500)
    return () => clearTimeout(t)
  }, [])
  // Lien de l'e-mail : la session s'ouvre ici, même sur un autre appareil que celui de la demande.
  useEffect(() => {
    if (!tokenHash || verified.current === tokenHash) return
    verified.current = tokenHash
    api
      .verifyRecovery(tokenHash)
      .then(async () => {
        await refresh()
        navigate('/nouveau-mot-de-passe', { replace: true })
      })
      .catch(() => setLinkError(true))
      .finally(() => setVerifying(false))
  }, [tokenHash, refresh, navigate])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.updatePassword(password)
      navigate('/espace-client', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (verifying) return <Loading />
  if (linkError || (ready && !user && waited))
    return (
      <AuthShell title="Lien expiré">
        <p>Ce lien n’est plus valable. Demandez-en un nouveau depuis la page « Mot de passe oublié ».</p>
        <Link to="/mot-de-passe-oublie" className="btn btn-primary mt-5 w-full">
          Recevoir un nouveau lien
        </Link>
      </AuthShell>
    )
  return (
    <AuthShell title="Nouveau mot de passe">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Nouveau mot de passe" htmlFor="n-password" hint="8 caractères minimum">
          <input id="n-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </Field>
        {error && <Notice tone="bad">{error}</Notice>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || !user}>
          {busy && <Spinner className="size-4" />} Enregistrer
        </button>
      </form>
    </AuthShell>
  )
}

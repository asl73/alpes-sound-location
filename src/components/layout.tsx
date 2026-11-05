import { CircleUserRound, Menu, X, ShoppingBag, LayoutDashboard, CalendarDays, Package, Boxes, Truck, Users, Mail, Settings2, ArrowLeft, Inbox, LogOut, Images } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { eur, phoneHref, plural } from '../lib/format'
import { useAuth, useCatalog, useQuote, useToast } from '../lib/store'
import { EVENT_PAGES, privateMeta } from '../lib/seo'
import { useMeta } from './seo'
import { CopyText, Emblem, Loading } from './ui'

// ------------------------------------------------------------------ Bandeau de démonstration

export function DemoBar() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  if (!__DEMO__ || !api.demo) return null
  const demo = api.demo
  return (
    <div className="bg-or text-nuit">
      <div className="wrap flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 text-[13px]">
        <p className="font-semibold">Aperçu de démonstration : données d’exemple, aucun paiement réel.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="rounded-[4px] bg-nuit/10 px-2.5 py-1 font-semibold hover:bg-nuit/20"
            onClick={async () => {
              await demo.loginAs('client')
              navigate('/espace-client')
            }}
          >
            Voir l’espace client
          </button>
          <button
            type="button"
            className="rounded-[4px] bg-nuit/10 px-2.5 py-1 font-semibold hover:bg-nuit/20"
            onClick={async () => {
              await demo.loginAs('admin')
              navigate('/admin')
            }}
          >
            Voir l’espace admin
          </button>
          <button
            type="button"
            className="rounded-[4px] px-2.5 py-1 font-semibold underline-offset-2 hover:underline"
            onClick={async () => {
              await demo.reset()
              try {
                localStorage.removeItem('asl-devis')
              } catch {
                /* rien à effacer */
              }
              toast('Démonstration réinitialisée')
              navigate('/')
              window.location.reload()
            }}
          >
            Réinitialiser
          </button>
          {user && <span className="text-nuit/70">Connecté : {user.full_name || user.email}</span>}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Site public

const NAV = [
  { to: '/materiel', label: 'Matériel' },
  { to: '/packs', label: 'Packs' },
  { to: '/prestations', label: 'Prestations' },
  { to: '/contact', label: 'Contact' },
]

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Alpes & Sound Location, accueil">
      <Emblem tone="dark" className="size-10 shrink-0 sm:size-11" />
      <span className="min-w-0 leading-none">
        <span className="display block truncate text-[16px] text-creme sm:text-[19px]">Alpes &amp; Sound Location</span>
        {!compact && <span className="mt-1 block truncate text-[11px] font-medium text-or-2 sm:text-[12px]">Sonorisation · Éclairage</span>}
      </span>
    </Link>
  )
}

function Header() {
  const { user } = useAuth()
  const { count } = useQuote()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])

  const account = user ? (user.is_admin ? '/admin' : '/espace-client') : '/connexion'
  const accountLabel = user ? (user.is_admin ? 'Administration' : 'Mon espace') : 'Se connecter'

  return (
    <header className="sticky z-40 bg-nuit text-creme" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="wrap flex h-[68px] items-center justify-between gap-4">
        <Brand />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `rounded-[5px] px-3 py-2 text-[15px] font-medium transition-colors ${isActive ? 'text-or-2' : 'text-creme/85 hover:text-white'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <Link to={account} className="hidden min-h-10 items-center gap-2 rounded-[5px] px-3 text-[15px] font-medium text-creme/85 hover:text-white sm:flex">
            <CircleUserRound className="size-5" strokeWidth={1.6} />
            {accountLabel}
          </Link>
          <Link to="/devis" className="btn btn-gold btn-sm relative min-h-10 px-3.5" aria-label={`Mon devis, ${plural(count, 'article', 'articles')}`}>
            <ShoppingBag className="size-[18px]" strokeWidth={1.8} />
            <span className="hidden sm:inline">Mon devis</span>
            {count > 0 && (
              <span className="tabular grid h-5 min-w-5 place-items-center rounded-full bg-nuit px-1 text-[12px] font-bold text-creme">{count}</span>
            )}
          </Link>
          <button type="button" className="grid size-10 place-items-center rounded-[5px] text-creme hover:bg-nuit-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open}>
            <Menu className="size-6" />
          </button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-nuit lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="wrap flex h-[68px] items-center justify-between" style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}>
            <Brand compact />
            <button type="button" className="grid size-10 place-items-center rounded-[5px] text-creme hover:bg-nuit-2" onClick={() => setOpen(false)} aria-label="Fermer le menu">
              <X className="size-6" />
            </button>
          </div>
          <nav className="wrap mt-6 flex flex-col" aria-label="Navigation principale">
            {[{ to: '/', label: 'Accueil' }, ...NAV, { to: '/devis', label: 'Mon devis' }, { to: account, label: accountLabel }].map((n) => (
              <NavLink key={n.to + n.label} to={n.to} end={n.to === '/'} className={({ isActive }) => `display border-b border-nuit-3 py-4 text-[30px] ${isActive ? 'text-or-2' : 'text-creme'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  )
}

function Footer() {
  const { settings } = useCatalog()
  const c = settings.company
  return (
    <footer className="mt-24 bg-nuit text-creme/80">
      <div className="wrap grid gap-10 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-3">
            <Emblem tone="dark" className="size-14" />
            <p className="display text-[22px] text-creme">Alpes &amp; Sound Location</p>
          </div>
          <p className="mt-4 text-[15px]">
            Location de sonorisation et d’éclairage pour vos mariages, soirées et événements. Livraison et installation en {c.area}.
          </p>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-or-2">Le site</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            {[...NAV, { to: '/devis', label: 'Réserver en ligne' }, { to: '/espace-client', label: 'Mon espace client' }].map((n) => (
              <li key={n.to}>
                <Link to={n.to} className="hover:text-white">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-or-2">Votre événement</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            {EVENT_PAGES.map((e) => (
              <li key={e.path}>
                <Link to={e.path} className="hover:text-white">
                  {e.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-or-2">Contact</p>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li>
              <a href={phoneHref(c.phone)} className="tabular hover:text-white">
                {c.phone}
              </a>
            </li>
            <li className="break-all">
              <CopyText text={c.email} />
            </li>
            <li>
              {c.address}, {c.postal_code} {c.city}
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-nuit-3">
        <div className="wrap flex flex-col gap-2 py-5 text-[13px] text-creme/60 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {c.name} · SIRET {c.siret} · {c.vat_note}
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/mentions-legales" className="hover:text-white">
              Mentions légales
            </Link>
            <Link to="/cgv" className="hover:text-white">
              Conditions de location
            </Link>
            <Link to="/confidentialite" className="hover:text-white">
              Confidentialité
            </Link>
          </p>
        </div>
      </div>
    </footer>
  )
}

/** Barre de devis fixée en bas d'écran sur mobile, dès qu'un article est ajouté. */
function QuoteBar() {
  const { count, quote } = useQuote()
  const location = useLocation()
  if (count === 0 || ['/devis', '/espace-client', '/packs/sur-mesure'].some((p) => location.pathname.startsWith(p))) return null
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-nuit-3 bg-nuit pt-3 text-creme md:hidden">
      <div className="wrap flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-creme/70">{plural(count, 'article', 'articles')} dans votre devis</p>
          <p className="tabular font-semibold">{quote.total === null ? 'Prix sur devis' : `${eur(quote.total)} estimés`}</p>
        </div>
        <Link to="/devis" className="btn btn-gold btn-sm min-h-10">
          Voir mon devis
        </Link>
      </div>
    </div>
  )
}

export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main id="contenu" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <QuoteBar />
    </div>
  )
}

/** En-tête des pages intérieures. Le titre de l'onglet et la description viennent de useMeta, appelé par chaque page. */
export function PageHead({ kicker, title, children, actions }: { kicker?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="bg-nuit text-creme">
      <div className="wrap pt-10 pb-12 md:pt-14 md:pb-16">
        {kicker && <p className="kicker text-or-2">{kicker}</p>}
        <h1 className="display mt-2 text-[44px] text-creme md:text-[64px]">{title}</h1>
        {children && <div className="mt-4 max-w-2xl text-[17px] text-creme/80">{children}</div>}
        {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
      </div>
    </div>
  )
}

/** Titre d'une page qui n'a pas sa place dans Google (compte, connexion, administration…). */
export function useTitle(title: string) {
  useMeta(privateMeta(title))
}

// ------------------------------------------------------------------ Espace client

export function RequireUser({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <Loading />
  if (!user) return <Navigate to={`/connexion?retour=${encodeURIComponent(location.pathname)}`} replace />
  return <>{children}</>
}

export function AccountLayout() {
  const { user } = useAuth()
  return (
    <RequireUser>
      <div className="bg-nuit text-creme">
        <div className="wrap flex flex-wrap items-end justify-between gap-4 pt-8 pb-6">
          <div>
            <p className="kicker text-or-2">Mon espace client</p>
            <p className="display mt-2 text-[36px] md:text-[48px]">Bonjour {user?.full_name.split(' ')[0] || ''}</p>
          </div>
          <nav className="flex gap-1" aria-label="Espace client">
            {[
              { to: '/espace-client', label: 'Mes réservations', end: true },
              { to: '/espace-client/profil', label: 'Mon profil', end: false },
            ].map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `rounded-[5px] px-3 py-2 text-[15px] font-medium ${isActive ? 'bg-nuit-2 text-or-2' : 'text-creme/80 hover:text-white'}`}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div className="wrap py-8 md:py-10">
        <Outlet />
      </div>
    </RequireUser>
  )
}

// ------------------------------------------------------------------ Administration

const ADMIN_NAV = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/reservations', label: 'Réservations', icon: Inbox },
  { to: '/admin/planning', label: 'Planning', icon: CalendarDays },
  { to: '/admin/materiel', label: 'Matériel', icon: Package },
  { to: '/admin/packs', label: 'Packs', icon: Boxes },
  { to: '/admin/galerie', label: 'Galerie', icon: Images },
  { to: '/admin/prestations', label: 'Livraison', icon: Truck },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/messages', label: 'Messages', icon: Mail },
  { to: '/admin/parametres', label: 'Paramètres', icon: Settings2 },
]

export function AdminLayout() {
  const { user, ready } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  if (!ready) return <Loading />
  if (!user) return <Navigate to={`/connexion?retour=${encodeURIComponent(location.pathname)}`} replace />
  if (!user.is_admin)
    return (
      <div className="wrap py-24 text-center">
        <p className="text-xl font-semibold">Cet espace est réservé à l’administrateur.</p>
        <Link to="/" className="link mt-4 inline-block">
          Retour au site
        </Link>
      </div>
    )
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky z-40 bg-nuit text-creme" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
        <div className="wrap flex h-14 items-center justify-between gap-3">
          <Link to="/admin" className="flex items-center gap-2.5">
            <Emblem tone="dark" className="size-8" />
            <span className="display text-[18px]">Administration</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/" className="flex min-h-9 items-center gap-1.5 rounded-[5px] px-2.5 text-sm text-creme/80 hover:text-white">
              <ArrowLeft className="size-4" /> <span className="hidden sm:inline">Voir le site</span>
            </Link>
            <button
              type="button"
              className="flex min-h-9 items-center gap-1.5 rounded-[5px] px-2.5 text-sm text-creme/80 hover:text-white"
              onClick={async () => {
                await api.signOut()
                navigate('/')
              }}
            >
              <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
        <nav className="no-scrollbar overflow-x-auto border-t border-nuit-3" aria-label="Administration">
          <div className="wrap flex gap-1 py-1.5">
            {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-[5px] px-3 py-2 text-[14px] font-medium ${isActive ? 'bg-nuit-2 text-or-2' : 'text-creme/75 hover:text-white'}`
                }
              >
                <Icon className="size-4" strokeWidth={1.8} />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="wrap py-6 pb-24 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}

export function AdminTitle({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  useTitle(`${title} · Administration`)
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[34px] md:text-[42px]">{title}</h1>
        {children && <div className="mt-1 text-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

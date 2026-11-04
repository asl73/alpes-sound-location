import { lazy, Suspense, type ComponentType } from 'react'
import { Outlet, RouterProvider, ScrollRestoration, createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router'
import { AccountLayout, AdminLayout, DemoBar, PublicLayout } from './components/layout'
import { Loading, Notice } from './components/ui'
import { DemoPaymentPage, MyBookingPage, MyBookingsPage, ProfilePage } from './pages/account/Account'
import { ForgotPage, LoginPage, RegisterPage, ResetPage } from './pages/auth/Auth'
import { CatalogPage, PackPage, PacksPage, ProductPage } from './pages/public/Catalog'
import PackBuilderPage from './pages/public/PackBuilder'
import Home from './pages/public/Home'
import { CgvPage, ContactPage, MentionsPage, PrivacyPage, ServicesPage } from './pages/public/Info'
import NotFound from './pages/public/NotFound'
import QuotePage, { QuoteSentPage } from './pages/public/Quote'
import { AuthProvider, CatalogProvider, QuoteProvider, ToastProvider, useCatalogState } from './lib/store'

// L'administration n'est chargée que pour l'administrateur.
const admin = <T extends string>(name: T) =>
  lazy(async () => {
    const mods = await Promise.all([import('./pages/admin/Dashboard'), import('./pages/admin/Bookings'), import('./pages/admin/CatalogAdmin'), import('./pages/admin/Other')])
    const all = Object.assign({}, ...mods) as Record<string, ComponentType>
    return { default: all[name] }
  })

const AdminPages = {
  Dashboard: admin('DashboardPage'),
  Planning: admin('PlanningPage'),
  Bookings: admin('BookingsPage'),
  BookingEdit: admin('BookingEditPage'),
  Products: admin('ProductsPage'),
  ProductEdit: admin('ProductEditPage'),
  Packs: admin('PacksAdminPage'),
  PackEdit: admin('PackEditPage'),
  Logistics: admin('LogisticsPage'),
  Gallery: admin('GalleryPage'),
  Clients: admin('ClientsPage'),
  Messages: admin('MessagesPage'),
  Settings: admin('SettingsPage'),
}

const S = (C: ComponentType) => (
  <Suspense fallback={<Loading />}>
    <C />
  </Suspense>
)

function CatalogGate() {
  const { catalog, error, reload } = useCatalogState()
  if (error)
    return (
      <div className="wrap max-w-lg py-24">
        <Notice tone="bad" title="Le site n’a pas pu se charger" action={<button type="button" className="btn btn-primary btn-sm" onClick={reload}>Réessayer</button>}>
          {error}
        </Notice>
      </div>
    )
  if (!catalog) return <Loading label="Chargement du catalogue…" />
  return (
    <AuthProvider>
      <QuoteProvider>
        <ToastProvider>
          <DemoBar />
          <Outlet />
          <ScrollRestoration />
        </ToastProvider>
      </QuoteProvider>
    </AuthProvider>
  )
}

function Root() {
  return (
    <CatalogProvider>
      <CatalogGate />
    </CatalogProvider>
  )
}

const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'materiel', element: <CatalogPage /> },
          { path: 'materiel/:slug', element: <ProductPage /> },
          { path: 'packs', element: <PacksPage /> },
          { path: 'packs/sur-mesure', element: <PackBuilderPage /> },
          { path: 'packs/:slug', element: <PackPage /> },
          { path: 'prestations', element: <ServicesPage /> },
          { path: 'devis', element: <QuotePage /> },
          { path: 'devis/envoye/:id', element: <QuoteSentPage /> },
          { path: 'contact', element: <ContactPage /> },
          { path: 'cgv', element: <CgvPage /> },
          { path: 'mentions-legales', element: <MentionsPage /> },
          { path: 'confidentialite', element: <PrivacyPage /> },
          { path: 'connexion', element: <LoginPage /> },
          { path: 'inscription', element: <RegisterPage /> },
          { path: 'mot-de-passe-oublie', element: <ForgotPage /> },
          { path: 'nouveau-mot-de-passe', element: <ResetPage /> },
          ...(__DEMO__ ? [{ path: 'paiement-demo/:id', element: <DemoPaymentPage /> }] : []),
          {
            path: 'espace-client',
            element: <AccountLayout />,
            children: [
              { index: true, element: <MyBookingsPage /> },
              { path: 'reservations/:id', element: <MyBookingPage /> },
              { path: 'profil', element: <ProfilePage /> },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: S(AdminPages.Dashboard) },
          { path: 'reservations', element: S(AdminPages.Bookings) },
          { path: 'reservations/:id', element: S(AdminPages.BookingEdit) },
          { path: 'planning', element: S(AdminPages.Planning) },
          { path: 'materiel', element: S(AdminPages.Products) },
          { path: 'materiel/:id', element: S(AdminPages.ProductEdit) },
          { path: 'packs', element: S(AdminPages.Packs) },
          { path: 'packs/:id', element: S(AdminPages.PackEdit) },
          { path: 'prestations', element: S(AdminPages.Logistics) },
          { path: 'galerie', element: S(AdminPages.Gallery) },
          { path: 'clients', element: S(AdminPages.Clients) },
          { path: 'messages', element: S(AdminPages.Messages) },
          { path: 'parametres', element: S(AdminPages.Settings) },
        ],
      },
    ],
  },
]

// L'aperçu de démonstration garde la navigation en mémoire : il fonctionne ainsi dans un simple fichier.
// Un lien comme …#admin--reservations ouvre directement /admin/reservations dans l'aperçu.
function demoStart(): string {
  const name = typeof location !== 'undefined' ? location.hash.slice(1) : ''
  const m = /^([a-z0-9-]+)(\?[a-z0-9=&_-]*)?$/.exec(name)
  return m ? '/' + m[1].split('--').join('/') + (m[2] ?? '') : '/'
}
// Une adresse avec « // » dans le chemin mène à la même page : c'est le cas des liens des e-mails
// Supabase quand l'adresse du site y est enregistrée avec un « / » final ({{ .SiteURL }}/nouveau-mot-de-passe).
function tidyPath() {
  if (typeof location === 'undefined' || !location.pathname.includes('//')) return
  history.replaceState(history.state, '', location.pathname.replace(/\/{2,}/g, '/') + location.search + location.hash)
}
if (!__DEMO__) tidyPath()
const router = __DEMO__ ? createMemoryRouter(routes, { initialEntries: [demoStart()] }) : createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}

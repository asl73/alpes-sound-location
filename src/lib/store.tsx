import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { todayParis } from './format'
import { buildQuote, endFor, firstBookableDay, shortages, validateDates, type QuoteView, type Shortage } from './rules'
import type { CartLine, Catalog, DeliveryMode, Formula, Profile } from './types'

// ------------------------------------------------------------------ Catalogue

interface CatalogCtx {
  catalog: Catalog | null
  error: string | null
  reload: () => Promise<void>
}

const CatalogContext = createContext<CatalogCtx | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setCatalog(await api.loadCatalog())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return <CatalogContext.Provider value={{ catalog, error, reload }}>{children}</CatalogContext.Provider>
}

export function useCatalogState() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('CatalogProvider manquant')
  return ctx
}

/** À utiliser sous <CatalogGate> : le catalogue est alors toujours chargé. */
export function useCatalog(): Catalog {
  const { catalog } = useCatalogState()
  if (!catalog) throw new Error('Catalogue non chargé')
  return catalog
}

// ------------------------------------------------------------------ Compte

interface AuthCtx {
  user: Profile | null
  ready: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const { reload } = useCatalogState()
  const lastAdmin = useRef<boolean | null>(null)

  const refresh = useCallback(async () => {
    try {
      const u = await api.currentUser()
      setUser(u)
      const isAdmin = !!u?.is_admin
      // L'admin voit aussi les articles masqués : on recharge le catalogue quand ce statut change.
      if (lastAdmin.current !== null && lastAdmin.current !== isAdmin) void reload()
      lastAdmin.current = isAdmin
    } catch {
      setUser(null)
    } finally {
      setReady(true)
    }
  }, [reload])

  useEffect(() => {
    void refresh()
    return api.onAuthChange(() => void refresh())
  }, [refresh])

  return <AuthContext.Provider value={{ user, ready, refresh }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider manquant')
  return ctx
}

// ------------------------------------------------------------------ Devis en cours

export interface QuoteState {
  formula: Formula
  start: string | null
  customEnd: string | null
  lines: CartLine[]
  delivery_mode: DeliveryMode
  zone_id: string | null
  address: string
  technician_evenings: number
  event_type: string
  guests: string
  venue: string
  message: string
}

const EMPTY: QuoteState = {
  formula: 'weekend',
  start: null,
  customEnd: null,
  lines: [],
  delivery_mode: 'retrait',
  zone_id: null,
  address: '',
  technician_evenings: 0,
  event_type: '',
  guests: '',
  venue: '',
  message: '',
}

const STORAGE_KEY = 'asl-devis'

function readStored(): QuoteState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<QuoteState>) }
  } catch {
    /* stockage indisponible */
  }
  return EMPTY
}

interface QuoteCtx {
  state: QuoteState
  end: string | null
  datesError: string | null
  update: (patch: Partial<QuoteState>) => void
  add: (kind: CartLine['kind'], id: string, qty?: number) => void
  setQty: (kind: CartLine['kind'], id: string, qty: number) => void
  remove: (kind: CartLine['kind'], id: string) => void
  clear: () => void
  qtyOf: (kind: CartLine['kind'], id: string) => number
  count: number
  availability: Record<string, number> | null
  availabilityLoading: boolean
  available: (productId: string) => number
  quote: QuoteView
  shortages: Shortage[]
}

const QuoteContext = createContext<QuoteCtx | null>(null)

export function QuoteProvider({ children }: { children: ReactNode }) {
  const catalog = useCatalog()
  const [state, setState] = useState<QuoteState>(readStored)
  const [availability, setAvailability] = useState<Record<string, number> | null>(null)
  const [availabilityLoading, setLoading] = useState(false)
  const today = todayParis()

  // Nettoie un devis mémorisé devenu invalide (dates passées, articles retirés du catalogue).
  useEffect(() => {
    setState((s) => {
      let next = s
      if (s.start && s.start < firstBookableDay(catalog.settings, today)) next = { ...next, start: null, customEnd: null }
      const lines = s.lines.filter((l) =>
        l.kind === 'product' ? catalog.products.some((p) => p.id === l.ref_id) : catalog.packs.some((p) => p.id === l.ref_id),
      )
      if (lines.length !== s.lines.length) next = { ...next, lines }
      if (s.zone_id && !catalog.zones.some((z) => z.id === s.zone_id)) next = { ...next, zone_id: null }
      return next
    })
  }, [catalog, today])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* stockage indisponible */
    }
  }, [state])

  const end = state.start ? endFor(state.formula, state.start, state.customEnd) : null
  const datesError = state.start ? validateDates(state.formula, state.start, end, catalog.settings, today) : null
  const datesOk = !!state.start && !!end && !datesError

  useEffect(() => {
    if (!datesOk || !state.start || !end) {
      setAvailability(null)
      return
    }
    let alive = true
    setLoading(true)
    api
      .availability(state.start, end)
      .then((a) => alive && setAvailability(a))
      .catch(() => alive && setAvailability(null))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [datesOk, state.start, end, catalog])

  const update = useCallback((patch: Partial<QuoteState>) => setState((s) => ({ ...s, ...patch })), [])

  const setQty = useCallback((kind: CartLine['kind'], id: string, qty: number) => {
    setState((s) => {
      const exists = s.lines.some((l) => l.kind === kind && l.ref_id === id)
      if (qty <= 0) return { ...s, lines: s.lines.filter((l) => !(l.kind === kind && l.ref_id === id)) }
      return {
        ...s,
        lines: exists
          ? s.lines.map((l) => (l.kind === kind && l.ref_id === id ? { ...l, quantity: qty } : l))
          : [...s.lines, { kind, ref_id: id, quantity: qty }],
      }
    })
  }, [])

  const value = useMemo<QuoteCtx>(() => {
    const qtyOf = (kind: CartLine['kind'], id: string) => state.lines.find((l) => l.kind === kind && l.ref_id === id)?.quantity ?? 0
    const available = (productId: string) =>
      availability?.[productId] ?? catalog.products.find((p) => p.id === productId)?.quantity ?? 0
    return {
      state,
      end,
      datesError,
      update,
      setQty,
      add: (kind, id, qty = 1) => setQty(kind, id, qtyOf(kind, id) + qty),
      remove: (kind, id) => setQty(kind, id, 0),
      clear: () => setState({ ...EMPTY, formula: state.formula, start: state.start, customEnd: state.customEnd }),
      qtyOf,
      count: state.lines.reduce((n, l) => n + l.quantity, 0),
      availability,
      availabilityLoading,
      available,
      quote: buildQuote(
        {
          formula: state.formula,
          lines: state.lines,
          delivery_mode: state.delivery_mode,
          zone_id: state.zone_id,
          technician_evenings: state.technician_evenings,
        },
        catalog,
      ),
      shortages: shortages(state.lines, catalog, availability),
    }
  }, [state, end, datesError, update, setQty, availability, availabilityLoading, catalog])

  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>
}

export function useQuote() {
  const ctx = useContext(QuoteContext)
  if (!ctx) throw new Error('QuoteProvider manquant')
  return ctx
}

// ------------------------------------------------------------------ Notifications

interface Toast {
  id: number
  text: string
  tone: 'ok' | 'bad' | 'info'
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto max-w-md rounded-[6px] px-4 py-3 text-[15px] font-medium shadow-lg ${
              t.tone === 'bad' ? 'bg-bad text-white' : t.tone === 'info' ? 'bg-nuit-2 text-creme' : 'bg-nuit text-creme'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

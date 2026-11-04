import { Check, ChevronLeft, ChevronRight, Copy, Disc3, Cable, Lightbulb, Mic, Minus, Plus, Speaker, X, Package, LoaderCircle } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EMBLEM, LOCKUP } from './logoPaths'
import type { Tone } from '../lib/rules'
import { addDays, isoWeekday, monthName, parseISO, toISO } from '../lib/format'
import { media, mediaSrcSet } from '../lib/media'

// ------------------------------------------------------------------ Logo

type LogoTone = 'light' | 'dark'

const LOGO_COLORS: Record<LogoTone, { main: string; wave: string; sub1: string; sub2: string }> = {
  light: { main: '#7A2540', wave: '#B98A34', sub1: '#2A0E1A', sub2: '#B98A34' },
  dark: { main: '#F5EAE0', wave: '#C99A45', sub1: '#E8D9CC', sub2: '#C99A45' },
}

export function Emblem({ tone = 'dark', className = '' }: { tone?: LogoTone; className?: string }) {
  const c = LOGO_COLORS[tone]
  return (
    <svg viewBox={EMBLEM.viewBox} className={className} aria-hidden="true">
      <circle cx={EMBLEM.circle.cx} cy={EMBLEM.circle.cy} r={EMBLEM.circle.r} fill="none" stroke={c.main} strokeWidth={EMBLEM.circle.w + 2} />
      <path d={EMBLEM.mountain} fill="none" stroke={c.main} strokeWidth={EMBLEM.mountainW + 1.5} strokeLinejoin="round" />
      <path d={EMBLEM.wave} fill="none" stroke={c.wave} strokeWidth={EMBLEM.waveW + 1.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={EMBLEM.text} fill={c.main} />
    </svg>
  )
}

export function Lockup({ tone = 'light', className = '', title = 'Alpes and Sound Location' }: { tone?: LogoTone; className?: string; title?: string }) {
  const c = LOGO_COLORS[tone]
  return (
    <svg viewBox={LOCKUP.viewBox} className={className} role="img" aria-label={title}>
      <circle cx={LOCKUP.circle.cx} cy={LOCKUP.circle.cy} r={LOCKUP.circle.r} fill="none" stroke={c.main} strokeWidth={LOCKUP.circle.w} />
      <path d={LOCKUP.mountain} fill="none" stroke={c.main} strokeWidth={LOCKUP.mountainW} strokeLinejoin="round" />
      <path d={LOCKUP.wave} fill="none" stroke={c.wave} strokeWidth={LOCKUP.waveW} strokeLinecap="round" strokeLinejoin="round" />
      <path d={LOCKUP.emblemText} fill={c.main} />
      <path d={LOCKUP.name} fill={c.main} />
      <path d={LOCKUP.sub1} fill={c.sub1} />
      <path d={LOCKUP.sub2} fill={c.sub2} />
    </svg>
  )
}

// ------------------------------------------------------------------ Icônes de catégories

export function CategoryIcon({ icon, className = 'size-5' }: { icon: string; className?: string }) {
  const props = { className, strokeWidth: 1.6, 'aria-hidden': true as const }
  switch (icon) {
    case 'speaker':
      return <Speaker {...props} />
    case 'disc':
      return <Disc3 {...props} />
    case 'mic':
      return <Mic {...props} />
    case 'light':
      return <Lightbulb {...props} />
    case 'cable':
      return <Cable {...props} />
    default:
      return <Package {...props} />
  }
}

const SIZES = { sm: '96px', md: '(min-width: 768px) 34vw, 100vw', lg: '(min-width: 1024px) 50vw, 100vw' }

/** Une photo du site : la bonne taille selon l'écran, chargée seulement à l'approche. */
export function Photo({ src, alt, sizes = SIZES.md, className = '', eager = false }: { src: string; alt: string; sizes?: string; className?: string; eager?: boolean }) {
  const srcSet = mediaSrcSet(src)
  return (
    <img
      src={media(src)}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`h-full w-full bg-nuit-2 object-cover ${className}`}
    />
  )
}

/** Photo de l'article, ou visuel d'attente dans l'esprit d'un faisceau de scène. */
export function ProductVisual({
  photo,
  icon,
  label,
  className = '',
  size = 'md',
  sizes,
}: {
  photo?: string | null
  icon: string
  label: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  sizes?: string
}) {
  if (photo) return <Photo src={photo} alt={label} sizes={sizes ?? SIZES[size]} className={className} />
  return (
    <div className={`visual-placeholder flex h-full w-full flex-col items-center justify-center gap-2 text-or ${className}`} role="img" aria-label={label}>
      <CategoryIcon icon={icon} className={size === 'lg' ? 'size-14' : size === 'sm' ? 'size-6' : 'size-10'} />
      {size !== 'sm' && <span className="text-[12px] font-medium text-creme/55">Photo à venir</span>}
    </div>
  )
}

// ------------------------------------------------------------------ Éléments de formulaire

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  optional,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  htmlFor?: string
  optional?: boolean
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(facultatif)</span>}
      </label>
      {children}
      {error ? <p className="mt-1.5 text-[13px] font-medium text-bad">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export function QtyStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  size = 'md',
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  label: string
  size?: 'sm' | 'md'
}) {
  const h = size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  return (
    <div className="inline-flex items-center rounded-[5px] border border-line-2 bg-white" role="group" aria-label={label}>
      <button type="button" className={`${h} grid place-items-center text-ink hover:bg-creme disabled:opacity-35`} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Retirer un ${label}`}>
        <Minus className="size-4" />
      </button>
      <span className="tabular min-w-8 text-center text-[15px] font-semibold" aria-live="polite">
        {value}
      </span>
      <button type="button" className={`${h} grid place-items-center text-ink hover:bg-creme disabled:opacity-35`} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Ajouter un ${label}`}>
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <label htmlFor={fid} className="inline-flex cursor-pointer items-center gap-3 select-none">
      <span className="relative inline-flex">
        <input id={fid} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-line-2 transition-colors peer-checked:bg-bordeaux peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-or" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="text-[15px] font-medium">{label}</span>
    </label>
  )
}

// ------------------------------------------------------------------ États

const TONES: Record<Tone, string> = {
  info: 'bg-info-bg text-info',
  warn: 'bg-warn-bg text-warn',
  ok: 'bg-ok-bg text-ok',
  muted: 'bg-line/70 text-muted',
  bad: 'bg-bad-bg text-bad',
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${TONES[tone]}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}

export function Notice({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`rounded-[6px] px-4 py-3 text-[15px] ${TONES[tone]}`} role={tone === 'bad' ? 'alert' : undefined}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted" role="status">
      <Spinner /> {label}
    </div>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-line-2 px-6 py-12 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function CopyText({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="select-all">{label ?? text}</span>
      <button
        type="button"
        className="grid size-7 place-items-center rounded text-muted hover:bg-creme hover:text-ink"
        aria-label={`Copier ${text}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          } catch {
            /* copie refusée : le texte reste sélectionnable */
          }
        }}
      >
        {done ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
      </button>
    </span>
  )
}

// ------------------------------------------------------------------ Fenêtre

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-nuit/60 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-[12px] bg-white shadow-2xl outline-none sm:max-w-lg sm:rounded-[10px]"
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded text-muted hover:bg-creme hover:text-ink" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="safe-bottom border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Visionneuse de photos

export interface ViewerPhoto {
  src: string
  caption?: string
}

/** Visionneuse plein écran : flèches du clavier ou de l'écran, glisser du doigt, Échap pour fermer. */
export function Lightbox({ photos, index, onIndex, onClose }: { photos: ViewerPhoto[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const open = index !== null && index >= 0 && index < photos.length
  const n = photos.length
  const closeRef = useRef<HTMLButtonElement>(null)
  const touchX = useRef<number | null>(null)
  const go = (d: number) => {
    if (index !== null && n > 1) onIndex((index + d + n) % n)
  }
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowRight') go(1)
    else if (e.key === 'ArrowLeft') go(-1)
  })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const handler = (e: KeyboardEvent) => onKey(e)
    document.addEventListener('keydown', handler)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = overflow
      prev?.focus()
    }
  }, [open])
  if (!open) return null
  const p = photos[index]
  const arrow = 'grid size-11 place-items-center rounded-full bg-white/10 text-creme backdrop-blur transition-colors hover:bg-white/20'
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-[#12060b] text-creme"
      role="dialog"
      aria-modal="true"
      aria-label="Photos"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchX.current
        touchX.current = null
        if (start === null) return
        const dx = e.changedTouches[0].clientX - start
        if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="safe-top flex items-center justify-between gap-4 px-4 pt-3 pb-2">
        <p className="tabular text-[14px] text-creme/70">{n > 1 ? `${index + 1} / ${n}` : ''}</p>
        <button ref={closeRef} type="button" onClick={onClose} className={arrow} aria-label="Fermer">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3 sm:px-20" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <img key={p.src} src={media(p.src)} alt={p.caption ?? ''} className="max-h-full max-w-full rounded-[6px] object-contain shadow-2xl" />
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className={`${arrow} absolute top-1/2 left-3 hidden -translate-y-1/2 sm:grid`} aria-label="Photo précédente">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => go(1)} className={`${arrow} absolute top-1/2 right-3 hidden -translate-y-1/2 sm:grid`} aria-label="Photo suivante">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>
      <div className="safe-bottom flex min-h-16 items-center justify-between gap-3 px-4 pt-3">
        {n > 1 ? (
          <button type="button" onClick={() => go(-1)} className={`${arrow} shrink-0 sm:invisible`} aria-label="Photo précédente">
            <ChevronLeft className="size-6" />
          </button>
        ) : (
          <span />
        )}
        <p className="text-center text-[15px] text-creme/85">{p.caption}</p>
        {n > 1 ? (
          <button type="button" onClick={() => go(1)} className={`${arrow} shrink-0 sm:invisible`} aria-label="Photo suivante">
            <ChevronRight className="size-6" />
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>,
    document.body,
  )
}

// ------------------------------------------------------------------ Calendrier

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/**
 * Calendrier mensuel.
 * - mode "day" : choisir un jour (forfait 24 h, ou retrait/retour en sur mesure)
 * - mode "friday" : choisir un week-end (seuls les vendredis sont proposés)
 */
export function Calendar({
  value,
  rangeEnd,
  onPick,
  min,
  mode = 'day',
  marks,
}: {
  value: string | null
  rangeEnd?: string | null
  onPick: (iso: string) => void
  min: string
  mode?: 'day' | 'friday'
  marks?: Record<string, 'full' | 'partial'>
}) {
  const initial = parseISO(value ?? min)
  const [cursor, setCursor] = useState({ y: initial.getFullYear(), m: initial.getMonth() })
  const first = new Date(cursor.y, cursor.m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(new Date(cursor.y, cursor.m, d)))
  const minDate = parseISO(min)
  const canPrev = new Date(cursor.y, cursor.m, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  const move = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1)
    setCursor({ y: d.getFullYear(), m: d.getMonth() })
  }
  const inRange = (iso: string) => !!value && !!rangeEnd && iso > value && iso < rangeEnd

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="grid size-10 place-items-center rounded hover:bg-creme disabled:opacity-30" onClick={() => move(-1)} disabled={!canPrev} aria-label="Mois précédent">
          <ChevronLeft className="size-5" />
        </button>
        <p className="font-semibold capitalize" aria-live="polite">
          {monthName(cursor.m)} {cursor.y}
        </p>
        <button type="button" className="grid size-10 place-items-center rounded hover:bg-creme" onClick={() => move(1)} aria-label="Mois suivant">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="pb-1 text-[12px] font-semibold text-muted">
            {w}
          </span>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />
          const disabled = iso < min || (mode === 'friday' && isoWeekday(iso) !== 5)
          const selected = iso === value || iso === rangeEnd
          const between = inRange(iso)
          const mark = marks?.[iso]
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(iso)}
              aria-pressed={selected}
              aria-label={iso}
              className={`relative mx-auto grid h-10 w-full max-w-11 place-items-center rounded-[5px] text-[15px] tabular transition-colors ${
                selected
                  ? 'bg-bordeaux font-semibold text-white'
                  : between
                    ? 'bg-bordeaux/12 text-bordeaux'
                    : disabled
                      ? 'text-muted/35'
                      : 'font-medium hover:bg-creme'
              }`}
            >
              {parseISO(iso).getDate()}
              {mark && !selected && (
                <span className={`absolute bottom-1 size-1 rounded-full ${mark === 'full' ? 'bg-bordeaux' : 'bg-or'}`} aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const nextFridayFrom = (iso: string) => {
  let d = iso
  while (isoWeekday(d) !== 5) d = addDays(d, 1)
  return d
}

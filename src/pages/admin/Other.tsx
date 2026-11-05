import { ArrowLeft, ArrowRight, ImagePlus, Mail, MailOpen, Phone, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PhotoMosaic } from '../../components/gallery'
import { AdminTitle } from '../../components/layout'
import { CopyText, Empty, Field, Loading, Notice, Photo, Spinner, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { dateTime, eur, phoneHref, plural } from '../../lib/format'
import { useCatalog, useCatalogState, useToast } from '../../lib/store'
import type { ClientSummary, ContactMessage, GalleryPhoto, Settings } from '../../lib/types'

export function ClientsPage() {
  const [list, setList] = useState<ClientSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    api.admin.clients().then(setList).catch((e) => setError((e as Error).message))
  }, [])
  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list) return <Loading />
  const s = q.trim().toLowerCase()
  const shown = list.filter((c) => !s || [c.full_name, c.email, c.phone, c.company].some((v) => v?.toLowerCase().includes(s)))
  return (
    <>
      <AdminTitle title="Clients">{plural(list.length, 'compte client', 'comptes clients')}</AdminTitle>
      <input className="input mb-4 md:max-w-sm" placeholder="Rechercher un client…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un client" />
      {shown.length === 0 ? (
        <Empty title="Aucun client">Les comptes créés sur le site apparaîtront ici.</Empty>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id} className="panel p-4 text-[15px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{c.full_name || 'Sans nom'}</p>
                  {c.company && <p className="text-muted">{c.company}</p>}
                </div>
                <p className="tabular text-right text-[14px]">
                  <span className="font-bold">{eur(c.revenue)}</span>
                  <span className="block text-muted">{plural(c.bookings, 'demande', 'demandes')}</span>
                </p>
              </div>
              <div className="mt-2 space-y-1">
                <p className="break-all">
                  <CopyText text={c.email} />
                </p>
                {c.phone && (
                  <a href={phoneHref(c.phone)} className="inline-flex items-center gap-2 font-semibold text-bordeaux">
                    <Phone className="size-4" /> {c.phone}
                  </a>
                )}
              </div>
              {c.bookings > 0 && (
                <Link to={`/admin/reservations?statut=toutes`} className="link mt-3 inline-block text-[14px]">
                  Voir ses demandes
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export function MessagesPage() {
  const [list, setList] = useState<ContactMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const toast = useToast()
  const load = () => api.admin.messages().then(setList).catch((e) => setError((e as Error).message))
  useEffect(() => {
    void load()
  }, [])
  if (error) return <Notice tone="bad">{error}</Notice>
  if (!list) return <Loading />
  return (
    <>
      <AdminTitle title="Messages">Envoyés depuis le formulaire de contact.</AdminTitle>
      {list.length === 0 ? (
        <Empty title="Aucun message">Les messages du formulaire de contact apparaîtront ici.</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const isOpen = open === m.id
            return (
              <li key={m.id} className={`panel ${m.read ? '' : 'border-bordeaux/40'}`}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  aria-expanded={isOpen}
                  onClick={async () => {
                    setOpen(isOpen ? null : m.id)
                    if (!m.read) {
                      await api.admin.markMessage(m.id, true)
                      setList((l) => l?.map((x) => (x.id === m.id ? { ...x, read: true } : x)) ?? l)
                    }
                  }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      {m.read ? <MailOpen className="size-4 text-muted" /> : <Mail className="size-4 text-bordeaux" />}
                      <span className={m.read ? 'font-medium' : 'font-bold'}>{m.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] text-muted">{m.subject || m.body.slice(0, 80)}</span>
                  </span>
                  <span className="shrink-0 text-[13px] text-muted">{dateTime(m.created_at)}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-line px-4 pt-3 pb-4 text-[15px]">
                    <p className="whitespace-pre-line">{m.body}</p>
                    <div className="mt-3 space-y-1 text-[14px]">
                      <p className="break-all">
                        <CopyText text={m.email} />
                      </p>
                      {m.phone && (
                        <a href={phoneHref(m.phone)} className="inline-flex items-center gap-2 font-semibold text-bordeaux">
                          <Phone className="size-4" /> {m.phone}
                        </a>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a className="btn btn-primary btn-sm" href={`mailto:${m.email}?subject=${encodeURIComponent('Re : ' + (m.subject || 'votre message'))}`}>
                        Répondre par e-mail
                      </a>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          await api.admin.markMessage(m.id, false)
                          setList((l) => l?.map((x) => (x.id === m.id ? { ...x, read: false } : x)) ?? l)
                          setOpen(null)
                        }}
                      >
                        Marquer comme non lu
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={async () => {
                          await api.admin.deleteMessage(m.id)
                          setList((l) => l?.filter((x) => x.id !== m.id) ?? l)
                          toast('Message supprimé')
                        }}
                      >
                        <Trash2 className="size-4" /> Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** Vraie si la photo est nettement plus large que haute (orientation de l'appareil comprise). */
async function isLandscape(file: File): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(file)
    const wide = bmp.width > bmp.height * 1.1
    bmp.close()
    return wide
  } catch {
    return false
  }
}

export function GalleryPage() {
  const catalog = useCatalog()
  const { reload } = useCatalogState()
  const toast = useToast()
  const [items, setItems] = useState<GalleryPhoto[]>(catalog.settings.gallery ?? [])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const change = (next: GalleryPhoto[]) => {
    setItems(next)
    setDirty(true)
  }
  const set = (i: number, patch: Partial<GalleryPhoto>) => change(items.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  const move = (i: number, d: number) => {
    const next = [...items]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    change(next)
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      const added: GalleryPhoto[] = []
      for (const f of Array.from(files)) {
        const wide = await isLandscape(f)
        added.push({ src: await api.admin.uploadPhoto(f), caption: '', wide })
      }
      change([...items, ...added])
      toast(added.length > 1 ? 'Photos ajoutées : ajoutez une légende puis enregistrez' : 'Photo ajoutée : ajoutez une légende puis enregistrez')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const gallery = items.map((x) => ({ src: x.src, caption: x.caption.trim(), ...(x.wide ? { wide: true } : {}) }))
      await api.admin.saveSettings({ ...catalog.settings, gallery })
      await reload()
      setDirty(false)
      toast('Galerie enregistrée')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      <AdminTitle title="Galerie">
        Les photos de la rubrique « Nos installations » de la page d’accueil. Les photos à l’horizontale peuvent occuper deux colonnes.
      </AdminTitle>
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p, i) => (
          <li key={p.src.slice(-40) + i} className="panel flex flex-col overflow-hidden">
            <div className="relative aspect-[4/3] overflow-hidden bg-nuit-2">
              <Photo src={p.src} alt="" sizes="360px" />
              <span className="tabular absolute top-2 left-2 rounded-[3px] bg-nuit/85 px-1.5 py-0.5 text-[12px] font-semibold text-or-2">{i + 1}</span>
            </div>
            <div className="grid gap-3 p-3">
              <Field label="Légende" htmlFor={`g-cap-${i}`}>
                <input
                  id={`g-cap-${i}`}
                  className="input"
                  value={p.caption}
                  maxLength={90}
                  placeholder="Ex. : Mariage dans une grange"
                  onChange={(e) => set(i, { caption: e.target.value })}
                />
              </Field>
              <Toggle checked={!!p.wide} onChange={(v) => set(i, { wide: v })} label="Grande vignette (2 colonnes)" id={`g-wide-${i}`} />
              <div className="flex items-center justify-between border-t border-line pt-2">
                <div className="flex">
                  <button type="button" className="grid size-9 place-items-center rounded hover:bg-creme disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Avancer">
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded hover:bg-creme disabled:opacity-30"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Reculer"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                </div>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => change(items.filter((_, k) => k !== i))}>
                  <Trash2 className="size-4" /> Retirer
                </button>
              </div>
            </div>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading}
            className="flex min-h-56 w-full flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-line-2 text-[15px] font-semibold text-muted hover:border-bordeaux hover:text-bordeaux"
          >
            {uploading ? <Spinner /> : <ImagePlus className="size-7" />}
            {uploading ? 'Envoi…' : 'Ajouter des photos'}
          </button>
          <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        </li>
      </ul>
      {items.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Aperçu sur l’accueil</h2>
          <div className="mt-3 rounded-[10px] bg-nuit p-3 md:p-5">
            <PhotoMosaic photos={items} />
          </div>
          <p className="mt-2 text-[14px] text-muted">Évitez les visages reconnaissables sans l’accord des personnes.</p>
        </section>
      )}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pt-3 backdrop-blur">
        <div className="wrap flex items-center justify-between gap-3">
          <span className="text-[14px] text-muted">{dirty ? 'Modifications non enregistrées' : ''}</span>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
            {busy && <Spinner className="size-4" />} Enregistrer la galerie
          </button>
        </div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const catalog = useCatalog()
  const { reload } = useCatalogState()
  const toast = useToast()
  const [s, setS] = useState<Settings>(catalog.settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const c = s.company
  const b = s.booking
  const setC = (patch: Partial<Settings['company']>) => setS({ ...s, company: { ...c, ...patch } })
  const setB = (patch: Partial<Settings['booking']>) => setS({ ...s, booking: { ...b, ...patch } })
  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.admin.saveSettings(s)
      await reload()
      toast('Paramètres enregistrés')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const text = (label: string, value: string, onChange: (v: string) => void, id: string, hint?: string) => (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
  const number = (label: string, value: number, onChange: (v: number) => void, id: string, hint?: string) => (
    <Field label={label} htmlFor={id} hint={hint}>
      <input id={id} className="input tabular" inputMode="decimal" value={String(value)} onChange={(e) => onChange(num(e.target.value))} />
    </Field>
  )

  return (
    <div className="pb-20">
      <AdminTitle title="Paramètres">Vos informations et vos règles de réservation, reprises sur tout le site, dans les e-mails et dans les conditions de location.</AdminTitle>
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-lg font-bold sm:col-span-2">Entreprise</h2>
          {text('Nom commercial', c.name, (v) => setC({ name: v }), 's-name')}
          {text('Responsable', c.owner, (v) => setC({ owner: v }), 's-owner')}
          {text('Statut', c.status, (v) => setC({ status: v }), 's-status', 'Affiché dans les mentions légales')}
          {text('SIRET', c.siret, (v) => setC({ siret: v }), 's-siret')}
          <div className="sm:col-span-2">{text('Adresse', c.address, (v) => setC({ address: v }), 's-address')}</div>
          {text('Code postal', c.postal_code, (v) => setC({ postal_code: v }), 's-cp')}
          {text('Commune', c.city, (v) => setC({ city: v }), 's-city')}
          {text('Téléphone', c.phone, (v) => setC({ phone: v }), 's-phone')}
          {text('E-mail de contact', c.email, (v) => setC({ email: v }), 's-email')}
          <div className="sm:col-span-2">{text('Mention TVA', c.vat_note, (v) => setC({ vat_note: v }), 's-vat')}</div>
          <div className="sm:col-span-2">{text('Zone d’intervention', c.area, (v) => setC({ area: v }), 's-area')}</div>
          {text('Médiateur de la consommation', c.mediator_name ?? '', (v) => setC({ mediator_name: v }), 's-med', 'Obligatoire pour vendre aux particuliers')}
          {text('Site du médiateur', c.mediator_url ?? '', (v) => setC({ mediator_url: v }), 's-medurl', 'Ex. : www.cm2c.net')}
          {text(
            'Lien pour laisser un avis Google',
            c.review_url ?? '',
            (v) => setC({ review_url: v }),
            's-review',
            'Fiche Google > « Demander des avis » > copier le lien. Envoyé au client quand vous passez sa réservation en « terminée ».',
          )}
        </section>

        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-lg font-bold sm:col-span-2">Réservations</h2>
          {number('Acompte (%)', b.deposit_percent, (v) => setB({ deposit_percent: Math.min(v, 100) }), 's-dep')}
          {number('Caution (€)', b.caution_amount, (v) => setB({ caution_amount: v }), 's-caution')}
          <div className="sm:col-span-2">{text('Forme de la caution', b.caution_method, (v) => setB({ caution_method: v }), 's-cmethod')}</div>
          {number('Validité d’un devis (jours)', b.quote_validity_days, (v) => setB({ quote_validity_days: Math.max(1, Math.round(v)) }), 's-valid')}
          {number('Délai minimum avant location (jours)', b.min_notice_days, (v) => setB({ min_notice_days: Math.round(v) }), 's-notice')}
          {number('Durée sur mesure max. (jours)', b.max_custom_days, (v) => setB({ max_custom_days: Math.max(1, Math.round(v)) }), 's-maxdays')}
          {number('Demandes en attente max. par client', b.max_pending_per_client, (v) => setB({ max_pending_per_client: Math.max(1, Math.round(v)) }), 's-maxpend')}
          {number('Remise pack sur mesure (%)', b.custom_discount_percent ?? 0, (v) => setB({ custom_discount_percent: Math.min(Math.round(v), 50) }), 's-cdisc', '0 pour ne pas faire de remise')}
          {number('À partir de (articles différents)', b.custom_discount_min_items ?? 3, (v) => setB({ custom_discount_min_items: Math.max(1, Math.round(v)) }), 's-cmin', 'Loués à l’unité, hors articles offerts')}
          <div className="sm:col-span-2">{text('Forfait 24 h', b.day_label, (v) => setB({ day_label: v }), 's-day')}</div>
          <div className="sm:col-span-2">{text('Forfait week-end', b.weekend_label, (v) => setB({ weekend_label: v }), 's-we')}</div>
          <div className="sm:col-span-2">{text('Délai de réponse annoncé', b.response_delay, (v) => setB({ response_delay: v }), 's-resp', 'Ex. : sous 24 h')}</div>
          <div className="sm:col-span-2">{text('Règlement du solde', b.balance_note, (v) => setB({ balance_note: v }), 's-balance')}</div>
          <div className="sm:col-span-2">{text('Annulation tardive', b.cancellation_late, (v) => setB({ cancellation_late: v }), 's-cl')}</div>
          <div className="sm:col-span-2">{text('Annulation anticipée', b.cancellation_early, (v) => setB({ cancellation_early: v }), 's-ce')}</div>
        </section>

        <section className="panel grid gap-4 p-5">
          <h2 className="text-lg font-bold">Suivi du chiffre d’affaires</h2>
          <Field label="Plafond annuel (€)" htmlFor="s-target" hint="Affiché sur le tableau de bord. Laissez vide pour ne pas l’afficher.">
            <input
              id="s-target"
              className="input tabular"
              inputMode="decimal"
              value={s.annual_target ?? ''}
              onChange={(e) => setS({ ...s, annual_target: e.target.value.trim() === '' ? null : num(e.target.value) })}
            />
          </Field>
        </section>
      </div>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pt-3 backdrop-blur">
        <div className="wrap flex justify-end">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <Spinner className="size-4" />} Enregistrer les paramètres
          </button>
        </div>
      </div>
    </div>
  )
}

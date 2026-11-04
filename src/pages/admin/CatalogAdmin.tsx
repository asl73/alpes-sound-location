import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ImagePlus, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AdminTitle } from '../../components/layout'
import { Empty, Field, Modal, Notice, Photo, ProductVisual, Spinner, Toggle } from '../../components/ui'
import { api } from '../../lib/api'
import { eur, slugify, uid } from '../../lib/format'
import { packRetailValue } from '../../lib/rules'
import { useCatalog, useCatalogState, useToast } from '../../lib/store'
import type { Pack, Product, RentalMode, Service, Zone } from '../../lib/types'

const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function SaveBar({ busy, onSave, onDelete, label = 'Enregistrer' }: { busy: boolean; onSave: () => void; onDelete?: () => void; label?: string }) {
  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pt-3 backdrop-blur">
      <div className="wrap flex items-center justify-between gap-3">
        {onDelete ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={busy}>
            <Trash2 className="size-4" /> Supprimer
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
          {busy && <Spinner className="size-4" />} {label}
        </button>
      </div>
    </div>
  )
}

function ConfirmDelete({ open, onClose, onConfirm, name, children }: { open: boolean; onClose: () => void; onConfirm: () => void; name: string; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Supprimer « ${name} » ?`}
      footer={
        <div className="mb-1 flex justify-end gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Garder
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Supprimer définitivement
          </button>
        </div>
      }
    >
      {children ?? <p>Cette action est définitive. Pour simplement le retirer du site, vous pouvez aussi le masquer.</p>}
    </Modal>
  )
}

/** Gestion des photos : envoi, ordre (la première est la photo principale), suppression. */
export function PhotosEditor({ photos, onChange, icon, label }: { photos: string[]; onChange: (p: string[]) => void; icon: string; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const urls: string[] = []
      for (const f of Array.from(files)) urls.push(await api.admin.uploadPhoto(f))
      onChange([...photos, ...urls])
      toast(urls.length > 1 ? 'Photos ajoutées' : 'Photo ajoutée')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const move = (i: number, d: number) => {
    const next = [...photos]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x)
    onChange(next)
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((src, i) => (
          <div key={src.slice(-40) + i} className="relative overflow-hidden rounded-[6px] border border-line">
            <div className="aspect-[4/3] overflow-hidden">
              <Photo src={src} alt="" sizes="200px" />
            </div>
            {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-[3px] bg-nuit/85 px-1.5 py-0.5 text-[11px] font-semibold text-or-2">Principale</span>}
            <div className="flex justify-between bg-white p-1">
              <div className="flex">
                <button type="button" className="grid size-8 place-items-center rounded hover:bg-creme disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Avancer">
                  <ArrowUp className="size-4 -rotate-90" />
                </button>
                <button type="button" className="grid size-8 place-items-center rounded hover:bg-creme disabled:opacity-30" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label="Reculer">
                  <ArrowDown className="size-4 -rotate-90" />
                </button>
              </div>
              <button type="button" className="grid size-8 place-items-center rounded text-bad hover:bg-bad-bg" onClick={() => onChange(photos.filter((_, k) => k !== i))} aria-label="Retirer la photo">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-[6px] border-2 border-dashed border-line-2 text-[14px] font-semibold text-muted hover:border-bordeaux hover:text-bordeaux"
        >
          {busy ? <Spinner /> : <ImagePlus className="size-6" />}
          {busy ? 'Envoi…' : 'Ajouter des photos'}
        </button>
      </div>
      {photos.length === 0 && (
        <div className="mt-3 flex items-center gap-3 text-[14px] text-muted">
          <div className="h-12 w-16 overflow-hidden rounded">
            <ProductVisual icon={icon} label={label} size="sm" />
          </div>
          Sans photo, ce visuel s’affiche à la place.
        </div>
      )}
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
      {error && (
        <div className="mt-3">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </div>
  )
}

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input className="input" value={v} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`${placeholder} ${i + 1}`} />
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Retirer">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...items, ''])}>
        <Plus className="size-4" /> {placeholder}
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ Matériel

export function ProductsPage() {
  const { products, categories } = useCatalog()
  return (
    <>
      <AdminTitle
        title="Matériel"
        actions={
          <Link to="/admin/materiel/nouveau" className="btn btn-primary">
            <Plus className="size-4" /> Nouvel article
          </Link>
        }
      >
        Modifiez les prix, les quantités, les photos et la visibilité de chaque article.
      </AdminTitle>
      <div className="space-y-8">
        {categories.map((c) => {
          const list = products.filter((p) => p.category_id === c.id)
          if (!list.length) return null
          return (
            <section key={c.id}>
              <h2 className="mb-2 text-[13px] font-semibold text-or">{c.name}</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-[8px] border border-line bg-white">
                {list.map((p) => (
                  <li key={p.id}>
                    <Link to={`/admin/materiel/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-paper">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded">
                        <ProductVisual photo={p.photos[0]} icon={c.icon} label={p.name} size="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{p.name}</span>
                          {!p.visible && <EyeOff className="size-4 shrink-0 text-muted" aria-label="Masqué" />}
                          {p.featured && <Star className="size-4 shrink-0 fill-or text-or" aria-label="Mis en avant" />}
                        </p>
                        <p className="tabular text-[14px] text-muted">
                          {p.quantity} en stock · {eur(p.price_24h)} / 24 h · {eur(p.price_weekend)} / week-end
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

const emptyProduct = (categoryId: string): Product => ({
  id: uid(),
  slug: '',
  category_id: categoryId,
  name: '',
  brand: null,
  model: null,
  summary: '',
  description: '',
  specs: [],
  included: [],
  quantity: 1,
  price_24h: null,
  price_weekend: null,
  unit_label: 'l’unité',
  rental_mode: 'libre',
  caution: null,
  photos: [],
  visible: true,
  featured: false,
  sort: 100,
})

export function ProductEditPage() {
  const { id } = useParams()
  const { products, categories, packs } = useCatalog()
  const { reload } = useCatalogState()
  const toast = useToast()
  const navigate = useNavigate()
  const isNew = id === 'nouveau'
  const existing = products.find((p) => p.id === id)
  const [p, setP] = useState<Product>(() => existing ?? emptyProduct(categories[0]?.id ?? 'sono'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!isNew)

  useEffect(() => {
    if (existing) setP(existing)
  }, [existing])

  if (!isNew && !existing) return <Empty title="Article introuvable" action={<Link to="/admin/materiel" className="btn btn-outline">Retour</Link>} />

  const set = (patch: Partial<Product>) => setP((x) => ({ ...x, ...patch }))
  const cat = categories.find((c) => c.id === p.category_id)

  const save = async () => {
    setError(null)
    if (!p.name.trim()) return setError('Donnez un nom à l’article.')
    const slug = p.slug || slugify(p.name)
    setBusy(true)
    try {
      await api.admin.saveProduct({
        ...p,
        slug,
        name: p.name.trim(),
        specs: p.specs.filter((s) => s.label.trim() && s.value.trim()),
        included: p.included.map((s) => s.trim()).filter(Boolean),
      })
      await reload()
      toast('Article enregistré')
      if (isNew) navigate(`/admin/materiel/${p.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setDel(false)
    setBusy(true)
    try {
      await api.admin.deleteProduct(p.id)
      await reload()
      toast('Article supprimé')
      navigate('/admin/materiel', { replace: true })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const usedIn = packs.filter((k) => k.items.some((it) => it.product_id === p.id))

  return (
    <div className="pb-20">
      <Link to="/admin/materiel" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Matériel
      </Link>
      <div className="mt-3">
        <AdminTitle title={isNew ? 'Nouvel article' : p.name || 'Article'}>
          {!isNew && (
            <Link to={`/materiel/${p.slug}`} className="link font-normal">
              Voir la fiche sur le site
            </Link>
          )}
        </AdminTitle>
      </div>
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="panel grid gap-4 p-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nom affiché" htmlFor="p-name">
                <input
                  id="p-name"
                  className="input"
                  value={p.name}
                  onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                />
              </Field>
            </div>
            <Field label="Catégorie" htmlFor="p-cat">
              <select id="p-cat" className="input" value={p.category_id} onChange={(e) => set({ category_id: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Adresse de la fiche" htmlFor="p-slug" hint={`/materiel/${p.slug || '…'}`}>
              <input
                id="p-slug"
                className="input"
                value={p.slug}
                onChange={(e) => {
                  setSlugTouched(true)
                  set({ slug: slugify(e.target.value) })
                }}
              />
            </Field>
            <Field label="Marque" htmlFor="p-brand" optional>
              <input id="p-brand" className="input" value={p.brand ?? ''} onChange={(e) => set({ brand: e.target.value || null })} />
            </Field>
            <Field label="Modèle" htmlFor="p-model" optional>
              <input id="p-model" className="input" value={p.model ?? ''} onChange={(e) => set({ model: e.target.value || null })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Résumé" htmlFor="p-summary" hint="Une phrase, affichée sur la carte de l’article.">
                <input id="p-summary" className="input" value={p.summary} onChange={(e) => set({ summary: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="p-desc">
                <textarea id="p-desc" className="input min-h-28" value={p.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-bold">Photos</h2>
            <div className="mt-4">
              <PhotosEditor photos={p.photos} onChange={(photos) => set({ photos })} icon={cat?.icon ?? 'box'} label={p.name} />
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-lg font-bold">Fiche technique</h2>
            <div className="mt-4 space-y-2">
              {p.specs.map((s, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-2">
                  <input className="input" placeholder="Puissance" value={s.label} onChange={(e) => set({ specs: p.specs.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} aria-label={`Caractéristique ${i + 1}`} />
                  <input className="input" placeholder="1 000 W RMS" value={s.value} onChange={(e) => set({ specs: p.specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} aria-label={`Valeur ${i + 1}`} />
                  <button type="button" className="grid size-11 place-items-center rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => set({ specs: p.specs.filter((_, k) => k !== i) })} aria-label="Retirer">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => set({ specs: [...p.specs, { label: '', value: '' }] })}>
                <Plus className="size-4" /> Caractéristique
              </button>
            </div>
            <h2 className="mt-6 text-lg font-bold">Fourni avec</h2>
            <div className="mt-3">
              <ListEditor items={p.included} onChange={(included) => set({ included })} placeholder="Élément fourni" />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel grid gap-4 p-5">
            <h2 className="font-bold">Prix et stock</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prix 24 h" htmlFor="p-p24" hint="Vide = sur devis">
                <input id="p-p24" className="input tabular" inputMode="decimal" value={p.price_24h ?? ''} onChange={(e) => set({ price_24h: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Prix week-end" htmlFor="p-pwe">
                <input id="p-pwe" className="input tabular" inputMode="decimal" value={p.price_weekend ?? ''} onChange={(e) => set({ price_weekend: numOrNull(e.target.value) })} />
              </Field>
            </div>
            <Field label="Unité de prix" htmlFor="p-unit">
              <input id="p-unit" className="input" value={p.unit_label} onChange={(e) => set({ unit_label: e.target.value })} placeholder="l’unité, la paire…" />
            </Field>
            <Field label="Quantité en stock" htmlFor="p-qty">
              <input id="p-qty" className="input tabular" type="number" min={0} value={p.quantity} onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Location" htmlFor="p-mode">
              <select id="p-mode" className="input" value={p.rental_mode} onChange={(e) => set({ rental_mode: e.target.value as RentalMode })}>
                <option value="libre">Libre, à l’unité</option>
                <option value="sur_demande">Sur demande (soumise à validation)</option>
                <option value="pack_uniquement">Uniquement dans un pack</option>
              </select>
            </Field>
            <Field label="Caution spécifique" htmlFor="p-caution" optional hint="Vide = caution habituelle">
              <input id="p-caution" className="input tabular" inputMode="decimal" value={p.caution ?? ''} onChange={(e) => set({ caution: numOrNull(e.target.value) })} />
            </Field>
          </section>
          <section className="panel grid gap-4 p-5">
            <h2 className="font-bold">Affichage</h2>
            <Toggle checked={p.visible} onChange={(visible) => set({ visible })} label="Visible sur le site" />
            <Toggle checked={p.featured} onChange={(featured) => set({ featured })} label="Mis en avant" />
            <Field label="Ordre d’affichage" htmlFor="p-sort" hint="Les plus petits nombres apparaissent en premier.">
              <input id="p-sort" className="input tabular" type="number" value={p.sort} onChange={(e) => set({ sort: Number(e.target.value) || 0 })} />
            </Field>
          </section>
          {usedIn.length > 0 && (
            <p className="text-[14px] text-muted">
              Utilisé dans : {usedIn.map((k) => k.name).join(', ')}. Le stock des packs en dépend.
            </p>
          )}
        </aside>
      </div>
      <SaveBar busy={busy} onSave={save} onDelete={isNew ? undefined : () => setDel(true)} />
      <ConfirmDelete open={del} onClose={() => setDel(false)} onConfirm={remove} name={p.name} />
    </div>
  )
}

// ------------------------------------------------------------------ Packs

export function PacksAdminPage() {
  const { packs, products } = useCatalog()
  return (
    <>
      <AdminTitle
        title="Packs"
        actions={
          <Link to="/admin/packs/nouveau" className="btn btn-primary">
            <Plus className="size-4" /> Nouveau pack
          </Link>
        }
      >
        Composez des ensembles prêts à louer, à un prix plus doux qu’à l’unité.
      </AdminTitle>
      <ul className="divide-y divide-line overflow-hidden rounded-[8px] border border-line bg-white">
        {packs.map((k) => {
          const retail = packRetailValue(k, products, 'weekend')
          return (
            <li key={k.id}>
              <Link to={`/admin/packs/${k.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    {k.name}
                    {!k.visible && <EyeOff className="size-4 text-muted" aria-label="Masqué" />}
                    {k.featured && <Star className="size-4 fill-or text-or" aria-label="Mis en avant" />}
                  </p>
                  <p className="text-[14px] text-muted">
                    {k.audience} · {k.items.reduce((n, i) => n + i.quantity, 0)} éléments
                  </p>
                </div>
                <p className="tabular text-right text-[14px]">
                  <span className="font-bold">{eur(k.price_weekend)}</span> le week-end
                  {retail !== null && <span className="block text-muted">au détail : {eur(retail)}</span>}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const emptyPack = (): Pack => ({
  id: uid(),
  slug: '',
  name: '',
  tagline: '',
  description: '',
  audience: '',
  items: [],
  price_24h: null,
  price_weekend: null,
  caution: null,
  photos: [],
  visible: true,
  featured: false,
  sort: 100,
})

export function PackEditPage() {
  const { id } = useParams()
  const { packs, products } = useCatalog()
  const { reload } = useCatalogState()
  const toast = useToast()
  const navigate = useNavigate()
  const isNew = id === 'nouveau'
  const existing = packs.find((k) => k.id === id)
  const [k, setK] = useState<Pack>(() => existing ?? emptyPack())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState(false)

  if (!isNew && !existing) return <Empty title="Pack introuvable" action={<Link to="/admin/packs" className="btn btn-outline">Retour</Link>} />
  const set = (patch: Partial<Pack>) => setK((x) => ({ ...x, ...patch }))
  const retail24 = packRetailValue(k, products, '24h')
  const retailWe = packRetailValue(k, products, 'weekend')

  const save = async () => {
    setError(null)
    if (!k.name.trim()) return setError('Donnez un nom au pack.')
    if (!k.items.length) return setError('Ajoutez au moins un article au pack.')
    setBusy(true)
    try {
      await api.admin.savePack({ ...k, name: k.name.trim(), slug: k.slug || slugify(k.name) })
      await reload()
      toast('Pack enregistré')
      if (isNew) navigate(`/admin/packs/${k.id}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      <Link to="/admin/packs" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Packs
      </Link>
      <div className="mt-3">
        <AdminTitle title={isNew ? 'Nouveau pack' : k.name} />
      </div>
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section className="panel grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Nom" htmlFor="k-name">
              <input id="k-name" className="input" value={k.name} onChange={(e) => set({ name: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })} />
            </Field>
            <Field label="Public visé" htmlFor="k-aud" hint="Ex. : Jusqu’à 120 personnes">
              <input id="k-aud" className="input" value={k.audience} onChange={(e) => set({ audience: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Accroche" htmlFor="k-tag">
                <input id="k-tag" className="input" value={k.tagline} onChange={(e) => set({ tagline: e.target.value })} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Description" htmlFor="k-desc">
                <textarea id="k-desc" className="input min-h-24" value={k.description} onChange={(e) => set({ description: e.target.value })} />
              </Field>
            </div>
          </section>
          <section className="panel p-5">
            <h2 className="text-lg font-bold">Contenu du pack</h2>
            <div className="mt-4 space-y-2">
              {k.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_88px_auto] gap-2">
                  <select className="input" value={it.product_id} onChange={(e) => set({ items: k.items.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)) })} aria-label={`Article ${i + 1}`}>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input className="input tabular" type="number" min={1} value={it.quantity} onChange={(e) => set({ items: k.items.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)) })} aria-label={`Quantité ${i + 1}`} />
                  <button type="button" className="grid size-11 place-items-center rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => set({ items: k.items.filter((_, j) => j !== i) })} aria-label="Retirer">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  const free = products.find((p) => !k.items.some((it) => it.product_id === p.id))
                  if (free) set({ items: [...k.items, { product_id: free.id, quantity: 1 }] })
                }}
              >
                <Plus className="size-4" /> Article
              </button>
            </div>
          </section>
          <section className="panel p-5">
            <h2 className="text-lg font-bold">Photos</h2>
            <div className="mt-4">
              <PhotosEditor photos={k.photos} onChange={(photos) => set({ photos })} icon="speaker" label={k.name} />
            </div>
          </section>
        </div>
        <aside className="space-y-4">
          <section className="panel grid gap-4 p-5">
            <h2 className="font-bold">Prix</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="24 h" htmlFor="k-p24" hint={retail24 !== null ? `Au détail : ${eur(retail24)}` : undefined}>
                <input id="k-p24" className="input tabular" inputMode="decimal" value={k.price_24h ?? ''} onChange={(e) => set({ price_24h: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Week-end" htmlFor="k-pwe" hint={retailWe !== null ? `Au détail : ${eur(retailWe)}` : undefined}>
                <input id="k-pwe" className="input tabular" inputMode="decimal" value={k.price_weekend ?? ''} onChange={(e) => set({ price_weekend: numOrNull(e.target.value) })} />
              </Field>
            </div>
            <Field label="Caution spécifique" htmlFor="k-caution" optional hint="Vide = caution habituelle">
              <input id="k-caution" className="input tabular" inputMode="decimal" value={k.caution ?? ''} onChange={(e) => set({ caution: numOrNull(e.target.value) })} />
            </Field>
          </section>
          <section className="panel grid gap-4 p-5">
            <h2 className="font-bold">Affichage</h2>
            <Toggle checked={k.visible} onChange={(visible) => set({ visible })} label="Visible sur le site" />
            <Toggle checked={k.featured} onChange={(featured) => set({ featured })} label="Sur la page d’accueil" />
            <Field label="Ordre d’affichage" htmlFor="k-sort">
              <input id="k-sort" className="input tabular" type="number" value={k.sort} onChange={(e) => set({ sort: Number(e.target.value) || 0 })} />
            </Field>
          </section>
        </aside>
      </div>
      <SaveBar busy={busy} onSave={save} onDelete={isNew ? undefined : () => setDel(true)} />
      <ConfirmDelete
        open={del}
        onClose={() => setDel(false)}
        onConfirm={async () => {
          setDel(false)
          setBusy(true)
          try {
            await api.admin.deletePack(k.id)
            await reload()
            toast('Pack supprimé')
            navigate('/admin/packs', { replace: true })
          } catch (e) {
            setError((e as Error).message)
            setBusy(false)
          }
        }}
        name={k.name}
      />
    </div>
  )
}

// ------------------------------------------------------------------ Livraison et prestations

export function LogisticsPage() {
  const catalog = useCatalog()
  const { reload } = useCatalogState()
  const toast = useToast()
  const [services, setServices] = useState<Service[]>(catalog.services)
  const [zones, setZones] = useState<Zone[]>(catalog.zones)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      for (const s of services) await api.admin.saveService(s)
      const keep = new Set(zones.map((z) => z.id))
      for (const z of catalog.zones) if (!keep.has(z.id)) await api.admin.deleteZone(z.id)
      for (const [i, z] of zones.entries()) await api.admin.saveZone({ ...z, sort: i + 1 })
      await reload()
      toast('Tarifs enregistrés')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      <AdminTitle title="Livraison et prestations">Ces tarifs sont repris dans le devis en ligne et sur la page Prestations.</AdminTitle>
      {error && (
        <div className="mb-5">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-lg font-bold">Zones de livraison</h2>
          <p className="mt-1 text-[14px] text-muted">Prix pour la livraison et la reprise. Laissez le prix vide pour « sur devis ».</p>
          <div className="mt-4 space-y-4">
            {zones.map((z, i) => (
              <div key={z.id || i} className="rounded-[6px] border border-line p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2">
                  <input className="input" value={z.name} onChange={(e) => setZones(zones.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} aria-label="Nom de la zone" />
                  <input className="input tabular" inputMode="decimal" placeholder="Sur devis" value={z.price ?? ''} onChange={(e) => setZones(zones.map((x, k) => (k === i ? { ...x, price: numOrNull(e.target.value) } : x)))} aria-label="Prix" />
                  <button type="button" className="grid size-11 place-items-center rounded-[5px] text-muted hover:bg-bad-bg hover:text-bad" onClick={() => setZones(zones.filter((_, k) => k !== i))} aria-label="Supprimer la zone">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <input className="input mt-2" value={z.description} onChange={(e) => setZones(zones.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} placeholder="Communes concernées" aria-label="Communes" />
              </div>
            ))}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setZones([...zones, { id: '', name: 'Nouvelle zone', description: '', price: null, sort: zones.length + 1 }])}>
              <Plus className="size-4" /> Zone
            </button>
          </div>
        </section>
        <section className="space-y-4">
          {services.map((s, i) => (
            <div key={s.id} className="panel grid gap-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{s.id === 'installation' ? 'Installation' : 'Présence technique'}</h2>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setServices(services.map((x, k) => (k === i ? { ...x, visible: !x.visible } : x)))}>
                  {s.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {s.visible ? 'Proposée' : 'Masquée'}
                </button>
              </div>
              <Field label="Nom affiché" htmlFor={`s-name-${s.id}`}>
                <input id={`s-name-${s.id}`} className="input" value={s.name} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              </Field>
              <Field label="Description" htmlFor={`s-desc-${s.id}`}>
                <textarea id={`s-desc-${s.id}`} className="input min-h-20" value={s.description} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prix" htmlFor={`s-price-${s.id}`}>
                  <input id={`s-price-${s.id}`} className="input tabular" inputMode="decimal" value={s.price ?? ''} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, price: numOrNull(e.target.value) } : x)))} />
                </Field>
                <Field label="Unité" htmlFor={`s-unit-${s.id}`}>
                  <input id={`s-unit-${s.id}`} className="input" value={s.unit_label} onChange={(e) => setServices(services.map((x, k) => (k === i ? { ...x, unit_label: e.target.value } : x)))} />
                </Field>
              </div>
            </div>
          ))}
        </section>
      </div>
      <SaveBar busy={busy} onSave={save} />
    </div>
  )
}

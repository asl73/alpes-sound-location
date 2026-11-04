import { Expand } from 'lucide-react'
import { useState } from 'react'
import type { GalleryPhoto } from '../lib/types'
import { Lightbox, Photo } from './ui'

/**
 * Mosaïque de l'accueil, en rangées régulières : les photos marquées « larges » occupent deux colonnes.
 * Un clic ouvre la visionneuse.
 */
export function PhotoMosaic({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="gallery">
      <ul className="gallery-grid">
        {photos.map((p, i) => (
          <li key={p.src + i} className={p.wide ? 'gallery-wide' : undefined}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block h-full w-full overflow-hidden rounded-[8px] bg-nuit-2 text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-or-2"
              aria-label={p.caption ? `Agrandir : ${p.caption}` : 'Agrandir la photo'}
            >
              <Photo
                src={p.src}
                alt={p.caption}
                sizes={p.wide ? '(min-width: 768px) 50vw, 100vw' : '(min-width: 768px) 25vw, 50vw'}
                className="transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.04]"
              />
              {p.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 via-black/35 to-transparent px-3 pt-10 pb-2.5 text-[13px] leading-snug font-medium text-white md:px-4 md:pb-3.5 md:text-[14px]">
                  {p.caption}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </div>
  )
}

/** Vignettes sous une fiche (pack, article) : un clic ouvre la visionneuse. */
export function PhotoStrip({ photos, label, note }: { photos: string[]; label: string; note?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  if (photos.length === 0) return null
  return (
    <div>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:gap-3 lg:grid-cols-6">
        {photos.map((src, i) => (
          <li key={src + i}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              className="group relative block aspect-[3/4] w-full overflow-hidden rounded-[6px] bg-nuit-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-bordeaux"
              aria-label={`Agrandir la photo ${i + 1} : ${label}`}
            >
              <Photo src={src} alt="" sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw" className="transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.04]" />
              <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-nuit/70 text-creme opacity-90">
                <Expand className="size-3.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-[13px] text-muted">{note}</p>}
      <Lightbox photos={photos.map((src) => ({ src, caption: label }))} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
    </div>
  )
}

import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { absUrl, DEFAULT_SITE_URL, fullTitle, type Meta } from '../lib/seo'

// Adresse officielle du site : les pages des aperçus Cloudflare renvoient vers elle (pas de doublon dans Google).
const SITE = String(import.meta.env.VITE_SITE_URL ?? '').replace(/\/+$/, '') || DEFAULT_SITE_URL

function setHead(selector: string, make: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (value === null) {
    el?.remove()
    return
  }
  if (!el) {
    el = make()
    document.head.appendChild(el)
  }
  if (el.getAttribute(attr) !== value) el.setAttribute(attr, value)
}

const metaTag = (key: 'name' | 'property', name: string) => () => {
  const m = document.createElement('meta')
  m.setAttribute(key, name)
  return m
}

/** Titre, description, adresse canonique et aperçu de lien de la page affichée. */
export function useMeta(meta: Meta) {
  const { pathname } = useLocation()
  const { title, description, image, noindex } = meta
  useEffect(() => {
    if (__DEMO__) {
      document.title = fullTitle(title)
      return
    }
    const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '').replace(/\/{2,}/g, '/')
    const url = absUrl(path, SITE)
    document.title = fullTitle(title)
    setHead('meta[name="description"]', metaTag('name', 'description'), 'content', description)
    setHead('meta[name="robots"]', metaTag('name', 'robots'), 'content', noindex ? 'noindex' : null)
    setHead(
      'link[rel="canonical"]',
      () => {
        const l = document.createElement('link')
        l.rel = 'canonical'
        return l
      },
      'href',
      noindex ? null : url,
    )
    setHead('meta[property="og:title"]', metaTag('property', 'og:title'), 'content', fullTitle(title))
    setHead('meta[property="og:description"]', metaTag('property', 'og:description'), 'content', description)
    setHead('meta[property="og:url"]', metaTag('property', 'og:url'), 'content', url)
    if (image) setHead('meta[property="og:image"]', metaTag('property', 'og:image'), 'content', absUrl(image, SITE))
  }, [title, description, image, noindex, pathname])
}

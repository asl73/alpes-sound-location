// Pré-rendu des en-têtes pour Google (build du vrai site seulement).
// Pour chaque page publique, écrit une copie de index.html avec son propre titre, sa description,
// son adresse canonique et son aperçu de lien, puis le plan du site (sitemap.xml).
// Le contenu des pages reste affiché par l'application : rien ne change à l'écran.
// Cloudflare Pages sert « materiel/sono-1600w-elokance.html » à l'adresse /materiel/sono-1600w-elokance,
// et la page d'accueil pour toute adresse sans fichier (application d'une seule page).
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv, type Plugin, type ResolvedConfig } from 'vite'
import { DEFAULT_SITE_URL, PAGES, absUrl, fullTitle, localBusinessJsonLd, packMeta, productMeta, type Meta } from '../src/lib/seo'
import type { Pack, Product, Settings } from '../src/lib/types'

interface CatalogData {
  products: Product[]
  packs: Pack[]
  settings: Settings
  source: string
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,100}$/

async function fetchCatalog(url: string, key: string): Promise<CatalogData> {
  const base = url.replace(/\/+$/, '')
  const get = async (query: string) => {
    const res = await fetch(`${base}/rest/v1/${query}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`${query.split('?')[0]} : ${res.status}`)
    return res.json()
  }
  const [products, packs, settings] = await Promise.all([get('products?select=*&order=sort'), get('packs?select=*&order=sort'), get('settings?select=data&id=eq.1')])
  if (!Array.isArray(products) || !Array.isArray(packs) || !settings?.[0]?.data) throw new Error('réponse inattendue')
  return { products, packs, settings: settings[0].data as Settings, source: 'Supabase' }
}

function seedCatalog(root: string): CatalogData {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'src/data/seed.json'), 'utf8'))
  return { products: seed.products, packs: seed.packs, settings: seed.settings, source: 'données de départ (src/data/seed.json)' }
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function setMeta(html: string, key: 'name' | 'property', name: string, value: string): string {
  const tag = `<meta ${key}="${name}" content="${attr(value)}" />`
  const re = new RegExp(`<meta\\s+${key}="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content="[^"]*"\\s*/?>`)
  return re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `  ${tag}\n  </head>`)
}

/** Copie de la page d'accueil avec l'en-tête d'une autre page. */
export function withHead(template: string, meta: Meta, pagePath: string, site: string, jsonLd: string): string {
  const url = absUrl(pagePath, site)
  const title = fullTitle(meta.title)
  let html = template.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${attr(title)}</title>`)
  html = setMeta(html, 'name', 'description', meta.description)
  html = setMeta(html, 'property', 'og:title', title)
  html = setMeta(html, 'property', 'og:description', meta.description)
  html = setMeta(html, 'property', 'og:url', url)
  if (meta.image) html = setMeta(html, 'property', 'og:image', absUrl(meta.image, site))
  if (meta.noindex) html = setMeta(html, 'name', 'robots', 'noindex')
  html = html.replace(/\s*<link rel="canonical"[^>]*>/g, '')
  // La page d'accueil sert aussi pour toutes les adresses sans fichier (compte, nouvel article…) :
  // pas d'adresse canonique écrite en dur, l'application la fixe une fois la page affichée.
  if (!meta.noindex && pagePath !== '/') html = html.replace('</head>', () => `  <link rel="canonical" href="${attr(url)}" />\n  </head>`)
  return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => `<script type="application/ld+json">${jsonLd}</script>`)
}

/** Les pages publiques et leur en-tête, d'après le catalogue. */
export function routesFor(catalog: CatalogData): Array<[string, Meta]> {
  const routes: Array<[string, Meta]> = Object.entries(PAGES)
  for (const p of catalog.products) if (p.visible !== false && SLUG.test(p.slug)) routes.push([`/materiel/${p.slug}`, productMeta(p)])
  for (const k of catalog.packs) {
    const route = `/packs/${k.slug}`
    if (k.visible !== false && SLUG.test(k.slug) && !PAGES[route]) routes.push([route, packMeta(k)])
  }
  return routes
}

export function sitemap(routes: Array<[string, Meta]>, site: string): string {
  const urls = routes.filter(([, m]) => !m.noindex).map(([p]) => `  <url><loc>${attr(absUrl(p, site))}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

export function seoPrerender(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'asl-seo-prerender',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      // Le référencement ne doit jamais empêcher la mise en ligne : en cas de souci, on prévient et on continue.
      try {
        const outDir = path.resolve(config.root, config.build.outDir)
        const indexFile = path.join(outDir, 'index.html')
        if (!fs.existsSync(indexFile)) return
        const env = loadEnv(config.mode, config.envDir || config.root, 'VITE_')
        const site = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '')
        let catalog: CatalogData
        try {
          if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('adresse ou clé Supabase absente')
          catalog = await fetchCatalog(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY)
        } catch (e) {
          catalog = seedCatalog(config.root)
          config.logger.warn(`[seo] Catalogue Supabase indisponible (${(e as Error).message}) : en-têtes faits avec les ${catalog.source}.`)
        }
        const template = fs.readFileSync(indexFile, 'utf8')
        const jsonLd = JSON.stringify(localBusinessJsonLd(catalog.settings, site)).replace(/</g, '\\u003c')
        const routes = routesFor(catalog)
        for (const [route, meta] of routes) {
          const file = route === '/' ? indexFile : path.join(outDir, `${route.slice(1)}.html`)
          if (!file.startsWith(outDir + path.sep)) continue
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(file, withHead(template, meta, route, site, jsonLd))
        }
        fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap(routes, site))
        config.logger.info(`[seo] ${routes.length} pages avec leur en-tête et sitemap.xml (catalogue : ${catalog.source}).`)
      } catch (e) {
        config.logger.warn(`[seo] Pré-rendu des en-têtes impossible : ${(e as Error).message}. Le site fonctionne quand même.`)
      }
    },
  }
}

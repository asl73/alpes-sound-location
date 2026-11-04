// Génère supabase/seed.sql (catalogue de départ) à partir de src/data/seed.json.
// Usage : npm run seed:sql
import fs from 'node:fs'

const seed = JSON.parse(fs.readFileSync('src/data/seed.json', 'utf8'))
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const j = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

const out = []
out.push('-- Catalogue de départ d’Alpes & Sound Location (généré par scripts/gen-seed.mjs).')
out.push('-- À exécuter après la migration. Sans effet sur les lignes déjà présentes.\n')
// Le plafond annuel de chiffre d'affaires reste privé : il va dans admin_settings, lisible par l'admin seulement.
const { annual_target, ...publicSettings } = seed.settings
out.push(`insert into public.settings (id, data) values (1, ${j(publicSettings)}) on conflict (id) do nothing;`)
out.push(`insert into public.admin_settings (id, data) values (1, ${j({ annual_target: annual_target ?? null })}) on conflict (id) do nothing;\n`)

for (const c of seed.categories)
  out.push(`insert into public.categories (id, name, description, icon, sort) values (${q(c.id)}, ${q(c.name)}, ${q(c.description)}, ${q(c.icon)}, ${c.sort}) on conflict (id) do nothing;`)
out.push('')

for (const p of seed.products)
  out.push(
    `insert into public.products (id, slug, category_id, name, brand, model, summary, description, specs, included, quantity, price_24h, price_weekend, unit_label, rental_mode, caution, photos, visible, featured, sort) values (${[
      q(p.id), q(p.slug), q(p.category_id), q(p.name), q(p.brand), q(p.model), q(p.summary), q(p.description), j(p.specs), j(p.included),
      p.quantity, q(p.price_24h), q(p.price_weekend), q(p.unit_label), q(p.rental_mode), q(p.caution), j(p.photos), p.visible, p.featured, p.sort,
    ].join(', ')}) on conflict (id) do nothing;`,
  )
out.push('')

for (const k of seed.packs) {
  out.push(
    `insert into public.packs (id, slug, name, tagline, description, audience, price_24h, price_weekend, caution, photos, visible, featured, sort) values (${[
      q(k.id), q(k.slug), q(k.name), q(k.tagline), q(k.description), q(k.audience), q(k.price_24h), q(k.price_weekend), q(k.caution), j(k.photos), k.visible, k.featured, k.sort,
    ].join(', ')}) on conflict (id) do nothing;`,
  )
  for (const it of k.items)
    out.push(`insert into public.pack_items (pack_id, product_id, quantity) values (${q(k.id)}, ${q(it.product_id)}, ${it.quantity}) on conflict do nothing;`)
}
out.push('')

for (const s of seed.services)
  out.push(`insert into public.services (id, name, description, price, unit_label, visible, sort) values (${[q(s.id), q(s.name), q(s.description), q(s.price), q(s.unit_label), s.visible, s.sort].join(', ')}) on conflict (id) do nothing;`)
out.push('')

for (const z of seed.zones)
  out.push(`insert into public.zones (id, name, description, price, sort) values (${[q(z.id), q(z.name), q(z.description), q(z.price), z.sort].join(', ')}) on conflict (id) do nothing;`)

fs.writeFileSync('supabase/seed.sql', out.join('\n') + '\n')
console.log('supabase/seed.sql généré')

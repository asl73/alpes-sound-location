// Teste la base de données en local (Postgres embarqué PGlite), sans compte Supabase.
// Usage : node scripts/test-db.mjs
import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'

const db = new PGlite()
let failures = 0
const ok = (cond, label) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failures++
}
const expectError = async (fn, pattern, label) => {
  try {
    await fn()
    ok(false, `${label} (aucune erreur levée)`)
  } catch (e) {
    ok(pattern.test(e.message), `${label} → « ${e.message} »`)
  }
}

// --- Ce que Supabase fournit d'office : schéma auth, rôles, stockage
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
`)

const migration = fs.readFileSync('supabase/migrations/20261102000000_init.sql', 'utf8')
await db.exec(migration)
await db.exec(fs.readFileSync('supabase/seed.sql', 'utf8'))
ok(true, 'migration et catalogue chargés')

const ADMIN = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'
const CLIENT2 = '33333333-3333-4333-8333-333333333333'
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${ADMIN}', 'remi@exemple.fr', '{"full_name":"Rémi"}'),
   ('${CLIENT}', 'camille@exemple.fr', '{"full_name":"Camille","phone":"0612345678"}'),
   ('${CLIENT2}', 'julien@exemple.fr', '{}');
  update public.profiles set is_admin = true where id = '${ADMIN}';
`)
ok((await db.query('select count(*)::int n from public.profiles')).rows[0].n === 3, 'profils créés automatiquement à l’inscription')

// Exécute une requête avec l'identité d'un utilisateur (comme le ferait l'API Supabase)
async function as(uid, sql, params = []) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role;')
  }
}

// Prochain vendredi au moins 3 jours après aujourd'hui
const fri = (await db.query(`select (d)::text as d from generate_series(public.today_paris() + 3, public.today_paris() + 12, interval '1 day') d where extract(isodow from d) = 5 limit 1`)).rows[0].d.slice(0, 10)
const mon = (await db.query(`select ($1::date + 3)::text d`, [fri])).rows[0].d
const P = (slug) => db.query('select id from public.products where slug = $1', [slug]).then((r) => r.rows[0].id)
const K = (slug) => db.query('select id from public.packs where slug = $1', [slug]).then((r) => r.rows[0].id)
const zone2 = (await db.query(`select id from public.zones where name = '20 à 50 km'`)).rows[0].id

const request = (lines, extra = {}) =>
  JSON.stringify({
    formula: 'weekend', start_date: fri, end_date: mon, lines, delivery_mode: 'livraison_installation', zone_id: zone2,
    address: 'Château, Chambéry', technician_evenings: 0, event_type: 'Mariage', guests: 120, venue: '', message: 'Merci',
    contact: { full_name: '', phone: '' }, ...extra,
  })

// Avec l'identité de la fonction serveur de paiement (clé service)
async function asService(sql, params = []) {
  await db.exec('set role service_role;')
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role;')
  }
}
const create = (uid, payload) => as(uid, 'select * from public.create_booking_request($1::jsonb)', [payload]).then((r) => r.rows[0])
const availableOf = async (slug, start, end) =>
  (await as(null, 'select available from public.product_availability($1, $2) where product_id = $3', [start, end, await P(slug)])).rows[0].available

// --- 1. Réservation directe : tous les prix sont connus, le client paie aussitôt
const b1 = await create(CLIENT, request([{ kind: 'pack', ref_id: await K('pack-mariage'), quantity: 1 }]))
ok(/^WEB-\d{4}-001$/.test(b1.reference), `référence séquentielle ${b1.reference}`)
ok(b1.status === 'validee', 'prix connus : réservation directe, acompte à payer tout de suite')
const row1 = (
  await db.query('select total::float, deposit_amount::float, client_name, client_email, extract(epoch from hold_until - now())::int hold from public.bookings where id = $1', [b1.id])
).rows[0]
ok(row1.total === 580 && row1.deposit_amount === 174, `prix calculé côté serveur : ${row1.total} €, acompte ${row1.deposit_amount} €`)
ok(row1.hold > 3500 && row1.hold <= 3600, `matériel réservé pendant le paiement (${Math.round(row1.hold / 60)} min)`)
ok(row1.client_name === 'Camille' && row1.client_email === 'camille@exemple.fr', 'coordonnées reprises du compte')
const lines1 = (await db.query('select kind, name, unit_price::float from public.booking_items where booking_id = $1 order by sort', [b1.id])).rows
ok(lines1.map((l) => l.kind).join(',') === 'pack,livraison,installation', `lignes : ${lines1.map((l) => `${l.name} (${l.unit_price})`).join(' | ')}`)

// --- 2. Pendant le paiement, le matériel est bloqué
ok((await availableOf('enceinte-alto-ts410', fri, mon)) === 0, 'paiement en cours : plus aucune TS410 libre ce week-end')
await expectError(
  async () => create(CLIENT2, request([{ kind: 'pack', ref_id: await K('pack-anniversaire'), quantity: 1 }], { contact: { full_name: 'Julien', phone: '0600000000' } })),
  /Plus assez/,
  'stock épuisé refusé',
)
// mais le lundi du retour peut repartir en location (24 h du lundi au mardi)
const tue = (await db.query(`select ($1::date + 1)::text d`, [mon])).rows[0].d
const r2 = await create(
  CLIENT2,
  JSON.stringify({ formula: '24h', start_date: mon, end_date: tue, lines: [{ kind: 'product', ref_id: await P('enceinte-alto-ts410'), quantity: 2 }], delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: 'Julien', phone: '0600000000' } }),
)
ok(r2.reference.endsWith('-002') && r2.status === 'validee', 'location enchaînée le jour du retour acceptée')

// --- 3. Délai de paiement dépassé : le matériel est libéré
await db.exec(`update public.bookings set hold_until = now() - interval '1 minute' where id = '${b1.id}'`)
ok((await availableOf('enceinte-alto-ts410', fri, mon)) === 4, 'paiement non finalisé dans l’heure : les TS410 sont de nouveau libres')
const r3 = await create(CLIENT2, request([{ kind: 'pack', ref_id: await K('pack-anniversaire'), quantity: 1 }], { contact: { full_name: 'Julien', phone: '0600000000' } }))
ok(r3.status === 'validee', 'un autre client réserve entre-temps')
await expectError(async () => asService('select public.refresh_hold($1)', [b1.id]), /Plus assez/, 'le premier client revient payer : refusé, le matériel est pris')
await as(CLIENT2, 'select public.cancel_my_booking($1)', [r3.id])
const renewed = (await asService('select extract(epoch from public.refresh_hold($1) - now())::int s', [b1.id])).rows[0].s
ok(renewed > 3500, 'matériel de nouveau libre : le délai de paiement repart pour une heure')
await expectError(async () => as(CLIENT, 'select public.refresh_hold($1)', [b1.id]), /permission/, 'un client ne peut pas prolonger le délai lui-même')

// --- 4. Demandes de devis : durée sur mesure, article sur demande, livraison sur devis
const thu = (await db.query(`select ($1::date - 1)::text d`, [fri])).rows[0].d
const q1 = await create(CLIENT2, JSON.stringify({ formula: 'sur_mesure', start_date: thu, end_date: mon, lines: [{ kind: 'product', ref_id: await P('micro-sans-fil'), quantity: 1 }], delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: 'Julien', phone: '0600000000' } }))
const q1row = (await db.query('select status, total, hold_until from public.bookings where id = $1', [q1.id])).rows[0]
ok(q1.status === 'demande' && q1row.total === null && q1row.hold_until === null, 'durée sur mesure : demande de devis, prix à fixer par l’admin')
const q2 = await create(CLIENT, request([{ kind: 'product', ref_id: await P('pioneer-dj-xdj-rr'), quantity: 1 }], { delivery_mode: 'retrait', zone_id: null }))
ok(q2.status === 'demande', 'article loué sur demande : validation par l’admin')
const zoneFar = (await db.query(`select id from public.zones where price is null limit 1`)).rows[0].id
const q3 = await create(CLIENT, request([{ kind: 'product', ref_id: await P('micro-sans-fil'), quantity: 1 }], { delivery_mode: 'livraison', zone_id: zoneFar }))
ok(q3.status === 'demande', 'livraison sur devis : demande de devis')
ok((await availableOf('pioneer-dj-xdj-rr', fri, mon)) === 1, 'une demande de devis ne bloque pas le matériel')

// --- 4 bis. L'admin valide un devis : le matériel est bloqué jusqu'à sa date de validité
await as(ADMIN, `select public.admin_booking_action($1, 'valider')`, [q2.id])
const st = (await db.query('select status, valid_until, hold_until from public.bookings where id = $1', [q2.id])).rows[0]
ok(st.status === 'validee' && st.valid_until && st.hold_until === null, 'devis validé, avec une date de validité')
ok((await availableOf('pioneer-dj-xdj-rr', fri, mon)) === 0, 'devis validé : la XDJ-RR est bloquée')

// --- 4 ter. Indisponibilités posées par l'admin dans le planning
await as(ADMIN, `insert into public.blocks (product_id, quantity, start_date, end_date, note) values ($1, null, $2, $2, 'Révision')`, [await P('machine-a-fumee-500w'), fri])
ok((await availableOf('machine-a-fumee-500w', fri, mon)) === 0, 'article bloqué le vendredi : indisponible ce week-end')
ok((await availableOf('machine-a-fumee-500w', thu, fri)) === 1, 'mais une location rendue le vendredi matin reste possible')
await expectError(
  async () => create(CLIENT2, request([{ kind: 'product', ref_id: await P('machine-a-fumee-500w'), quantity: 1 }], { delivery_mode: 'retrait', zone_id: null })),
  /Plus assez/,
  'réservation refusée pendant une indisponibilité',
)
const next = (await db.query(`select ($1::date + 7)::text f, ($1::date + 10)::text m`, [fri])).rows[0]
await as(ADMIN, `insert into public.blocks (product_id, quantity, start_date, end_date, note) values ($1, 3, $2, $3, 'Location par téléphone')`, [await P('uplight-led'), next.f, next.m])
ok((await availableOf('uplight-led', next.f, next.m)) === 5, 'blocage partiel : 3 uplights sur 8 bloquées le week-end suivant')
const holiday = (await db.query(`select ($1::date + 21)::text a, ($1::date + 27)::text b, ($1::date + 22)::text c, ($1::date + 23)::text d`, [fri])).rows[0]
await as(ADMIN, `insert into public.blocks (product_id, start_date, end_date, note) values (null, $1, $2, 'Vacances')`, [holiday.a, holiday.b])
const allFree = (await as(null, 'select max(available) m from public.product_availability($1, $2)', [holiday.c, holiday.d])).rows[0].m
ok(allFree === 0, 'tout le matériel bloqué pendant les vacances')
const seenBlocks = await as(CLIENT, 'select count(*)::int n from public.blocks')
ok(seenBlocks.rows[0].n === 0, 'un client ne voit pas les indisponibilités')
await expectError(
  async () => as(CLIENT, `insert into public.blocks (start_date, end_date) values ($1, $1)`, [fri]),
  /policy|permission/,
  'ni ne peut en poser',
)

// --- 5. Confidentialité entre clients
const seen = await as(CLIENT2, `select count(*)::int n from public.bookings where user_id <> '${CLIENT2}'`)
const mine = await as(CLIENT2, 'select count(*)::int n from public.bookings')
ok(seen.rows[0].n === 0 && mine.rows[0].n === 3, 'un client ne voit que ses propres réservations')
const seenItems = await as(CLIENT2, 'select count(*)::int n from public.booking_items where booking_id = $1', [b1.id])
ok(seenItems.rows[0].n === 0, 'ni les lignes des autres')
const anonBookings = await as(null, 'select count(*)::int n from public.bookings').catch(() => ({ rows: [{ n: 0 }] }))
ok(anonBookings.rows[0].n === 0, 'un visiteur ne voit aucune réservation')

// --- 6. Tentatives non autorisées
await expectError(async () => as(CLIENT, `update public.profiles set is_admin = true where id = '${CLIENT}'`), /non autorisée/, 'un client ne peut pas devenir admin')
await expectError(async () => as(CLIENT, `select public.admin_booking_action($1, 'valider')`, [r2.id]), /réservé/, 'un client ne peut pas valider')
await expectError(async () => as(CLIENT, `update public.products set price_24h = 1`).then((r) => { if (r.affectedRows === 0) throw new Error('aucune ligne modifiée') }), /aucune ligne|permission|policy/, 'un client ne peut pas changer les prix')
await expectError(
  async () => as(CLIENT, 'select * from public.create_booking_request($1::jsonb)', [request([{ kind: 'pack', ref_id: await K('pack-mariage'), quantity: 1 }], { start_date: '2020-01-03', end_date: '2020-01-06' })]),
  /au plus tôt/,
  'dates passées refusées',
)
await expectError(
  async () => as(CLIENT, 'select * from public.create_booking_request($1::jsonb)', [request([{ kind: 'pack', ref_id: await K('pack-mariage'), quantity: 1 }], { end_date: tue })]),
  /vendredi/,
  'week-end mal formé refusé',
)
await expectError(async () => as(null, 'select * from public.create_booking_request($1::jsonb)', [request([])]), /Connectez-vous|permission/, 'un visiteur non connecté ne peut pas envoyer de demande')

// --- 7. L'admin ajuste le devis
const patch = {
  formula: 'weekend', start_date: fri, end_date: mon, delivery_mode: 'livraison_installation', zone_id: zone2, address: 'Château, Chambéry',
  technician_evenings: 1, event_type: 'Mariage', guests: 120, venue: '', client_name: 'Camille', client_phone: '0612345678',
  client_note: 'Tout est prêt', admin_note: '', valid_until: null, deposit_amount: null,
  items: [
    ...lines1.map((l, i) => ({ kind: l.kind, ref_id: null, name: l.name, quantity: 1, unit_price: l.unit_price, sort: i })),
    { kind: 'technicien', ref_id: null, name: 'Présence technique sur place', quantity: 1, unit_price: 150, sort: 9 },
    { kind: 'autre', ref_id: null, name: 'Remise commerciale', quantity: 1, unit_price: -30, sort: 10 },
  ],
}
patch.items[0].ref_id = await K('pack-mariage')
await as(ADMIN, 'select public.admin_save_booking($1, $2::jsonb)', [b1.id, JSON.stringify(patch)])
const row2 = (await db.query('select total::float, deposit_amount::float from public.bookings where id = $1', [b1.id])).rows[0]
ok(row2.total === 700 && row2.deposit_amount === 210, `devis ajusté : ${row2.total} €, acompte ${row2.deposit_amount} €`)
const comps = (await db.query(`select components from public.booking_items where booking_id = $1 and kind = 'pack'`, [b1.id])).rows[0].components
ok(Array.isArray(comps) && comps.length === 8, 'la composition du pack est conservée')

// --- 8. Annulation par le client
await as(CLIENT2, 'select public.cancel_my_booking($1)', [r2.id])
ok((await db.query('select status from public.bookings where id = $1', [r2.id])).rows[0].status === 'annulee', 'le client annule sa réservation non payée')
await expectError(async () => as(CLIENT2, 'select public.cancel_my_booking($1)', [b1.id]), /ne peut plus/, 'mais pas celle d’un autre')

// --- 9. Paiement reçu hors ligne, puis fin de location
await as(ADMIN, `select public.admin_booking_action($1, 'acompte_recu')`, [b1.id])
const paid = (await db.query('select status, deposit_paid_amount::float from public.bookings where id = $1', [b1.id])).rows[0]
ok(paid.status === 'confirmee' && paid.deposit_paid_amount === 210, 'acompte enregistré, réservation confirmée')
await as(ADMIN, `select public.admin_booking_action($1, 'terminer')`, [b1.id])
ok((await db.query('select status from public.bookings where id = $1', [b1.id])).rows[0].status === 'terminee', 'réservation terminée')

// --- 10. Formulaire de contact et catalogue public
const msg = await as(null, 'select public.submit_contact($1::jsonb) id', [JSON.stringify({ name: 'Asso', email: 'asso@exemple.fr', phone: '', subject: 'Fête', body: 'Bonjour !' })])
ok(!!msg.rows[0].id, 'un visiteur peut envoyer un message')
const msgSeen = await as(null, 'select count(*)::int n from public.messages').catch(() => ({ rows: [{ n: 0 }] }))
ok(msgSeen.rows[0].n === 0, 'mais pas lire les messages')
await db.exec(`update public.products set visible = false where slug = 'cables-xlr'`)
const pub = await as(null, 'select count(*)::int n from public.products')
const adm = await as(ADMIN, 'select count(*)::int n from public.products')
ok(pub.rows[0].n === 15 && adm.rows[0].n === 16, 'les articles masqués ne sont visibles que par l’admin')
const packId = await as(ADMIN, 'select public.admin_save_pack($1::jsonb, $2::jsonb) id', [
  JSON.stringify({ id: null, slug: 'pack-test', name: 'Pack test', price_24h: 10, price_weekend: 20, photos: [], visible: true, featured: false, sort: 9 }),
  JSON.stringify([{ product_id: await P('micro-sans-fil'), quantity: 1 }]),
])
ok(!!packId.rows[0].id, 'l’admin crée un pack')

// --- 10 bis. Pack sur mesure : remise dès 3 articles différents loués à l'unité
const day = (n) => db.query(`select ($1::date + $2::int)::text a, ($1::date + $2::int + 1)::text b`, [fri, n]).then((r) => r.rows[0])
const d40 = await day(40)
const custom = await create(CLIENT, JSON.stringify({
  formula: '24h', start_date: d40.a, end_date: d40.b, delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: '', phone: '' },
  lines: [
    { kind: 'product', ref_id: await P('enceinte-alto-ts410'), quantity: 2 },
    { kind: 'product', ref_id: await P('table-de-mixage-2-voies'), quantity: 1 },
    { kind: 'product', ref_id: await P('micro-sans-fil'), quantity: 1 },
    { kind: 'product', ref_id: await P('pied-enceinte'), quantity: 2 },
  ],
}))
const customRow = (await db.query('select total::float, deposit_amount::float, status from public.bookings where id = $1', [custom.id])).rows[0]
const discountLine = (await db.query(`select name, unit_price::float from public.booking_items where booking_id = $1 and kind = 'autre'`, [custom.id])).rows[0]
ok(discountLine && discountLine.unit_price === -8.7 && customRow.total === 78.3 && customRow.deposit_amount === 23.49 && customRow.status === 'validee',
  `pack sur mesure : ${discountLine?.name} ${discountLine?.unit_price} €, total ${customRow.total} €, acompte ${customRow.deposit_amount} €`)
const d42 = await day(42)
const two = await create(CLIENT, JSON.stringify({
  formula: '24h', start_date: d42.a, end_date: d42.b, delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: '', phone: '' },
  lines: [
    { kind: 'product', ref_id: await P('enceinte-alto-ts410'), quantity: 2 },
    { kind: 'pack', ref_id: await K('pack-entreprise-ceremonie'), quantity: 1 },
    { kind: 'product', ref_id: await P('pied-enceinte'), quantity: 2 },
  ],
}))
const twoLines = (await db.query(`select count(*)::int n from public.booking_items where booking_id = $1 and kind = 'autre'`, [two.id])).rows[0].n
ok(twoLines === 0, 'pas de remise avec un seul article payant à l’unité (pack et articles offerts exclus)')

// --- 11. Limite des demandes et paiements en attente par client
const far = (await db.query(`select ($1::date + 60)::text d`, [fri])).rows[0].d
let refused = null
for (let i = 0; i < 6 && !refused; i++) {
  const d = (await db.query(`select ($1::date + $2::int)::text a, ($1::date + $2::int + 1)::text b`, [far, i * 2])).rows[0]
  try {
    await create(CLIENT2, JSON.stringify({ formula: '24h', start_date: d.a, end_date: d.b, lines: [{ kind: 'product', ref_id: await P('micro-sans-fil'), quantity: 1 }], delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: 'Julien', phone: '0600000000' } }))
  } catch (e) {
    refused = e.message
  }
}
ok(!!refused && /attente/.test(refused), `au-delà de 5 demandes ou paiements en attente : « ${refused} »`)

// --- 12. Données réservées à l'admin
await as(ADMIN, 'select public.admin_save_booking($1, $2::jsonb)', [b1.id, JSON.stringify({ ...patch, admin_note: 'Client à rappeler' })])
const note = await as(ADMIN, 'select admin_note from public.booking_notes where booking_id = $1', [b1.id])
const noteSeen = await as(CLIENT, 'select count(*)::int n from public.booking_notes')
ok(note.rows[0]?.admin_note === 'Client à rappeler' && noteSeen.rows[0].n === 0, 'la note privée est enregistrée, et le client ne peut pas la lire')
const target = await as(ADMIN, 'select data from public.admin_settings')
const targetSeen = await as(CLIENT, 'select count(*)::int n from public.admin_settings')
const publicSettings = (await as(null, 'select data from public.settings')).rows[0].data
ok(target.rows[0]?.data.annual_target > 0 && targetSeen.rows[0].n === 0 && !('annual_target' in publicSettings), 'le plafond de chiffre d’affaires n’est visible que par l’admin')

// --- 13. Paiement reçu de Stripe (fonction appelée par le webhook)
const CLIENT3 = '44444444-4444-4444-8444-444444444444'
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${CLIENT3}', 'lea@exemple.fr', '{"full_name":"Léa"}')`)
const later = async (n) => (await db.query(`select ($1::date + $2::int)::text a, ($1::date + $2::int + 1)::text b`, [fri, n])).rows[0]
const dayReq = (d, slug = 'micro-sans-fil') => P(slug).then((id) => JSON.stringify({ formula: '24h', start_date: d.a, end_date: d.b, lines: [{ kind: 'product', ref_id: id, quantity: 1 }], delivery_mode: 'retrait', zone_id: null, address: '', technician_evenings: 0, event_type: '', guests: null, venue: '', message: '', contact: { full_name: 'Léa', phone: '0600000000' } }))
const pay1 = await create(CLIENT3, await dayReq(await later(80)))
await expectError(async () => as(CLIENT3, `select public.confirm_payment($1, 10, 'pi_x')`, [pay1.id]), /permission/, 'un client ne peut pas se déclarer payé')
const c1 = (await asService(`select public.confirm_payment($1, 4.5, 'pi_test_1') r`, [pay1.id])).rows[0].r
const c1bis = (await asService(`select public.confirm_payment($1, 4.5, 'pi_test_1') r`, [pay1.id])).rows[0].r
ok(c1 === 'confirmee' && c1bis === 'deja_traite', `paiement confirmé une seule fois (${c1}, puis ${c1bis})`)
const c1ter = (await asService(`select public.confirm_payment($1, 4.5, 'pi_test_2') r`, [pay1.id])).rows[0].r
ok(c1ter === 'rembourser_deja_payee', `second paiement de la même réservation : ${c1ter}`)
const pay2 = await create(CLIENT3, await dayReq(await later(82)))
await as(CLIENT3, 'select public.cancel_my_booking($1)', [pay2.id])
const c2 = (await asService(`select public.confirm_payment($1, 4.5, 'pi_test_3') r`, [pay2.id])).rows[0].r
const st2 = (await db.query('select status from public.bookings where id = $1', [pay2.id])).rows[0].status
ok(c2 === 'rembourser_annulee' && st2 === 'annulee', `paiement après annulation : ${c2}, la réservation reste annulée`)
const myPays = await as(CLIENT3, 'select status from public.payments order by created_at')
ok(myPays.rows.map((x) => x.status).join() === 'paid,a_rembourser,a_rembourser', `le client voit ses paiements (${myPays.rows.map((x) => x.status).join()})`)
const tamper = await as(CLIENT3, `update public.payments set status = 'paid'`)
ok(tamper.affectedRows === 0, 'mais ne peut pas les modifier')

// --- 13 bis. Paiement de la totalité, et caution selon le matériel
const pay4 = await create(CLIENT3, await dayReq(await later(88)))
const row4 = (await db.query('select total::float t from public.bookings where id = $1', [pay4.id])).rows[0]
const c4 = (await asService(`select public.confirm_payment($1, $2, 'pi_test_4') r`, [pay4.id, row4.t])).rows[0].r
const full = (await db.query('select status, deposit_paid_amount::float paid, balance_paid_at from public.bookings where id = $1', [pay4.id])).rows[0]
ok(c4 === 'confirmee' && full.paid === row4.t && full.balance_paid_at !== null, `totalité payée (${full.paid} €) : réservation confirmée et solde réglé`)
const cautionOf = async (id) => (await db.query('select caution_amount::float c from public.bookings where id = $1', [id])).rows[0].c
ok((await cautionOf(pay4.id)) === 500, 'caution habituelle : 500 €')
ok((await cautionOf(b1.id)) === 1000, 'Pack Mariage : caution de 1 000 €')
ok((await cautionOf(q2.id)) === 1000, 'Pioneer XDJ-RR : caution de 1 000 €')

// --- 14. Délai de paiement renouvelable trois fois au plus
const pay3 = await create(CLIENT3, await dayReq(await later(84)))
const tries = []
for (let i = 0; i < 4; i++) {
  await db.exec(`update public.bookings set hold_until = now() + interval '5 minutes' where id = '${pay3.id}'`)
  tries.push(await asService('select public.refresh_hold($1)', [pay3.id]).then(() => 'ok', (e) => e.message))
}
ok(tries.slice(0, 3).every((t) => t === 'ok') && /Refaites votre réservation/.test(tries[3]), `renouvellements : 3 acceptés, puis « ${tries[3]} »`)

// --- 15. Références au-delà de 999 dans l'année
await db.exec(`update public.bookings set reference = 'WEB-' || to_char(public.today_paris(), 'YYYY') || '-999' where id = '${pay3.id}'`)
const big = await create(CLIENT3, await dayReq(await later(86)))
ok(big.reference.endsWith('-1000'), `après la 999e réservation : ${big.reference}`)

console.log(failures ? `\n${failures} test(s) en échec` : '\nTous les tests passent')
process.exit(failures ? 1 : 0)

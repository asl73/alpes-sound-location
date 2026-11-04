-- =====================================================================
-- Alpes & Sound Location : base de données du site
-- À exécuter une seule fois dans Supabase (SQL Editor), puis seed.sql.
-- Les règles de prix et de disponibilité reproduisent src/lib/rules.ts.
-- =====================================================================

-- ------------------------------------------------------------ Utilitaires

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.today_paris() returns date
language sql stable as $$ select (now() at time zone 'Europe/Paris')::date $$;

-- ------------------------------------------------------------ Catalogue

create table public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.categories (
  id text primary key,
  name text not null,
  description text not null default '',
  icon text not null default 'box',
  sort int not null default 0
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id text not null references public.categories(id) on update cascade,
  name text not null check (char_length(name) between 1 and 160),
  brand text,
  model text,
  summary text not null default '',
  description text not null default '',
  specs jsonb not null default '[]'::jsonb,
  included jsonb not null default '[]'::jsonb,
  quantity int not null default 1 check (quantity >= 0),
  price_24h numeric(10, 2) check (price_24h >= 0),
  price_weekend numeric(10, 2) check (price_weekend >= 0),
  unit_label text not null default 'l''unité',
  rental_mode text not null default 'libre' check (rental_mode in ('libre', 'sur_demande', 'pack_uniquement')),
  caution numeric(10, 2) check (caution >= 0),
  photos jsonb not null default '[]'::jsonb,
  visible boolean not null default true,
  featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

create table public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (char_length(name) between 1 and 160),
  tagline text not null default '',
  description text not null default '',
  audience text not null default '',
  price_24h numeric(10, 2) check (price_24h >= 0),
  price_weekend numeric(10, 2) check (price_weekend >= 0),
  caution numeric(10, 2) check (caution >= 0),
  photos jsonb not null default '[]'::jsonb,
  visible boolean not null default true,
  featured boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger packs_touch before update on public.packs for each row execute function public.touch_updated_at();

create table public.pack_items (
  pack_id uuid not null references public.packs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity int not null check (quantity > 0),
  primary key (pack_id, product_id)
);

create table public.services (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(10, 2) check (price >= 0),
  unit_label text not null default '',
  visible boolean not null default true,
  sort int not null default 0
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price numeric(10, 2) check (price >= 0),
  sort int not null default 0
);

-- ------------------------------------------------------------ Comptes

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  phone text not null default '',
  company text not null default '',
  address text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- Crée le profil à l'inscription, avec le nom et le téléphone saisis.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 40)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Un client ne peut pas se donner les droits d'administration.
create or replace function public.protect_profile() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.is_admin is distinct from old.is_admin or new.email is distinct from old.email or new.id is distinct from old.id then
      raise exception 'Modification non autorisée.';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile();

-- ------------------------------------------------------------ Réservations

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'demande' check (status in ('demande', 'validee', 'confirmee', 'terminee', 'refusee', 'annulee')),
  formula text not null check (formula in ('24h', 'weekend', 'sur_mesure')),
  start_date date not null,
  end_date date not null,
  delivery_mode text not null check (delivery_mode in ('retrait', 'livraison', 'livraison_installation')),
  zone_id uuid references public.zones(id) on delete set null,
  address text not null default '',
  technician_evenings int not null default 0 check (technician_evenings between 0 and 10),
  event_type text not null default '',
  guests int check (guests > 0),
  venue text not null default '',
  message text not null default '',
  client_name text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  total numeric(10, 2),
  deposit_amount numeric(10, 2),
  deposit_paid_at timestamptz,
  deposit_paid_amount numeric(10, 2),
  payment_ref text,
  stripe_session_id text,
  balance_paid_at timestamptz,
  caution_status text not null default 'a_recevoir' check (caution_status in ('a_recevoir', 'recue', 'restituee')),
  -- Devis établi par l'admin : valable jusqu'à cette date (incluse).
  valid_until date,
  -- Réservation directe : le matériel est réservé au client jusqu'à cette heure, le temps de payer l'acompte.
  hold_until timestamptz,
  hold_renewals int not null default 0,
  -- Caution demandée à la remise du matériel (la plus élevée des cautions du matériel loué)
  caution_amount numeric(10, 2),
  client_note text not null default '',
  notified jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date > start_date)
);
create index bookings_user_idx on public.bookings (user_id);
create index bookings_dates_idx on public.bookings (start_date, end_date);
create index bookings_status_idx on public.bookings (status);
create trigger bookings_touch before update on public.bookings for each row execute function public.touch_updated_at();

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('product', 'pack', 'livraison', 'installation', 'technicien', 'autre')),
  ref_id uuid,
  name text not null,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(10, 2),
  sort int not null default 0,
  -- Pour un pack : sa composition au moment de la réservation (le stock en dépend).
  components jsonb
);
create index booking_items_booking_idx on public.booking_items (booking_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  amount numeric(10, 2) not null,
  provider text not null default 'stripe',
  provider_ref text,
  -- 'paid' : acompte encaissé ; 'a_rembourser' : paiement arrivé pour une réservation annulée, déjà payée, ou dont le matériel n'est plus libre
  status text not null default 'paid' check (status in ('paid', 'a_rembourser', 'rembourse')),
  created_at timestamptz not null default now()
);
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref) where provider_ref is not null;
create index payments_booking_idx on public.payments (booking_id);

-- Note privée de l'admin sur une réservation : table à part, que le client ne peut pas lire.
create table public.booking_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  admin_note text not null default ''
);

-- Réglages réservés à l'admin (non publics), par exemple le plafond annuel de chiffre d'affaires.
create table public.admin_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  phone text not null default '' check (char_length(phone) <= 40),
  subject text not null default '' check (char_length(subject) <= 200),
  body text not null check (char_length(body) between 1 and 5000),
  read boolean not null default false,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indisponibilités posées par l'admin dans le planning (usage personnel, réparation,
-- location prise par téléphone…). Sans article : tout le matériel. Sans quantité : toutes les unités.
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  quantity int check (quantity > 0),
  start_date date not null,
  end_date date not null, -- dernier jour indisponible, inclus
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index blocks_dates_idx on public.blocks (start_date, end_date);

-- ------------------------------------------------------------ Disponibilités

-- Stock libre de chaque article sur une période. Bloquent le matériel :
-- les réservations confirmées, les réservations en cours de paiement (délai d'une heure),
-- les devis validés non expirés et les indisponibilités du planning.
-- Le jour du retour peut servir à une nouvelle location (retour le matin, départ l'après-midi).
create or replace function public.product_availability(p_start date, p_end date, p_exclude uuid default null)
returns table (product_id uuid, available int)
language sql stable security definer set search_path = public as $$
  with active as (
    select b.id from public.bookings b
    where b.id is distinct from p_exclude
      and b.start_date < p_end and b.end_date > p_start
      and (b.status = 'confirmee'
           or (b.status = 'validee'
               and (b.valid_until is null or b.valid_until >= public.today_paris())
               and (b.hold_until is null or b.hold_until > now())))
  ),
  reserved as (
    select bi.ref_id as pid, bi.quantity as qty
    from public.booking_items bi join active a on a.id = bi.booking_id
    where bi.kind = 'product'
    union all
    select (c ->> 'product_id')::uuid, bi.quantity * (c ->> 'quantity')::int
    from public.booking_items bi join active a on a.id = bi.booking_id,
         jsonb_array_elements(coalesce(bi.components, '[]'::jsonb)) c
    where bi.kind = 'pack'
  ),
  blocked as (
    select bl.product_id as pid, bl.quantity as qty
    from public.blocks bl
    where bl.start_date < p_end and bl.end_date >= p_start
  )
  select p.id,
         greatest(p.quantity
                  - coalesce((select sum(r.qty) from reserved r where r.pid = p.id), 0)
                  - coalesce((select sum(coalesce(k.qty, p.quantity)) from blocked k where k.pid = p.id or k.pid is null), 0),
                  0)::int
  from public.products p
$$;

-- Premier article qui manque pour une réservation existante (null si tout le matériel est libre).
create or replace function public.booking_shortage(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  v_need jsonb := '{}'::jsonb; v_it record; v_c jsonb; v_av record;
begin
  select * into b from public.bookings where id = p_id;
  if not found then return 'réservation'; end if;
  for v_it in select bi.kind, bi.ref_id, bi.quantity, bi.components from public.booking_items bi
               where bi.booking_id = p_id and bi.kind in ('product', 'pack') loop
    if v_it.kind = 'product' then
      v_need := jsonb_set(v_need, array[v_it.ref_id::text], to_jsonb(coalesce((v_need ->> v_it.ref_id::text)::int, 0) + v_it.quantity));
    else
      for v_c in select value from jsonb_array_elements(coalesce(v_it.components, '[]'::jsonb)) loop
        v_need := jsonb_set(v_need, array[v_c ->> 'product_id'],
          to_jsonb(coalesce((v_need ->> (v_c ->> 'product_id'))::int, 0) + v_it.quantity * (v_c ->> 'quantity')::int));
      end loop;
    end if;
  end loop;
  for v_av in
    select a.product_id, a.available, pr.name
      from public.product_availability(b.start_date, b.end_date, p_id) a
      join public.products pr on pr.id = a.product_id
  loop
    if coalesce((v_need ->> v_av.product_id::text)::int, 0) > v_av.available then return v_av.name; end if;
  end loop;
  return null;
end $$;

-- Caution d'une réservation : la caution habituelle, ou celle d'un article ou d'un pack loué si elle est plus élevée.
create or replace function public.booking_caution(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(
    coalesce((select (s.data #>> '{booking,caution_amount}')::numeric from public.settings s where s.id = 1), 0),
    coalesce((select max(pr.caution) from public.booking_items bi join public.products pr on pr.id = bi.ref_id
               where bi.booking_id = p_id and bi.kind = 'product'), 0),
    coalesce((select max(pk.caution) from public.booking_items bi join public.packs pk on pk.id = bi.ref_id
               where bi.booking_id = p_id and bi.kind = 'pack'), 0),
    coalesce((select max(pr.caution) from public.booking_items bi
               cross join lateral jsonb_array_elements(coalesce(bi.components, '[]'::jsonb)) c
               join public.products pr on pr.id = (c ->> 'product_id')::uuid
               where bi.booking_id = p_id and bi.kind = 'pack'), 0)
  )
$$;

-- ------------------------------------------------------------ Réservation ou demande de devis (client)

-- Quand tous les prix sont connus, la réservation est directe : statut « validee »,
-- matériel réservé une heure le temps de payer l'acompte. Sinon (durée sur mesure,
-- livraison sur devis, article sur demande, rien à payer) : demande de devis pour l'admin.
create or replace function public.create_booking_request(payload jsonb)
returns table (id uuid, reference text, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_settings jsonb;
  v_today date := public.today_paris();
  v_formula text := payload ->> 'formula';
  v_start date := nullif(payload ->> 'start_date', '')::date;
  v_end date := nullif(payload ->> 'end_date', '')::date;
  v_mode text := payload ->> 'delivery_mode';
  v_zone uuid := nullif(payload ->> 'zone_id', '')::uuid;
  v_evenings int := coalesce(nullif(payload ->> 'technician_evenings', '')::int, 0);
  v_notice int; v_maxdays int; v_pct numeric; v_maxpending int;
  v_email text; v_name text; v_phone text;
  v_line jsonb; v_prod public.products%rowtype; v_pack public.packs%rowtype;
  v_zone_row public.zones%rowtype; v_service public.services%rowtype;
  v_qty int; v_price numeric; v_id uuid; v_ref text; v_next int; v_sort int := 0;
  v_total numeric := 0; v_open boolean := false; v_count int;
  v_need jsonb := '{}'::jsonb; v_pi record; v_av record;
  v_on_request boolean := false; v_direct boolean; v_status text;
  v_cbase numeric := 0; v_cids uuid[] := '{}'; v_cpct numeric; v_cmin int; v_cdisc numeric;
begin
  if v_uid is null then raise exception 'Connectez-vous pour envoyer une demande.'; end if;
  -- Un seul calcul de stock à la fois : deux clients ne peuvent pas réserver le même matériel en même temps.
  perform pg_advisory_xact_lock(hashtext('asl_booking_reference'));

  select s.data into v_settings from public.settings s where s.id = 1;
  v_notice := coalesce((v_settings #>> '{booking,min_notice_days}')::int, 2);
  v_maxdays := coalesce((v_settings #>> '{booking,max_custom_days}')::int, 30);
  v_pct := coalesce((v_settings #>> '{booking,deposit_percent}')::numeric, 30);
  v_maxpending := coalesce((v_settings #>> '{booking,max_pending_per_client}')::int, 5);

  -- Dates et formule
  if v_formula is null or v_formula not in ('24h', 'weekend', 'sur_mesure') then raise exception 'Formule de location inconnue.'; end if;
  if v_start is null or v_end is null then raise exception 'Choisissez vos dates.'; end if;
  if v_start < v_today + v_notice then
    raise exception 'La location peut commencer au plus tôt % jours après aujourd''hui.', v_notice;
  end if;
  if v_formula = '24h' and v_end <> v_start + 1 then raise exception 'Le forfait 24 h dure une journée.'; end if;
  if v_formula = 'weekend' and (extract(isodow from v_start) <> 5 or v_end <> v_start + 3) then
    raise exception 'Le forfait week-end commence un vendredi et se termine le lundi.';
  end if;
  if v_formula = 'sur_mesure' and (v_end <= v_start or v_end - v_start > v_maxdays) then
    raise exception 'Pour plus de % jours, contactez-nous directement.', v_maxdays;
  end if;

  -- Logistique
  if v_mode is null or v_mode not in ('retrait', 'livraison', 'livraison_installation') then raise exception 'Mode de retrait inconnu.'; end if;
  if v_mode <> 'retrait' and v_zone is null then raise exception 'Choisissez une zone de livraison.'; end if;
  if v_evenings < 0 or v_evenings > 10 then raise exception 'Nombre de soirées invalide.'; end if;
  if jsonb_typeof(payload -> 'lines') is distinct from 'array' or jsonb_array_length(payload -> 'lines') = 0 then
    raise exception 'Votre devis est vide.';
  end if;
  if jsonb_array_length(payload -> 'lines') > 40 then raise exception 'Trop de lignes dans le devis.'; end if;

  select count(*) into v_count from public.bookings b
   where b.user_id = v_uid and (b.status = 'demande' or (b.status = 'validee' and b.hold_until > now()));
  if v_count >= v_maxpending then
    raise exception 'Vous avez déjà plusieurs demandes ou paiements en attente. Finalisez-les depuis votre espace client.';
  end if;

  -- Coordonnées : celles saisies, sinon celles du profil
  select u.email into v_email from auth.users u where u.id = v_uid;
  select coalesce(nullif(trim(payload #>> '{contact,full_name}'), ''), p.full_name, ''),
         coalesce(nullif(trim(payload #>> '{contact,phone}'), ''), p.phone, '')
    into v_name, v_phone
    from public.profiles p where p.id = v_uid;
  update public.profiles p
     set full_name = case when p.full_name = '' then left(coalesce(v_name, ''), 120) else p.full_name end,
         phone = case when p.phone = '' then left(coalesce(v_phone, ''), 40) else p.phone end
   where p.id = v_uid;

  -- Référence WEB-AAAA-NNN, à la suite des précédentes (le verrou est déjà pris)
  select coalesce(max(nullif(substring(b.reference from 10), '')::int), 0) + 1 into v_next
    from public.bookings b where b.reference like 'WEB-' || to_char(v_today, 'YYYY') || '-%';
  v_ref := 'WEB-' || to_char(v_today, 'YYYY') || '-' || case when v_next < 1000 then lpad(v_next::text, 3, '0') else v_next::text end;

  insert into public.bookings (reference, user_id, formula, start_date, end_date, delivery_mode, zone_id, address,
    technician_evenings, event_type, guests, venue, message, client_name, client_email, client_phone)
  values (v_ref, v_uid, v_formula, v_start, v_end, v_mode, case when v_mode = 'retrait' then null else v_zone end,
    case when v_mode = 'retrait' then '' else left(coalesce(payload ->> 'address', ''), 300) end,
    v_evenings, left(coalesce(payload ->> 'event_type', ''), 80), nullif(nullif(payload ->> 'guests', ''), '0')::int,
    left(coalesce(payload ->> 'venue', ''), 200), left(coalesce(payload ->> 'message', ''), 3000),
    left(coalesce(v_name, ''), 120), coalesce(v_email, ''), left(coalesce(v_phone, ''), 40))
  returning bookings.id into v_id;

  -- Matériel
  for v_line in select value from jsonb_array_elements(payload -> 'lines') loop
    v_qty := nullif(v_line ->> 'quantity', '')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'Quantité invalide.'; end if;

    if v_line ->> 'kind' = 'product' then
      select * into v_prod from public.products pr where pr.id = (v_line ->> 'ref_id')::uuid and pr.visible;
      if not found then raise exception 'Un article du devis n''est plus proposé.'; end if;
      if v_prod.rental_mode = 'pack_uniquement' then raise exception '« % » se loue uniquement dans un pack.', v_prod.name; end if;
      if v_prod.rental_mode = 'sur_demande' then v_on_request := true; end if;
      v_price := case v_formula when '24h' then v_prod.price_24h when 'weekend' then v_prod.price_weekend else null end;
      insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort)
      values (v_id, 'product', v_prod.id, v_prod.name, v_qty, v_price, v_sort);
      v_need := jsonb_set(v_need, array[v_prod.id::text], to_jsonb(coalesce((v_need ->> v_prod.id::text)::int, 0) + v_qty));
      if v_price is not null and v_price > 0 then
        v_cbase := v_cbase + v_price * v_qty;
        if not (v_prod.id = any(v_cids)) then v_cids := v_cids || v_prod.id; end if;
      end if;

    elsif v_line ->> 'kind' = 'pack' then
      select * into v_pack from public.packs pk where pk.id = (v_line ->> 'ref_id')::uuid and pk.visible;
      if not found then raise exception 'Un pack du devis n''est plus proposé.'; end if;
      v_price := case v_formula when '24h' then v_pack.price_24h when 'weekend' then v_pack.price_weekend else null end;
      insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort, components)
      values (v_id, 'pack', v_pack.id, v_pack.name, v_qty, v_price, v_sort,
        (select coalesce(jsonb_agg(jsonb_build_object('product_id', pi.product_id, 'quantity', pi.quantity)), '[]'::jsonb)
           from public.pack_items pi where pi.pack_id = v_pack.id));
      for v_pi in select pi.product_id, pi.quantity, pr.rental_mode from public.pack_items pi
                    join public.products pr on pr.id = pi.product_id where pi.pack_id = v_pack.id loop
        v_need := jsonb_set(v_need, array[v_pi.product_id::text],
          to_jsonb(coalesce((v_need ->> v_pi.product_id::text)::int, 0) + v_qty * v_pi.quantity));
        if v_pi.rental_mode = 'sur_demande' then v_on_request := true; end if;
      end loop;
    else
      raise exception 'Ligne de devis invalide.';
    end if;

    if v_price is null then v_open := true; else v_total := v_total + v_price * v_qty; end if;
    v_sort := v_sort + 1;
  end loop;

  -- Pack sur mesure : remise dès N articles différents loués à l'unité (les packs, déjà remisés, n'en profitent pas)
  v_cpct := round(coalesce((v_settings #>> '{booking,custom_discount_percent}')::numeric, 0));
  v_cmin := greatest(coalesce((v_settings #>> '{booking,custom_discount_min_items}')::int, 3), 1);
  if v_cpct > 0 and coalesce(array_length(v_cids, 1), 0) >= v_cmin then
    v_cdisc := round(v_cbase * v_cpct / 100, 2);
    if v_cdisc > 0 then
      insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort)
      values (v_id, 'autre', null, 'Remise pack sur mesure (−' || v_cpct::int || chr(160) || '%)', 1, -v_cdisc, v_sort);
      v_sort := v_sort + 1;
      v_total := v_total - v_cdisc;
    end if;
  end if;

  -- Stock : le matériel demandé doit être libre sur toute la période
  for v_av in
    select a.product_id, a.available, pr.name
      from public.product_availability(v_start, v_end, v_id) a
      join public.products pr on pr.id = a.product_id
  loop
    if coalesce((v_need ->> v_av.product_id::text)::int, 0) > v_av.available then
      raise exception 'Plus assez de « % » disponible à ces dates.', v_av.name;
    end if;
  end loop;

  -- Livraison, installation, technicien
  if v_mode in ('livraison', 'livraison_installation') then
    select * into v_zone_row from public.zones z where z.id = v_zone;
    if not found then raise exception 'Zone de livraison inconnue.'; end if;
    insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort)
    values (v_id, 'livraison', v_zone_row.id, 'Livraison et reprise (' || lower(v_zone_row.name) || ')', 1, v_zone_row.price, v_sort);
    v_sort := v_sort + 1;
    if v_zone_row.price is null then v_open := true; else v_total := v_total + v_zone_row.price; end if;
  end if;

  if v_mode = 'livraison_installation' then
    select * into v_service from public.services s where s.id = 'installation' and s.visible;
    insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort)
    values (v_id, 'installation', null, coalesce(v_service.name, 'Installation et démontage'), 1, v_service.price, v_sort);
    v_sort := v_sort + 1;
    if v_service.price is null then v_open := true; else v_total := v_total + v_service.price; end if;
  end if;

  if v_evenings > 0 then
    select * into v_service from public.services s where s.id = 'technicien' and s.visible;
    insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort)
    values (v_id, 'technicien', null, coalesce(v_service.name, 'Présence technique sur place'), v_evenings, v_service.price, v_sort);
    if v_service.price is null then v_open := true; else v_total := v_total + v_service.price * v_evenings; end if;
  end if;

  v_direct := not v_open and not v_on_request and round(v_total * v_pct / 100, 2) >= 0.5;
  v_status := case when v_direct then 'validee' else 'demande' end;
  update public.bookings b
     set total = case when v_open then null else round(v_total, 2) end,
         deposit_amount = case when v_open then null else round(v_total * v_pct / 100, 2) end,
         caution_amount = public.booking_caution(v_id),
         status = v_status,
         hold_until = case when v_direct then now() + interval '60 minutes' end
   where b.id = v_id;

  return query select v_id, v_ref, v_status;
end $$;

-- Réservation directe dont le délai de paiement est (presque) écoulé : si le matériel
-- est toujours libre, il est de nouveau réservé une heure (trois fois au plus, pour qu'un
-- client ne puisse pas bloquer du matériel sans payer). Appelée par la fonction de paiement.
create or replace function public.refresh_hold(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  v_short text;
  v_until timestamptz := now() + interval '60 minutes';
begin
  perform pg_advisory_xact_lock(hashtext('asl_booking_reference')); -- même verrou que la création
  select * into b from public.bookings where id = p_id for update;
  if not found or b.status <> 'validee' or b.hold_until is null then
    raise exception 'L''acompte ne peut pas être réglé pour cette réservation.';
  end if;
  if b.start_date < public.today_paris() then raise exception 'La date de début est passée. Contactez-nous.'; end if;
  if b.hold_until > now() + interval '35 minutes' then return b.hold_until; end if;
  if b.hold_renewals >= 3 then
    raise exception 'Le délai pour régler l''acompte est dépassé. Refaites votre réservation : le matériel vous sera de nouveau réservé s''il est libre.';
  end if;
  v_short := public.booking_shortage(p_id);
  if v_short is not null then
    raise exception 'Plus assez de « % » disponible à ces dates : le matériel a été réservé entre-temps.', v_short;
  end if;
  update public.bookings set hold_until = v_until, hold_renewals = hold_renewals + 1 where id = p_id;
  return v_until;
end $$;

-- Paiement reçu de Stripe (appelée par le webhook, clé serveur uniquement), sous le même verrou
-- que les réservations. Confirme la réservation si elle attend son acompte et que le matériel est
-- toujours à elle. Sinon le paiement est noté « à rembourser » (le webhook le rembourse) et la
-- fonction en donne la raison : rembourser_deja_payee, rembourser_annulee, rembourser_indisponible
-- ou rembourser_date_passee. Un même paiement reçu deux fois n'est traité qu'une fois (deja_traite).
create or replace function public.confirm_payment(p_booking uuid, p_amount numeric, p_ref text) returns text
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  v_today date := public.today_paris();
  v_reason text;
begin
  perform pg_advisory_xact_lock(hashtext('asl_booking_reference'));
  select * into b from public.bookings where id = p_booking for update;
  if not found then return 'inconnue'; end if;
  if exists (select 1 from public.payments where provider = 'stripe' and provider_ref = p_ref) then return 'deja_traite'; end if;

  if b.status in ('confirmee', 'terminee') then v_reason := 'deja_payee';
  elsif b.status <> 'validee' then v_reason := 'annulee';
  elsif b.start_date < v_today then v_reason := 'date_passee';
  -- Délai de paiement ou validité du devis dépassés : le matériel est peut-être reparti entre-temps
  elsif ((b.hold_until is not null and b.hold_until <= now()) or (b.hold_until is null and b.valid_until is not null and b.valid_until < v_today))
        and public.booking_shortage(p_booking) is not null then v_reason := 'indisponible';
  end if;

  if v_reason is null then
    update public.bookings set status = 'confirmee', deposit_paid_at = now(), deposit_paid_amount = p_amount, payment_ref = p_ref,
      -- Le client a payé la totalité : plus rien à encaisser le jour J
      balance_paid_at = case when b.total is not null and p_amount >= b.total then now() else balance_paid_at end
    where id = p_booking;
    insert into public.payments (booking_id, amount, provider, provider_ref, status) values (p_booking, p_amount, 'stripe', p_ref, 'paid');
    return 'confirmee';
  end if;
  -- La réservation ne peut plus avoir lieu : elle est annulée, le client est remboursé.
  if b.status = 'validee' then update public.bookings set status = 'annulee' where id = p_booking; end if;
  insert into public.payments (booking_id, amount, provider, provider_ref, status) values (p_booking, p_amount, 'stripe', p_ref, 'a_rembourser');
  return 'rembourser_' || v_reason;
end $$;

-- Annulation par le client, tant que l'acompte n'est pas réglé
create or replace function public.cancel_my_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.bookings set status = 'annulee'
   where id = p_id and user_id = auth.uid() and status in ('demande', 'validee');
  if not found then raise exception 'Cette demande ne peut plus être annulée en ligne. Contactez-nous.'; end if;
end $$;

-- ------------------------------------------------------------ Administration

create or replace function public.admin_save_booking(p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb; v_sort int := 0; v_total numeric; v_pct numeric; v_ref uuid;
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur.'; end if;
  if (p_patch ->> 'end_date')::date <= (p_patch ->> 'start_date')::date then
    raise exception 'La date de retour doit suivre la date de début.';
  end if;

  update public.bookings set
    formula = p_patch ->> 'formula',
    start_date = (p_patch ->> 'start_date')::date,
    end_date = (p_patch ->> 'end_date')::date,
    delivery_mode = p_patch ->> 'delivery_mode',
    zone_id = nullif(p_patch ->> 'zone_id', '')::uuid,
    address = coalesce(p_patch ->> 'address', ''),
    technician_evenings = coalesce(nullif(p_patch ->> 'technician_evenings', '')::int, 0),
    event_type = coalesce(p_patch ->> 'event_type', ''),
    guests = nullif(nullif(p_patch ->> 'guests', ''), '0')::int,
    venue = coalesce(p_patch ->> 'venue', ''),
    client_name = coalesce(p_patch ->> 'client_name', client_name),
    client_phone = coalesce(p_patch ->> 'client_phone', client_phone),
    client_note = coalesce(p_patch ->> 'client_note', ''),
    valid_until = nullif(p_patch ->> 'valid_until', '')::date
  where id = p_id;
  if not found then raise exception 'Réservation introuvable.'; end if;

  insert into public.booking_notes (booking_id, admin_note) values (p_id, coalesce(p_patch ->> 'admin_note', ''))
  on conflict (booking_id) do update set admin_note = excluded.admin_note;

  delete from public.booking_items where booking_id = p_id;
  for v_item in select value from jsonb_array_elements(coalesce(p_patch -> 'items', '[]'::jsonb)) loop
    v_ref := nullif(v_item ->> 'ref_id', '')::uuid;
    insert into public.booking_items (booking_id, kind, ref_id, name, quantity, unit_price, sort, components)
    values (
      p_id,
      coalesce(v_item ->> 'kind', 'autre'),
      v_ref,
      coalesce(nullif(trim(v_item ->> 'name'), ''), 'Ligne'),
      greatest(coalesce(nullif(v_item ->> 'quantity', '')::int, 1), 1),
      nullif(v_item ->> 'unit_price', '')::numeric,
      v_sort,
      case when v_item ->> 'kind' = 'pack' then
        case when jsonb_typeof(v_item -> 'components') = 'array' and jsonb_array_length(v_item -> 'components') > 0
          then v_item -> 'components'
          else (select coalesce(jsonb_agg(jsonb_build_object('product_id', pi.product_id, 'quantity', pi.quantity)), '[]'::jsonb)
                  from public.pack_items pi where pi.pack_id = v_ref)
        end
      end
    );
    v_sort := v_sort + 1;
  end loop;

  select case when bool_or(unit_price is null) then null else round(coalesce(sum(unit_price * quantity), 0), 2) end
    into v_total from public.booking_items where booking_id = p_id;
  select coalesce((data #>> '{booking,deposit_percent}')::numeric, 30) into v_pct from public.settings where id = 1;

  update public.bookings set
    total = v_total,
    deposit_amount = coalesce(nullif(p_patch ->> 'deposit_amount', '')::numeric,
                              case when v_total is null then null else round(v_total * v_pct / 100, 2) end),
    caution_amount = public.booking_caution(p_id)
  where id = p_id;
end $$;

create or replace function public.admin_booking_action(p_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings%rowtype;
  v_settings jsonb;
  v_today date := public.today_paris();
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur.'; end if;
  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'Réservation introuvable.'; end if;
  select data into v_settings from public.settings where id = 1;

  if p_action = 'valider' then
    if b.status not in ('demande', 'validee') then raise exception 'Seule une demande en attente peut être validée.'; end if;
    if b.total is null or exists (select 1 from public.booking_items where booking_id = p_id and unit_price is null) then
      raise exception 'Indiquez un prix pour chaque ligne avant de valider.';
    end if;
    update public.bookings set
      status = 'validee',
      hold_until = null,
      valid_until = case when valid_until is null or valid_until < v_today
                         then v_today + coalesce((v_settings #>> '{booking,quote_validity_days}')::int, 7)
                         else valid_until end,
      deposit_amount = coalesce(deposit_amount, round(total * coalesce((v_settings #>> '{booking,deposit_percent}')::numeric, 30) / 100, 2))
    where id = p_id;
  elsif p_action = 'refuser' then
    if b.status not in ('demande', 'validee') then raise exception 'Cette réservation ne peut plus être refusée.'; end if;
    update public.bookings set status = 'refusee' where id = p_id;
  elsif p_action = 'acompte_recu' then
    if b.status not in ('demande', 'validee') then raise exception 'Action impossible pour ce statut.'; end if;
    update public.bookings set status = 'confirmee', deposit_paid_at = now(), deposit_paid_amount = deposit_amount where id = p_id;
    insert into public.payments (booking_id, amount, provider, status)
    select p_id, deposit_amount, 'hors_ligne', 'paid' from public.bookings where id = p_id and deposit_amount is not null;
  elsif p_action = 'solde_regle' then
    update public.bookings set balance_paid_at = now() where id = p_id;
  elsif p_action = 'caution_recue' then
    update public.bookings set caution_status = 'recue' where id = p_id;
  elsif p_action = 'caution_restituee' then
    update public.bookings set caution_status = 'restituee' where id = p_id;
  elsif p_action = 'terminer' then
    if b.status <> 'confirmee' then raise exception 'Seule une réservation confirmée peut être terminée.'; end if;
    update public.bookings set status = 'terminee' where id = p_id;
  elsif p_action = 'annuler' then
    if b.status not in ('demande', 'validee', 'confirmee') then raise exception 'Cette réservation ne peut plus être annulée.'; end if;
    update public.bookings set status = 'annulee' where id = p_id;
  elsif p_action = 'rouvrir' then
    if b.status not in ('refusee', 'annulee') then raise exception 'Action impossible pour ce statut.'; end if;
    update public.bookings set status = 'demande', hold_until = null where id = p_id;
  else
    raise exception 'Action inconnue.';
  end if;
end $$;

create or replace function public.admin_save_pack(p_pack jsonb, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Accès réservé à l''administrateur.'; end if;
  insert into public.packs (id, slug, name, tagline, description, audience, price_24h, price_weekend, caution, photos, visible, featured, sort)
  values (
    coalesce(nullif(p_pack ->> 'id', '')::uuid, gen_random_uuid()),
    p_pack ->> 'slug',
    p_pack ->> 'name',
    coalesce(p_pack ->> 'tagline', ''),
    coalesce(p_pack ->> 'description', ''),
    coalesce(p_pack ->> 'audience', ''),
    nullif(p_pack ->> 'price_24h', '')::numeric,
    nullif(p_pack ->> 'price_weekend', '')::numeric,
    nullif(p_pack ->> 'caution', '')::numeric,
    coalesce(p_pack -> 'photos', '[]'::jsonb),
    coalesce((p_pack ->> 'visible')::boolean, true),
    coalesce((p_pack ->> 'featured')::boolean, false),
    coalesce((p_pack ->> 'sort')::int, 0)
  )
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, tagline = excluded.tagline, description = excluded.description,
    audience = excluded.audience, price_24h = excluded.price_24h, price_weekend = excluded.price_weekend,
    caution = excluded.caution, photos = excluded.photos, visible = excluded.visible, featured = excluded.featured, sort = excluded.sort
  returning id into v_id;

  delete from public.pack_items where pack_id = v_id;
  insert into public.pack_items (pack_id, product_id, quantity)
  select v_id, (i ->> 'product_id')::uuid, sum(greatest((i ->> 'quantity')::int, 1))
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
   group by (i ->> 'product_id')::uuid;
  return v_id;
end $$;

-- Formulaire de contact : ouvert à tous, avec une limite anti-abus
create or replace function public.submit_contact(payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_email text := lower(trim(coalesce(payload ->> 'email', '')));
  v_recent int;
begin
  if coalesce(payload ->> 'website', '') <> '' then return null; end if; -- champ piège pour robots
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  select count(*) into v_recent from public.messages where lower(email) = v_email and created_at > now() - interval '1 hour';
  if v_recent >= 3 then raise exception 'Vous avez déjà envoyé plusieurs messages. Nous vous répondons rapidement.'; end if;
  -- Limite globale, pour qu'un robot ne puisse pas épuiser le quota d'e-mails du site
  if (select count(*) from public.messages where created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.messages where created_at > now() - interval '1 day') >= 40 then
    raise exception 'Le formulaire est très sollicité en ce moment : réessayez plus tard, ou appelez-nous.';
  end if;
  insert into public.messages (name, email, phone, subject, body)
  values (
    left(trim(coalesce(payload ->> 'name', '')), 120),
    v_email,
    left(trim(coalesce(payload ->> 'phone', '')), 40),
    left(trim(coalesce(payload ->> 'subject', '')), 200),
    left(trim(coalesce(payload ->> 'body', '')), 5000)
  )
  returning id into v_id;
  return v_id;
end $$;

-- ------------------------------------------------------------ Règles d'accès (RLS)

alter table public.settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.packs enable row level security;
alter table public.pack_items enable row level security;
alter table public.services enable row level security;
alter table public.zones enable row level security;
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_items enable row level security;
alter table public.payments enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.booking_notes enable row level security;
alter table public.admin_settings enable row level security;

-- Catalogue : lecture publique (articles visibles), écriture par l'admin
create policy "settings_lecture" on public.settings for select using (true);
create policy "settings_admin" on public.settings for update using (public.is_admin()) with check (public.is_admin());

create policy "categories_lecture" on public.categories for select using (true);
create policy "categories_admin" on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "products_lecture" on public.products for select using (visible or public.is_admin());
create policy "products_admin" on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy "packs_lecture" on public.packs for select using (visible or public.is_admin());
create policy "packs_admin" on public.packs for all using (public.is_admin()) with check (public.is_admin());

create policy "pack_items_lecture" on public.pack_items for select using (true);
create policy "pack_items_admin" on public.pack_items for all using (public.is_admin()) with check (public.is_admin());

create policy "services_lecture" on public.services for select using (visible or public.is_admin());
create policy "services_admin" on public.services for all using (public.is_admin()) with check (public.is_admin());

create policy "zones_lecture" on public.zones for select using (true);
create policy "zones_admin" on public.zones for all using (public.is_admin()) with check (public.is_admin());

-- Profils : chacun le sien, l'admin tous
create policy "profiles_lecture" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_maj" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Réservations : le client voit les siennes ; les créations passent par create_booking_request
create policy "bookings_lecture" on public.bookings for select using (user_id = auth.uid() or public.is_admin());
create policy "bookings_admin" on public.bookings for all using (public.is_admin()) with check (public.is_admin());

create policy "booking_items_lecture" on public.booking_items for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "booking_items_admin" on public.booking_items for all using (public.is_admin()) with check (public.is_admin());

create policy "payments_lecture" on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and (b.user_id = auth.uid() or public.is_admin())));
create policy "payments_admin" on public.payments for update using (public.is_admin()) with check (public.is_admin());

-- Messages : envoyés via submit_contact, lus par l'admin
create policy "messages_admin" on public.messages for all using (public.is_admin()) with check (public.is_admin());

-- Indisponibilités : gérées par l'admin (les disponibilités publiques passent par product_availability)
create policy "blocks_admin" on public.blocks for all using (public.is_admin()) with check (public.is_admin());

-- Note privée et réglages privés : l'admin seulement
create policy "booking_notes_admin" on public.booking_notes for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_settings_admin" on public.admin_settings for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ Droits

grant usage on schema public to anon, authenticated, service_role;
grant select on public.settings, public.categories, public.products, public.packs, public.pack_items, public.services, public.zones to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.packs, public.pack_items, public.services, public.zones to authenticated;
grant update on public.settings to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.bookings, public.booking_items, public.messages, public.blocks, public.booking_notes, public.admin_settings to authenticated;
grant select, update on public.payments to authenticated;
-- Les fonctions serveur (clé secrète) lisent et mettent à jour les tables, quel que soit le réglage
-- « Afficher automatiquement les nouvelles tables » choisi à la création du projet Supabase.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Supabase ouvre par défaut les fonctions à tous : seules celles-ci restent appelables depuis le site.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.today_paris() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.product_availability(date, date, uuid) to anon, authenticated;
grant execute on function public.submit_contact(jsonb) to anon, authenticated;
grant execute on function public.create_booking_request(jsonb) to authenticated;
grant execute on function public.cancel_my_booking(uuid) to authenticated;
grant execute on function public.admin_save_booking(uuid, jsonb) to authenticated;
grant execute on function public.admin_booking_action(uuid, text) to authenticated;
grant execute on function public.admin_save_pack(jsonb, jsonb) to authenticated;
grant execute on function public.refresh_hold(uuid) to service_role;
grant execute on function public.confirm_payment(uuid, numeric, text) to service_role;

-- ------------------------------------------------------------ Photos du catalogue

insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;

create policy "photos_lecture" on storage.objects for select using (bucket_id = 'photos');
create policy "photos_ajout_admin" on storage.objects for insert to authenticated with check (bucket_id = 'photos' and public.is_admin());
create policy "photos_maj_admin" on storage.objects for update to authenticated using (bucket_id = 'photos' and public.is_admin());
create policy "photos_suppr_admin" on storage.objects for delete to authenticated using (bucket_id = 'photos' and public.is_admin());

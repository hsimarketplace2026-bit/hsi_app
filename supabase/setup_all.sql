-- ================================================================
-- HSI Marketplace — COMPLETE IDEMPOTENT SETUP (run this one file)
--
-- Naming convention (MJM-style, module-namespaced):
--   shared_*  → cross-module identity/config (reused by future modules)
--   mkt_*     → marketplace module tables
--
-- This file:
--   0) Renames any OLD un-prefixed tables to the new names (keeps data)
--   A) Creates the base marketplace under the new names
--   B) Adds loyalty / coupons / promotions / billing / settings
-- Safe on a fresh OR partially-set-up DB, and safe to re-run.
--
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ================================================================


-- ================================================================
-- PART 0 — RENAME OLD → NEW (only if the old name still exists)
-- ================================================================
do $$
declare
  r record;
  renames text[][] := array[
    ['profiles','shared_profiles'],
    ['app_settings','shared_app_settings'],
    ['products','mkt_products'],
    ['cart_items','mkt_cart_items'],
    ['orders','mkt_orders'],
    ['order_items','mkt_order_items'],
    ['payments','mkt_payments'],
    ['announcements','mkt_announcements'],
    ['coupons','mkt_coupons'],
    ['coupon_redemptions','mkt_coupon_redemptions'],
    ['promotions','mkt_promotions'],
    ['points_ledger','mkt_points_ledger'],
    ['billing_info','mkt_billing_info']
  ];
  i int;
begin
  for i in 1 .. array_length(renames,1) loop
    if exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=renames[i][1])
       and not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=renames[i][2]) then
      execute format('alter table public.%I rename to %I', renames[i][1], renames[i][2]);
    end if;
  end loop;
  -- old view name, if present
  if exists (select 1 from information_schema.views where table_schema='public' and table_name='customer_points_balance') then
    execute 'drop view if exists public.customer_points_balance';
  end if;
end $$;


-- ================================================================
-- PART A — BASE MARKETPLACE (namespaced)
-- ================================================================

-- ---- A1. Tables -------------------------------------------------
create table if not exists public.shared_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text,
  phone         text,
  role          text not null check (role in ('buyer','seller','admin')) default 'buyer',
  status        text not null check (status in ('pending','active','suspended')) default 'active',
  farm_name     text,
  farm_location text,
  created_at    timestamptz default now()
);

create table if not exists public.mkt_products (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid references public.shared_profiles(id) on delete cascade,
  name         text not null,
  category     text not null check (category in ('Vegetables','Fruits','Herbs','Other')),
  description  text,
  price        numeric(10,2) not null,
  unit         text not null default 'kg',
  quantity     integer not null default 0,
  harvest_date date,
  image_url    text,
  status       text not null check (status in ('active','inactive')) default 'active',
  created_at   timestamptz default now()
);

create table if not exists public.mkt_cart_items (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   uuid references public.shared_profiles(id) on delete cascade,
  product_id uuid references public.mkt_products(id) on delete cascade,
  quantity   integer not null default 1,
  created_at timestamptz default now(),
  unique(buyer_id, product_id)
);

create table if not exists public.mkt_orders (
  id             uuid primary key default gen_random_uuid(),
  buyer_id       uuid references public.shared_profiles(id),
  seller_id      uuid references public.shared_profiles(id),
  status         text not null check (status in (
    'pending','payment_uploaded','payment_verified','processing','completed','cancelled'
  )) default 'pending',
  total_amount   numeric(10,2) not null default 0,
  delivery_notes text,
  created_at     timestamptz default now()
);

create table if not exists public.mkt_order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references public.mkt_orders(id) on delete cascade,
  product_id uuid references public.mkt_products(id),
  quantity   integer not null,
  unit_price numeric(10,2) not null,
  created_at timestamptz default now()
);

create table if not exists public.mkt_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.mkt_orders(id) on delete cascade,
  buyer_id    uuid references public.shared_profiles(id),
  method      text not null,
  proof_url   text,
  status      text not null check (status in ('pending','verified','rejected')) default 'pending',
  admin_notes text,
  created_at  timestamptz default now()
);

create table if not exists public.mkt_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  image_url   text,
  is_featured boolean default false,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- ---- A2. Shared helper + signup trigger ------------------------
create or replace function public.is_admin(uid uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.shared_profiles where id = uid and role = 'admin');
$$;
grant execute on function public.is_admin(uuid) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.shared_profiles (id, email, full_name, phone, farm_name, farm_location, role, status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'farm_name',
    new.raw_user_meta_data->>'farm_location',
    coalesce(new.raw_user_meta_data->>'role', 'buyer'),
    case when coalesce(new.raw_user_meta_data->>'role','buyer') = 'seller' then 'pending' else 'active' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---- A3. RLS (drop-then-create; covers old policy names too) ---
alter table public.shared_profiles  enable row level security;
alter table public.mkt_products     enable row level security;
alter table public.mkt_cart_items   enable row level security;
alter table public.mkt_orders       enable row level security;
alter table public.mkt_order_items  enable row level security;
alter table public.mkt_payments     enable row level security;
alter table public.mkt_announcements enable row level security;

drop policy if exists "Users view own profile"        on public.shared_profiles;
drop policy if exists "Users update own profile"       on public.shared_profiles;
drop policy if exists "Users can view own profile"     on public.shared_profiles;
drop policy if exists "Users can update own profile"   on public.shared_profiles;
drop policy if exists "Admins view all profiles"       on public.shared_profiles;
drop policy if exists "Admins update all profiles"     on public.shared_profiles;
drop policy if exists "Admins can view all profiles"   on public.shared_profiles;
drop policy if exists "Admins can update all profiles" on public.shared_profiles;
drop policy if exists "Users insert own profile"       on public.shared_profiles;
create policy "Users view own profile"     on public.shared_profiles for select using (auth.uid() = id);
create policy "Users insert own profile"   on public.shared_profiles for insert with check (auth.uid() = id);
create policy "Users update own profile"   on public.shared_profiles for update using (auth.uid() = id);
create policy "Admins view all profiles"   on public.shared_profiles for select using (public.is_admin(auth.uid()));
create policy "Admins update all profiles" on public.shared_profiles for update using (public.is_admin(auth.uid()));

drop policy if exists "Anyone views active products"    on public.mkt_products;
drop policy if exists "Anyone can view active products" on public.mkt_products;
drop policy if exists "Sellers manage own products"     on public.mkt_products;
drop policy if exists "Admins manage all products"      on public.mkt_products;
create policy "Anyone views active products" on public.mkt_products for select using (status = 'active');
create policy "Sellers manage own products"  on public.mkt_products for all   using (auth.uid() = seller_id);
create policy "Admins manage all products"   on public.mkt_products for all   using (public.is_admin(auth.uid()));

drop policy if exists "Buyers manage own cart" on public.mkt_cart_items;
create policy "Buyers manage own cart" on public.mkt_cart_items for all using (auth.uid() = buyer_id);

drop policy if exists "Buyers view own orders"    on public.mkt_orders;
drop policy if exists "Buyers create orders"      on public.mkt_orders;
drop policy if exists "Sellers view own orders"   on public.mkt_orders;
drop policy if exists "Sellers update own orders" on public.mkt_orders;
drop policy if exists "Admins manage all orders"  on public.mkt_orders;
create policy "Buyers view own orders"    on public.mkt_orders for select using (auth.uid() = buyer_id);
create policy "Buyers create orders"      on public.mkt_orders for insert with check (auth.uid() = buyer_id);
create policy "Sellers view own orders"   on public.mkt_orders for select using (auth.uid() = seller_id);
create policy "Sellers update own orders" on public.mkt_orders for update using (auth.uid() = seller_id);
create policy "Admins manage all orders"  on public.mkt_orders for all   using (public.is_admin(auth.uid()));

drop policy if exists "Buyers view own order items"   on public.mkt_order_items;
drop policy if exists "Buyers insert order items"     on public.mkt_order_items;
drop policy if exists "Sellers view own order items"  on public.mkt_order_items;
drop policy if exists "Admins manage all order items" on public.mkt_order_items;
create policy "Buyers view own order items"   on public.mkt_order_items for select using (
  exists(select 1 from public.mkt_orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy "Buyers insert order items"     on public.mkt_order_items for insert with check (
  exists(select 1 from public.mkt_orders o where o.id = order_id and o.buyer_id = auth.uid()));
create policy "Sellers view own order items"  on public.mkt_order_items for select using (
  exists(select 1 from public.mkt_orders o where o.id = order_id and o.seller_id = auth.uid()));
create policy "Admins manage all order items" on public.mkt_order_items for all using (public.is_admin(auth.uid()));

drop policy if exists "Buyers manage own payments"       on public.mkt_payments;
drop policy if exists "Sellers view payments for orders" on public.mkt_payments;
drop policy if exists "Sellers update payment status"    on public.mkt_payments;
drop policy if exists "Admins manage all payments"       on public.mkt_payments;
create policy "Buyers manage own payments"       on public.mkt_payments for all    using (auth.uid() = buyer_id);
create policy "Sellers view payments for orders" on public.mkt_payments for select using (
  exists(select 1 from public.mkt_orders o where o.id = order_id and o.seller_id = auth.uid()));
create policy "Sellers update payment status"    on public.mkt_payments for update using (
  exists(select 1 from public.mkt_orders o where o.id = order_id and o.seller_id = auth.uid()));
create policy "Admins manage all payments"       on public.mkt_payments for all    using (public.is_admin(auth.uid()));

drop policy if exists "Anyone views active announcements"     on public.mkt_announcements;
drop policy if exists "Anyone can view active announcements"  on public.mkt_announcements;
drop policy if exists "Admins manage announcements"           on public.mkt_announcements;
create policy "Anyone views active announcements" on public.mkt_announcements for select using (is_active = true);
create policy "Admins manage announcements"       on public.mkt_announcements for all    using (public.is_admin(auth.uid()));

-- ---- A4. Storage buckets + policies ----------------------------
insert into storage.buckets (id, name, public) values ('mkt-product-images','mkt-product-images', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('mkt-payment-proofs','mkt-payment-proofs', false) on conflict (id) do nothing;

drop policy if exists "Public read product images"        on storage.objects;
drop policy if exists "Sellers upload product images"     on storage.objects;
drop policy if exists "Sellers delete own product images" on storage.objects;
drop policy if exists "Buyers upload payment proofs"      on storage.objects;
drop policy if exists "Buyers view own payment proofs"    on storage.objects;
drop policy if exists "Admins view all payment proofs"    on storage.objects;
create policy "Public read product images"        on storage.objects for select using (bucket_id = 'mkt-product-images');
create policy "Sellers upload product images"     on storage.objects for insert with check (bucket_id = 'mkt-product-images' and auth.role() = 'authenticated');
create policy "Sellers delete own product images" on storage.objects for delete using (bucket_id = 'mkt-product-images' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Buyers upload payment proofs"      on storage.objects for insert with check (bucket_id = 'mkt-payment-proofs' and auth.role() = 'authenticated');
create policy "Buyers view own payment proofs"    on storage.objects for select using (bucket_id = 'mkt-payment-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Admins view all payment proofs"    on storage.objects for select using (bucket_id = 'mkt-payment-proofs' and public.is_admin(auth.uid()));


-- ================================================================
-- PART B — V2: loyalty, coupons, promotions, billing, settings
-- ================================================================

-- ---- B1. New columns on mkt_orders / mkt_order_items / mkt_payments
alter table public.mkt_orders add column if not exists order_number        text;
alter table public.mkt_orders add column if not exists subtotal            numeric(10,2) not null default 0;
alter table public.mkt_orders add column if not exists discount_amount     numeric(10,2) not null default 0;
alter table public.mkt_orders add column if not exists coupon_code         text;
alter table public.mkt_orders add column if not exists points_redeemed     integer       not null default 0;
alter table public.mkt_orders add column if not exists points_discount_rm  numeric(10,2) not null default 0;
alter table public.mkt_orders add column if not exists points_issued       integer       not null default 0;
alter table public.mkt_orders add column if not exists payment_method      text          default 'offline';
alter table public.mkt_orders add column if not exists channel             text          default 'online_store';
alter table public.mkt_orders add column if not exists amount_paid         numeric(10,2) not null default 0;
alter table public.mkt_orders add column if not exists amount_paid_at      timestamptz;
alter table public.mkt_orders add column if not exists billplz_bill_id     text;
alter table public.mkt_orders add column if not exists rating              integer;
alter table public.mkt_orders add column if not exists rating_comment      text;
alter table public.mkt_orders add column if not exists email_sent_at       timestamptz;
alter table public.mkt_orders add column if not exists updated_at          timestamptz default now();
create unique index if not exists uniq_mkt_orders_order_number on public.mkt_orders (order_number) where order_number is not null;

alter table public.mkt_order_items add column if not exists product_name       text;
alter table public.mkt_order_items add column if not exists promotion_id       uuid;
alter table public.mkt_order_items add column if not exists promotion_discount numeric(10,2) not null default 0;

alter table public.mkt_payments add column if not exists amount    numeric(10,2);
alter table public.mkt_payments add column if not exists reference text;

-- ---- B2. Shared app settings -----------------------------------
create table if not exists public.shared_app_settings (
  key text primary key, value jsonb not null default '{}'::jsonb, updated_at timestamptz default now()
);
insert into public.shared_app_settings (key, value) values
  ('points_config',       '{"earn_rm": 10, "earn_pts": 1, "redeem_pts": 100, "redeem_rm": 1, "enabled": true}'::jsonb),
  ('member_tiers',        '[{"name":"Sprout","min_points":0,"color":"#86efac"},{"name":"Grower","min_points":500,"color":"#22c55e"},{"name":"Harvester","min_points":2000,"color":"#15803d"},{"name":"Master Farmer","min_points":5000,"color":"#14532d"}]'::jsonb),
  ('payment_config',      '{"online_enabled": false, "offline_enabled": true, "bank_name": "", "bank_account": "", "account_holder": "", "duitnow_qr_url": ""}'::jsonb),
  ('notification_config', '{"from_email": "orders@hsimarketplace.com", "from_name": "HSI Marketplace", "admin_emails": []}'::jsonb),
  ('store_info',          '{"name": "HSI Marketplace", "whatsapp": "", "support_email": "", "address": ""}'::jsonb),
  ('order_auto_release',  '{"enabled": true, "hours": 48}'::jsonb)
on conflict (key) do nothing;

-- ---- B3. Points ledger + balance view --------------------------
create table if not exists public.mkt_points_ledger (
  id bigserial primary key,
  user_id uuid not null references public.shared_profiles(id) on delete cascade,
  change integer not null,
  type text not null check (type in ('Earned','Redeemed','Adjusted','Expired')),
  order_id uuid references public.mkt_orders(id) on delete set null,
  rm_value numeric(10,2), note text, created_by text, created_at timestamptz default now()
);
create index if not exists idx_mkt_points_ledger_user on public.mkt_points_ledger (user_id, created_at desc);
create unique index if not exists uniq_mkt_points_ledger_order_type on public.mkt_points_ledger (order_id, type) where order_id is not null;

create or replace view public.mkt_customer_points_balance as
with ledger_totals as (
  select user_id,
         coalesce(sum(change),0)::int as ledger_balance,
         coalesce(sum(case when change > 0 then change else 0 end),0)::int as lifetime_earned,
         coalesce(sum(case when change < 0 then -change else 0 end),0)::int as lifetime_redeemed,
         max(created_at) as last_activity
  from public.mkt_points_ledger group by user_id
),
pending as (
  select buyer_id as user_id, coalesce(sum(points_redeemed),0)::int as pending_redeemed
  from public.mkt_orders where status in ('pending','payment_uploaded') and points_redeemed > 0 group by buyer_id
)
select p.id as user_id,
       (coalesce(l.ledger_balance,0) - coalesce(pe.pending_redeemed,0))::int as balance,
       coalesce(l.lifetime_earned,0)::int   as lifetime_earned,
       coalesce(l.lifetime_redeemed,0)::int as lifetime_redeemed,
       coalesce(pe.pending_redeemed,0)::int as pending_redeemed,
       l.last_activity
from public.shared_profiles p
left join ledger_totals l on l.user_id = p.id
left join pending pe on pe.user_id = p.id;

-- ---- B4. Coupons -----------------------------------------------
create table if not exists public.mkt_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text, description text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null default 0,
  min_order_value numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  usage_limit integer not null default 0, usage_count integer not null default 0,
  per_customer_limit integer not null default 0, first_order_only boolean not null default false,
  scope text not null default 'all' check (scope in ('all','category')),
  scope_categories text[] not null default '{}',
  start_date date, expiry_date date, is_active boolean not null default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.mkt_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.mkt_coupons(id) on delete cascade,
  coupon_code text not null,
  customer_id uuid references public.shared_profiles(id) on delete set null,
  order_id uuid references public.mkt_orders(id) on delete set null,
  subtotal numeric(10,2) not null default 0, discount_amount numeric(10,2) not null default 0,
  redeemed_at timestamptz default now()
);
create index if not exists idx_mkt_coupon_redemptions_coupon   on public.mkt_coupon_redemptions(coupon_id);
create index if not exists idx_mkt_coupon_redemptions_customer on public.mkt_coupon_redemptions(customer_id);

-- ---- B5. Promotions --------------------------------------------
create table if not exists public.mkt_promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text,
  discount_type text not null default 'percentage' check (discount_type in ('percentage','fixed')),
  discount_value numeric(10,2) not null default 0,
  target text not null default 'all' check (target in ('all','category','specific')),
  target_categories text[] not null default '{}', target_product_ids uuid[] not null default '{}',
  banner_text text, banner_emoji text default '🏷️', banner_color text default '#16a34a',
  priority integer not null default 0, max_discount numeric(10,2), min_order_value numeric(10,2) not null default 0,
  start_date date, end_date date,
  status text not null default 'draft' check (status in ('draft','scheduled','live','ended','archived')),
  is_active boolean not null default true, created_at timestamptz default now(), updated_at timestamptz default now()
);

-- ---- B6. Billing info ------------------------------------------
create table if not exists public.mkt_billing_info (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.shared_profiles(id) on delete cascade,
  type text not null default 'personal' check (type in ('personal','company')),
  name text, phone text, address text, city text, state text, postcode text, tax_id text,
  is_default boolean not null default false, created_at timestamptz default now()
);
create index if not exists idx_mkt_billing_info_user on public.mkt_billing_info(user_id);

-- ---- B7. RPC functions (mkt_*) ---------------------------------
create or replace function public.mkt_next_order_number()
returns text language plpgsql security definer set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; candidate text; i int; attempts int := 0;
begin
  loop
    candidate := 'HSI-';
    for i in 1..6 loop candidate := candidate || substr(alphabet, floor(random()*length(alphabet))::int + 1, 1); end loop;
    exit when not exists (select 1 from public.mkt_orders where order_number = candidate);
    attempts := attempts + 1;
    if attempts > 20 then candidate := 'HSI-' || to_char(now(),'YYMMDDHH24MISS'); exit; end if;
  end loop;
  return candidate;
end; $$;
grant execute on function public.mkt_next_order_number() to anon, authenticated;

create or replace function public.mkt_preview_coupon(p_code text, p_customer_id uuid, p_subtotal numeric, p_categories text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.mkt_coupons%rowtype; v_eligible numeric := 0; v_discount numeric := 0; v_used int := 0; v_today date := current_date;
begin
  select * into c from public.mkt_coupons where lower(code) = lower(p_code) limit 1;
  if not found then return jsonb_build_object('valid', false, 'reason', 'Coupon code not found'); end if;
  if not c.is_active then return jsonb_build_object('valid', false, 'reason', 'Coupon is not active'); end if;
  if c.start_date is not null and c.start_date > v_today then return jsonb_build_object('valid', false, 'reason', 'Coupon is not yet valid'); end if;
  if c.expiry_date is not null and c.expiry_date < v_today then return jsonb_build_object('valid', false, 'reason', 'Coupon has expired'); end if;
  if c.usage_limit > 0 and c.usage_count >= c.usage_limit then return jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached'); end if;
  if p_subtotal < c.min_order_value then return jsonb_build_object('valid', false, 'reason', 'Minimum order of RM ' || to_char(c.min_order_value,'FM999990.00') || ' required'); end if;
  if c.per_customer_limit > 0 and p_customer_id is not null then
    select count(*) into v_used from public.mkt_coupon_redemptions where coupon_id = c.id and customer_id = p_customer_id;
    if v_used >= c.per_customer_limit then return jsonb_build_object('valid', false, 'reason', 'You have already used this coupon'); end if;
  end if;
  if c.first_order_only and p_customer_id is not null then
    if exists (select 1 from public.mkt_orders where buyer_id = p_customer_id and status not in ('cancelled')) then
      return jsonb_build_object('valid', false, 'reason', 'Coupon valid on first order only'); end if;
  end if;
  if c.scope = 'category' then
    if not (p_categories && c.scope_categories) then return jsonb_build_object('valid', false, 'reason', 'Coupon does not apply to items in your cart'); end if;
    v_eligible := p_subtotal;
  else v_eligible := p_subtotal; end if;
  if c.discount_type = 'percentage' then v_discount := round(v_eligible * (c.discount_value / 100.0), 2);
  else v_discount := least(c.discount_value, v_eligible); end if;
  if coalesce(c.max_discount,0) > 0 and v_discount > c.max_discount then v_discount := c.max_discount; end if;
  return jsonb_build_object('valid', true, 'coupon_id', c.id, 'code', c.code, 'name', coalesce(c.name, c.code), 'discount', v_discount, 'discount_type', c.discount_type);
end; $$;
grant execute on function public.mkt_preview_coupon(text, uuid, numeric, text[]) to anon, authenticated;

create or replace function public.mkt_redeem_coupon(p_code text, p_customer_id uuid, p_order_id uuid, p_subtotal numeric, p_categories text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prev jsonb; v_coupon_id uuid; v_discount numeric;
begin
  if exists (select 1 from public.mkt_coupon_redemptions where order_id = p_order_id) then
    select jsonb_build_object('ok', true, 'discount', discount_amount, 'coupon_code', coupon_code) into v_prev
      from public.mkt_coupon_redemptions where order_id = p_order_id limit 1;
    return v_prev;
  end if;
  v_prev := public.mkt_preview_coupon(p_code, p_customer_id, p_subtotal, p_categories);
  if not (v_prev->>'valid')::boolean then return jsonb_build_object('ok', false, 'reason', v_prev->>'reason'); end if;
  v_coupon_id := (v_prev->>'coupon_id')::uuid; v_discount := (v_prev->>'discount')::numeric;
  insert into public.mkt_coupon_redemptions(coupon_id, coupon_code, customer_id, order_id, subtotal, discount_amount)
  values (v_coupon_id, v_prev->>'code', p_customer_id, p_order_id, p_subtotal, v_discount);
  update public.mkt_coupons set usage_count = usage_count + 1, updated_at = now() where id = v_coupon_id;
  return jsonb_build_object('ok', true, 'discount', v_discount, 'coupon_code', v_prev->>'code');
end; $$;
grant execute on function public.mkt_redeem_coupon(text, uuid, uuid, numeric, text[]) to anon, authenticated;

create or replace function public.mkt_promotions_for_cart(p_items jsonb)
returns table(product_id uuid, promotion_id uuid, promo_title text, discount numeric)
language plpgsql security definer set search_path = public as $$
declare v_today date := current_date;
begin
  return query
  with live_promos as (
    select * from public.mkt_promotions where status = 'live' and coalesce(is_active, true)
      and (start_date is null or start_date <= v_today) and (end_date is null or end_date >= v_today)
  ),
  cart as (
    select (it->>'product_id')::uuid as product_id, (it->>'category') as category,
           (it->>'qty')::numeric as qty, (it->>'price')::numeric as price
      from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) as it
  ),
  matches as (
    select c.product_id, lp.id as promotion_id, lp.title as promo_title, lp.priority,
           case when lp.discount_type = 'percentage'
             then least(round(c.qty*c.price*(lp.discount_value/100.0),2), coalesce(nullif(lp.max_discount,0), 1e12))
             else least(lp.discount_value*c.qty, c.qty*c.price) end as discount
      from cart c join live_promos lp on (
            lp.target = 'all'
         or (lp.target = 'specific' and c.product_id = any(lp.target_product_ids))
         or (lp.target = 'category' and c.category = any(lp.target_categories)))
  ),
  ranked as (select *, row_number() over (partition by product_id order by priority desc, discount desc) as rn from matches)
  select r.product_id, r.promotion_id, r.promo_title, r.discount from ranked r where rn = 1 and discount > 0;
end; $$;
grant execute on function public.mkt_promotions_for_cart(jsonb) to anon, authenticated;

create or replace function public.mkt_award_order_points(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare o public.mkt_orders%rowtype; cfg jsonb; earn_rm numeric := 10; earn_pts numeric := 1; pts int := 0;
begin
  select * into o from public.mkt_orders where id = p_order_id;
  if not found then return 0; end if;
  if o.points_issued is not null and o.points_issued > 0 then return o.points_issued; end if;
  if o.buyer_id is null then return 0; end if;
  select value into cfg from public.shared_app_settings where key = 'points_config';
  if cfg is not null then
    if (cfg ? 'enabled') and not (cfg->>'enabled')::boolean then return 0; end if;
    earn_rm  := greatest(0.01, coalesce((cfg->>'earn_rm')::numeric, 10));
    earn_pts := greatest(0,    coalesce((cfg->>'earn_pts')::numeric, 1));
  end if;
  pts := floor(coalesce(o.total_amount,0) / earn_rm) * earn_pts;
  if pts > 0 then
    update public.mkt_orders set points_issued = pts, updated_at = now() where id = p_order_id;
    insert into public.mkt_points_ledger(user_id, change, type, order_id, rm_value, note, created_by)
    values (o.buyer_id, pts, 'Earned', p_order_id, o.total_amount, 'Order ' || coalesce(o.order_number, p_order_id::text), 'system')
    on conflict (order_id, type) do nothing;
  end if;
  if coalesce(o.points_redeemed,0) > 0 then
    insert into public.mkt_points_ledger(user_id, change, type, order_id, rm_value, note, created_by)
    values (o.buyer_id, -o.points_redeemed, 'Redeemed', p_order_id, o.points_discount_rm, 'Redeemed on order ' || coalesce(o.order_number, p_order_id::text), 'system')
    on conflict (order_id, type) do nothing;
  end if;
  return pts;
end; $$;
grant execute on function public.mkt_award_order_points(uuid) to anon, authenticated;

create or replace function public.mkt_release_abandoned_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare cfg jsonb; v_hours int := 48; v_enabled boolean := true; v_count int := 0; r record;
begin
  select value into cfg from public.shared_app_settings where key = 'order_auto_release';
  if cfg is not null then v_enabled := coalesce((cfg->>'enabled')::boolean, true); v_hours := coalesce((cfg->>'hours')::int, 48); end if;
  if not v_enabled or v_hours <= 0 then return 0; end if;
  for r in select id from public.mkt_orders where status = 'pending' and created_at < now() - (v_hours || ' hours')::interval loop
    update public.mkt_products p set quantity = coalesce(p.quantity,0) + oi.qty
      from (select product_id, sum(quantity) qty from public.mkt_order_items where order_id = r.id and product_id is not null group by product_id) oi
     where p.id = oi.product_id;
    update public.mkt_orders set status = 'cancelled', updated_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $$;
grant execute on function public.mkt_release_abandoned_orders() to authenticated;

-- Drop the old un-prefixed function names if a previous version created them
drop function if exists public.next_order_number();
drop function if exists public.preview_coupon(text, uuid, numeric, text[]);
drop function if exists public.redeem_coupon(text, uuid, uuid, numeric, text[]);
drop function if exists public.promotions_for_cart(jsonb);
drop function if exists public.award_order_points(uuid);
drop function if exists public.release_abandoned_orders();

-- ---- B8. RLS for v2 tables (drop-then-create) ------------------
alter table public.shared_app_settings      enable row level security;
alter table public.mkt_points_ledger        enable row level security;
alter table public.mkt_coupons              enable row level security;
alter table public.mkt_coupon_redemptions   enable row level security;
alter table public.mkt_promotions           enable row level security;
alter table public.mkt_billing_info         enable row level security;

drop policy if exists "Anyone reads settings" on public.shared_app_settings;
drop policy if exists "Admins write settings"  on public.shared_app_settings;
create policy "Anyone reads settings" on public.shared_app_settings for select using (true);
create policy "Admins write settings" on public.shared_app_settings for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Users read own points"  on public.mkt_points_ledger;
drop policy if exists "Admins read all points" on public.mkt_points_ledger;
drop policy if exists "Admins write points"    on public.mkt_points_ledger;
create policy "Users read own points"  on public.mkt_points_ledger for select using (auth.uid() = user_id);
create policy "Admins read all points" on public.mkt_points_ledger for select using (public.is_admin(auth.uid()));
create policy "Admins write points"    on public.mkt_points_ledger for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Anyone reads coupons"  on public.mkt_coupons;
drop policy if exists "Admins manage coupons" on public.mkt_coupons;
create policy "Anyone reads coupons"  on public.mkt_coupons for select using (true);
create policy "Admins manage coupons" on public.mkt_coupons for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Users read own redemptions" on public.mkt_coupon_redemptions;
drop policy if exists "Admins read redemptions"    on public.mkt_coupon_redemptions;
create policy "Users read own redemptions" on public.mkt_coupon_redemptions for select using (auth.uid() = customer_id);
create policy "Admins read redemptions"    on public.mkt_coupon_redemptions for select using (public.is_admin(auth.uid()));

drop policy if exists "Anyone reads promotions"  on public.mkt_promotions;
drop policy if exists "Admins manage promotions" on public.mkt_promotions;
create policy "Anyone reads promotions"  on public.mkt_promotions for select using (true);
create policy "Admins manage promotions" on public.mkt_promotions for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Users manage own billing" on public.mkt_billing_info;
drop policy if exists "Admins read billing"      on public.mkt_billing_info;
create policy "Users manage own billing" on public.mkt_billing_info for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Admins read billing"      on public.mkt_billing_info for select using (public.is_admin(auth.uid()));

-- ================================================================
-- PART C — GRANTS  (PostgREST/API roles need table privileges;
-- Row Level Security still enforces who can see/modify each row.)
-- ================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables    in schema public to anon, authenticated;
grant usage, select                  on all sequences  in schema public to anon, authenticated;
grant execute                        on all functions  in schema public to anon, authenticated;

-- Make sure future objects are reachable too
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- ================================================================
-- DONE. Idempotent — safe to re-run.
-- Create your admin: visit /setup/ while logged in, or run
--   update public.shared_profiles set role='admin', status='active'
--     where email='YOUR-ADMIN-EMAIL';
-- ================================================================

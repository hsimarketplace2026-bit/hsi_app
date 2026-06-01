-- ============================================================
-- HSI Marketplace — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- TABLES -------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  phone        text,
  role         text not null check (role in ('buyer','seller','admin')) default 'buyer',
  status       text not null check (status in ('pending','active','suspended')) default 'active',
  farm_name    text,
  farm_location text,
  created_at   timestamptz default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid references public.profiles(id) on delete cascade,
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

create table if not exists public.cart_items (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid references public.profiles(id) on delete cascade,
  product_id  uuid references public.products(id) on delete cascade,
  quantity    integer not null default 1,
  created_at  timestamptz default now(),
  unique(buyer_id, product_id)
);

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  buyer_id        uuid references public.profiles(id),
  seller_id       uuid references public.profiles(id),
  status          text not null check (status in (
    'pending','payment_uploaded','payment_verified','processing','completed','cancelled'
  )) default 'pending',
  total_amount    numeric(10,2) not null default 0,
  delivery_notes  text,
  created_at      timestamptz default now()
);

create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid references public.orders(id) on delete cascade,
  product_id  uuid references public.products(id),
  quantity    integer not null,
  unit_price  numeric(10,2) not null,
  created_at  timestamptz default now()
);

create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references public.orders(id) on delete cascade,
  buyer_id     uuid references public.profiles(id),
  method       text not null,
  proof_url    text,
  status       text not null check (status in ('pending','verified','rejected')) default 'pending',
  admin_notes  text,
  created_at   timestamptz default now()
);

create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text,
  image_url   text,
  is_featured boolean default false,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

-- HELPER FUNCTIONS ---------------------------------------------

-- SECURITY DEFINER bypasses RLS — needed so admin checks in RLS
-- policies don't cause infinite recursion on the profiles table.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

-- AUTO-PROFILE TRIGGER -----------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'buyer'),
    case
      when coalesce(new.raw_user_meta_data->>'role','buyer') = 'seller' then 'pending'
      else 'active'
    end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS ----------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.products       enable row level security;
alter table public.cart_items     enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;
alter table public.payments       enable row level security;
alter table public.announcements  enable row level security;

-- profiles
create policy "Users can view own profile"        on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"      on public.profiles for update using (auth.uid() = id);
create policy "Admins can view all profiles"      on public.profiles for select using (public.is_admin(auth.uid()));
create policy "Admins can update all profiles"    on public.profiles for update using (public.is_admin(auth.uid()));

-- products
create policy "Anyone can view active products"   on public.products for select using (status = 'active');
create policy "Sellers manage own products"       on public.products for all using (auth.uid() = seller_id);
create policy "Admins manage all products"        on public.products for all using (public.is_admin(auth.uid()));

-- cart_items
create policy "Buyers manage own cart"            on public.cart_items for all using (auth.uid() = buyer_id);

-- orders
create policy "Buyers view own orders"            on public.orders for select using (auth.uid() = buyer_id);
create policy "Buyers create orders"              on public.orders for insert with check (auth.uid() = buyer_id);
create policy "Sellers view own orders"           on public.orders for select using (auth.uid() = seller_id);
create policy "Sellers update own orders"         on public.orders for update using (auth.uid() = seller_id);
create policy "Admins manage all orders"          on public.orders for all using (public.is_admin(auth.uid()));

-- order_items
create policy "Buyers view own order items"       on public.order_items for select using (
  exists(select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
);
create policy "Buyers insert order items"         on public.order_items for insert with check (
  exists(select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
);
create policy "Sellers view own order items"      on public.order_items for select using (
  exists(select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);
create policy "Admins manage all order items"     on public.order_items for all using (public.is_admin(auth.uid()));

-- payments
create policy "Buyers manage own payments"        on public.payments for all using (auth.uid() = buyer_id);
create policy "Sellers view payments for orders"  on public.payments for select using (
  exists(select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);
create policy "Sellers update payment status"     on public.payments for update using (
  exists(select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
);
create policy "Admins manage all payments"        on public.payments for all using (public.is_admin(auth.uid()));

-- announcements
create policy "Anyone can view active announcements" on public.announcements for select using (is_active = true);
create policy "Admins manage announcements"          on public.announcements for all using (public.is_admin(auth.uid()));

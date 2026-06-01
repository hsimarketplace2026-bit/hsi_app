-- ============================================================
-- HSI Marketplace — Fix RLS Infinite Recursion
-- Run this ONCE in: Supabase Dashboard → SQL Editor
-- ============================================================
-- Problem: Admin policies query the same table they protect,
-- which causes infinite recursion in PostgreSQL RLS.
-- Solution: Wrap the admin check in a SECURITY DEFINER function
-- that bypasses RLS when checking the role.
-- ============================================================

-- 1. SECURITY DEFINER helper function ------------------------

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

-- 2. Drop the old recursive policies -------------------------

drop policy if exists "Admins can view all profiles"   on public.profiles;
drop policy if exists "Admins can update all profiles" on public.profiles;
drop policy if exists "Admins manage all products"     on public.products;
drop policy if exists "Admins manage all orders"       on public.orders;
drop policy if exists "Admins manage all order items"  on public.order_items;
drop policy if exists "Admins manage all payments"     on public.payments;
drop policy if exists "Admins manage announcements"    on public.announcements;

-- 3. Recreate them using the helper function -----------------

create policy "Admins can view all profiles"
  on public.profiles for select using (public.is_admin(auth.uid()));

create policy "Admins can update all profiles"
  on public.profiles for update using (public.is_admin(auth.uid()));

create policy "Admins manage all products"
  on public.products for all using (public.is_admin(auth.uid()));

create policy "Admins manage all orders"
  on public.orders for all using (public.is_admin(auth.uid()));

create policy "Admins manage all order items"
  on public.order_items for all using (public.is_admin(auth.uid()));

create policy "Admins manage all payments"
  on public.payments for all using (public.is_admin(auth.uid()));

create policy "Admins manage announcements"
  on public.announcements for all using (public.is_admin(auth.uid()));

-- Done! Login should now work for all roles.
select 'RLS recursion fixed!' as result;

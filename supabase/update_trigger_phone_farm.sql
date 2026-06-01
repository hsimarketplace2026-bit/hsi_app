-- ============================================================
-- Update auto-profile trigger to also save phone + farm fields
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, phone, farm_name, farm_location, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'farm_name',
    new.raw_user_meta_data->>'farm_location',
    coalesce(new.raw_user_meta_data->>'role', 'buyer'),
    case
      when coalesce(new.raw_user_meta_data->>'role','buyer') = 'seller' then 'pending'
      else 'active'
    end
  );
  return new;
end;
$$;

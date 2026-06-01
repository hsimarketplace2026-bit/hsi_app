-- ============================================================
-- Bootstrap first admin account
-- Run AFTER the user has signed up normally with their email.
-- Replace 'your-email@example.com' with the actual admin email.
-- ============================================================

update public.profiles
set role = 'admin', status = 'active'
where email = 'fushun92@gmail.com';

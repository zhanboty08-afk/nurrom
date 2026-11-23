-- Replace the example email below with the exact email of your Supabase Auth user, then run this file.
-- Run from Supabase Dashboard → SQL Editor after creating or confirming that user.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(email) = lower('admin@example.com')
returning email, raw_app_meta_data ->> 'role' as assigned_role;

-- The result should report UPDATE 1 and show assigned_role = admin.
-- Sign out and sign in again to refresh the admin role in the session.

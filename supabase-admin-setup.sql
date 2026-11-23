-- Run in Supabase SQL Editor. Existing products columns are preserved.
alter table public.products add column if not exists name text not null default '';
alter table public.products add column if not exists category text not null default 'Стулья';
alter table public.products add column if not exists price numeric not null default 0;
alter table public.products add column if not exists old_price numeric;
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists material text not null default '';
alter table public.products add column if not exists color text not null default '';
alter table public.products add column if not exists image text not null default '';
alter table public.products add column if not exists badge text not null default '';
alter table public.products add column if not exists dimensions text not null default '';
alter table public.products add column if not exists availability text not null default 'Уточнить';
alter table public.products add column if not exists gallery text[] not null default '{}'::text[];

alter table public.products enable row level security;
grant usage on schema public to anon, authenticated;
revoke insert, update, delete on table public.products from public, anon;
grant select on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Replace all previous policies on this shop-owned table to remove any legacy
-- write access that could be combined with the policies below.
do $$
declare old_policy record;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname='public' and tablename='products'
  loop
    execute format('drop policy if exists %I on public.products', old_policy.policyname);
  end loop;
end $$;

create policy "Public can read products" on public.products for select using (true);
create policy "Admins can insert products" on public.products for insert to authenticated with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins can update products" on public.products for update to authenticated using ((auth.jwt()->'app_metadata'->>'role') = 'admin') with check ((auth.jwt()->'app_metadata'->>'role') = 'admin');
create policy "Admins can delete products" on public.products for delete to authenticated using ((auth.jwt()->'app_metadata'->>'role') = 'admin');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images" on storage.objects for select using (bucket_id='product-images');
drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images" on storage.objects for insert to authenticated with check (bucket_id='product-images' and (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images" on storage.objects for update to authenticated using (bucket_id='product-images' and (auth.jwt()->'app_metadata'->>'role')='admin') with check (bucket_id='product-images' and (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images" on storage.objects for delete to authenticated using (bucket_id='product-images' and (auth.jwt()->'app_metadata'->>'role')='admin');

-- Remove the no-login image write policies from the previous demo mode.
drop policy if exists "Anyone can upload product images" on storage.objects;
drop policy if exists "Anyone can replace product images" on storage.objects;
drop policy if exists "Anyone can remove product images" on storage.objects;

-- Restrictive guards make these writes admin-only even if an older permissive
-- storage policy still exists. Other storage buckets keep their own policies.
drop policy if exists "Product image uploads require admin" on storage.objects;
create policy "Product image uploads require admin" on storage.objects as restrictive for insert to public
with check (bucket_id <> 'product-images' or (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Product image updates require admin" on storage.objects;
create policy "Product image updates require admin" on storage.objects as restrictive for update to public
using (bucket_id <> 'product-images' or (auth.jwt()->'app_metadata'->>'role')='admin')
with check (bucket_id <> 'product-images' or (auth.jwt()->'app_metadata'->>'role')='admin');
drop policy if exists "Product image deletes require admin" on storage.objects;
create policy "Product image deletes require admin" on storage.objects as restrictive for delete to public
using (bucket_id <> 'product-images' or (auth.jwt()->'app_metadata'->>'role')='admin');

-- To grant the owner access, use supabase-grant-admin.sql after creating the Auth user.
notify pgrst, 'reload schema';

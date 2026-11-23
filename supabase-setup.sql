-- NURROOM: выполните целиком в Supabase → SQL Editor. Безопасно запускать повторно.
-- 1) Таблица заказов. Напрямую в неё писать нельзя — только через функцию create_order.
create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  created_at timestamptz not null default now(),
  customer jsonb not null,
  items jsonb not null,
  total numeric not null,
  status text not null default 'Новый');

-- Migrate the earlier column name without losing existing order numbers.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='number')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='order_number') then
    alter table public.orders rename column number to order_number;
  end if;
end $$;
alter table public.orders add column if not exists created_at timestamptz not null default now();
create unique index if not exists orders_order_number_uidx on public.orders(order_number);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, authenticated, public;
grant select, update on table public.orders to authenticated;

-- Replace every previous policy on this shop-owned table so an old permissive
-- policy cannot grant visitors access to customer details.
do $$
declare old_policy record;
begin
  for old_policy in
    select policyname from pg_policies
    where schemaname='public' and tablename='orders'
  loop
    execute format('drop policy if exists %I on public.orders', old_policy.policyname);
  end loop;
end $$;

create policy "Admins read orders" on public.orders for select to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy "Admins update orders" on public.orders for update to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');

-- 2) Функция оформления заказа: цены и названия берутся из таблицы products, а не из браузера.
drop function if exists public.create_order(jsonb,jsonb);
create function public.create_order(p_customer jsonb, p_items jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare
  v_name text;
  v_phone text;
  v_address text;
  v_comment text;
  v_order_number text;
  v_items jsonb;
  v_total numeric;
  v_expected_items integer;
  v_actual_items bigint;
begin
  if pg_catalog.jsonb_typeof(p_customer) is distinct from 'object'
     or pg_catalog.jsonb_typeof(p_customer->'name') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_customer->'phone') is distinct from 'string'
     or pg_catalog.jsonb_typeof(p_customer->'address') is distinct from 'string' then
    raise exception 'Invalid customer details';
  end if;
  if pg_catalog.pg_column_size(p_customer) > 8192
     or (p_customer - array['name','phone','address','comment']) <> '{}'::pg_catalog.jsonb then
    raise exception 'Invalid customer details';
  end if;

  v_name := pg_catalog.btrim(p_customer->>'name');
  v_phone := pg_catalog.btrim(p_customer->>'phone');
  v_address := pg_catalog.btrim(p_customer->>'address');
  v_comment := pg_catalog.btrim(coalesce(p_customer->>'comment',''));

  if v_name = '' or pg_catalog.length(v_name) > 120
     or pg_catalog.length(v_phone) > 32
     or pg_catalog.length(pg_catalog.regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 10 and 15
     or v_address = '' or pg_catalog.length(v_address) > 300
     or pg_catalog.length(v_comment) > 1000 then
    raise exception 'Invalid customer details';
  end if;

  if p_customer ? 'comment'
     and p_customer->'comment' <> 'null'::pg_catalog.jsonb
     and pg_catalog.jsonb_typeof(p_customer->'comment') is distinct from 'string' then
    raise exception 'Invalid customer details';
  end if;

  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Invalid order items';
  end if;
  v_expected_items := pg_catalog.jsonb_array_length(p_items);
  if v_expected_items < 1 or v_expected_items > 30 then
    raise exception 'Invalid order items';
  end if;
  if pg_catalog.pg_column_size(p_items) > 16384 then
    raise exception 'Invalid order items';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as row_data(item)
    where pg_catalog.jsonb_typeof(row_data.item) is distinct from 'object'
       or (row_data.item - array['id','qty']) <> '{}'::pg_catalog.jsonb
       or pg_catalog.jsonb_typeof(row_data.item->'id') not in ('string','number')
       or pg_catalog.length(coalesce(row_data.item->>'id','')) not between 1 and 64
       or pg_catalog.jsonb_typeof(row_data.item->'qty') is distinct from 'number'
       or coalesce(row_data.item->>'qty','') !~ '^[1-9][0-9]?$'
  ) then
    raise exception 'Invalid order items';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as row_data(item)
    where (row_data.item->>'qty')::integer > 20
  ) then
    raise exception 'Invalid order items';
  end if;

  if (
    select pg_catalog.count(*) <> pg_catalog.count(distinct row_data.item->>'id')
    from pg_catalog.jsonb_array_elements(p_items) as row_data(item)
  ) then
    raise exception 'Invalid order items';
  end if;

  select
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'qty',(row_data.item->>'qty')::integer)
      order by row_data.ordinality
    ),
    pg_catalog.sum(p.price * (row_data.item->>'qty')::integer),
    pg_catalog.count(*)
  into v_items, v_total, v_actual_items
  from pg_catalog.jsonb_array_elements(p_items) with ordinality as row_data(item, ordinality)
  join public.products p on p.id::text=row_data.item->>'id' and p.price > 0;

  if v_actual_items <> v_expected_items then
    raise exception 'One or more order items are unavailable';
  end if;

  v_order_number := 'FM-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,12));
  insert into public.orders(order_number,customer,items,total)
  values(
    v_order_number,
    pg_catalog.jsonb_build_object('name',v_name,'phone',v_phone,'address',v_address,'comment',v_comment),
    v_items,
    v_total
  );
  return v_order_number;
end $$;
revoke all on function public.create_order(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_order(jsonb,jsonb) to anon, authenticated;

-- Product access remains restricted to admin users by supabase-admin-setup.sql.
notify pgrst, 'reload schema';

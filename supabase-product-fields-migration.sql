-- Run in the Supabase SQL Editor to enable extended furniture specifications
-- (tables & chairs dimensions, seating capacity, ergonomics, warranty and lead time).
-- Safe to run multiple times.
alter table public.products
  add column if not exists dimensions text not null default '',
  add column if not exists availability text not null default 'В наличии',
  add column if not exists gallery text[] not null default '{}'::text[],
  add column if not exists length_cm integer,
  add column if not exists width_cm integer,
  add column if not exists height_cm integer,
  add column if not exists seat_height_cm integer,
  add column if not exists seats integer,
  add column if not exists shape text not null default '',
  add column if not exists extendable boolean not null default false,
  add column if not exists warranty_months integer,
  add column if not exists delivery_time text not null default '';

notify pgrst, 'reload schema';

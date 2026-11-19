-- =====================================================================
--  KHIDMA INVOICE — skema database Supabase
--  Cara pakai: Supabase → SQL Editor → New query → tempel semua → Run.
--  Aman dijalankan ulang (idempotent).
-- =====================================================================

-- ---------- Profil & peran (admin / staff) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Akun yang SUDAH ada saat skrip dijalankan: yang tertua jadi admin
insert into public.profiles (id, email, role)
select u.id, u.email,
       case when row_number() over (order by u.created_at) = 1
             and not exists (select 1 from public.profiles) then 'admin' else 'staff' end
from auth.users u
on conflict (id) do nothing;

-- Akun BARU: otomatis dibuatkan profil. Akun pertama di sistem = admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email,
          case when not exists (select 1 from public.profiles) then 'admin' else 'staff' end)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Pengaturan perusahaan (1 baris, dipakai bersama) ----------
create table if not exists public.app_settings (
  id               int primary key default 1 check (id = 1),
  data             jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  updated_by_email text
);
alter table public.app_settings enable row level security;

drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated using (true);
drop policy if exists settings_insert on public.app_settings;
create policy settings_insert on public.app_settings for insert to authenticated with check (public.is_admin());
drop policy if exists settings_update on public.app_settings;
create policy settings_update on public.app_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.settings_before()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by_email := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists trg_settings_before on public.app_settings;
create trigger trg_settings_before before insert or update on public.app_settings
  for each row execute function public.settings_before();

-- ---------- Penomoran invoice (atomik, tidak bisa dobel) ----------
create table if not exists public.invoice_counters (
  key  text primary key,          -- contoh: UMR-2026
  last int  not null default 0
);
alter table public.invoice_counters enable row level security;   -- tanpa policy = tidak bisa diakses langsung

create or replace function public.alloc_invoice_number(p_type text, p_date date)
returns text language plpgsql security definer set search_path = public as $$
declare pre text; yr text; k text; n int;
begin
  pre := case p_type when 'HJI' then 'HJI' when 'LAIN' then 'INV' else 'UMR' end;
  yr  := to_char(coalesce(p_date, current_date), 'YYYY');
  k   := pre || '-' || yr;
  insert into public.invoice_counters (key, last) values (k, 1)
  on conflict (key) do update set last = public.invoice_counters.last + 1
  returning last into n;
  return 'INV/' || pre || '/' || yr || '/' || lpad(n::text, 3, '0');
end $$;
revoke all on function public.alloc_invoice_number(text, date) from public, anon, authenticated;

-- Dipakai impor data lama: naikkan penghitung agar nomor berikutnya tidak bentrok
create or replace function public.bump_counter(p_key text, p_last int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  insert into public.invoice_counters (key, last) values (p_key, p_last)
  on conflict (key) do update set last = greatest(public.invoice_counters.last, excluded.last);
end $$;
revoke all on function public.bump_counter(text, int) from public, anon;
grant execute on function public.bump_counter(text, int) to authenticated;

-- ---------- Invoice ----------
create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  number           text unique,
  type             text not null default 'UMR',
  invoice_date     date,
  bill_to          text,
  program          text,
  total            numeric not null default 0,
  paid             numeric not null default 0,
  status           text,
  data             jsonb not null,
  settings         jsonb,
  created_by       uuid,
  created_by_email text,
  updated_by_email text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists invoices_updated_idx on public.invoices (updated_at desc);
alter table public.invoices enable row level security;

create or replace function public.invoices_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.number is null or new.number = '' then
      new.number := public.alloc_invoice_number(new.type, new.invoice_date);
    end if;
    new.created_by       := auth.uid();
    new.created_by_email := auth.jwt() ->> 'email';
    new.created_at       := now();
  else
    new.number           := old.number;            -- nomor tidak bisa diubah
    new.created_by       := old.created_by;
    new.created_by_email := old.created_by_email;
    new.created_at       := old.created_at;
  end if;
  new.updated_at       := now();
  new.updated_by_email := auth.jwt() ->> 'email';
  return new;
end $$;
drop trigger if exists trg_invoices_before on public.invoices;
create trigger trg_invoices_before before insert or update on public.invoices
  for each row execute function public.invoices_before();

-- Semua anggota tim yang login: boleh lihat, buat, dan koreksi. Hapus: admin saja.
drop policy if exists inv_select on public.invoices;
create policy inv_select on public.invoices for select to authenticated using (true);
drop policy if exists inv_insert on public.invoices;
create policy inv_insert on public.invoices for insert to authenticated with check (true);
drop policy if exists inv_update on public.invoices;
create policy inv_update on public.invoices for update to authenticated using (true) with check (true);
drop policy if exists inv_delete on public.invoices;
create policy inv_delete on public.invoices for delete to authenticated using (public.is_admin());

-- Pastikan role anon (belum login) tidak punya akses apa pun
revoke all on public.invoices, public.app_settings, public.profiles, public.invoice_counters from anon;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select, update on public.profiles to authenticated;

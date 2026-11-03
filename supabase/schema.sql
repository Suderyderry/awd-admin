-- Arjawinangun Delivery – Skema database Supabase
-- Jalankan seluruh isi file ini di Supabase: SQL Editor > New query > Run.

-- 1) Tabel admin (siapa yang boleh masuk panel) -------------------------
create table if not exists public.admin (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  peran text not null check (peran in ('Admin Utama','Operator','Layanan Pelanggan')),
  dibuat_pada timestamptz not null default now()
);

-- 2) Tabel data. Kolom utama dipakai untuk filter/laporan,
--    detail lengkap disimpan di kolom "data" (jsonb).
create table if not exists public.pengguna (
  urut bigint generated always as identity,
  id text primary key,
  tipe text not null check (tipe in ('merchant','driver','customer')),
  nama text not null,
  status text,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.produk (
  urut bigint generated always as identity,
  id text primary key,
  merchant_id text not null,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.pesanan (
  urut bigint generated always as identity,
  id text primary key,
  status text,
  total integer,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.versi_aplikasi (
  tipe text primary key check (tipe in ('merchant','driver','customer')),
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.spanduk (
  id integer primary key,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.notifikasi (
  id integer primary key,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.pesan_masuk (
  urut bigint generated always as identity,
  id text primary key,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.pengaturan (
  kunci text primary key,
  data jsonb not null default '{}',
  diubah_pada timestamptz not null default now()
);
create table if not exists public.log_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  peran text,
  jam text,
  aksi text not null,
  waktu timestamptz not null default now()
);

create index if not exists produk_merchant_idx on public.produk(merchant_id);
create index if not exists pesanan_status_idx on public.pesanan(status);

-- 3) Penanda waktu ubah otomatis ---------------------------------------
create or replace function public.sentuh() returns trigger
language plpgsql as $$
begin new.diubah_pada = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['pengguna','produk','pesanan','versi_aplikasi','spanduk','notifikasi','pesan_masuk','pengaturan'] loop
    execute format('drop trigger if exists sentuh on public.%I', t);
    execute format('create trigger sentuh before update on public.%I for each row execute function public.sentuh()', t);
  end loop;
end $$;

-- 4) Keamanan: Row Level Security (RLS) --------------------------------
-- Fungsi pembantu: peran admin yang sedang login (null bila bukan admin)
create or replace function public.peran_admin() returns text
language sql stable security definer set search_path = public as $$
  select peran from public.admin where user_id = auth.uid()
$$;
revoke all on function public.peran_admin() from public;
grant execute on function public.peran_admin() to authenticated;

alter table public.admin enable row level security;
drop policy if exists "admin baca diri sendiri" on public.admin;
create policy "admin baca diri sendiri" on public.admin
  for select to authenticated using (user_id = auth.uid());
-- Tidak ada kebijakan tulis: admin baru ditambahkan lewat SQL Editor (lihat README).

do $$
declare t text;
begin
  -- Tabel yang hanya boleh diubah Admin Utama & Operator
  foreach t in array array['pengguna','produk','pesanan','versi_aplikasi','spanduk','pengaturan'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "baca" on public.%I', t);
    execute format('drop policy if exists "tambah" on public.%I', t);
    execute format('drop policy if exists "ubah" on public.%I', t);
    execute format('drop policy if exists "hapus" on public.%I', t);
    execute format('create policy "baca" on public.%I for select to authenticated using (public.peran_admin() is not null)', t);
    execute format('create policy "tambah" on public.%I for insert to authenticated with check (public.peran_admin() in (''Admin Utama'',''Operator''))', t);
    execute format('create policy "ubah" on public.%I for update to authenticated using (public.peran_admin() in (''Admin Utama'',''Operator'')) with check (public.peran_admin() in (''Admin Utama'',''Operator''))', t);
    execute format('create policy "hapus" on public.%I for delete to authenticated using (public.peran_admin() = ''Admin Utama'')', t);
  end loop;
  -- Tabel yang boleh ditulis semua admin (balas pesan, notifikasi); hapus hanya Admin Utama
  foreach t in array array['notifikasi','pesan_masuk'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "baca" on public.%I', t);
    execute format('drop policy if exists "tambah" on public.%I', t);
    execute format('drop policy if exists "ubah" on public.%I', t);
    execute format('drop policy if exists "hapus" on public.%I', t);
    execute format('create policy "baca" on public.%I for select to authenticated using (public.peran_admin() is not null)', t);
    execute format('create policy "tambah" on public.%I for insert to authenticated with check (public.peran_admin() is not null)', t);
    execute format('create policy "ubah" on public.%I for update to authenticated using (public.peran_admin() is not null) with check (public.peran_admin() is not null)', t);
    execute format('create policy "hapus" on public.%I for delete to authenticated using (public.peran_admin() = ''Admin Utama'')', t);
  end loop;
end $$;

alter table public.log_audit enable row level security;
drop policy if exists "baca" on public.log_audit;
drop policy if exists "tambah" on public.log_audit;
create policy "baca" on public.log_audit for select to authenticated using (public.peran_admin() is not null);
create policy "tambah" on public.log_audit for insert to authenticated
  with check (public.peran_admin() is not null and admin_id = auth.uid());
-- Log audit tidak bisa diubah/dihapus dari klien (sengaja).

-- 5) Realtime untuk pesanan baru (notifikasi transaksi di panel) --------
do $$
begin
  alter publication supabase_realtime add table public.pesanan;
exception when duplicate_object then null;
end $$;

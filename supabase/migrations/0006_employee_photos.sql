-- ============================================================================
-- 0006 — Foto profil pegawai + dukungan multi PIC utama
--
-- Penambahan minimal & aman (idempotent):
--   1. employees.avatar_path / avatar_updated_at — foto disimpan di Storage,
--      TIDAK pernah base64 di database.
--   2. Bucket privat `employee-photos` — baca oleh seluruh akun terautentikasi
--      (via signed URL), tulis/hapus hanya ADMIN.
--   3. tasks.pic_main_ids — PIC utama bisa lebih dari satu; kolom lama
--      pic_main_id dipertahankan (selalu = elemen pertama) untuk kompatibilitas.
-- ============================================================================

-- 1. Kolom foto pegawai --------------------------------------------------------
alter table public.employees add column if not exists avatar_path text;
alter table public.employees add column if not exists avatar_updated_at timestamptz;

-- 2. Bucket foto pegawai -------------------------------------------------------
-- Batas server 400 KB (client menargetkan <150 KB, maks 300 KB) + tipe gambar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 409600,
        array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

drop policy if exists "employee photos read authenticated" on storage.objects;
create policy "employee photos read authenticated" on storage.objects for select
  using (bucket_id = 'employee-photos' and public.current_app_role() is not null);

drop policy if exists "employee photos insert admin" on storage.objects;
create policy "employee photos insert admin" on storage.objects for insert
  with check (bucket_id = 'employee-photos' and public.current_app_role() = 'ADMIN');

drop policy if exists "employee photos update admin" on storage.objects;
create policy "employee photos update admin" on storage.objects for update
  using (bucket_id = 'employee-photos' and public.current_app_role() = 'ADMIN');

drop policy if exists "employee photos delete admin" on storage.objects;
create policy "employee photos delete admin" on storage.objects for delete
  using (bucket_id = 'employee-photos' and public.current_app_role() = 'ADMIN');

-- 3. Multi PIC utama -----------------------------------------------------------
alter table public.tasks add column if not exists pic_main_ids uuid[] not null default '{}';

-- Backfill dari kolom lama (hanya baris yang belum terisi).
update public.tasks
set pic_main_ids = array[pic_main_id]
where pic_main_id is not null and pic_main_ids = '{}';

-- ============================================================================
-- Dashboard Pekerjaan PIP Puslapdik — skema produksi (Supabase/Postgres)
-- Jalankan via: supabase db push  (atau SQL editor)
-- Prinsip:
--   * Role diverifikasi SERVER-SIDE lewat RLS (bukan di client).
--   * Data penyaluran hanya agregat per jenjang — tanpa data individual siswa.
--   * Audit log append-only (tidak dapat diubah/dihapus dari client).
--   * Konflik ditangani optimistic concurrency (kolom version).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Role akun (dua akun: USER bersama & ADMIN) — diisi manual saat setup
-- ----------------------------------------------------------------------------
create table public.account_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('USER', 'ADMIN')),
  account_label text not null default 'tim-pip'
);

alter table public.account_roles enable row level security;

create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.account_roles where user_id = auth.uid();
$$;

create policy "account_roles read own" on public.account_roles
  for select using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Master pegawai
-- ----------------------------------------------------------------------------
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  display_name text not null,
  initials text not null,
  color text not null default 'slate',
  position text not null default '',
  team text not null default '',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Board, step, pekerjaan
-- ----------------------------------------------------------------------------
create table public.board (
  id text primary key,
  title text not null,
  updated_at timestamptz not null default now(),
  version int not null default 1
);

create table public.steps (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.board (id),
  name text not null,
  kind text not null default 'NORMAL' check (kind in ('NORMAL', 'BLOCKED', 'DONE')),
  color text not null default '#94a3b8',
  sort_order int not null default 0,
  deleted_at timestamptz,
  version int not null default 1
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.board (id),
  step_id uuid not null references public.steps (id),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  duration_type text not null check (duration_type in ('JANGKA_PANJANG', 'JANGKA_PENDEK')),
  category_id uuid,
  label_ids uuid[] not null default '{}',
  priority text not null check (priority in ('RENDAH', 'SEDANG', 'TINGGI')),
  start_date date,
  due_date date,
  progress_mode text not null default 'MANUAL' check (progress_mode in ('MANUAL', 'CHECKLIST')),
  manual_progress int not null default 0 check (manual_progress between 0 and 100),
  pic_main_id uuid references public.employees (id),
  pic_ids uuid[] not null default '{}',
  checklist jsonb not null default '[]',
  is_focus boolean not null default false,
  sort_order int not null default 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  created_by_employee_id uuid references public.employees (id),
  updated_by_employee_id uuid references public.employees (id)
);

create index tasks_step_idx on public.tasks (step_id) where deleted_at is null;
create index tasks_updated_idx on public.tasks (updated_at desc);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  type text not null check (type in ('KOMENTAR', 'KENDALA', 'TINDAK_LANJUT')),
  text text not null check (char_length(text) between 1 and 2000),
  employee_id uuid not null references public.employees (id),
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  file_name text not null,
  size bigint not null check (size > 0),
  mime_type text not null,
  storage_path text not null,
  uploaded_by_employee_id uuid not null references public.employees (id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Kategori, label, template
-- ----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  description text not null default '',
  category_id uuid references public.categories (id),
  label_ids uuid[] not null default '{}',
  duration_type text not null check (duration_type in ('JANGKA_PANJANG', 'JANGKA_PENDEK')),
  priority text not null check (priority in ('RENDAH', 'SEDANG', 'TINGGI')),
  initial_step_id uuid references public.steps (id),
  target_offset_days int,
  checklist jsonb not null default '[]',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Data penyaluran (SNAPSHOT AGREGAT — dilarang menyimpan data individual siswa)
-- rows: [{jenjang, alokasiSiswa, alokasiAnggaran, skSiswa, skAnggaran,
--         salurSiswa, salurAnggaran}]
-- ----------------------------------------------------------------------------
create table public.distribution_snapshots (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2020 and 2100),
  period text not null check (char_length(period) between 1 and 30),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  rows jsonb not null,
  source_file_name text,
  note text,
  created_at timestamptz not null default now(),
  created_by_employee_id uuid references public.employees (id),
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  version int not null default 1
);

-- Hanya satu snapshot ACTIVE per scope (tahun, periode)
create unique index distribution_one_active_per_scope
  on public.distribution_snapshots (year, period)
  where status = 'ACTIVE';

-- ----------------------------------------------------------------------------
-- Audit log (append-only) & sesi perangkat
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_role text not null check (actor_role in ('USER', 'ADMIN')),
  actor_account text not null,
  employee_id uuid references public.employees (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  before jsonb,
  after jsonb,
  success boolean not null default true,
  error_message text,
  session_id text,
  device_label text
);

create index audit_log_at_idx on public.audit_log (at desc);
create index audit_log_entity_idx on public.audit_log (entity_id);

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('USER', 'ADMIN')),
  account text not null,
  device_label text not null default 'Perangkat',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ----------------------------------------------------------------------------
-- Pengaturan aplikasi (baris tunggal)
-- ----------------------------------------------------------------------------
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  app_name text not null default 'Dashboard PIP',
  logo_data_url text,
  active_year int not null default 2026,
  user_session_days int not null default 180 check (user_session_days between 1 and 730),
  stale_days int not null default 7 check (stale_days between 1 and 90),
  attachment_max_mb int not null default 10 check (attachment_max_mb between 1 and 50),
  attachment_allowed_ext text[] not null
    default '{pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg,csv,txt}',
  updated_at timestamptz not null default now(),
  version int not null default 1
);

-- ----------------------------------------------------------------------------
-- RLS — role diverifikasi server-side
-- ----------------------------------------------------------------------------
alter table public.employees enable row level security;
alter table public.board enable row level security;
alter table public.steps enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.attachments enable row level security;
alter table public.categories enable row level security;
alter table public.labels enable row level security;
alter table public.templates enable row level security;
alter table public.distribution_snapshots enable row level security;
alter table public.audit_log enable row level security;
alter table public.device_sessions enable row level security;
alter table public.app_settings enable row level security;

-- Baca: seluruh akun terautentikasi (USER & ADMIN)
create policy "read all authenticated" on public.employees for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.board for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.steps for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.tasks for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.task_comments for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.attachments for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.categories for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.labels for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.templates for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.distribution_snapshots for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.app_settings for select
  using (public.current_app_role() is not null);

-- Board/step/task/komentar/lampiran: seluruh User dapat membuat & mengedit
create policy "write board authenticated" on public.board for update
  using (public.current_app_role() is not null);
create policy "insert steps authenticated" on public.steps for insert
  with check (public.current_app_role() is not null);
create policy "update steps authenticated" on public.steps for update
  using (public.current_app_role() is not null);
create policy "insert tasks authenticated" on public.tasks for insert
  with check (public.current_app_role() is not null);
create policy "update tasks authenticated" on public.tasks for update
  using (public.current_app_role() is not null);
create policy "insert comments authenticated" on public.task_comments for insert
  with check (public.current_app_role() is not null);
create policy "insert attachments authenticated" on public.attachments for insert
  with check (public.current_app_role() is not null);
create policy "delete attachments authenticated" on public.attachments for delete
  using (public.current_app_role() is not null);

-- Hapus PERMANEN hanya Admin (soft delete = update kolom deleted_at)
create policy "delete tasks admin only" on public.tasks for delete
  using (public.current_app_role() = 'ADMIN');
create policy "delete comments admin only" on public.task_comments for delete
  using (public.current_app_role() = 'ADMIN');
create policy "delete steps admin only" on public.steps for delete
  using (public.current_app_role() = 'ADMIN');

-- Master data & penyaluran & pengaturan: tulis hanya Admin
create policy "write employees admin" on public.employees for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write categories admin" on public.categories for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write labels admin" on public.labels for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write templates admin" on public.templates for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write snapshots admin" on public.distribution_snapshots for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write settings admin" on public.app_settings for update
  using (public.current_app_role() = 'ADMIN');

-- Audit: tulis oleh semua akun terautentikasi; baca hanya Admin;
-- TIDAK ADA policy update/delete → append-only dari client.
create policy "insert audit authenticated" on public.audit_log for insert
  with check (public.current_app_role() is not null);
create policy "read audit admin" on public.audit_log for select
  using (public.current_app_role() = 'ADMIN');

-- Sesi perangkat: insert milik sendiri; baca Admin atau sesi sendiri;
-- update (heartbeat) milik sendiri; revoke (update) oleh Admin.
create policy "insert own session" on public.device_sessions for insert
  with check (user_id = auth.uid());
create policy "read sessions" on public.device_sessions for select
  using (user_id = auth.uid() or public.current_app_role() = 'ADMIN');
create policy "update sessions" on public.device_sessions for update
  using (user_id = auth.uid() or public.current_app_role() = 'ADMIN');

-- ----------------------------------------------------------------------------
-- Realtime — perubahan tampil tanpa reload penuh
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.board, public.steps, public.tasks, public.task_comments,
  public.attachments, public.employees, public.categories, public.labels,
  public.templates, public.distribution_snapshots, public.app_settings,
  public.device_sessions, public.audit_log;

-- ----------------------------------------------------------------------------
-- Storage: bucket privat lampiran (signed URL; validasi tipe di client + policy)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('lampiran', 'lampiran', false, 52428800)
on conflict (id) do nothing;

create policy "lampiran read authenticated" on storage.objects for select
  using (bucket_id = 'lampiran' and public.current_app_role() is not null);
create policy "lampiran write authenticated" on storage.objects for insert
  with check (bucket_id = 'lampiran' and public.current_app_role() is not null);
create policy "lampiran delete authenticated" on storage.objects for delete
  using (bucket_id = 'lampiran' and public.current_app_role() is not null);

-- ----------------------------------------------------------------------------
-- Data awal minimum (board + step default + pengaturan)
-- ----------------------------------------------------------------------------
insert into public.board (id, title) values ('board-utama', 'Board Pekerjaan Tim PIP');

insert into public.steps (board_id, name, kind, color, sort_order) values
  ('board-utama', 'Will Do', 'NORMAL', '#94a3b8', 0),
  ('board-utama', 'To Do', 'NORMAL', '#3579ee', 1),
  ('board-utama', 'On Progress', 'NORMAL', '#f59e0b', 2),
  ('board-utama', 'Blocking', 'BLOCKED', '#ef4444', 3),
  ('board-utama', 'Done', 'DONE', '#10b981', 4);

insert into public.app_settings (id) values (1);

-- ============================================================================
-- SETELAH MIGRATION (manual, butuh kredensial — lihat DEPLOYMENT.md):
-- 1. Buat 2 user di Supabase Auth: akun tim (USER) & akun admin (ADMIN).
-- 2. INSERT ke account_roles: (user_id_tim, 'USER', 'tim-pip'),
--    (user_id_admin, 'ADMIN', 'admin').
-- 3. Deploy edge function admin-actions (ganti password akun tim).
-- 4. Isi master pegawai lewat menu Admin.
-- ============================================================================

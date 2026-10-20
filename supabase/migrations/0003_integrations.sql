-- ============================================================================
-- 0003 — Integrasi Google Sheets, Rencana Kegiatan, Google OAuth (Docs/09)
-- Menambah pada skema 0001/0002 tanpa mengubah tabel lama.
-- Prinsip:
--   * Spreadsheet = sumber data; Supabase = cache/snapshot/histori/realtime.
--   * Data dibaca READ-ONLY dari Google — tidak ada write-back.
--   * Token Google DIENKRIPSI dan hanya dapat dibaca service role (server).
--   * Tidak menyimpan data pribadi siswa (nama/NISN/NIK/rekening/alamat).
-- Catatan pemetaan istilah Docs/09 §N → skema:
--   * profiles/app_accounts  → account_roles (0001)
--   * boards/board_columns   → board/steps (0001)
--   * task_* / checklists    → tasks (jsonb checklist) & task_comments (0001)
--   * activity_events        → proyeksi dari audit_log (0001)
--   * audit_logs             → audit_log (0001)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Pegawai: kolom NIP (tag board = display_name; instansi = team)
-- ----------------------------------------------------------------------------
alter table public.employees add column if not exists nip text;

-- Tag board unik di antara pegawai aktif (case-insensitive)
create unique index if not exists employees_unique_active_tag
  on public.employees (lower(display_name))
  where active;

-- ----------------------------------------------------------------------------
-- Trigger updated_at generik
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Sumber spreadsheet per (jenis, tahun)
-- ----------------------------------------------------------------------------
create table public.spreadsheet_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('pip_progress', 'activity_plan')),
  year int not null check (year between 2020 and 2100),
  name text not null check (char_length(name) between 1 and 120),
  spreadsheet_url text not null,
  spreadsheet_id text not null,
  is_active boolean not null default true,
  is_primary boolean not null default false,
  sync_mode text not null default 'WEBHOOK_DAN_INTERVAL'
    check (sync_mode in ('WEBHOOK_DAN_INTERVAL', 'MANUAL')),
  last_synced_at timestamptz,
  last_sync_status text not null default 'BELUM_SINKRON'
    check (last_sync_status in ('BELUM_SINKRON', 'BERHASIL', 'PERLU_VALIDASI', 'GAGAL')),
  last_error text,
  created_by_employee_id uuid references public.employees (id),
  updated_by_employee_id uuid references public.employees (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Hanya satu sumber utama per (jenis, tahun) yang belum terhapus
create unique index spreadsheet_sources_one_primary
  on public.spreadsheet_sources (source_type, year)
  where is_primary and deleted_at is null;

create index spreadsheet_sources_type_year_idx
  on public.spreadsheet_sources (source_type, year)
  where deleted_at is null;

create trigger spreadsheet_sources_updated_at
  before update on public.spreadsheet_sources
  for each row execute function public.set_updated_at();

-- Sumber pertama pada (jenis, tahun) otomatis menjadi utama
create or replace function public.default_primary_source()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.spreadsheet_sources
    where source_type = new.source_type
      and year = new.year
      and is_primary
      and deleted_at is null
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

create trigger spreadsheet_sources_default_primary
  before insert on public.spreadsheet_sources
  for each row execute function public.default_primary_source();

-- RPC: tetapkan sumber utama (dipakai adapter frontend oleh Admin)
create or replace function public.set_primary_source(p_id uuid)
returns public.spreadsheet_sources
language plpgsql security definer set search_path = public
as $$
declare
  v_source public.spreadsheet_sources;
begin
  if public.current_app_role() is distinct from 'ADMIN' then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_source from public.spreadsheet_sources where id = p_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_source.deleted_at is not null then
    raise exception 'VALIDATION: Sumber terhapus tidak dapat dijadikan utama.';
  end if;
  update public.spreadsheet_sources
     set is_primary = false
   where source_type = v_source.source_type
     and year = v_source.year
     and id <> p_id;
  update public.spreadsheet_sources
     set is_primary = true
   where id = p_id
   returning * into v_source;
  return v_source;
end;
$$;

-- ----------------------------------------------------------------------------
-- Sheet binding: satu sumber membaca ≥1 sheet (Pemberian + REKAP PROGRESS)
-- ----------------------------------------------------------------------------
create table public.spreadsheet_sheet_bindings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.spreadsheet_sources (id) on delete cascade,
  binding_type text not null
    check (binding_type in ('detail_realisasi', 'allocation_summary', 'activity_rows')),
  sheet_name text not null,
  header_row int not null default 1 check (header_row >= 1),
  data_start_row int not null default 2 check (data_start_row >= 1),
  optional_range text,
  mapping_status text not null default 'BELUM_DIKONFIRMASI'
    check (mapping_status in ('BELUM_DIKONFIRMASI', 'TERKONFIRMASI', 'PERLU_VALIDASI')),
  unique (source_id, binding_type, sheet_name)
);

-- ----------------------------------------------------------------------------
-- Mapping kolom berbasis header (bukan posisi kolom)
-- ----------------------------------------------------------------------------
create table public.spreadsheet_column_mappings (
  id uuid primary key default gen_random_uuid(),
  binding_id uuid not null references public.spreadsheet_sheet_bindings (id) on delete cascade,
  detected_header text not null,
  target_field text not null,
  parser_type text not null default 'text'
    check (parser_type in ('text', 'number', 'currency', 'date', 'time', 'percent')),
  transform_rule text,
  required boolean not null default false,
  validation_status text not null default 'BELUM_DIVALIDASI'
    check (validation_status in ('VALID', 'BELUM_DIVALIDASI', 'TIDAK_VALID')),
  unique (binding_id, target_field)
);

-- ----------------------------------------------------------------------------
-- Catatan proses sinkronisasi + error detail
-- ----------------------------------------------------------------------------
create table public.spreadsheet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.spreadsheet_sources (id) on delete cascade,
  trigger text not null check (trigger in ('MANUAL', 'WEBHOOK', 'JADWAL')),
  status text not null default 'BERHASIL'
    check (status in ('BELUM_SINKRON', 'BERHASIL', 'PERLU_VALIDASI', 'GAGAL')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_read int not null default 0,
  rows_upserted int not null default 0,
  message text,
  error_message text
);

create index spreadsheet_sync_runs_source_idx
  on public.spreadsheet_sync_runs (source_id, started_at desc);

create table public.spreadsheet_sync_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.spreadsheet_sync_runs (id) on delete cascade,
  source_id uuid not null references public.spreadsheet_sources (id) on delete cascade,
  at timestamptz not null default now(),
  sheet_name text,
  row_ref text,
  error_code text not null default 'PARSE',
  detail text not null
);

create index spreadsheet_sync_errors_run_idx on public.spreadsheet_sync_errors (run_id);

-- ----------------------------------------------------------------------------
-- Koneksi Google Admin.
-- Metadata (boleh dibaca Admin) TERPISAH dari token (khusus service role).
-- ----------------------------------------------------------------------------
create table public.google_oauth_connections (
  id int primary key default 1 check (id = 1),
  email text,
  connected_at timestamptz,
  last_used_at timestamptz,
  token_status text check (token_status in ('AKTIF', 'KEDALUWARSA', 'DICABUT')),
  updated_at timestamptz not null default now()
);

create trigger google_oauth_connections_updated_at
  before update on public.google_oauth_connections
  for each row execute function public.set_updated_at();

insert into public.google_oauth_connections (id) values (1);

-- Token terenkripsi (AES-256-GCM oleh server) — TANPA policy client sama sekali.
create table public.google_oauth_tokens (
  id int primary key default 1 check (id = 1),
  refresh_token_ciphertext text,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

create trigger google_oauth_tokens_updated_at
  before update on public.google_oauth_tokens
  for each row execute function public.set_updated_at();

insert into public.google_oauth_tokens (id) values (1);

-- ----------------------------------------------------------------------------
-- Hasil sinkronisasi penyaluran (AGREGAT per SK/jenjang — tanpa data siswa)
-- ----------------------------------------------------------------------------
create table public.pip_progress_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.spreadsheet_sources (id) on delete cascade,
  source_year int not null,
  source_row_key text not null,
  jenjang text not null,
  tahap text not null default '',
  sk_keterangan text not null default '',
  sk_nomor text not null default '',
  sk_tanggal date,
  jumlah_siswa bigint not null default 0 check (jumlah_siswa >= 0),
  jumlah_dana numeric(18, 2) not null default 0 check (jumlah_dana >= 0),
  status text not null default '',
  updated_on date,
  catatan text not null default '',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_id, source_row_key)
);

create index pip_progress_records_source_idx
  on public.pip_progress_records (source_id, jenjang)
  where deleted_at is null;

create trigger pip_progress_records_updated_at
  before update on public.pip_progress_records
  for each row execute function public.set_updated_at();

-- Snapshot rekap per sinkronisasi (kontrol REKAP PROGRESS + hasil validasi silang)
create table public.pip_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.spreadsheet_sources (id) on delete cascade,
  run_id uuid references public.spreadsheet_sync_runs (id) on delete set null,
  source_year int not null,
  rows jsonb not null,
  detail_totals jsonb,
  control_totals jsonb,
  validation_status text not null default 'VALID'
    check (validation_status in ('VALID', 'PERLU_VALIDASI')),
  validation_notes jsonb,
  is_last_valid boolean not null default false,
  created_at timestamptz not null default now()
);

create index pip_progress_snapshots_source_idx
  on public.pip_progress_snapshots (source_id, created_at desc);

-- Satu snapshot "valid terakhir" per sumber (fallback saat sheet bermasalah)
create unique index pip_progress_snapshots_one_last_valid
  on public.pip_progress_snapshots (source_id)
  where is_last_valid;

-- ----------------------------------------------------------------------------
-- Rencana Kegiatan (read-only dari spreadsheet)
-- ----------------------------------------------------------------------------
create table public.activity_plan_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.spreadsheet_sources (id) on delete set null,
  year int not null,
  title text not null,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default true,
  location text not null default '',
  category text not null default '',
  pic_names text[] not null default '{}',
  pic_employee_ids uuid[] not null default '{}',
  participants text not null default '',
  status text not null default 'RENCANA'
    check (status in ('RENCANA', 'TERJADWAL', 'BERLANGSUNG', 'SELESAI', 'DITUNDA', 'DIBATALKAN')),
  notes text not null default '',
  meeting_link text,
  document_link text,
  source_row_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_date >= start_date),
  unique (source_id, source_row_key)
);

create index activity_plan_items_year_idx
  on public.activity_plan_items (year, start_date)
  where deleted_at is null;

create trigger activity_plan_items_updated_at
  before update on public.activity_plan_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.spreadsheet_sources enable row level security;
alter table public.spreadsheet_sheet_bindings enable row level security;
alter table public.spreadsheet_column_mappings enable row level security;
alter table public.spreadsheet_sync_runs enable row level security;
alter table public.spreadsheet_sync_errors enable row level security;
alter table public.google_oauth_connections enable row level security;
alter table public.google_oauth_tokens enable row level security;
alter table public.pip_progress_records enable row level security;
alter table public.pip_progress_snapshots enable row level security;
alter table public.activity_plan_items enable row level security;

-- Baca: seluruh akun terautentikasi
create policy "read all authenticated" on public.spreadsheet_sources for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.spreadsheet_sheet_bindings for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.spreadsheet_column_mappings for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.spreadsheet_sync_runs for select
  using (public.current_app_role() is not null);
create policy "read errors admin" on public.spreadsheet_sync_errors for select
  using (public.current_app_role() = 'ADMIN');
create policy "read all authenticated" on public.pip_progress_records for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.pip_progress_snapshots for select
  using (public.current_app_role() is not null);
create policy "read all authenticated" on public.activity_plan_items for select
  using (public.current_app_role() is not null);

-- Metadata koneksi Google: hanya Admin (tanpa kolom token)
create policy "read google conn admin" on public.google_oauth_connections for select
  using (public.current_app_role() = 'ADMIN');
-- google_oauth_tokens: TIDAK ADA policy — hanya service role (server) yang bisa.

-- Tulis konfigurasi sumber/binding/mapping: hanya Admin
create policy "write sources admin" on public.spreadsheet_sources for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write bindings admin" on public.spreadsheet_sheet_bindings for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');
create policy "write mappings admin" on public.spreadsheet_column_mappings for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');

-- Hasil sinkronisasi (runs, errors, records, snapshots, activity items):
-- TIDAK ADA policy tulis untuk client — hanya service role pada proses server.

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.spreadsheet_sources, public.spreadsheet_sheet_bindings,
  public.spreadsheet_column_mappings, public.spreadsheet_sync_runs,
  public.pip_progress_snapshots, public.activity_plan_items;

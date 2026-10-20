-- ============================================================================
-- 0010 — Lampiran berkelompok + riwayat versi + Google Drive
--
-- Model:
--   attachment_groups   = satu "dokumen" pada sebuah pekerjaan (mis. "Dokumen
--                         Utama"), memiliki folder Drive tersendiri.
--   attachment_versions = setiap unggahan = SATU berkas Drive tersendiri, agar
--                         versi lama tetap dapat diunduh dan tidak tertimpa.
--
-- Backward compatibility: tabel `attachments` (0001) DIPERTAHANKAN apa adanya.
-- Berkas lama tidak dipindahkan; hanya unggahan BARU memakai model ini.
-- Backend penyimpanan disimpan per versi (`storage_backend`) sehingga Drive dan
-- Supabase Storage dapat hidup berdampingan tanpa migrasi paksa.
-- ============================================================================

alter table public.tasks add column if not exists drive_folder_id text;

create table if not exists public.attachment_groups (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  drive_folder_id text,
  created_by_employee_id uuid references public.employees (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_employee_id uuid references public.employees (id)
);

create index if not exists attachment_groups_task_idx
  on public.attachment_groups (task_id) where deleted_at is null;

create table if not exists public.attachment_versions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.attachment_groups (id) on delete cascade,
  version int not null check (version > 0),
  file_name text not null,
  size bigint not null check (size > 0),
  mime_type text not null,
  /** 'drive' = berkas ada di Google Drive aplikasi; 'supabase' = Storage. */
  storage_backend text not null default 'supabase'
    check (storage_backend in ('drive', 'supabase')),
  drive_file_id text,
  drive_web_view_link text,
  storage_path text,
  checksum text,
  change_note text not null default '',
  uploaded_by_employee_id uuid references public.employees (id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_employee_id uuid references public.employees (id),
  unique (group_id, version)
);

create index if not exists attachment_versions_group_idx
  on public.attachment_versions (group_id, version desc);

-- Setiap versi wajib punya lokasi berkas sesuai backend-nya.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attachment_versions_location_check'
  ) then
    alter table public.attachment_versions
      add constraint attachment_versions_location_check
      check (
        (storage_backend = 'drive' and drive_file_id is not null)
        or (storage_backend = 'supabase' and storage_path is not null)
      );
  end if;
end $$;

alter table public.attachment_groups enable row level security;
alter table public.attachment_versions enable row level security;

-- Baca metadata: seluruh akun terautentikasi (sejalan dengan visibilitas board).
drop policy if exists "attachment groups read" on public.attachment_groups;
create policy "attachment groups read" on public.attachment_groups for select
  using (public.current_account_type() is not null);

drop policy if exists "attachment versions read" on public.attachment_versions;
create policy "attachment versions read" on public.attachment_versions for select
  using (public.current_account_type() is not null);

-- Tulis: hanya peserta pekerjaan (owner/PIC/anggota) & Admin. DEMO read-only.
drop policy if exists "attachment groups write" on public.attachment_groups;
create policy "attachment groups write" on public.attachment_groups for insert
  with check (public.can_edit_task(task_id));

drop policy if exists "attachment groups update" on public.attachment_groups;
create policy "attachment groups update" on public.attachment_groups for update
  using (public.can_edit_task(task_id))
  with check (public.can_edit_task(task_id));

drop policy if exists "attachment groups delete admin" on public.attachment_groups;
create policy "attachment groups delete admin" on public.attachment_groups for delete
  using (public.is_admin());

drop policy if exists "attachment versions write" on public.attachment_versions;
create policy "attachment versions write" on public.attachment_versions for insert
  with check (
    exists (
      select 1 from public.attachment_groups g
       where g.id = group_id and public.can_edit_task(g.task_id)
    )
  );

drop policy if exists "attachment versions update" on public.attachment_versions;
create policy "attachment versions update" on public.attachment_versions for update
  using (
    exists (
      select 1 from public.attachment_groups g
       where g.id = group_id and public.can_edit_task(g.task_id)
    )
  )
  with check (
    exists (
      select 1 from public.attachment_groups g
       where g.id = group_id and public.can_edit_task(g.task_id)
    )
  );

drop policy if exists "attachment versions delete admin" on public.attachment_versions;
create policy "attachment versions delete admin" on public.attachment_versions for delete
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Notifikasi lampiran
-- ----------------------------------------------------------------------------
create or replace function public.notify_attachment_version()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_group public.attachment_groups;
  v_actor uuid;
begin
  select * into v_group from public.attachment_groups where id = new.group_id;
  if not found then return null; end if;
  select * into v_task from public.tasks where id = v_group.task_id;
  if not found then return null; end if;

  v_actor := public.notif_actor(new.uploaded_by_employee_id);

  perform public.notif_push(
    public.task_participants(v_task),
    case when new.version = 1 then 'ATTACHMENT_ADDED' else 'ATTACHMENT_VERSION' end,
    case when new.version = 1 then 'Lampiran baru diunggah' else 'Versi baru lampiran diunggah' end,
    v_task.title, v_task.id, v_actor,
    jsonb_build_object('group', v_group.title, 'version', new.version, 'fileName', new.file_name)
  );
  return null;
end;
$$;

drop trigger if exists notify_attachment_version_trg on public.attachment_versions;
create trigger notify_attachment_version_trg
  after insert on public.attachment_versions
  for each row execute function public.notify_attachment_version();

create or replace function public.notify_attachment_state()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_group public.attachment_groups;
  v_actor uuid;
begin
  if new.deleted_at is not distinct from old.deleted_at then return null; end if;

  select * into v_group from public.attachment_groups where id = new.group_id;
  if not found then return null; end if;
  select * into v_task from public.tasks where id = v_group.task_id;
  if not found then return null; end if;

  v_actor := public.notif_actor(new.deleted_by_employee_id);

  perform public.notif_push(
    public.task_participants(v_task),
    case when new.deleted_at is null then 'ATTACHMENT_RESTORED' else 'ATTACHMENT_DELETED' end,
    case when new.deleted_at is null then 'Lampiran dipulihkan' else 'Lampiran dihapus' end,
    v_task.title, v_task.id, v_actor,
    jsonb_build_object('group', v_group.title, 'version', new.version)
  );
  return null;
end;
$$;

drop trigger if exists notify_attachment_state_trg on public.attachment_versions;
create trigger notify_attachment_state_trg
  after update on public.attachment_versions
  for each row execute function public.notify_attachment_state();

-- ----------------------------------------------------------------------------
-- Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.attachment_groups;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.attachment_versions;
exception when duplicate_object then null;
end $$;

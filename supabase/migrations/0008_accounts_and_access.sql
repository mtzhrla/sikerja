-- ============================================================================
-- 0008 — Model akun baru (ADMIN / EMPLOYEE / DEMO), tingkat pegawai
--        (LEADER / STAFF), kepemilikan pekerjaan, dan RLS hak akses.
--
-- Prinsip:
--   * IDEMPOTEN & aman untuk data lama (tanpa DROP TABLE, tanpa hapus baris).
--   * Role sistem (account type) TERPISAH dari tingkat organisasi (level).
--   * Hak akses ditegakkan SERVER-SIDE lewat RLS + trigger field-level.
--   * Akun USER bersama yang lama → DEMO (read-only), login "user" tetap jalan.
--   * Password TIDAK PERNAH disimpan di tabel aplikasi (tetap di Supabase Auth).
--
-- Rollback ringkas (bila diperlukan):
--   update public.account_roles set role = 'USER' where role = 'DEMO';
--   -- lalu pulihkan policy 0001 ("insert/update tasks authenticated").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PEGAWAI — username, NIP ternormalisasi, tingkat, atasan langsung
-- ----------------------------------------------------------------------------
alter table public.employees add column if not exists username text;
alter table public.employees add column if not exists level text;
alter table public.employees add column if not exists supervisor_id uuid;

-- NIP ternormalisasi (hanya angka) — dipakai untuk login & unik.
alter table public.employees
  add column if not exists nip_normalized text
  generated always as (nullif(regexp_replace(coalesce(nip, ''), '[^0-9]', '', 'g'), '')) stored;

update public.employees set level = 'STAFF' where level is null;

-- Tingkat pegawai: LEADER (Pimpinan) / STAFF (Staf).
do $$
begin
  alter table public.employees alter column level set default 'STAFF';
  alter table public.employees alter column level set not null;
exception when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_level_check'
  ) then
    alter table public.employees
      add constraint employees_level_check check (level in ('LEADER', 'STAFF'));
  end if;
end $$;

-- Username: huruf/angka/titik/garis bawah/strip, 2–32 karakter, tanpa spasi.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_username_format'
  ) then
    alter table public.employees
      add constraint employees_username_format
      check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{1,31}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_supervisor_fk'
  ) then
    alter table public.employees
      add constraint employees_supervisor_fk
      foreign key (supervisor_id) references public.employees (id) on delete set null;
  end if;
end $$;

-- Atasan langsung tidak boleh dirinya sendiri.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_supervisor_not_self'
  ) then
    alter table public.employees
      add constraint employees_supervisor_not_self
      check (supervisor_id is null or supervisor_id <> id);
  end if;
end $$;

-- Backfill username dari display_name (tag pendek yang sudah dipakai board).
-- Tidak mengarang data: hanya menormalkan tag yang sudah ada; bentrok diberi
-- akhiran angka agar tetap unik.
with kandidat as (
  select
    id,
    regexp_replace(lower(display_name), '[^a-z0-9._-]', '', 'g') as base
  from public.employees
  where username is null
),
bernomor as (
  select
    id,
    base,
    row_number() over (partition by base order by id) as rn
  from kandidat
  where base ~ '^[a-z0-9][a-z0-9._-]{1,31}$'
)
update public.employees e
   set username = case when b.rn = 1 then b.base else b.base || b.rn::text end
  from bernomor b
 where e.id = b.id
   and not exists (
     select 1 from public.employees x
      where x.username = (case when b.rn = 1 then b.base else b.base || b.rn::text end)
   );

-- Tingkat: pegawai dengan jabatan "Ketua/Kepala/Koordinator" = Pimpinan.
-- Diturunkan dari data jabatan yang sudah ada (bukan data karangan); Admin
-- dapat mengubahnya kapan saja lewat Pusat Admin.
update public.employees
   set level = 'LEADER'
 where level = 'STAFF'
   and (position ilike '%ketua%' or position ilike '%kepala%' or position ilike '%koordinator%');

create unique index if not exists employees_username_key
  on public.employees (lower(username)) where username is not null;
create unique index if not exists employees_nip_normalized_key
  on public.employees (nip_normalized) where nip_normalized is not null;
create index if not exists employees_supervisor_idx on public.employees (supervisor_id);
create index if not exists employees_level_idx on public.employees (level) where active;

-- ----------------------------------------------------------------------------
-- 2. AKUN — jenis akun sistem & pemetaan ke pegawai
-- ----------------------------------------------------------------------------
alter table public.account_roles add column if not exists employee_id uuid;
alter table public.account_roles add column if not exists is_active boolean not null default true;
alter table public.account_roles
  add column if not exists must_change_password boolean not null default false;
alter table public.account_roles add column if not exists last_login_at timestamptz;
alter table public.account_roles add column if not exists password_changed_at timestamptz;
alter table public.account_roles
  add column if not exists created_at timestamptz not null default now();
alter table public.account_roles
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'account_roles_employee_fk') then
    alter table public.account_roles
      add constraint account_roles_employee_fk
      foreign key (employee_id) references public.employees (id) on delete restrict;
  end if;
end $$;

-- Satu pegawai = tepat satu akun.
create unique index if not exists account_roles_employee_key
  on public.account_roles (employee_id) where employee_id is not null;

-- Jenis akun: ADMIN | EMPLOYEE | DEMO. Akun USER bersama lama → DEMO.
alter table public.account_roles drop constraint if exists account_roles_role_check;
update public.account_roles set role = 'DEMO' where role = 'USER';
alter table public.account_roles
  add constraint account_roles_role_check check (role in ('ADMIN', 'EMPLOYEE', 'DEMO'));

-- Akun EMPLOYEE wajib terhubung ke pegawai; ADMIN/DEMO tidak boleh terhubung.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'account_roles_employee_link') then
    alter table public.account_roles
      add constraint account_roles_employee_link
      check (
        (role = 'EMPLOYEE' and employee_id is not null)
        or (role <> 'EMPLOYEE' and employee_id is null)
      );
  end if;
end $$;

-- Jenis akun baru harus diterima audit & sesi perangkat. Nilai lama ('USER')
-- tetap diizinkan agar baris historis tidak menjadi tidak valid.
alter table public.audit_log drop constraint if exists audit_log_actor_role_check;
alter table public.audit_log add constraint audit_log_actor_role_check
  check (actor_role in ('USER', 'ADMIN', 'EMPLOYEE', 'DEMO'));

alter table public.device_sessions drop constraint if exists device_sessions_role_check;
alter table public.device_sessions add constraint device_sessions_role_check
  check (role in ('USER', 'ADMIN', 'EMPLOYEE', 'DEMO'));

-- ----------------------------------------------------------------------------
-- 3. HELPER — jenis akun, pegawai aktif, tingkat, hak tulis
-- ----------------------------------------------------------------------------

-- Jenis akun efektif; NULL bila belum terdaftar ATAU akun dinonaktifkan.
create or replace function public.current_account_type()
returns text
language sql stable security definer set search_path = public
as $$
  select r.role
    from public.account_roles r
   where r.user_id = auth.uid()
     and r.is_active
     and (
       r.employee_id is null
       or exists (select 1 from public.employees e where e.id = r.employee_id and e.active)
     );
$$;

-- Kompatibilitas: seluruh policy lama memakai nama ini.
create or replace function public.current_app_role()
returns text
language sql stable security definer set search_path = public
as $$
  select public.current_account_type();
$$;

create or replace function public.current_employee_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select r.employee_id
    from public.account_roles r
   where r.user_id = auth.uid() and r.is_active;
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_account_type() = 'ADMIN';
$$;

-- Akun yang boleh melakukan perubahan data (DEMO selalu read-only).
create or replace function public.can_write()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_account_type() in ('ADMIN', 'EMPLOYEE');
$$;

create or replace function public.current_employee_level()
returns text
language sql stable security definer set search_path = public
as $$
  select e.level
    from public.employees e
   where e.id = public.current_employee_id();
$$;

create or replace function public.is_leader()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.current_employee_level() = 'LEADER', false);
$$;

grant execute on function public.current_account_type() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_write() to authenticated;
grant execute on function public.current_employee_level() to authenticated;
grant execute on function public.is_leader() to authenticated;

-- Akun boleh membaca barisnya sendiri (untuk mengetahui jenis akun & status).
drop policy if exists "account_roles read own" on public.account_roles;
create policy "account_roles read own" on public.account_roles
  for select using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. PEKERJAAN — kepemilikan, jenis (mandiri/disposisi), pendisposisi
-- ----------------------------------------------------------------------------
alter table public.tasks add column if not exists owner_employee_id uuid;
alter table public.tasks add column if not exists task_type text;
alter table public.tasks add column if not exists disposed_by_employee_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_owner_fk') then
    alter table public.tasks add constraint tasks_owner_fk
      foreign key (owner_employee_id) references public.employees (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_disposed_by_fk') then
    alter table public.tasks add constraint tasks_disposed_by_fk
      foreign key (disposed_by_employee_id) references public.employees (id);
  end if;
end $$;

-- Backfill: owner = pembuat, jatuh ke PIC utama pertama bila pembuat kosong.
update public.tasks
   set owner_employee_id = coalesce(created_by_employee_id, pic_main_ids[1], pic_main_id)
 where owner_employee_id is null;

update public.tasks set task_type = 'MANDIRI' where task_type is null;

do $$
begin
  alter table public.tasks alter column task_type set default 'MANDIRI';
  alter table public.tasks alter column task_type set not null;
exception when others then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_task_type_check') then
    alter table public.tasks add constraint tasks_task_type_check
      check (task_type in ('MANDIRI', 'DISPOSISI'));
  end if;
end $$;

create index if not exists tasks_owner_idx on public.tasks (owner_employee_id)
  where deleted_at is null;
create index if not exists tasks_pic_main_ids_idx on public.tasks using gin (pic_main_ids);
create index if not exists tasks_pic_ids_idx on public.tasks using gin (pic_ids);

-- ----------------------------------------------------------------------------
-- 5. HAK EDIT PEKERJAAN
--   Admin            : penuh.
--   Owner            : penuh atas pekerjaannya (kecuali hapus permanen).
--   Pembuat/pendisposisi (Pimpinan) : penuh atas pekerjaan yang ia buat.
--   PIC utama & anggota tim         : operasional (progres, status, checklist).
-- ----------------------------------------------------------------------------
create or replace function public.task_role_for_current(p_task public.tasks)
returns text
language sql stable security definer set search_path = public
as $$
  select case
    when public.is_admin() then 'ADMIN'
    when public.current_employee_id() is null then 'NONE'
    when p_task.owner_employee_id = public.current_employee_id() then 'OWNER'
    when p_task.created_by_employee_id = public.current_employee_id() then 'OWNER'
    when p_task.disposed_by_employee_id = public.current_employee_id() then 'OWNER'
    when public.current_employee_id() = any(p_task.pic_main_ids) then 'MEMBER'
    when p_task.pic_main_id = public.current_employee_id() then 'MEMBER'
    when public.current_employee_id() = any(p_task.pic_ids) then 'MEMBER'
    else 'NONE'
  end;
$$;

/** Hak mengubah pekerjaan (level baris). Field sensitif dijaga trigger. */
create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_write()
     and exists (
       select 1 from public.tasks t
        where t.id = p_task_id
          and public.task_role_for_current(t) in ('ADMIN', 'OWNER', 'MEMBER')
     );
$$;

/** Hak mengelola pekerjaan (owner/pembuat/pendisposisi/Admin). */
create or replace function public.can_manage_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.can_write()
     and exists (
       select 1 from public.tasks t
        where t.id = p_task_id
          and public.task_role_for_current(t) in ('ADMIN', 'OWNER')
     );
$$;

grant execute on function public.task_role_for_current(public.tasks) to authenticated;
grant execute on function public.can_edit_task(uuid) to authenticated;
grant execute on function public.can_manage_task(uuid) to authenticated;

-- Trigger field-level: anggota tim hanya boleh mengubah bagian operasional.
create or replace function public.tasks_guard_fields()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
begin
  -- Konteks tepercaya (service role / job server): tanpa pengguna Auth.
  if auth.uid() is null then return new; end if;

  v_role := public.task_role_for_current(old);

  if v_role in ('ADMIN', 'OWNER') then
    -- Kepemilikan tidak boleh dilepas begitu saja.
    if new.owner_employee_id is null and old.owner_employee_id is not null then
      raise exception 'VALIDATION: pekerjaan wajib memiliki pemilik';
    end if;
    return new;
  end if;

  if v_role <> 'MEMBER' then
    raise exception 'FORBIDDEN: Anda tidak berhak mengubah pekerjaan ini';
  end if;

  -- Anggota tim: hanya progres, status/langkah, checklist, fokus, urutan.
  if new.owner_employee_id is distinct from old.owner_employee_id
     or new.pic_main_ids is distinct from old.pic_main_ids
     or new.pic_main_id is distinct from old.pic_main_id
     or new.pic_ids is distinct from old.pic_ids
     or new.task_type is distinct from old.task_type
     or new.disposed_by_employee_id is distinct from old.disposed_by_employee_id
     or new.created_by_employee_id is distinct from old.created_by_employee_id
     or new.title is distinct from old.title
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.start_date is distinct from old.start_date
     or new.archived_at is distinct from old.archived_at
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'FORBIDDEN: hanya pemilik pekerjaan yang dapat mengubah bagian ini';
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_guard_fields_trg on public.tasks;
create trigger tasks_guard_fields_trg
  before update on public.tasks
  for each row execute function public.tasks_guard_fields();

-- ----------------------------------------------------------------------------
-- 6. RLS PEKERJAAN — baca semua, tulis terbatas, DEMO read-only
-- ----------------------------------------------------------------------------
drop policy if exists "insert tasks authenticated" on public.tasks;
drop policy if exists "tasks insert" on public.tasks;
create policy "tasks insert" on public.tasks for insert with check (
  public.is_admin()
  or (
    public.current_account_type() = 'EMPLOYEE'
    and public.current_employee_id() is not null
    and owner_employee_id = public.current_employee_id()
    and created_by_employee_id = public.current_employee_id()
    and (
      -- Pimpinan boleh mendisposisikan kepada pegawai lain.
      public.is_leader()
      -- Staf hanya boleh membuat pekerjaan mandiri untuk dirinya sendiri.
      or (task_type = 'MANDIRI' and public.current_employee_id() = any(pic_main_ids))
    )
  )
);

drop policy if exists "update tasks authenticated" on public.tasks;
drop policy if exists "tasks update" on public.tasks;
create policy "tasks update" on public.tasks for update
  using (public.can_edit_task(id))
  with check (public.can_edit_task(id));

-- Hapus permanen tetap khusus Admin (policy 0001 dipertahankan).

-- Komentar/kendala/tindak lanjut: peserta pekerjaan & Admin.
drop policy if exists "insert comments authenticated" on public.task_comments;
drop policy if exists "comments insert" on public.task_comments;
create policy "comments insert" on public.task_comments for insert
  with check (public.can_edit_task(task_id));

-- Step & board: DEMO tidak boleh mengubah.
drop policy if exists "write board authenticated" on public.board;
drop policy if exists "board update" on public.board;
create policy "board update" on public.board for update using (public.can_write());
drop policy if exists "insert steps authenticated" on public.steps;
drop policy if exists "steps insert" on public.steps;
create policy "steps insert" on public.steps for insert with check (public.can_write());
drop policy if exists "update steps authenticated" on public.steps;
drop policy if exists "steps update" on public.steps;
create policy "steps update" on public.steps for update using (public.can_write());

-- Lampiran lama (tabel `attachments`) — hanya peserta pekerjaan.
drop policy if exists "insert attachments authenticated" on public.attachments;
drop policy if exists "attachments insert" on public.attachments;
create policy "attachments insert" on public.attachments for insert
  with check (public.can_edit_task(task_id));
drop policy if exists "delete attachments authenticated" on public.attachments;
drop policy if exists "attachments delete" on public.attachments;
create policy "attachments delete" on public.attachments for delete
  using (public.can_edit_task(task_id));

-- Audit: DEMO boleh membaca (read-only), tetapi tidak menulis.
drop policy if exists "insert audit authenticated" on public.audit_log;
drop policy if exists "audit insert" on public.audit_log;
create policy "audit insert" on public.audit_log for insert with check (public.can_write());

-- Pegawai boleh memperbarui FOTO miliknya sendiri; kolom lain tetap Admin.
create or replace function public.employees_guard_self_update()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return new; end if;
  if public.is_admin() then return new; end if;
  if new.id is distinct from public.current_employee_id() then
    raise exception 'FORBIDDEN: hanya Admin yang dapat mengubah data pegawai lain';
  end if;
  if new.full_name is distinct from old.full_name
     or new.display_name is distinct from old.display_name
     or new.nip is distinct from old.nip
     or new.username is distinct from old.username
     or new.position is distinct from old.position
     or new.team is distinct from old.team
     or new.level is distinct from old.level
     or new.supervisor_id is distinct from old.supervisor_id
     or new.active is distinct from old.active
     or new.sort_order is distinct from old.sort_order then
    raise exception 'FORBIDDEN: data kepegawaian hanya dapat diubah Admin';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard_self_update_trg on public.employees;
create trigger employees_guard_self_update_trg
  before update on public.employees
  for each row execute function public.employees_guard_self_update();

drop policy if exists "employees update self photo" on public.employees;
create policy "employees update self photo" on public.employees for update
  using (public.can_write() and id = public.current_employee_id())
  with check (public.can_write() and id = public.current_employee_id());

-- Foto pegawai di Storage: Admin bebas; pegawai boleh menulis fotonya sendiri.
drop policy if exists "employee photos insert self" on storage.objects;
create policy "employee photos insert self" on storage.objects for insert
  with check (
    bucket_id = 'employee-photos'
    and public.current_account_type() = 'EMPLOYEE'
    and public.current_employee_id() is not null
  );

drop policy if exists "employee photos delete self" on storage.objects;
create policy "employee photos delete self" on storage.objects for delete
  using (
    bucket_id = 'employee-photos'
    and public.current_account_type() = 'EMPLOYEE'
    and public.current_employee_id() is not null
  );

-- ----------------------------------------------------------------------------
-- 7. PERCOBAAN LOGIN — pembatasan laju, hanya diakses server (service role)
-- ----------------------------------------------------------------------------
create table if not exists public.auth_login_attempts (
  identifier text primary key,
  fail_count int not null default 0,
  first_failed_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_login_attempts enable row level security;
-- Tanpa policy apa pun → tidak dapat diakses klien (anon/authenticated).

-- ----------------------------------------------------------------------------
-- 8. PEMULIHAN DATA — step "Blocking" ikut terhapus oleh uji E2E yang gagal
--    di tengah jalan. Board wajib memiliki 5 tahapan sesuai spesifikasi.
-- ----------------------------------------------------------------------------
update public.steps
   set deleted_at = null, version = version + 1
 where board_id = 'board-utama' and name = 'Blocking' and deleted_at is not null;

-- ----------------------------------------------------------------------------
-- 9. RPC — pemetaan identitas login (NIP / username) → akun Auth.
--    Dipakai HANYA oleh endpoint server (service role); tidak di-grant ke
--    anon/authenticated sehingga tidak dapat dipakai untuk enumerasi akun.
-- ----------------------------------------------------------------------------
create or replace function public.resolve_login_identity(p_identifier text)
returns table (user_id uuid, account_type text, is_active boolean, employee_id uuid)
language sql stable security definer set search_path = public
as $$
  with ident as (
    select nullif(btrim(p_identifier), '') as raw
  ),
  norm as (
    select
      lower(raw) as uname,
      nullif(regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g'), '') as nip
    from ident
  )
  select r.user_id, r.role, r.is_active, r.employee_id
    from public.account_roles r
    join public.employees e on e.id = r.employee_id
   cross join norm n
   where (n.uname is not null and lower(e.username) = n.uname)
      or (n.nip is not null and e.nip_normalized = n.nip)
   limit 1;
$$;

revoke all on function public.resolve_login_identity(text) from public, anon, authenticated;

-- ============================================================================
-- CATATAN SETELAH MIGRATION (dilakukan lewat Pusat Admin → Pengguna & Akses):
--   1. Provisioning akun EMPLOYEE untuk pegawai aktif (password sementara).
--   2. Tetapkan Pimpinan/Staf & atasan langsung sesuai struktur nyata.
--   3. Lengkapi NIP pegawai yang masih kosong (tidak boleh dikarang).
-- ============================================================================

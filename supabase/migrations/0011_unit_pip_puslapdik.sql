-- ============================================================================
-- 0011 — Unit/Tim tunggal: seluruh pegawai memakai 'PIP Puslapdik'
--
-- Unit/Tim disimpan sebagai kolom teks pada public.employees (bukan tabel
-- master), sehingga tidak ada risiko record unit ganda. Migrasi ini:
--   1. mencatat nilai unit lama ke tabel audit ringan (sekali saja);
--   2. menyeragamkan seluruh nilai menjadi 'PIP Puslapdik';
--   3. menjadikan 'PIP Puslapdik' sebagai default kolom untuk pegawai baru.
-- Idempotent: dijalankan ulang tidak mengubah apa pun dan tidak menduplikasi
-- baris log (hanya baris dengan nilai berbeda yang tercatat/di-update).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Jejak nilai unit sebelum penyeragaman (untuk pelacakan; hanya-baca oleh admin)
-- ----------------------------------------------------------------------------
create table if not exists public.employee_team_migration_log (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  previous_team text not null,
  new_team text not null,
  migrated_at timestamptz not null default now()
);

alter table public.employee_team_migration_log enable row level security;

drop policy if exists "employee_team_migration_log read admin" on public.employee_team_migration_log;
create policy "employee_team_migration_log read admin" on public.employee_team_migration_log
  for select using (public.is_admin());

-- 1) Catat nilai lama untuk pegawai yang akan berubah (sekali; tidak menimpa
--    catatan yang sudah ada agar nilai asli tetap terlacak).
insert into public.employee_team_migration_log (employee_id, previous_team, new_team)
select id, team, 'PIP Puslapdik'
from public.employees
where team is distinct from 'PIP Puslapdik'
on conflict (employee_id) do nothing;

-- 2) Seragamkan seluruh pegawai (termasuk nilai kosong, 'Puslapdik', dan unit lain).
update public.employees
set team = 'PIP Puslapdik',
    updated_at = now()
where team is distinct from 'PIP Puslapdik';

-- 3) Default untuk pegawai baru.
alter table public.employees alter column team set default 'PIP Puslapdik';

-- Jaring pengaman: nilai kosong tidak boleh kembali muncul lewat insert eksplisit.
create or replace function public.employees_default_team()
returns trigger
language plpgsql
as $$
begin
  if new.team is null or btrim(new.team) = '' then
    new.team := 'PIP Puslapdik';
  end if;
  return new;
end;
$$;

drop trigger if exists employees_default_team on public.employees;
create trigger employees_default_team
  before insert or update of team on public.employees
  for each row execute function public.employees_default_team();

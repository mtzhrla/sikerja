-- ============================================================================
-- 0007 — Mapping/sync Google Sheets sesuai struktur aktual (19 Jul 2026)
--   * Kuota/alokasi per tahun sebagai KONFIGURASI (fallback matriks ALOKASI 2026
--     pada REKAP PROGRESS) — dapat diperbarui Admin, bukan tersebar di frontend.
--   * Binding kalender (activity_rows) membaca header baris 4, data mulai baris 5.
-- Idempotent: aman dijalankan ulang.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Konfigurasi kuota/alokasi per (tahun, jenjang). Realisasi TIDAK di sini —
-- realisasi selalu dihitung dari sheet "Pemberian" saat sinkronisasi.
-- ----------------------------------------------------------------------------
create table if not exists public.distribution_quota (
  year int not null check (year between 2020 and 2100),
  jenjang text not null,
  kuota_siswa bigint not null default 0 check (kuota_siswa >= 0),
  kuota_dana numeric(20, 0) not null default 0 check (kuota_dana >= 0),
  updated_at timestamptz not null default now(),
  primary key (year, jenjang)
);

alter table public.distribution_quota enable row level security;

drop policy if exists "read quota authenticated" on public.distribution_quota;
create policy "read quota authenticated" on public.distribution_quota for select
  using (public.current_app_role() is not null);

drop policy if exists "write quota admin" on public.distribution_quota;
create policy "write quota admin" on public.distribution_quota for all
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');

-- Nilai ALOKASI 2026 (baris TOTAL matriks REKAP PROGRESS) sebagai fallback stabil.
insert into public.distribution_quota (year, jenjang, kuota_siswa, kuota_dana) values
  (2026, 'TK',  888000,   399600000000),
  (2026, 'SD',  10360614, 4212276300000),
  (2026, 'SMP', 4369968,  2711107500000),
  (2026, 'SMA', 1935774,  3291821100000),
  (2026, 'SMK', 1928271,  3148801200000)
on conflict (year, jenjang) do nothing;

-- ----------------------------------------------------------------------------
-- Kalender Kegiatan (Sheet1): header di baris 4 (Tanggal | Nama Kegiatan |
-- Substansi | Tempat | Peserta), data mulai baris 5. Baris non-kegiatan (grid
-- kalender, header bulan, libur, kosong) diabaikan saat sinkronisasi.
-- ----------------------------------------------------------------------------
update public.spreadsheet_sheet_bindings
   set header_row = 4, data_start_row = 5
 where id = 'c1000000-0000-4000-8000-000000000003';

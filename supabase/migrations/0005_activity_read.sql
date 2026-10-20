-- ============================================================================
-- 0005 — Baca aktivitas untuk akun terautentikasi (USER & ADMIN)
-- ----------------------------------------------------------------------------
-- Konteks: akun Tim PIP dipakai bersama sebagai satu akun USER. Dua fitur
-- pengguna membaca audit_log:
--   * Riwayat per-kartu pada detail pekerjaan  (tasks.history → audit_log)
--   * "Aktivitas Terbaru" pada Dashboard        (recentActivity → audit_log)
-- Pada 0001 baca audit_log dibatasi Admin ("read audit admin"), sehingga kedua
-- fitur ini KOSONG untuk USER. Catatan di kode (adapter tasks.history) sudah
-- mengantisipasi membuka policy ini bila dibutuhkan User.
--
-- Kebijakan ini menambah hak SELECT audit_log untuk seluruh akun terautentikasi.
-- Modul "Audit Log" LENGKAP tetap khusus Admin di UI (route guard /admin), dan
-- audit TIDAK menyimpan password/token (Docs/09 §AA) sehingga aman dibaca
-- terbatas untuk umpan aktivitas & riwayat. Idempotent & reversible.
-- ============================================================================

drop policy if exists "read activity authenticated" on public.audit_log;
create policy "read activity authenticated" on public.audit_log for select
  using (public.current_app_role() is not null);

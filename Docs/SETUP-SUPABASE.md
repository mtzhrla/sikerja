# Setup Supabase

Panduan menyiapkan project Supabase kosong sampai siap dipakai aplikasi.

## 1. Buat / gunakan project

Project referensi: `https://srdqjvftjdklqebgvlco.supabase.co`.
Catat dari **Project Settings → API**:

- `Project URL` → `VITE_SUPABASE_URL` dan `SUPABASE_URL`
- `anon public` key → `VITE_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**hanya server/Vercel — jangan pernah masuk frontend atau Git**)

## 2. Jalankan migration

Urutan file di `supabase/migrations/` (jalankan berurutan pada SQL Editor,
atau `supabase db push` bila memakai CLI):

| File | Isi |
| --- | --- |
| `0001_init.sql` | Skema inti: account_roles, employees, board, steps, tasks, komentar, lampiran, kategori/label/template, distribution_snapshots, audit_log, device_sessions, app_settings + RLS + Realtime + bucket `lampiran` |
| `0002_functions.sql` | Fungsi RPC board (move_task, delete_step_safe, activate_snapshot) |
| `0003_integrations.sql` | Integrasi Google Sheets: spreadsheet_sources, sheet_bindings, column_mappings, sync_runs/errors, google_oauth_connections/tokens, pip_progress_records/snapshots, activity_plan_items + RLS + Realtime + `set_primary_source` + kolom `employees.nip` |
| `0004_seed_master.sql` | Seed 25 pegawai (Docs/09 §P) + sumber spreadsheet 2026 + sheet binding (idempotent) |

Seluruh migration dapat dijalankan pada project **kosong** dari nol.

## 3. Buat akun aplikasi

Lihat [SETUP-USERS.md](SETUP-USERS.md) — dua akun (Tim PIP & Admin) dibuat di
Supabase Auth lalu dipetakan role-nya lewat tabel `account_roles`.

## 4. Deploy edge function (opsional tapi disarankan)

`supabase/functions/admin-actions` dipakai Admin untuk mengganti password akun
Tim dari dalam aplikasi:

```bash
supabase functions deploy admin-actions
```

## 5. Verifikasi

1. Isi `.env.local`: `VITE_DATA_MODE=supabase`, URL + anon key.
2. `npm run build && npm run preview` → login dengan akun yang dibuat.
3. Menu **Admin → Ringkasan** harus menampilkan status Supabase "Terhubung".

## Catatan keamanan

- RLS aktif pada seluruh tabel; role dibaca server-side dari `account_roles`
  (`current_app_role()`), tidak pernah dipercaya dari client.
- `google_oauth_tokens` tidak punya policy client sama sekali — hanya service
  role (server) yang dapat membacanya.
- Audit log append-only dari client (tanpa policy update/delete).

# Deployment ke Vercel

> Sesuai instruksi, repo INI belum di-push dan belum di-deploy. Setelah
> deployment, cukup isi credential lalu jalankan migration.

## Arsitektur produksi

- **Frontend**: Vite SPA (output `dist/`) — di-serve statis oleh Vercel.
- **Backend**: Vercel Serverless Functions di folder `api/` (OAuth Google,
  status, webhook, sinkronisasi) + Supabase (Postgres/Auth/Realtime/Storage).
- `vercel.json` berisi rewrite SPA (semua path non-`/api` → `index.html`)
  dan cron rekonsiliasi `*/15 * * * *`.

## Langkah

1. **Push repo ke GitHub** (`https://github.com/pipplppdrive-create/pip-dashboard.git`).
2. **Vercel → Add New Project** → import repo (team `puslapdik-s-projects`).
   - Framework preset: **Vite**; build `npm run build`; output `dist`.
3. **Environment Variables** (Production + Preview):

```env
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://srdqjvftjdklqebgvlco.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_AUTH_EMAIL_DOMAIN=pip.local

SUPABASE_URL=https://srdqjvftjdklqebgvlco.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role — rahasia server>
GOOGLE_CLIENT_ID=<...>
GOOGLE_CLIENT_SECRET=<...>
GOOGLE_REDIRECT_URI=https://<domain>/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<acak ≥32 char>
GOOGLE_WEBHOOK_SECRET=<acak>
NEXT_PUBLIC_APP_URL=https://<domain>
CRON_SECRET=<opsional>
```

4. **Deploy.**
5. **Migration Supabase** — lihat [SETUP-SUPABASE.md](SETUP-SUPABASE.md)
   (0001 → 0004 pada project kosong).
6. **Akun** — lihat [SETUP-USERS.md](SETUP-USERS.md).
7. **Google OAuth** — daftarkan redirect URI produksi
   ([SETUP-GOOGLE-OAUTH.md](SETUP-GOOGLE-OAUTH.md)) lalu Admin klik
   **Hubungkan Google**.
8. **Apps Script webhook** — [SETUP-GOOGLE-SHEETS.md](SETUP-GOOGLE-SHEETS.md).

## Callback URI yang harus terdaftar di Google Console

```text
http://localhost:3000/api/integrations/google/callback   (lokal, vercel dev)
https://<domain-vercel>/api/integrations/google/callback (produksi)
```

## Uji pasca-deploy (checklist singkat)

1. Login `tim-pip` → Dashboard tampil; menu Admin TIDAK ada.
2. Login `admin` → Pusat Admin, seluruh modul terbuka.
3. Admin → Integrasi: Hubungkan Google → Tes koneksi → Konfirmasi mapping →
   Sinkronkan sekarang → Dashboard & Rencana Kegiatan terisi.
4. Edit sel di spreadsheet → dalam ±1 menit data ikut berubah (webhook +
   Realtime, tanpa reload).
5. `POST /api/sync/webhook` tanpa secret → harus 401.

## Local development dengan API

`npm run dev` (Vite, port 5173) hanya menjalankan frontend; endpoint `api/`
membutuhkan `vercel dev` (port 3000) bila ingin menguji OAuth/webhook lokal.
Tanpa itu, UI menampilkan status "belum dikonfigurasi" secara aman.

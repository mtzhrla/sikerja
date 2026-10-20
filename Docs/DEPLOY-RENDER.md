# Deploy ke Render (alternatif Vercel)

Deployment Render **berdampingan** dengan Vercel — tidak menggantikan atau
merusak deployment Vercel yang ada. Keduanya membaca repo & Supabase yang sama.

## Jenis deployment: Web Service (bukan Static Site)

Aplikasi butuh runtime server Node karena:

- **Google Sheets Service Account** menandatangani JWT dengan private key **di
  server** (tidak boleh di browser);
- **Supabase service role** dipakai server-side (PostgREST) untuk sinkronisasi;
- route `/api/*` (sinkronisasi, integrasi Google) berjalan server-side.

Static Site tidak dapat menjalankan hal di atas → **Web Service**.

## Arsitektur di Render

`server/render-server.ts` (dijalankan lewat `tsx`) adalah server Node minimal yang:

- menyajikan hasil build `dist/` (SPA React);
- meneruskan `/api/*` ke handler existing di `api/**` (tanpa duplikasi logika);
- SPA fallback untuk route seperti `/dashboard`, `/pekerjaan`,
  `/rencana-kegiatan`, `/daftar-pegawai`, `/admin` → `index.html`;
- `/api/*` **tidak** pernah jatuh ke `index.html` (404 JSON bila tak dikenal);
- bind `0.0.0.0` + `process.env.PORT`;
- endpoint `/health`;
- graceful shutdown (SIGTERM/SIGINT);
- tidak mencetak nilai rahasia ke log.

| Aspek           | Nilai                       |
| --------------- | --------------------------- |
| Build command   | `npm ci && npm run build`   |
| Start command   | `npm run start:render`      |
| Health check    | `/health`                   |
| Node            | `20.18.1` (`NODE_VERSION`)  |
| Region / plan   | `singapore` / `free`        |

## Environment variables

Blueprint (`render.yaml`) **tidak memuat satu pun nilai rahasia**. Nilai `value:`
hanya untuk yang non-rahasia; sisanya `sync: false` (diisi manual di dashboard).

### Otomatis (sudah ada `value:` di render.yaml — tidak perlu diisi)

- `NODE_VERSION` = `20.18.1`
- `GOOGLE_SHEETS_ACCESS_MODE` = `service_account`
- `VITE_DATA_MODE` = `supabase`

### Wajib diisi manual

**Frontend (di-inline saat build; anon key aman untuk browser):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_EMAIL_DOMAIN` _(opsional; default `pip.local`)_

**Server-only (RAHASIA — tidak pernah masuk bundle frontend):**

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` _(non-rahasia, tapi diisi manual)_
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` _(RAHASIA — lihat catatan multiline)_
- `GOOGLE_WEBHOOK_SECRET`

**Opsional — hanya bila memakai mode OAuth (alternatif Service Account):**

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `GOOGLE_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`

> Auth aplikasi memakai email/password Supabase — **tidak** perlu konfigurasi
> OAuth Supabase / redirect URL tambahan.

### Private key multiline

`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` boleh ditempel:

- **apa adanya** (multiline, termasuk `-----BEGIN PRIVATE KEY-----`), atau
- sebagai **satu baris** dengan `\n` literal.

Server menormalkan `\n` → newline asli (`api/_lib/env.ts`), jadi keduanya jalan.

## Multi-host (Vercel + Render)

Frontend memanggil API lewat path relatif `/api/*` (same-origin) → **tanpa CORS**
dan tanpa hardcode origin. Aplikasi berjalan di URL Vercel maupun `onrender.com`
tanpa perubahan kode. Env Vercel yang ada **tidak** disentuh.

## Catatan cron

Cron `/api/sync/run` (harian) di Vercel diatur `vercel.json`. Render free tidak
menjalankan cron dari blueprint ini; sinkronisasi tetap bisa lewat tombol
**Sinkronkan Sekarang** (Admin) atau webhook Apps Script. Cron Vercel tetap aktif.

## Langkah di dashboard Render

1. **New → Blueprint**, pilih repo `PIP-DASHBOARD`, branch `main`.
2. Render membaca `render.yaml` dan menampilkan service `pip-dashboard`.
3. Isi seluruh env var **wajib** di atas (bertanda `sync: false`).
4. **Apply / Create** → Render menjalankan build lalu start.
5. Tunggu health check `/health` hijau; buka URL `https://pip-dashboard.onrender.com`.
6. Bagikan kedua spreadsheet ke `GOOGLE_SERVICE_ACCOUNT_EMAIL` (akses Viewer) —
   sama seperti Vercel; **tidak perlu** dibagikan ulang bila sudah pernah.

## Uji lokal (opsional)

```bash
npm run build
npm run start:render      # default port 10000
# GET http://localhost:10000/health  → {"status":"ok",...}
# GET http://localhost:10000/dashboard → index.html (SPA)
```

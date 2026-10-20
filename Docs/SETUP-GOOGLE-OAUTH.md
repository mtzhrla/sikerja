# Setup Google OAuth (Integrasi Google Sheets)

Google OAuth **hanya** dipakai Admin untuk menghubungkan SATU akun Google agar
server dapat membaca spreadsheet (read-only). **Bukan** untuk login aplikasi —
halaman login tidak punya tombol "Masuk dengan Google".

## 1. Buat OAuth Client di Google Cloud Console

1. Buka <https://console.cloud.google.com> → buat/gunakan project.
2. **APIs & Services → Library** → aktifkan **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: *Internal* (bila memakai Google Workspace) atau *External* + test users;
   - Scope yang dipakai aplikasi: `https://www.googleapis.com/auth/spreadsheets.readonly`, `openid`, `email`.
4. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**;
   - **Authorized redirect URIs** — daftarkan KEDUANYA:

```text
Lokal    : http://localhost:3000/api/integrations/google/callback
Produksi : https://<domain-vercel-anda>/api/integrations/google/callback
```

5. Salin **Client ID** dan **Client Secret**.

## 2. Isi environment server (Vercel)

```env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=https://<domain-anda>/api/integrations/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=<string acak ≥32 karakter — jangan diganti setelah terpakai>
GOOGLE_WEBHOOK_SECRET=<string acak — samakan dengan Apps Script>
NEXT_PUBLIC_APP_URL=https://<domain-anda>
```

Cara membuat string acak: `openssl rand -base64 32`.

## 3. Hubungkan akun (sekali saja)

1. Login sebagai **Admin** → **Admin → Integrasi Spreadsheet**.
2. Klik **Hubungkan Google** → pilih akun Google yang punya akses ke seluruh
   spreadsheet sumber → setujui.
3. Aplikasi meminta `access_type=offline&prompt=consent` sehingga menerima
   **refresh token**; token disimpan **terenkripsi (AES-256-GCM)** di tabel
   `google_oauth_tokens` dan hanya dapat dibaca server.
4. Kartu Koneksi Google menampilkan email akun, waktu terhubung, dan status
   token. Tersedia **Hubungkan Ulang**, **Putuskan**, dan **Tes Koneksi**
   (per sumber).

Satu akun ini dipakai untuk SEMUA spreadsheet & semua tahun — tidak perlu
menghubungkan ulang setiap tahun selama akun masih punya akses ke file-nya.

## Keamanan token

- Refresh token: dienkripsi sebelum disimpan; tidak pernah dikirim ke
  frontend, tidak tampil di UI, tidak dicatat ke log, tidak masuk repository.
- Saat **Putuskan Koneksi**, token dicabut ke Google (best-effort) lalu
  dihapus dari database.
- Jika token kedaluwarsa/dicabut dari sisi Google, status menjadi
  `KEDALUWARSA` dan Admin cukup klik **Hubungkan Ulang**.

## Jika belum dikonfigurasi

Aplikasi tetap berjalan: kartu koneksi menampilkan
**"Integrasi Google belum dikonfigurasi"**, Dashboard/Rencana Kegiatan memakai
snapshot valid terakhir atau empty state — tanpa crash dan tanpa stack trace.

# Panduan Deployment — Dashboard PIP Puslapdik

Aplikasi ini adalah SPA statis (Vite) + backend **Supabase**
(Postgres + RLS + Realtime + Storage + Auth).

> **Status:** seluruh kode backend (migration, RLS, RPC, adapter, edge function)
> sudah lengkap, tetapi **belum diuji terhadap project Supabase nyata** karena
> kredensial belum tersedia. Setelah kredensial ada, ikuti langkah di bawah lalu
> jalankan checklist verifikasi di bagian akhir.

## Kredensial / keputusan yang masih dibutuhkan

| Kebutuhan | Untuk apa |
| --- | --- |
| Project Supabase (URL + anon key) | Backend produksi |
| Akses dashboard Supabase / CLI login | Menjalankan migration & membuat akun |
| `SUPABASE_SERVICE_ROLE_KEY` (di server saja) | Edge function ganti password User |
| Password default akun aplikasi | Provisioning awal akun sistem & pegawai |
| Domain/hosting statis (mis. Vercel/Netlify/nginx internal) | Menyajikan aplikasi |

## 1. Siapkan project Supabase

```bash
npm i -g supabase
supabase login
supabase link --project-ref <PROJECT_REF>

# Jalankan seluruh migration (skema, RLS, RPC, bucket, seed minimum)
supabase db push
```

Migration ada di [`supabase/migrations/`](supabase/migrations/):

- `0001_init.sql` — tabel, RLS (role diverifikasi server-side), realtime
  publication, bucket `lampiran` privat, board + step default, pengaturan.
- `0002_functions.sql` — RPC atomik: `activate_snapshot`, `move_task`,
  `delete_step_safe`.

## 2. Provisioning akun aplikasi

Setelah seluruh migration berhasil, buat/perbarui akun sistem dan 25 akun
pegawai secara idempotent:

```powershell
npm run auth:setup
```

Daftar username/NIP ada di `Docs/SETUP-USERS.md`. Skrip memakai Supabase Admin
API dari terminal dengan `SUPABASE_SERVICE_ROLE_KEY`; key tersebut tidak boleh
dimasukkan ke environment frontend.

## 3. Deploy edge function (ganti password User)

```bash
supabase functions deploy admin-actions
```

`SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY` tersedia otomatis di runtime
functions — **jangan pernah** menaruh service role key di env frontend.

## 4. Build & host frontend

```bash
# .env.production
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
VITE_AUTH_EMAIL_DOMAIN=pip.local

npm ci
npm run build   # hasil di dist/
```

Sajikan `dist/` pada hosting statis apa pun. Untuk SPA, arahkan seluruh route
ke `index.html` (contoh nginx):

```nginx
location / {
  try_files $uri /index.html;
}
```

## 5. Pasca-deploy (langkah pertama di aplikasi)

1. Login sebagai Admin → **Admin → Pegawai & PIC**: isi master pegawai.
2. **Admin → Kategori & Label** dan **Template**: sesuaikan kebutuhan tim.
3. **Admin → Data Penyaluran**: unggah Excel pertama → validasi → aktifkan.
4. **Admin → Pengaturan**: nama aplikasi, logo, tahun aktif, ambang, lampiran.

## Backup & pemulihan

- **Otomatis:** Supabase melakukan backup harian (dan PITR sesuai paket).
- **Sebelum migration besar:** `supabase db dump -f backup.sql` (atau snapshot
  dari dashboard) dan uji restore ke project staging.
- **Rollback data penyaluran:** tidak perlu restore database — gunakan histori
  snapshot pada menu Admin (aktifkan versi sebelumnya).
- Tombol *Unduh backup* di Pengaturan menghasilkan salinan JSON (pelengkap,
  bukan pengganti backup database).

## Catatan keamanan

- Role dan seluruh izin ditegakkan **server-side** lewat RLS; client hanya
  memberi umpan balik cepat.
- Audit log **append-only** (tidak ada policy update/delete).
- Bucket `lampiran` privat; unduhan memakai **signed URL** berumur pendek;
  tipe/ukuran divalidasi (executable selalu ditolak).
- Data penyaluran hanya agregat per jenjang — skema tidak punya tempat untuk
  NIK/NISN/nama siswa/rekening.
- Pencabutan sesi: baris `device_sessions` ditandai revoked → perangkat
  ter-logout lewat realtime; JWT tersisa kedaluwarsa mengikuti TTL Supabase
  (default 1 jam).
- `su`: riwayat per kartu untuk akun USER dibatasi RLS audit (hanya Admin).
  Bila tim ingin User melihat riwayat kartu, buka policy select audit_log
  terbatas kolom/kondisi `entity_type='TASK'`.

## Checklist verifikasi setelah kredensial tersedia

- [ ] `supabase db push` sukses tanpa error.
- [ ] Login Demo, Admin, dan satu pegawai lewat username serta NIP (mode `supabase`).
- [ ] Buat/edit/pindah kartu dari dua browser → realtime tanpa reload.
- [ ] Edit bersamaan → konflik terdeteksi (bukan tertimpa diam-diam).
- [ ] Unggah Excel → aktivasi snapshot → Dashboard menampilkan data.
- [ ] Unggah lampiran → unduh via signed URL → hapus.
- [ ] Soft delete → restore → hapus permanen (Admin).
- [ ] Cabut sesi dari Admin → perangkat lain keluar.
- [ ] Ganti password User via edge function → login password baru.
- [ ] `npm run e2e` terhadap environment staging.

# Setup Google Sheets (Sumber Data & Webhook)

Spreadsheet adalah **sumber data utama**; Supabase berfungsi sebagai cache,
snapshot, histori, validasi, dan sumber Realtime. Integrasi bersifat
**read-only** — aplikasi tidak pernah menulis balik ke spreadsheet.

## Sumber ter-seed (2026)

| Jenis | Spreadsheet ID | Sheet |
| --- | --- | --- |
| Progres Penyaluran SK (`pip_progress`) | `11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8` | `Pemberian` (detail/realisasi SK) + `REKAP PROGRESS` (alokasi/pagu/kontrol) |
| Rencana Kegiatan (`activity_plan`) | `16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98` | `Sheet1` |

Sumber tahun berikutnya ditambahkan Admin dari **Admin → Integrasi
Spreadsheet → Tambah sumber** (cukup tempel URL — ID diekstrak otomatis).

## Alur aktivasi sumber

1. **Tes koneksi** — memeriksa akses akun Google + keberadaan sheet wajib,
   lalu mendeteksi header (mapping berbasis **header**, bukan posisi kolom).
2. **Detail & mapping** — periksa hasil deteksi; gunakan **Preview** untuk
   melihat baris awal.
3. **Konfirmasi mapping** per sheet. Sebelum dikonfirmasi, status
   "Mapping belum dikonfirmasi" dan sinkronisasi tidak menimpa data.
4. **Sinkronkan sekarang** — sinkronisasi manual pertama.

## Aturan pembacaan

- `Pemberian`: baris kosong/judul/subtotal diabaikan; angka format Indonesia
  dan rupiah diparse; hanya **agregat per SK/jenjang** yang disimpan — tanpa
  data pribadi siswa.
- `REKAP PROGRESS`: hanya blok tahun sumber; total detail divalidasi silang
  terhadap kontrol per jenjang. Selisih → status **Perlu Validasi**, snapshot
  valid terakhir dipertahankan (tidak ditimpa).
- Rencana Kegiatan: satu tanggal → `tanggal selesai = tanggal mulai`; tanpa
  waktu → `all_day = true`; PIC dicocokkan ke pegawai (nama lengkap/tag);
  yang tidak cocok tetap disimpan sebagai nama + peringatan pada hasil sync.

## Webhook near real-time (Apps Script)

1. Buka spreadsheet → **Extensions → Apps Script**.
2. Tempel isi [`google-apps-script/Code.gs`](../google-apps-script/Code.gs).
3. Isi `WEBHOOK_URL` (`https://<domain>/api/sync/webhook`) dan
   `WEBHOOK_SECRET` (= env `GOOGLE_WEBHOOK_SECRET`).
4. Jalankan fungsi `setupTrigger` sekali → installable trigger `onChange`
   terpasang.
5. Uji dengan fungsi `testWebhook` → cek Logs; histori sinkronisasi di
   aplikasi harus bertambah dengan pemicu "Webhook".
6. Ulangi pada setiap spreadsheet sumber. Bila link/file berganti tahun,
   pasang di file baru dan hapus trigger lama.

Keamanan webhook: server memverifikasi `X-Webhook-Secret`, menolak request
tidak sah, dan **tidak mempercayai payload** — data selalu dibaca ulang dari
Google. Proses idempotent (upsert `source_row_key`), tidak membuat duplikasi.

## Sinkronisasi cadangan

- Tombol **Sinkronkan sekarang** per sumber (Admin).
- Cron Vercel (lihat `vercel.json`) memanggil `GET /api/sync/run` tiap
  15 menit sebagai rekonsiliasi terjadwal (interval dapat diubah).

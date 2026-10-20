# Data, Realtime, and Security

## Data penyaluran

- Hanya data agregat.
- Tidak menyimpan atau menampilkan data individual siswa pada versi awal.
- Tidak menampilkan NIK, NISN, nama siswa, rekening, virtual account, atau alamat.

## Realtime

Perubahan berikut harus tampil tanpa reload penuh:

- pekerjaan dibuat;
- pekerjaan diperbarui;
- progres berubah;
- kartu dipindahkan;
- PIC berubah;
- step berubah;
- data penyaluran aktif berubah.

## Konflik

- Perubahan bersamaan harus terdeteksi.
- User diberi informasi jika datanya sudah berubah.
- Sistem tidak boleh menimpa perubahan terbaru secara diam-diam.

## Penyimpanan lampiran

- private storage;
- signed URL;
- validasi MIME;
- validasi ukuran;
- sanitasi nama file;
- executable dilarang.

## Autentikasi

- role diverifikasi server-side;
- session aman;
- rate limiting login;
- Admin dapat mencabut sesi;
- secret tidak disimpan dalam source code.

## Penghapusan

- soft delete untuk User;
- pemulihan tersedia;
- permanent delete hanya Admin;
- permanent delete membutuhkan konfirmasi.

## Backup

- backup database;
- backup sebelum migration besar;
- restore test;
- rollback snapshot penyaluran.

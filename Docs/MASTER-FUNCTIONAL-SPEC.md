# Master Functional Specification — Dashboard Pekerjaan PIP Puslapdik

Versi: 3.0.0
Pembaruan: 16 Juli 2026

> Dokumen ini berisi gabungan seluruh spesifikasi fungsi. Claude bebas menentukan UI/UX terbaik tanpa mengubah fungsi.

---

# App Functions

## Tujuan

Aplikasi menjadi pusat monitoring bersama untuk penyaluran PIP dan pekerjaan tim PIP Puslapdik.

## Pengguna

- Pimpinan.
- Seluruh staf PIP Puslapdik.
- Admin aplikasi.

## Perangkat

- TV Android.
- Desktop.
- Laptop.
- Tablet.
- Ponsel.

## Fungsi utama

1. Menampilkan progres penyaluran PIP.
2. Menampilkan posisi seluruh pekerjaan.
3. Membuat dan memperbarui pekerjaan.
4. Menentukan PIC.
5. Menampilkan target, progres, kendala, dan tindak lanjut.
6. Mendukung pekerjaan jangka panjang dan pendek.
7. Mencatat pegawai pelaku.
8. Menyediakan riwayat perubahan.
9. Menyediakan data penyaluran agregat.
10. Memperbarui data secara real-time.

## Jenis pekerjaan

### Jangka panjang

Contoh:

- pengolahan SK;
- aktivasi rekening;
- penyaluran;
- rekonsiliasi;
- pengembangan sistem;
- pekerjaan lintas periode.

### Jangka pendek

Contoh:

- rapat;
- permintaan data;
- bahan pimpinan;
- surat;
- koordinasi;
- tindak lanjut singkat.

## Feedback

Sistem harus memberi feedback jelas untuk:

- berhasil;
- gagal;
- validasi;
- konfirmasi;
- konflik perubahan;
- upload;
- aktivasi data;
- penghapusan;
- pemindahan kartu.

Claude menentukan bentuk UI terbaik.

---

# Roles, Access, and Audit

## Role

- USER
- ADMIN

Tidak ada role pimpinan terpisah.

## User

User menggunakan satu akun bersama.

User dapat:

- melihat Dashboard;
- mengelola seluruh pekerjaan;
- mengubah PIC;
- mengelola step;
- mengarsipkan;
- memulihkan dari arsip.

User tidak dapat:

- menghapus permanen;
- mengelola master;
- mengelola data penyaluran;
- mengubah pengaturan;
- melihat audit teknis lengkap.

## Admin

Admin dapat:

- melakukan seluruh fungsi User;
- mengelola data penyaluran;
- mengelola pegawai;
- mengelola kategori dan label;
- mengelola template;
- memulihkan data;
- menghapus permanen;
- melihat audit;
- mengubah pengaturan;
- mencabut sesi User.

## Pegawai pelaku

Karena akun User digunakan bersama, setiap perubahan penting harus menyimpan:

- akun autentikasi;
- pegawai pelaku;
- tanggal dan waktu;
- jenis tindakan;
- entitas;
- nilai sebelum;
- nilai sesudah;
- status berhasil atau gagal;
- sesi/perangkat ringkas.

Pegawai pelaku dipilih dari master pegawai aktif.

## Audit

Audit tidak dapat diubah User.

Pegawai nonaktif tetap muncul pada histori lama.

---

# Dashboard Functions

## Tujuan

Menampilkan kondisi utama penyaluran PIP dan pekerjaan tim secara cepat.

## Penyaluran PIP

Minimal:

- alokasi siswa;
- alokasi anggaran;
- SK Pemberian;
- siswa tersalur;
- dana tersalur;
- sisa siswa;
- sisa anggaran;
- progres siswa;
- progres dana;
- waktu pembaruan.

## Rekap jenjang

Minimal:

- SD;
- SMP;
- SMA;
- SMK.

Data minimal:

- alokasi;
- SK Pemberian;
- tersalur;
- sisa;
- dana;
- persentase.

## Grafik

Menampilkan rekomendasi visual terbaik untuk:

- target dibanding realisasi;
- tren penyaluran;
- progres per jenjang.

Angka penting harus tetap dapat dipahami tanpa hover.

## Ringkasan pekerjaan

- Mengambil step board aktif.
- Nama tidak hard-coded.
- Urutan mengikuti board.
- Menampilkan jumlah pekerjaan per step.
- Klik ringkasan membuka board dengan filter step.

Default awal:

- Will Do
- To Do
- On Progress

- Done

Default dapat diubah User.

## Perlu Perhatian

Menampilkan pekerjaan:

- jatuh tempo hari ini;
- melewati tenggat;
- belum memiliki PIC;
- lama tidak diperbarui;
- prioritas tinggi;
- blocked.

## Fokus Hari Ini

Menampilkan pekerjaan yang:

- ditandai fokus;
- jatuh tempo hari ini;
- prioritas tinggi;
- blocked;
- memerlukan tindak lanjut.

## Aktivitas terbaru

- pekerjaan dibuat;
- progres berubah;
- kartu dipindahkan;
- PIC berubah;
- pekerjaan selesai;
- data penyaluran diperbarui.

## Filter

Minimal:

- tahun;
- periode;
- jenjang.

## Larangan

- tidak menampilkan data individual siswa;
- tidak membuat menu Penyaluran PIP terpisah;
- tidak menjadikan terlambat sebagai step;
- tidak menampilkan workflow operasional penyaluran sebagai fungsi utama.

---

# Work Board Functions

## Board

- Kanban horizontal.
- Drag-and-drop.
- Judul editable.
- Perubahan tanpa reload penuh.
- Search dan filter.
- Responsif.

## Step

Default:

- Will Do
- To Do
- On Progress
- Done

User dapat:

- menambah;
- mengubah nama;
- mengubah urutan;
- menghapus dengan pengamanan.

### Hapus step kosong

- minta konfirmasi;
- soft delete.

### Hapus step berisi kartu

- jangan langsung hapus;
- wajib pilih step tujuan;
- pindahkan seluruh kartu;
- kartu tidak boleh hilang.

## Kartu pekerjaan

Minimal:

- judul;
- deskripsi;
- jenis durasi;
- step;
- kategori;
- label;
- prioritas;
- tanggal mulai;
- target selesai;
- progres;
- PIC utama;
- PIC tambahan;
- checklist;
- kendala;
- tindak lanjut;
- komentar;
- lampiran;
- riwayat;
- status arsip;
- waktu update terakhir.

## PIC

- Multi-PIC.
- Satu PIC utama opsional.
- Dipilih dari master pegawai.
- Pegawai nonaktif tidak dapat dipilih untuk pekerjaan baru.
- Histori lama tetap menampilkan pegawai nonaktif.

## Progres

Mode:

- manual;
- otomatis dari checklist.

Rumus otomatis:

```text
jumlah item selesai / jumlah item keseluruhan × 100
```

## Checklist

- beberapa kelompok;
- tambah;
- edit;
- urutkan;
- centang;
- hapus;
- dapat memengaruhi progres.

## Komentar dan catatan

- komentar umum;
- kendala;
- tindak lanjut;
- pegawai pelaku;
- waktu.

## Lampiran

- tipe dan ukuran dibatasi;
- penyimpanan aman;
- metadata pengunggah;
- tidak digunakan untuk data siswa sensitif tanpa kebijakan tambahan.

## Arsip

- berada sebagai tab atau filter dalam halaman Pekerjaan;
- User dapat mengarsipkan;
- User dapat memulihkan;
- hapus permanen hanya Admin.

## Detail pekerjaan

Claude menentukan UI terbaik, tetapi semua field dan fungsi harus dapat diakses.

---

# Admin Functions

## Menu Admin

Satu menu Admin dengan bagian:

1. Data Penyaluran
2. Pegawai & PIC
3. Kategori & Label
4. Template Pekerjaan
5. Data Terhapus
6. Audit Log
7. Pengaturan

Claude menentukan tampilan terbaik.

## Data Penyaluran

Admin dapat:

- upload Excel;
- mapping kolom;
- preview;
- validasi;
- melihat error;
- menyimpan draft;
- mengaktifkan snapshot;
- membatalkan aktivasi;
- memulihkan snapshot sebelumnya;
- melihat histori;
- koreksi manual dengan alasan.

## Validasi

Minimal:

- tahun valid;
- periode valid;
- jenjang valid;
- angka tidak negatif;
- nominal valid;
- tidak ada duplikasi kunci;
- hanya satu snapshot aktif untuk ruang lingkup yang sama.

## Pegawai & PIC

Admin dapat:

- menambah;
- mengubah;
- mengatur nama tampilan;
- mengatur inisial/avatar;
- mengatur jabatan/tim;
- mengatur urutan;
- mengaktifkan;
- menonaktifkan.

Pegawai yang sudah mempunyai histori tidak boleh dihapus permanen.

## Kategori dan label

Admin dapat:

- menambah;
- mengubah;
- mengurutkan;
- mengaktifkan;
- menonaktifkan.

## Template pekerjaan

Template dapat berisi:

- judul;
- deskripsi;
- kategori;
- label;
- jenis durasi;
- prioritas;
- checklist;
- step awal;
- target relatif.

## Data terhapus

Admin dapat:

- melihat;
- memulihkan;
- menghapus permanen;
- melihat pegawai pelaku;
- melihat waktu;
- melihat alasan.

## Pengaturan

Minimal:

- nama aplikasi;
- logo;
- tahun aktif;
- password User;
- durasi sesi User;
- ambang tidak diperbarui;
- batas lampiran;
- tipe file;
- backup;
- pencabutan sesi.

---

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

---

# Build Steps

## Fase 1 — Inisialisasi Project Baru

Kerjakan:

- baca dokumen;
- pilih stack;
- inisialisasi project;
- TypeScript strict;
- lint;
- formatter;
- test setup;
- struktur route;
- struktur feature;
- `.env.example`;
- placeholder route.

Belum membuat UI lengkap.

## Fase 2 — Fondasi UI/UX

Claude menentukan rekomendasi terbaik.

Kerjakan:

- design system;
- app shell;
- navigation;
- component primitives;
- responsive foundation;
- feedback pattern;
- loading;
- empty;
- error;
- success state.

Berhenti untuk review.

## Fase 3 — Login dan Akses

Kerjakan:

- login User;
- login Admin;
- session persisten;
- role guard;
- employee actor picker;
- logout;
- revoke session.

Berhenti untuk review.

## Fase 4 — Dashboard

Kerjakan seluruh fungsi Dashboard menggunakan mock data terlebih dahulu.

Berhenti untuk review.

## Fase 5 — Board Pekerjaan

Kerjakan seluruh fungsi board menggunakan mock data atau data lokal terlebih dahulu.

Berhenti untuk review.

## Fase 6 — Admin

Kerjakan seluruh fungsi Admin.

Berhenti untuk review.

## Fase 7 — Backend dan Real-time

Hubungkan:

- database;
- auth;
- realtime;
- storage;
- import Excel;
- audit;
- settings;
- backup.

Hapus mock data yang tidak diperlukan.

## Fase 8 — QA dan Deployment

Jalankan:

- lint;
- type-check;
- unit test;
- integration test;
- E2E;
- accessibility;
- responsive check;
- console check;
- security check;
- performance check;
- deployment.

## Aturan

- Satu fase per prompt.
- Jangan melompat.
- Berhenti setelah fase.
- Laporkan file yang diubah.
- Laporkan test.
- Laporkan bagian yang masih mock.

---

# Acceptance Criteria

## Login

- User dapat login.
- Admin dapat login.
- Sesi User persisten.
- User tidak dapat membuka Admin.
- Pegawai pelaku tercatat.
- Admin dapat mencabut sesi.

## Dashboard

- Data penyaluran tampil.
- Rekap jenjang tampil.
- Grafik dapat dipahami.
- Ringkasan pekerjaan mengikuti step.
- Perlu Perhatian berfungsi.
- Fokus Hari Ini berfungsi.
- Aktivitas terbaru tampil.
- Tidak ada data individual siswa.

## Board

- Semua User dapat membuat dan mengedit pekerjaan.
- Card dapat dipindahkan.
- Step dapat dikelola.
- Step berisi kartu tidak dapat dihapus langsung.
- Multi-PIC berfungsi.
- Checklist berfungsi.
- Progres manual dan otomatis berfungsi.
- Komentar, kendala, tindak lanjut, dan lampiran berfungsi.
- Riwayat tercatat.
- Arsip dan pemulihan berfungsi.

## Admin

- Upload dapat dilakukan.
- Preview tersedia.
- Data invalid tidak dapat diaktifkan.
- Snapshot dapat dipulihkan.
- Pegawai dapat dikelola.
- Kategori dan template dapat dikelola.
- Data terhapus dapat dipulihkan.
- Hapus permanen hanya Admin.
- Audit dapat dilihat.
- Pengaturan dapat disimpan.

## Realtime

- Perubahan muncul tanpa reload penuh.
- Konflik ditangani.
- Tidak ada spam feedback.

## Responsive

- TV 1920×1080.
- Desktop.
- Laptop.
- Tablet.
- Mobile.
- Tidak ada overflow yang merusak fungsi.

## Quality

- Tidak ada runtime error.
- Console bersih.
- Lint lulus.
- Type-check lulus.
- Test lulus.
- Loading, empty, error, success state tersedia.
- Tidak ada secret.
- Tidak ada data siswa individual.

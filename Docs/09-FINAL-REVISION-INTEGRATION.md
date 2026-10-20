# 09 — Final Revision & Integration

## Prompt Final Claude Code

Lanjutkan pengembangan aplikasi **“Dashboard Pekerjaan PIP Puslapdik”** dari kondisi repository saat ini.

Aplikasi utama sudah selesai dibuat dan sudah berjalan di lokal. Jangan membuat ulang proyek, jangan mengganti stack tanpa alasan kuat, jangan menghapus fitur yang sudah berfungsi, dan jangan mengulang fase pembangunan sebelumnya.

Baca seluruh kode, migration, konfigurasi, dan dokumen Markdown yang sudah tersedia di repository. Gunakan implementasi saat ini sebagai dasar, lalu kerjakan seluruh revisi UI/UX, Supabase, autentikasi, integrasi Google Sheets, Rencana Kegiatan, navigasi, Admin, seed pegawai, realtime, dan kesiapan deployment dalam satu rangkaian pekerjaan.

Jangan berhenti untuk meminta persetujuan pada setiap tahap. Lanjutkan sampai seluruh implementasi lokal, lint, type-check, test, dan production build lulus.

Jangan push ke GitHub dan jangan deploy ke Vercel pada pekerjaan ini. Siapkan project agar setelah deployment saya hanya perlu memasukkan credential dan menjalankan migration.

---

## A. Kondisi dan Referensi Proyek

### Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://srdqjvftjdklqebgvlco.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### GitHub

Hanya sebagai referensi. Jangan push sekarang.

```text
https://github.com/pipplppdrive-create/pip-dashboard.git
```

### Vercel

Hanya sebagai referensi. Jangan deploy sekarang.

```text
https://vercel.com/puslapdik-s-projects
```

### Spreadsheet Progres Penyaluran SK

```text
https://docs.google.com/spreadsheets/d/11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8/edit?usp=sharing
```

Spreadsheet ID:

```text
11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8
```

Sheet yang digunakan:

1. `Pemberian`  
   Sumber detail/realisasi SK Pemberian.

2. `REKAP PROGRESS`  
   Sumber alokasi, pagu/target, dan kontrol rekap progres.

### Spreadsheet Rencana Kegiatan

```text
https://docs.google.com/spreadsheets/d/16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98/edit?usp=sharing
```

Spreadsheet ID:

```text
16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98
```

Sheet yang digunakan:

```text
Sheet1
```

---

## B. Batasan Utama

Pertahankan ketentuan berikut:

1. Role aplikasi hanya:
   - USER
   - ADMIN

2. Tidak ada role Manager.

3. USER dan ADMIN memakai satu halaman login yang sama.

4. Data progres penyaluran dan Rencana Kegiatan berasal dari Google Sheets.

5. Data penyaluran dan Rencana Kegiatan tidak diedit manual di aplikasi.

6. Data penyaluran tetap agregat.

7. Jangan mengambil, menyimpan, atau menampilkan:
   - nama siswa;
   - NISN;
   - NIK;
   - nomor rekening;
   - alamat;
   - data pribadi siswa lainnya.

8. Data yang dikelola manual melalui Admin hanya:
   - pegawai dan PIC;
   - konfigurasi Board/Pekerjaan;
   - kategori dan label pekerjaan;
   - template pekerjaan;
   - kolom board;
   - pengaturan aplikasi;
   - data aplikasi yang terhapus;
   - konfigurasi integrasi spreadsheet.

9. Jangan mengubah fungsi utama Board Pekerjaan yang sudah selesai.

10. Jangan membuat write-back ke Google Sheets. Integrasi spreadsheet untuk tahap ini harus read-only.

---

## C. Revisi Login

Hapus pemisahan login berupa tab atau pilihan:

- Tim PIP
- Admin

Gunakan satu form login terpadu:

- Username
- Password
- tombol Masuk

Jangan tampilkan pilihan role pada halaman login.

Role ditentukan setelah username dan password berhasil diverifikasi.

Alur:

```text
Akun USER
→ masuk sebagai Tim PIP

Akun ADMIN
→ masuk sebagai Admin
```

Gunakan Supabase Auth sebagai autentikasi utama.

Jika Supabase Auth memerlukan email tetapi tampilan harus menggunakan username, buat mekanisme username mapping yang aman pada sisi server, misalnya:

- tabel `app_accounts` atau `profiles`;
- username unik;
- `auth_user_id`;
- role;
- status aktif.

Jangan mempercayai role dari frontend.

Validasi role dan session harus dilakukan melalui Supabase/server.

Pertahankan session login agar pengguna tidak perlu login berulang pada perangkat yang sama.

Route USER dan ADMIN harus memiliki route guard.

Login Google bukan untuk masuk ke aplikasi. Google OAuth hanya digunakan Admin untuk menghubungkan Google Sheets.

Jangan menambahkan tombol **Masuk dengan Google** pada halaman login utama.

---

## D. Desain Login dan Maskot

Buat ulang halaman login agar lebih modern, terang, hidup, premium, dan terlihat seperti hasil desain Figma.

Claude harus membuat sendiri seluruh asset yang diperlukan. Jangan bergantung pada asset berbayar atau asset pihak ketiga yang hak pakainya tidak jelas.

Buat maskot original berbentuk karakter geometris/blob sederhana, lucu, ramah, tetapi tetap sesuai untuk aplikasi internal pemerintahan.

Gunakan kombinasi karakter seperti:

- rounded rectangle;
- semicircle;
- circle;
- capsule;
- triangle dengan sudut membulat.

Gunakan warna cerah seperti:

- biru;
- cyan;
- ungu;
- pink;
- kuning;
- mint.

Asset dapat dibuat sebagai:

- SVG;
- CSS illustration;
- React component;
- kombinasi SVG dan CSS animation.

Maskot harus memiliki beberapa state:

1. **Idle**
   - mata terbuka;
   - berkedip ringan;
   - ekspresi ramah.

2. **Password field focus**
   - karakter memperhatikan field;
   - gerakan ringan.

3. **Saat pengguna mulai mengetik password**
   - karakter menutup mata atau menutupi mata;
   - karakter lain dapat menoleh.

4. **Saat tombol show password aktif**
   - karakter mengintip atau membuka satu mata.

5. **Login berhasil**
   - tersenyum;
   - gerakan kecil atau sparkle ringan.

6. **Login gagal**
   - ekspresi bingung;
   - animasi shake sangat ringan.

Animasi harus singkat dan tidak berlebihan.

Hormati `prefers-reduced-motion`.

Desain login harus:

- responsif;
- tidak terlalu kosong;
- tidak terasa seperti template generik;
- memiliki gradient lembut;
- memiliki ornamen ringan;
- tetap mudah dibaca;
- tetap cepat dimuat;
- dapat digunakan dengan keyboard, touch, dan remote TV.

---

## E. Arah UI/UX Seluruh Aplikasi

Ubah visual aplikasi yang sekarang terasa terlalu gelap dan datar.

Gunakan arah desain:

- terang;
- modern;
- premium;
- tren web app terbaru;
- terlihat seperti rancangan Figma;
- profesional;
- tidak kaku;
- tidak terlalu ramai.

Gunakan palette utama:

- putih;
- off-white;
- biru muda;
- indigo;
- violet;
- cyan;
- mint sebagai aksen.

Gunakan gradient secara terkontrol pada:

- background utama;
- header tertentu;
- tombol utama;
- active navigation;
- icon container;
- KPI card tertentu;
- progress indicator;
- highlight penting;
- empty state;
- halaman login.

Jangan memakai sidebar gelap pekat seperti tampilan lama.

Gunakan:

- surface terang;
- gradient lembut;
- border tipis;
- shadow halus;
- radius konsisten;
- spacing lebih lega;
- typography dengan hierarki yang jelas.

Jangan mengubah isi dan fungsi Dashboard atau Board secara sembarangan. Fokus pada perbaikan visual, keterbacaan, interaksi, dan responsivitas.

---

## F. Micro-interactions dan Efek Touch/Klik

Semua elemen interaktif harus memberikan feedback visual.

Terapkan state:

- hover;
- focus;
- active;
- pressed;
- loading;
- disabled;
- success;
- error.

Untuk tombol dan card interaktif gunakan efek seperti:

### Hover

- sedikit terangkat;
- shadow bertambah halus;
- gradient atau border menjadi lebih jelas.

### Pressed/Touch

- scale sekitar `0.97–0.98`;
- ripple atau glow ringan;
- kembali ke ukuran normal.

Durasi umum:

```text
120–220 ms
```

Terapkan pada:

- tombol;
- menu navigasi;
- card Admin;
- card pekerjaan;
- filter;
- tab;
- dropdown;
- modal;
- tombol sinkronisasi;
- tombol login;
- kontrol kalender;
- tombol tambah;
- tombol kembali;
- tombol sidebar.

Animasi tidak boleh menghambat penggunaan Android TV.

Jangan menggunakan animasi berat atau library animasi besar apabila CSS/transisi ringan sudah cukup.

---

## G. Navigasi Utama

### USER

1. Dashboard
2. Pekerjaan
3. Rencana Kegiatan

### ADMIN

1. Dashboard
2. Pekerjaan
3. Rencana Kegiatan
4. Admin

Jangan menampilkan menu Admin kepada USER.

Gunakan navigasi yang adaptif berdasarkan perangkat.

### Desktop dan Laptop

- sidebar di kiri;
- dapat expanded;
- dapat compact;
- dapat hidden.

### Android TV

- icon rail/sidebar di kiri;
- dapat diperluas;
- dapat disembunyikan;
- fokus D-pad harus jelas.

### Tablet Landscape

- sidebar compact;
- dapat disembunyikan.

### Tablet Portrait dan Mobile

- gunakan bottom navigation;
- menu Admin hanya muncul untuk ADMIN.

---

## H. Sidebar Expanded, Compact, dan Hidden

Buat sidebar memiliki tiga mode:

1. **Expanded**
   - icon dan nama menu terlihat.

2. **Compact**
   - hanya icon terlihat;
   - tooltip atau label muncul saat fokus/hover.

3. **Hidden**
   - sidebar tidak mengambil ruang;
   - konten utama melebar.

Tambahkan tombol/icon untuk:

- memperkecil sidebar;
- menyembunyikan sidebar;
- menampilkan sidebar kembali.

Saat sidebar hidden, tombol buka harus tetap terlihat dan mudah dijangkau di kiri atas.

Tombol tersebut harus:

- besar;
- mudah difokuskan;
- mendukung keyboard;
- mendukung D-pad;
- mendukung touch.

Saat sidebar berubah:

- konten harus reflow;
- chart harus resize;
- board harus mendapatkan lebar tambahan;
- tidak boleh terjadi layout shift yang merusak;
- posisi scroll sebisa mungkin dipertahankan.

Simpan preferensi sidebar per perangkat menggunakan `localStorage`:

```text
sidebar_state = expanded | compact | hidden
```

---

## I. Dukungan Android TV

Aplikasi akan digunakan pada Android TV berukuran besar, tetapi juga tetap digunakan pada desktop, laptop, tablet, dan mobile.

Target minimal:

- TV: `1920 × 1080`
- Desktop: `1440 × 900`
- Laptop: `1366 × 768`
- Tablet: `768 × 1024`
- Mobile: `390 × 844`

Untuk Android TV, dukung:

- Arrow Up;
- Arrow Down;
- Arrow Left;
- Arrow Right;
- Enter/OK;
- Escape/Back;
- keyboard navigation;
- remote/D-pad navigation.

Semua komponen interaktif harus memiliki focus ring yang terlihat jelas.

Gunakan ukuran target klik/fokus minimal sekitar `48–56 px` untuk kontrol utama pada mode TV.

Pastikan:

- teks terbaca dari jarak jauh;
- focus order logis;
- fokus tidak terjebak;
- dropdown dapat dioperasikan remote;
- modal dapat ditutup dengan Back/Escape;
- board dapat dinavigasi secara horizontal;
- scrolling tidak hanya bergantung pada mouse drag;
- tombol kecil tiga titik tetap memiliki target fokus yang cukup besar.

Gunakan deteksi input dan layout secara hati-hati. Jangan hanya bergantung pada user-agent.

---

## J. Dashboard

Pertahankan fungsi Dashboard yang sudah ada, tetapi perbarui tampilannya agar lebih modern dan terang.

Dashboard harus menampilkan data spreadsheet aktif berdasarkan tahun.

Tambahkan atau pertahankan:

- pemilih tahun;
- pemilih periode jika data mendukung;
- pemilih jenjang;
- sumber data aktif;
- waktu sinkronisasi terakhir;
- status sinkronisasi.

Data utama:

- alokasi siswa;
- pagu/anggaran;
- SK Pemberian;
- dana SK Pemberian;
- siswa tersalur;
- dana tersalur;
- sisa siswa;
- sisa dana;
- progres siswa;
- progres dana;
- rekap per jenjang;
- grafik.

Jenjang minimal:

- SD;
- SMP;
- SMA;
- SMK.

Gunakan layout KPI dan chart yang lebih bersih, terang, bergradient lembut, dan mudah dibaca pimpinan.

Jangan menampilkan angka mock sebagai data production.

Jika credential belum tersedia, tampilkan empty state:

```text
Integrasi data belum dikonfigurasi
```

Jangan membuat aplikasi crash.

---

## K. Board Pekerjaan

Pertahankan seluruh fitur Board yang sudah ada:

- horizontal Kanban;
- drag and drop;
- judul board editable;
- kolom editable;
- multi PIC;
- checklist;
- progress;
- komentar;
- kendala;
- tindak lanjut;
- attachment;
- history;
- archive;
- restore.

Pertahankan kolom contoh seperti:

- Will Do;
- To Do;
- On Progress;
- Done.

Jangan menjadikan **Perlu Perhatian** sebagai kolom Board.

Perbarui tampilan Board agar:

- lebih terang;
- tidak flat;
- card lebih polished;
- label lebih mudah dibaca;
- progress bar lebih modern;
- avatar/tag pegawai jelas;
- jarak antar card rapi;
- drag state terlihat;
- focus state TV terlihat;
- horizontal scroll mudah digunakan.

Pada TV, sediakan navigasi antar kolom dan kartu menggunakan D-pad.

---

## L. Admin Hub

Tampilan Admin lama memiliki daftar submenu yang diletakkan di sisi area konten dan tidak berfungsi. Hapus pola tersebut.

Sidebar utama hanya memiliki satu menu:

```text
Admin
```

Ketika menu Admin dibuka, tampilkan halaman:

```text
Pusat Admin
```

Gunakan model **Admin App Launcher** berupa tombol/card besar seperti aplikasi, bukan dropdown kecil sebagai navigasi utama.

Card Pusat Admin:

1. Ringkasan
2. Integrasi Spreadsheet
3. Pegawai & PIC
4. Board & Aktivitas
5. Data Terhapus
6. Audit Log
7. Pengaturan

Setiap card harus memiliki:

- icon;
- judul;
- deskripsi singkat;
- status;
- jumlah data atau indikator jika relevan;
- hover;
- pressed effect;
- focus TV;
- click/touch feedback.

Contoh informasi card:

### Integrasi Spreadsheet

- 2 sumber aktif;
- terakhir sinkron;
- indikator jika terjadi error.

### Pegawai & PIC

- jumlah pegawai aktif.

### Audit Log

- jumlah aktivitas hari ini.

Pusat Admin harus responsif:

- TV/desktop besar: 3–4 card per baris;
- laptop: sekitar 3 card per baris;
- tablet: 2 card per baris;
- mobile: 1–2 card per baris.

Saat sebuah card dibuka, tampilkan breadcrumb:

```text
Admin › Integrasi Spreadsheet
```

Sediakan tombol kembali ke Pusat Admin.

Gunakan dropdown hanya untuk:

- filter;
- memilih tahun;
- memilih sheet;
- memilih status;
- aksi tiga titik.

Jangan menggunakan dropdown sebagai navigasi utama modul Admin.

---

## M. Modul Admin

### 1. Ringkasan

Tampilkan:

- status Supabase;
- status Google OAuth;
- akun Google terhubung;
- jumlah sumber spreadsheet;
- status sinkronisasi terakhir;
- error sinkronisasi;
- jumlah pegawai aktif;
- jumlah pekerjaan aktif;
- status realtime;
- status environment variable tanpa menampilkan nilai rahasia.

### 2. Integrasi Spreadsheet

Kelola:

- Progres Penyaluran SK;
- Rencana Kegiatan;
- sumber berdasarkan tahun;
- sheet yang digunakan;
- mapping kolom;
- preview;
- tes koneksi;
- sinkronisasi;
- histori sinkronisasi;
- status error.

### 3. Pegawai & PIC

Kelola:

- nama lengkap;
- tag board;
- NIP;
- jabatan;
- instansi;
- status aktif;
- tambah;
- edit;
- nonaktifkan;
- arsipkan;
- restore.

### 4. Board & Aktivitas

Kelola hal-hal manual yang berhubungan dengan Trello/Board:

- kategori;
- label;
- warna label;
- template pekerjaan;
- kolom Board;
- urutan kolom;
- prioritas;
- aturan status;
- pengaturan checklist;
- pengaturan arsip.

Jangan menjadikan modul ini sebagai tempat mengedit Rencana Kegiatan spreadsheet.

### 5. Data Terhapus

Tampilkan data aplikasi yang di-soft-delete:

- pekerjaan;
- komentar;
- attachment;
- pegawai;
- konfigurasi spreadsheet;
- data lain yang relevan.

ADMIN dapat:

- restore;
- hapus permanen.

Jangan menghapus histori audit ketika data utama dihapus.

### 6. Audit Log

Catat:

- waktu;
- akun;
- pegawai pelaku;
- role;
- aksi;
- modul;
- data yang berubah;
- nilai sebelum;
- nilai sesudah;
- sumber perubahan;
- IP atau metadata yang aman jika tersedia;
- sinkronisasi spreadsheet;
- error integrasi.

### 7. Pengaturan

Kelola:

- tahun aktif;
- preferensi aplikasi;
- koneksi Google;
- status Supabase;
- konfigurasi realtime;
- pengaturan tampilan;
- konfigurasi sistem lain yang relevan.

---

## N. Integrasi Supabase

Audit kode dan migration Supabase yang sudah ada.

Jangan menghapus migration lama secara sembarangan.

Buat migration lanjutan jika diperlukan.

Pastikan migration dapat dijalankan pada Supabase project kosong.

Gunakan pemisahan client:

- browser Supabase client;
- server Supabase client;
- service role client.

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh digunakan di server, Vercel Function, Supabase Edge Function, atau lingkungan backend lain.

Jangan pernah mengekspos service role ke frontend.

Tambahkan validasi environment variable.

Jika credential belum tersedia:

- aplikasi tetap dapat build;
- halaman tetap dapat dibuka;
- integrasi menampilkan status belum dikonfigurasi;
- jangan crash.

Gunakan tabel atau struktur setara untuk:

- profiles;
- app_accounts;
- employees;
- boards;
- board_columns;
- tasks;
- task_assignees;
- task_labels;
- checklists;
- checklist_items;
- task_comments;
- task_attachments;
- task_activity;
- spreadsheet_sources;
- spreadsheet_sheet_bindings;
- spreadsheet_column_mappings;
- spreadsheet_sync_runs;
- spreadsheet_sync_errors;
- google_oauth_connections;
- pip_progress_records;
- pip_progress_snapshots;
- activity_events;
- audit_logs;
- app_settings.

Gunakan:

- UUID;
- `created_at`;
- `updated_at`;
- `deleted_at`;
- `created_by_employee_id`;
- `updated_by_employee_id`;
- `source_row_key`;
- `source_type`;
- `source_year`.

Tambahkan:

- updated_at trigger;
- unique constraint yang relevan;
- foreign key;
- index;
- soft delete;
- idempotency constraint.

Aktifkan Row Level Security.

USER hanya memperoleh hak yang sesuai.

ADMIN memperoleh hak administratif.

Service role hanya digunakan pada proses sinkronisasi server.

---

## O. Identitas Pegawai Pelaku

Karena akun Tim PIP digunakan bersama, setiap aksi penting harus tetap meminta atau menggunakan identitas pegawai pelaku.

Contoh aksi:

- membuat pekerjaan;
- mengedit pekerjaan;
- memindahkan pekerjaan;
- mengarsipkan;
- restore;
- mengubah pegawai;
- mengubah konfigurasi spreadsheet;
- sinkronisasi manual;
- mengubah pengaturan Admin.

Simpan:

- `account_user_id`;
- `employee_actor_id`;
- `action`;
- `timestamp`.

Jangan menyamakan akun login bersama dengan identitas pegawai pelaku.

---

## P. Seed Data Pegawai

Masukkan daftar pegawai berikut sebagai seed awal.

Kolom minimal:

- `full_name`;
- `display_tag`;
- `nip`;
- `position`;
- `institution`;
- `is_active`.

Tag Board harus satu kata dan dapat diedit Admin.

### Daftar Pegawai

1. **Rakean Sundayana, S.Pd., M.A**
   - Tag: `Rakean`
   - NIP: `198102082005011003`
   - Jabatan: Ketua Tim Kerja Kemitraan dan Tata Kelola Program

2. **Thoriq Rozaq Rosyadi**
   - Tag: `Thoriq`
   - NIP: `199412252022031015`
   - Jabatan: Penelaah Teknis Kebijakan

3. **Tri Hesti Wahyudiati**
   - Tag: `Hesti`
   - NIP: `197008102007102001`
   - Jabatan: Penelaah Teknis Kebijakan

4. **Erna Fitriawati Novi Hastuti**
   - Tag: `Erna`
   - NIP: `198309252008122002`
   - Jabatan: Penelaah Teknis Kebijakan

5. **Yusna Yurita**
   - Tag: `Yusna`
   - NIP: `198209242014042001`
   - Jabatan: Penelaah Teknis Kebijakan

6. **Sucianingsih**
   - Tag: `Sucianingsih`
   - NIP: `1990031020015042003`
   - Jabatan: Perencana Ahli Pertama

7. **Entin Jainingsih**
   - Tag: `Entin`
   - NIP: `196903111990022001`
   - Jabatan: Pengadministrasian Perkantoran

8. **Suyadi**
   - Tag: `Suyadi`
   - NIP: `196907151994031010`
   - Jabatan: Pengadministrasian Perkantoran

9. **Drajat Sujarwo**
   - Tag: `Drajat`
   - NIP: `198102032007011001`
   - Jabatan: Pengolah Data dan Informasi

10. **Sirda Eldita**
    - Tag: `Sirda`
    - NIP: `199204152018012002`
    - Jabatan: Penelaah Teknis Kebijakan

11. **Linda Eri Jayanti**
    - Tag: `Linda`
    - NIP: `199101032025212048`
    - Jabatan: Penata Layanan Operasional

12. **Rendy Pamungkas**
    - Tag: `Rendy`
    - NIP: `199105062025211055`
    - Jabatan: Penata Layanan Operasional

13. **Muhammad Nur**
    - Tag: `Nur`
    - NIP: `199503102025211034`
    - Jabatan: Penata Layanan Operasional

14. **Muhammad Rifai**
    - Tag: `Rifai`
    - NIP: `199608292025211031`
    - Jabatan: Penata Layanan Operasional

15. **Lina Fitriani**
    - Tag: `Lina`
    - NIP: `198602032025212037`
    - Jabatan: Pengadministrasi Perkantoran

16. **Mulkirom**
    - Tag: `Mulkirom`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

17. **Eka Dewi Pertiwi**
    - Tag: `Eka`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

18. **Santika Indah Pratiwi**
    - Tag: `Santika`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

19. **Vyja Tona Rapolo**
    - Tag: `Vyja`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

20. **Achmad Ulfi**
    - Tag: `Ulfi`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

21. **Dhani Prayudi**
    - Tag: `Dhani`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

22. **Sendi Irjansaputra**
    - Tag: `Sendi`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

23. **Fajar Robbyana**
    - Tag: `Fajar`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

24. **Ferry Widiarta**
    - Tag: `Ferry`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

25. **Muhammad Lazuardy Kamil**
    - Tag: `Kamil`
    - NIP: `null`
    - Jabatan: `null`
    - Instansi: Pusat Layanan Pembiayaan Pendidikan

### Aturan Pegawai

- `display_tag` harus unik di antara pegawai aktif;
- `full_name` tidak boleh digantikan oleh `display_tag`;
- Board menampilkan `display_tag`;
- detail, audit, dan Admin dapat menampilkan `full_name`;
- pegawai yang sudah dipakai dalam audit tidak boleh dihapus tanpa mempertahankan referensi histori.

---

## Q. Google OAuth untuk Google Sheets

Google OAuth hanya digunakan untuk menghubungkan satu akun Google milik Admin agar aplikasi dapat membaca seluruh spreadsheet yang dapat diakses akun tersebut.

Admin cukup menghubungkan akun satu kali.

Gunakan environment variable:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_WEBHOOK_SECRET=
```

Gunakan access offline.

Pastikan request OAuth menggunakan:

```text
access_type=offline
prompt=consent
```

Gunakan scope minimum:

```text
https://www.googleapis.com/auth/spreadsheets.readonly
```

Gunakan scope Drive terbatas hanya apabila benar-benar membuat pemilih file dari Google Drive.

Fitur Google connection:

- Hubungkan Google;
- Hubungkan Ulang;
- Putuskan Koneksi;
- Tes Koneksi;
- status akun;
- email akun;
- waktu terhubung;
- waktu terakhir digunakan;
- status token.

Refresh token harus:

- dienkripsi sebelum disimpan;
- hanya dibaca server;
- tidak dikirim ke frontend;
- tidak ditampilkan di UI;
- tidak dicatat ke log;
- tidak masuk repository.

Buat route server sesuai stack yang ada.

Jika aplikasi adalah Vite SPA, jangan memaksa migrasi framework. Gunakan Vercel Serverless Functions, Supabase Edge Functions, atau backend yang paling sesuai dengan repository saat ini.

Gunakan satu callback path yang konsisten, misalnya:

```text
/api/integrations/google/callback
```

Dokumentasikan callback lokal dan production.

Jika OAuth belum dikonfigurasi, tampilkan:

```text
Integrasi Google belum dikonfigurasi
```

Jangan menampilkan stack trace kepada pengguna.

---

## R. Daftar Sumber Spreadsheet Berdasarkan Tahun

Admin harus dapat mengelola banyak sumber spreadsheet untuk tahun yang berbeda.

Contoh:

```text
2026
- Progres Penyaluran SK 2026
- Rencana Kegiatan 2026

2027
- Progres Penyaluran SK 2027
- Rencana Kegiatan 2027
```

Jenis sumber internal:

```text
pip_progress
activity_plan
```

Setiap sumber memiliki:

- id;
- source_type;
- year;
- name;
- spreadsheet_url;
- spreadsheet_id;
- is_active;
- is_primary;
- sync_mode;
- last_synced_at;
- last_sync_status;
- last_error;
- created_by_employee_id;
- updated_by_employee_id;
- created_at;
- updated_at;
- deleted_at.

Admin dapat:

- tambah;
- edit;
- nonaktifkan;
- arsipkan;
- restore;
- tes koneksi;
- preview;
- sinkronkan sekarang;
- melihat histori;
- menentukan sumber utama;
- memilih tahun aktif.

Satu akun Google terhubung digunakan untuk seluruh spreadsheet.

Tidak perlu menghubungkan akun Google ulang setiap tahun selama akun tersebut memiliki akses.

---

## S. Konfigurasi Khusus Penyaluran SK

Satu sumber Progres Penyaluran SK harus dapat membaca lebih dari satu sheet.

Untuk sumber 2026, seed konfigurasi berikut:

### Spreadsheet

```text
11IgR3kwN3xiSuArIKgPmC98AcdotR0k_iWOMPJjNVY8
```

### Sheet Binding

1. `detail_realisasi`
   - Sheet: `Pemberian`

2. `allocation_summary`
   - Sheet: `REKAP PROGRESS`

Jangan menganggap satu sumber hanya memiliki satu sheet.

Gunakan tabel sheet binding atau struktur setara:

- source_id;
- binding_type;
- sheet_name;
- header_row;
- data_start_row;
- optional_range;
- mapping_status.

---

## T. Mapping dan Validasi Kolom Penyaluran

Jangan mengunci mapping berdasarkan posisi kolom seperti A, B, C.

Gunakan mapping berbasis header.

Saat Admin menambahkan atau membuka sumber:

1. ekstrak Spreadsheet ID;
2. cek akses akun Google;
3. ambil daftar sheet;
4. pastikan `Pemberian` dan `REKAP PROGRESS` tersedia;
5. baca baris awal;
6. deteksi header;
7. tampilkan preview;
8. minta konfirmasi mapping;
9. validasi tipe data;
10. aktifkan sinkronisasi setelah mapping valid.

Mapping data detail minimal harus dapat mewakili jika tersedia:

- tahun;
- jenjang;
- tahap;
- keterangan tahap/SK;
- nomor SK;
- tanggal SK;
- jumlah siswa;
- jumlah dana;
- status;
- tanggal update;
- catatan.

Mapping `REKAP PROGRESS` minimal harus dapat mewakili:

- tahun;
- jenjang;
- alokasi siswa;
- pagu/anggaran;
- realisasi siswa;
- realisasi dana;
- sisa siswa;
- sisa dana;
- progres siswa;
- progres dana.

Jangan menebak mapping jika nama header ambigu.

Simpan:

- detected_header;
- target_field;
- parser_type;
- transform_rule;
- required;
- validation_status.

Jika credential belum tersedia, tetap buat wizard mapping dan seed metadata sumber, tetapi jangan mengaktifkan mapping palsu.

Tampilkan status:

```text
Mapping belum dikonfirmasi
```

---

## U. Aturan Pembacaan Penyaluran

### Sheet `Pemberian`

- gunakan sebagai sumber detail/realisasi SK Pemberian;
- abaikan baris kosong;
- abaikan judul;
- abaikan subtotal atau total yang bukan baris detail;
- tangani merge cell;
- tangani formula;
- tangani format angka Indonesia;
- tangani format rupiah;
- tangani tanggal;
- simpan raw value dan normalized value jika diperlukan.

SK Pemberian murni dan cutoff tetap masuk dalam kategori SK Pemberian apabila struktur spreadsheet memang membedakan keduanya.

Jangan menggandakan total dengan menjumlahkan kolom yang sebenarnya sudah merupakan total akhir.

### Sheet `REKAP PROGRESS`

- gunakan hanya blok alokasi/pagu yang sesuai tahun;
- jangan mengambil angka dari blok lain yang kebetulan memiliki nama mirip;
- dukung pemilihan range/blok melalui Admin jika struktur sheet kompleks;
- tampilkan preview range yang digunakan.

Lakukan validasi silang:

- total realisasi dari `Pemberian`;
- dibandingkan dengan total kontrol pada `REKAP PROGRESS`;
- per jenjang;
- total keseluruhan;
- siswa;
- dana.

Jika berbeda, tampilkan:

```text
Status: Perlu Validasi
Selisih siswa: ...
Selisih dana: ...
```

Jangan menganggap sinkronisasi valid hanya karena API berhasil membaca sheet.

Jika struktur berubah:

- jangan menimpa snapshot valid terakhir;
- ubah status sumber menjadi Perlu Validasi;
- catat error;
- tampilkan notifikasi Admin.

---

## V. Spreadsheet Rencana Kegiatan

Seed sumber berikut:

```text
Jenis: activity_plan
Tahun awal: 2026
Spreadsheet ID: 16U0Zv9lHXr41S1oiXdf1m0xt2K1bZiN6neLz5lCbO98
Sheet: Sheet1
```

Gunakan proses mapping yang sama:

- deteksi header;
- preview;
- mapping fleksibel;
- validasi;
- konfirmasi sebelum aktif.

Data kegiatan minimal harus dapat mewakili jika tersedia:

- tahun;
- judul kegiatan;
- tanggal mulai;
- tanggal selesai;
- waktu mulai;
- waktu selesai;
- `all_day`;
- lokasi;
- kategori;
- PIC;
- peserta;
- status;
- keterangan;
- link meeting;
- link dokumen;
- `source_row_key`.

Jika hanya ada satu tanggal:

```text
tanggal selesai = tanggal mulai
```

Jika tidak ada waktu:

```text
all_day = true
```

Jika PIC pada spreadsheet cocok dengan nama lengkap atau tag pegawai, hubungkan ke `employee_id`.

Jika tidak cocok:

- jangan menghapus nama dari sumber;
- simpan sebagai PIC eksternal/unmatched;
- tampilkan peringatan mapping pada Admin.

---

## W. Menu Rencana Kegiatan

Tambahkan menu Rencana Kegiatan untuk USER dan ADMIN.

Claude bebas memilih pola tampilan yang paling mudah dipahami staf dan pimpinan.

Jangan dipaksa hanya menjadi kalender bulanan.

Gunakan desain hybrid yang cocok untuk TV dan desktop, misalnya:

- ringkasan Hari Ini;
- kegiatan terdekat;
- tujuh hari ke depan;
- kalender bulanan;
- daftar kronologis;
- timeline tahunan;
- ringkasan per bulan.

Boleh menyediakan pilihan view:

- Ringkasan;
- Kalender;
- Daftar;
- Timeline;
- Tahunan.

Default view harus memudahkan pimpinan melihat:

- kegiatan hari ini;
- kegiatan terdekat;
- bulan aktif;
- status kegiatan;
- PIC;
- lokasi.

Fitur minimal:

- pemilih tahun;
- pemilih bulan;
- pencarian;
- filter kategori;
- filter PIC;
- filter status;
- detail kegiatan;
- lokasi;
- link;
- catatan;
- sumber spreadsheet;
- terakhir sinkron;
- status sinkronisasi.

Status kegiatan minimal:

- Rencana;
- Terjadwal;
- Berlangsung;
- Selesai;
- Ditunda;
- Dibatalkan.

Tampilan harus:

- jelas di TV;
- nyaman di desktop;
- responsif di tablet/mobile;
- tidak terlalu padat;
- memiliki focus state;
- mendukung D-pad;
- mendukung touch.

Data utama tidak diedit melalui aplikasi.

Jika data perlu diperbaiki, pengguna memperbaikinya di spreadsheet.

---

## X. Sinkronisasi Near Real-Time

Spreadsheet adalah sumber data utama.

Supabase berfungsi sebagai:

- cache;
- snapshot;
- histori;
- validasi;
- sumber Realtime frontend;
- fallback jika Google Sheets tidak dapat dibaca.

Alur:

```text
Google Sheets
→ webhook/API sinkronisasi
→ validasi
→ Supabase
→ Supabase Realtime
→ Dashboard dan Rencana Kegiatan
```

Buat dua metode:

### 1. Webhook Langsung

Google Apps Script installable trigger mengirim pemberitahuan ketika spreadsheet berubah.

### 2. Sinkronisasi Cadangan

- tombol Sinkronkan Sekarang;
- scheduled reconciliation/cron;
- interval dapat dikonfigurasi.

Buat endpoint webhook aman.

Gunakan:

```env
GOOGLE_WEBHOOK_SECRET=
```

Webhook harus:

- memverifikasi secret;
- menolak request tidak sah;
- tidak mempercayai payload mentah;
- membaca ulang baris/range yang relevan;
- idempotent;
- tidak membuat duplikasi;
- mencatat sync run;
- mencatat error;
- mempertahankan last valid snapshot.

Buat template Apps Script yang siap dipasang.

Sediakan file seperti:

```text
google-apps-script/Code.gs
```

Sertakan dokumentasi:

- memasang Apps Script;
- mengatur webhook URL;
- mengisi secret;
- membuat installable trigger;
- mengetes webhook;
- memindahkan trigger ketika link spreadsheet berganti.

Gunakan `source_row_key` yang stabil.

Jika sheet tidak memiliki ID baris, buat fingerprint dari kombinasi nilai stabil dan simpan dengan hati-hati.

Frontend harus menerima Supabase Realtime tanpa reload halaman.

---

## Y. Kondisi Gagal dan Fallback

Jika Google Sheets tidak dapat diakses:

- tampilkan snapshot valid terakhir;
- tampilkan status sinkronisasi gagal;
- Dashboard tidak boleh kosong;
- Rencana Kegiatan tidak boleh crash.

Jika mapping berubah:

- hentikan penimpaan data;
- gunakan snapshot valid terakhir;
- tandai Perlu Validasi.

Jika environment belum lengkap:

- aplikasi tetap build;
- halaman tetap dapat dibuka;
- integrasi tampil sebagai belum dikonfigurasi.

Jika data kosong:

- tampilkan empty state yang jelas;
- jangan tampilkan angka mock production.

Jika API gagal:

- jangan tampilkan stack trace;
- log error server dengan aman;
- tampilkan pesan pengguna yang singkat.

---

## Z. File dan Dokumentasi yang Harus Disiapkan

Siapkan atau perbarui:

### 1. `.env.example`

Minimal:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_TOKEN_ENCRYPTION_KEY=
GOOGLE_WEBHOOK_SECRET=

NEXT_PUBLIC_APP_URL=
```

### 2. Migration Supabase

### 3. Seed pegawai

### 4. Seed metadata sumber spreadsheet 2026

### 5. Google Apps Script template

### 6. Dokumentasi setup Supabase

### 7. Dokumentasi setup Google OAuth

### 8. Dokumentasi setup Google Sheets

### 9. Dokumentasi migration

### 10. Dokumentasi local development

### 11. Dokumentasi deployment Vercel

### 12. Dokumentasi callback URI lokal dan production

### 13. Dokumentasi membuat akun USER dan ADMIN tanpa menyimpan password di Git

Gunakan struktur dokumentasi yang jelas, misalnya:

```text
docs/SETUP-SUPABASE.md
docs/SETUP-GOOGLE-OAUTH.md
docs/SETUP-GOOGLE-SHEETS.md
docs/SETUP-USERS.md
docs/DEPLOY-VERCEL.md
```

---

## AA. Keamanan

Pastikan:

- secret tidak pernah berada di frontend;
- secret tidak masuk Git;
- token terenkripsi;
- service role hanya server;
- RLS aktif;
- route Admin dilindungi;
- role tidak dipercaya dari client;
- webhook menggunakan secret;
- input spreadsheet divalidasi;
- HTML dari spreadsheet tidak dirender mentah;
- URL divalidasi;
- attachment mengikuti aturan keamanan yang sudah ada;
- audit tidak menyimpan password/token;
- log tidak menyimpan credential.

---

## AB. Aksesibilitas

Pastikan:

- semantic HTML;
- label input;
- focus visible;
- keyboard support;
- D-pad support;
- aria-label untuk icon;
- kontras cukup;
- tidak hanya menggunakan warna untuk status;
- modal focus trap;
- Escape/Back menutup modal;
- `prefers-reduced-motion`;
- text scaling tidak merusak layout.

---

## AC. Pengujian Wajib

Setelah implementasi selesai, jalankan:

- lint;
- type-check;
- unit test;
- integration test;
- E2E jika tersedia;
- production build.

Perbaiki seluruh error sebelum menyatakan selesai.

Uji minimal:

1. Login USER.
2. Login ADMIN.
3. Username/password salah.
4. Session persistence.
5. Route guard.
6. USER tidak dapat membuka Admin.
7. Login tanpa pemilih role.
8. Sidebar expanded.
9. Sidebar compact.
10. Sidebar hidden.
11. Tombol membuka sidebar kembali.
12. Mobile bottom navigation.
13. Android TV focus navigation.
14. D-pad antar menu.
15. D-pad Board.
16. Enter/OK.
17. Back/Escape.
18. Admin Hub card.
19. Semua modul Admin dapat dibuka.
20. Tidak ada tombol Admin yang mati.
21. Kondisi tanpa Supabase env.
22. Kondisi tanpa Google env.
23. OAuth status.
24. Spreadsheet tidak dapat diakses.
25. Mapping belum lengkap.
26. Preview spreadsheet.
27. Sinkronisasi manual.
28. Webhook tidak sah ditolak.
29. Sinkronisasi idempotent.
30. Realtime update.
31. Snapshot terakhir tetap tampil saat gagal.
32. PIP data tidak mengandung data pribadi siswa.
33. Rencana Kegiatan tahun/bulan/filter.
34. Seed 25 pegawai.
35. Tag Board satu kata.
36. Tag Muhammad Lazuardy Kamil tampil sebagai `Kamil`.
37. Soft delete.
38. Restore.
39. Audit actor pegawai.
40. Production build.

---

## AD. Output Akhir Claude

Setelah seluruh pekerjaan selesai, tampilkan laporan singkat dan faktual:

1. Fitur yang selesai.
2. UI/UX yang diperbarui.
3. Asset yang dibuat.
4. File utama yang diubah.
5. Migration yang dibuat atau diperbarui.
6. Tabel Supabase yang digunakan.
7. Seed pegawai.
8. Sumber spreadsheet yang disiapkan.
9. Environment variable yang harus diisi.
10. Callback URL lokal.
11. Callback URL production yang harus didaftarkan.
12. Langkah menjalankan migration.
13. Langkah membuat akun USER dan ADMIN.
14. Langkah menghubungkan Google.
15. Langkah memasang Apps Script.
16. Langkah tes sinkronisasi.
17. Hasil lint.
18. Hasil type-check.
19. Hasil test.
20. Hasil production build.
21. Hal yang masih memerlukan credential manual.

Jangan mengklaim berhasil apabila test atau build masih gagal.

Jangan push ke GitHub.

Jangan deploy ke Vercel.

Berhenti hanya apabila benar-benar membutuhkan credential rahasia untuk melakukan pengujian integrasi langsung. Walaupun credential belum tersedia, seluruh struktur, UI, route, migration, empty state, dokumentasi, dan kode integrasi harus tetap diselesaikan.

---

## Prompt Eksekusi Pendek

Setelah file ini disimpan di folder `Docs`, jalankan Claude Code/Fable dengan prompt berikut:

```text
Baca seluruh repository dan seluruh dokumen di folder `Docs`.

Fokus utama pekerjaan ini adalah:

`Docs/09-FINAL-REVISION-INTEGRATION.md`

Implementasikan seluruh persyaratan dalam dokumen tersebut dari kondisi aplikasi saat ini.

Jangan membuat ulang proyek, jangan mengganti stack, jangan mengulang fitur yang sudah selesai, dan jangan merusak fungsi yang sudah berjalan.

Kerjakan seluruh revisi UI/UX, Admin Hub, login terpadu, Supabase, autentikasi, Google OAuth, integrasi spreadsheet, Rencana Kegiatan, seed pegawai, realtime, Android TV, dan pengujian sampai selesai.

Gunakan repository saat ini sebagai dasar. Buat todo internal dan lanjutkan otomatis tanpa menunggu persetujuan per tahap.

Jangan push ke GitHub dan jangan deploy ke Vercel.

Setelah selesai, jalankan lint, type-check, test, dan production build. Perbaiki seluruh error sebelum menyatakan selesai.

Berhenti hanya apabila benar-benar membutuhkan credential rahasia untuk pengujian langsung.
```

## Prompt Lanjutan Jika Session Limit

```text
Lanjutkan implementasi berdasarkan:

`Docs/09-FINAL-REVISION-INTEGRATION.md`

Baca kondisi repository dan todo yang tersisa. Jangan ulangi bagian yang sudah selesai, jangan reset perubahan, dan jangan membuat ulang aplikasi.

Selesaikan seluruh persyaratan yang belum terpenuhi, kemudian jalankan lint, type-check, test, dan production build.

Jangan push dan jangan deploy.
```

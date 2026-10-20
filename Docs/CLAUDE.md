# CLAUDE.md — Dashboard Pekerjaan PIP Puslapdik

## Mandat

Bangun aplikasi baru dari nol berdasarkan seluruh dokumen Markdown di folder `Docs`.

Dokumen mengatur fungsi aplikasi. Claude diberi kebebasan menentukan:

- UI/UX;
- layout;
- design system;
- warna;
- typography;
- komponen;
- library UI;
- animasi;
- responsive behavior;
- accessibility;
- struktur teknis yang paling tepat.

Kebebasan tersebut tidak boleh mengubah fungsi yang sudah ditetapkan.

## Sumber utama

Urutan prioritas:

1. `CLAUDE.md`
2. `MASTER-FUNCTIONAL-SPEC.md`
3. Dokumen fungsi terkait
4. Prompt fase yang sedang dijalankan

## Project baru

- Project dibangun dari nol.
- Jangan menggunakan atau menyalin implementasi Codex sebelumnya.
- Jangan mengaudit aplikasi lama.
- Jangan mempertahankan UI lama.
- Jangan mengimpor kode lama tanpa persetujuan.
- Struktur project harus bersih dan mudah dikembangkan.

## Navigasi terkunci

### User

- Dashboard
- Pekerjaan

### Admin

- Dashboard
- Pekerjaan
- Admin

Dilarang menambah menu utama:

- Penyaluran PIP;
- Aktivitas;
- Arsip;
- Kalender;
- Mode TV;
- menu lain yang tidak disetujui.

Aktivitas dan arsip harus berada di halaman terkait.

## Role terkunci

Hanya:

- `USER`
- `ADMIN`

Pimpinan dan staf menggunakan role User yang sama.

## Akun dan pegawai pelaku

- User menggunakan satu akun bersama.
- Admin menggunakan akun terpisah.
- Login User cukup satu kali per perangkat.
- Sesi User harus persisten.
- Setiap perubahan penting wajib mencatat pegawai pelaku.
- Pegawai pelaku dipilih dari master pegawai.
- PIN pegawai tidak diwajibkan pada versi awal.

## Hak User

User dapat:

- melihat Dashboard;
- melihat board;
- membuat seluruh pekerjaan;
- mengedit seluruh pekerjaan;
- mengubah PIC;
- memindahkan kartu;
- mengubah progres;
- mengelola checklist;
- menambahkan komentar, kendala, tindak lanjut, dan lampiran;
- mengubah judul board;
- menambah, mengubah, mengurutkan, dan menghapus step dengan pengamanan;
- mengarsipkan;
- memulihkan dari arsip.

User tidak dapat:

- menghapus permanen;
- mengelola data penyaluran;
- mengelola master pegawai;
- mengubah pengaturan sistem;
- melihat audit teknis lengkap.

## Dashboard

Dashboard harus menggabungkan:

- data penyaluran PIP;
- ringkasan pekerjaan;
- Perlu Perhatian;
- Fokus Hari Ini;
- Aktivitas terbaru.

Aturan:

- data penyaluran hanya agregat;
- tidak ada data individual siswa;
- ringkasan pekerjaan mengikuti step board secara dinamis;
- terlambat bukan step;
- tidak ada menu Penyaluran PIP terpisah.

## Board Pekerjaan

Wajib:

- Kanban horizontal;
- drag-and-drop;
- judul board editable;
- step editable;
- tambah, urutkan, dan hapus step dengan pengamanan;
- multi-PIC;
- pekerjaan jangka panjang dan pendek;
- checklist;
- progres;
- target;
- komentar;
- kendala;
- tindak lanjut;
- lampiran;
- riwayat;
- arsip sebagai tab/filter;
- detail pekerjaan yang lengkap;
- seluruh User dapat mengedit semua pekerjaan.

## Admin

Admin mengelola:

1. Data Penyaluran
2. Pegawai & PIC
3. Kategori & Label
4. Template Pekerjaan
5. Data Terhapus
6. Audit Log
7. Pengaturan

Semua berada dalam satu menu Admin.

## UI/UX

Claude memilih rekomendasi UI/UX terbaik dengan ketentuan:

- modern;
- profesional;
- mudah dipahami;
- tidak kaku;
- tidak generik;
- nyaman untuk kerja harian;
- terbaca pada TV;
- responsif;
- aksesibel;
- feedback jelas;
- tidak menghilangkan fungsi.

## Responsive targets

Wajib diuji:

- TV 1920×1080
- Desktop 1440×900
- Laptop 1366×768
- Tablet 768×1024
- Mobile 390×844

Tidak ada Mode TV khusus.

## Kualitas wajib

Sebelum menyatakan fase selesai:

- lint lulus;
- type-check lulus;
- test fase lulus;
- tidak ada error runtime;
- console browser bersih;
- tidak ada overflow;
- loading, empty, error, dan success state tersedia;
- akses keyboard tersedia;
- tidak ada secret;
- tidak ada data siswa individual;
- file yang masih mock dijelaskan;
- screenshot ukuran yang relevan tersedia.

## Cara kerja

- Kerjakan satu fase per prompt.
- Jangan melompat fase.
- Jangan membangun seluruh aplikasi sekaligus.
- Laporkan file yang dibuat atau diubah.
- Laporkan test.
- Berhenti setelah setiap fase dan tunggu persetujuan.

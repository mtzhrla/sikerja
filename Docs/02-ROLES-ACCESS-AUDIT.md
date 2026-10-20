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

# Work Board Functions

## Board

- Kanban horizontal.
- Drag-and-drop.
- Judul editable.
- Perubahan tanpa reload penuh.
- Search dan filter.
- Responsif.

## Impor Excel

- Admin dan pengguna yang berhak membuat pekerjaan dapat mengimpor `.xlsx` atau `.xlsm`. Workbook
  pekerjaan khusus memakai sheet `Data Pekerjaan` dan `Checklist`; berkas umum tetap dibaca dari
  sheet pertama.
- Baris pertama berisi header; pengguna dapat memetakan nama pekerjaan, deskripsi, step/status,
  tanggal mulai, tenggat, prioritas, jenis durasi, PIC, mode/progres, dan fokus hari ini.
- Checklist dipasangkan menurut nomor pekerjaan atau judul. Kelompok, item, dan status selesai
  dipertahankan; nama PIC harus cocok dengan pegawai aktif.
- Kategori dan label tidak diimpor. Jumlah pekerjaan di Dashboard mengikuti pekerjaan yang berhasil
  tersimpan setelah cache daftar pekerjaan diperbarui.
- Nama step pada file dicocokkan dengan step Board; baris tanpa step memakai step default yang
  dipilih.
- Semua baris divalidasi dan ditinjau sebelum disimpan. Satu baris tidak valid akan menahan proses
  impor sampai file diperbaiki.
- Jika proses simpan berhenti karena kegagalan layanan, baris yang sudah tersimpan tidak dibuat
  ulang saat proses dilanjutkan.

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

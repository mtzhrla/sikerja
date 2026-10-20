# Dashboard Functions

> Dashboard menampilkan ringkasan penyaluran PIP sekaligus visualisasi pekerjaan
> dan agenda tim. Data pekerjaan tetap terhubung ke board Pekerjaan; kalender
> dan jadwal juga membaca Rencana Kegiatan.

## Tujuan

Menampilkan kondisi utama penyaluran PIP dalam SATU layar tanpa scroll pada
TV 1920×1080, desktop 1440×900, dan laptop 1366×768 (tablet/mobile boleh
scroll). Satu informasi utama tampil satu kali — tanpa duplikasi.

## Sumber data (semua angka nyata — tanpa tren sintetis/dummy)

| Elemen | Sumber | Perhitungan |
|---|---|---|
| Kartu Alokasi (siswa + dana) | Angka tetap sesuai referensi desain | 19.482.627 siswa; Rp13.763.606.100.000 |
| Kartu SK Pemberian (siswa + dana) | Angka tetap sesuai referensi desain | 13.629.840 siswa; Rp9.463.746.600.000; 16 SK terbit |
| Kartu Progres Siswa dan Progres Dana | Angka tetap sesuai referensi desain | 69,96% siswa dan 68,76% dana |
| Project Progress dan Jumlah Task per Bulan | Board Pekerjaan (`tasks` + `steps`) | Komposisi step; grafik 2026 memakai angka awal sesuai rekap (Jan–Des: 2, 3, 6, 7, 4, 2, 1, 5, 8, 4, 2, 1), lalu pekerjaan setelah 45 data awal menambah bulan sesuai tanggal dibuat. Tahun lain dihitung langsung dari tanggal dibuat |
| Kalender dan Jadwal — Pekerjaan | Board Pekerjaan (`tasks` + `steps`) | Kalender menandai tenggat pada bulan dan tahun yang dipilih; jadwal menampilkan seluruh pekerjaan pada bulan pilihan atau tanggal yang diklik |
| Kalender dan Jadwal — Rencana Kegiatan | Data Rencana Kegiatan | Kalender memakai rentang kegiatan pada bulan/tahun yang ditampilkan; jadwal menampilkan kegiatan yang beririsan dengan bulan pilihan atau berlangsung pada tanggal yang diklik, lengkap dengan warna status |

Filter Tahun dan Bulan menyinkronkan kalender, grafik task, dan jadwal.
Memilih satu bulan menampilkan grafik bulan itu dan seluruh agenda pada bulan
tersebut; memilih tanggal pada kalender mempersempit jadwal ke tanggal itu.
Memilih "Semua Bulan" mengembalikan grafik ke tampilan setahun penuh.

Logika agregasi SK: `src/features/dashboard/lib.ts` (`skStats`) — teruji unit
untuk nomor duplikat, nomor kosong, tanggal invalid, satu SK banyak baris,
SK lintas jenjang, dan agregasi bulanan.

Angka empat kartu penyaluran dipatok sesuai gambar referensi dan tidak berubah
mengikuti filter tahun atau data snapshot. Font, ukuran, warna, ikon, dan
susunan kartu mengikuti gaya pada gambar tersebut.

Grafik task bulanan 2026 mempertahankan total awal 45 sesuai rekap yang
diminta. Pekerjaan baru setelah 45 data paling awal otomatis menambah bulan
berdasarkan `createdAt`; tahun selain 2026 dihitung seluruhnya dari data board.

## Aturan anti-duplikasi

- Nilai SK Pemberian dan progres ditampilkan pada kartu yang berbeda; rumus
  progres tetap menggunakan SK ÷ alokasi.
- Kolom "Sisa" tidak ada di tabel rekap (tersirat dari progres).
- Tooltip bukan satu-satunya tempat angka penting (label langsung + tabel).
- Tabel rekap adalah satu-satunya sumber angka detail per jenjang.

## Perhitungan jumlah SK

1. Normalisasi nomor: trim; pencocokan case-insensitive; format asli dipertahankan.
2. Nomor sama pada banyak baris = SATU SK (bukan jumlah baris).
3. SK lintas jenjang dihitung pada tiap jenjang tercatat; total global tetap
   menghitung nomor unik sekali (footnote muncul otomatis bila berbeda).
4. Satu nomor dengan beberapa tanggal → ditandai "perlu validasi tanggal";
   deterministik memakai tanggal valid paling awal.
5. Nomor kosong tidak dihitung dan tidak dibuatkan ID buatan.

## Status pembaruan data

`Sumber: <nama sumber>` · `Terakhir diperbarui: <tanggal & waktu> WIB` ·
`Sinkronisasi berhasil` (atau Perlu validasi / gagal — data valid terakhir).

## Filter

- tahun untuk ringkasan penyaluran dan grafik pekerjaan.

## Larangan

- tidak menampilkan data individual siswa;
- tidak membuat menu Penyaluran PIP terpisah;
- tidak menampilkan tren sintetis/snapshot historis buatan/angka interpolasi;
- tidak mengulang satu angka dengan judul berbeda;
- pertahankan integrasi data pekerjaan dan rencana kegiatan pada kalender/jadwal dashboard.

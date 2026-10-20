# Setup Akun Supabase Auth

Aplikasi memakai satu halaman login dengan NIP atau username. Role dibaca ulang
oleh server dari `account_roles`; pengguna tidak memilih role saat login.

Password default seluruh akun adalah `12345678`. Email Supabase Auth bersifat
internal dan tidak ditampilkan ke pengguna. Akun pegawai dipetakan ke email
`emp-<employee_id>@<AUTH_EMAIL_DOMAIN>`, sehingga NIP/username tidak menjadi
alamat email Auth.

## Akun Sistem

| Peran | Username | Password |
| --- | --- | --- |
| ADMIN | `admin` | `12345678` |
| DEMO (read-only) | `user` | `12345678` |

## Akun Pegawai

| Nama | Username | NIP alternatif login |
| --- | --- | --- |
| Rakean Sundayana | `rakean` | `198102082005011003` |
| Thoriq Rozaq Rosyadi | `thoriq` | `199412252022031015` |
| Tri Hesti Wahyudiati | `hesti` | `197008102007102001` |
| Erna Fitriawati Novi Hastuti | `erna` | `198309252008122002` |
| Yusna Yurita | `yusna` | `198209242014042001` |
| Sucianingsih | `sucianingsih` | `1990031020015042003` |
| Entin Jainingsih | `entin` | `196903111990022001` |
| Suyadi | `suyadi` | `196907151994031010` |
| Drajat Sujarwo | `drajat` | `198102032007011001` |
| Sirda Eldita | `sirda` | `199204152018012002` |
| Linda Eri Jayanti | `linda` | `199101032025212048` |
| Rendy Pamungkas | `rendy` | `199105062025211055` |
| Muhammad Nur | `nur` | `199503102025211034` |
| Muhammad Rifai | `rifai` | `199608292025211031` |
| Lina Fitriani | `lina` | `198602032025212037` |
| Mulkirom | `mulkirom` | — |
| Eka Dewi Pertiwi | `eka` | — |
| Santika Indah Pratiwi | `santika` | — |
| Vyja Tona Rapolo | `vyja` | — |
| Achmad Ulfi | `ulfi` | — |
| Dhani Prayudi | `dhani` | — |
| Sendi Irjansaputra | `sendi` | — |
| Fajar Robbyana | `fajar` | — |
| Ferry Widiarta | `ferry` | — |
| Muhammad Lazuardy Kamil | `kamil` | — |

## Provisioning Produksi

Isi `.env.local` atau environment proses dengan:

- `SUPABASE_URL` (atau `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` — hanya server/terminal, jangan `NEXT_PUBLIC_*`
- `AUTH_EMAIL_DOMAIN` bila tidak memakai default `pip.local`

Jalankan dari root repository:

```powershell
npm run auth:setup
```

Skrip `scripts/setup-auth-users.ps1` bersifat idempotent: memperbarui
username/NIP master pegawai, membuat atau memperbarui 27 user Auth, menyetel
role `ADMIN`/`DEMO`/`EMPLOYEE`, menonaktifkan kewajiban ganti password, dan
menjalankan query verifikasi. Password tidak dicetak serta tidak disimpan di
tabel aplikasi.

## Mode Lokal

Seed lokal menyediakan daftar akun yang sama. Hapus data situs/IndexedDB lama
bila browser masih memakai versi seed terdahulu.

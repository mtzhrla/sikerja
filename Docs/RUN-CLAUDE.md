# Prompt Awal Menjalankan Claude

Jalankan Claude Code dari folder utama:

```powershell
cd "C:\Users\kaemn\OneDrive\Desktop\PROJECTS\PIP-DASHBOARD"
claude
```

Setelah Claude terbuka, tempel prompt berikut:

---

Saya ingin membangun aplikasi Dashboard Pekerjaan PIP Puslapdik dari nol.

Seluruh dokumen spesifikasi berada di folder:

`Docs/`

Baca seluruh file Markdown di folder `Docs`, terutama:

- `Docs/CLAUDE.md`
- `Docs/MASTER-FUNCTIONAL-SPEC.md`
- `Docs/01-APP-FUNCTIONS.md`
- `Docs/02-ROLES-ACCESS-AUDIT.md`
- `Docs/03-DASHBOARD-FUNCTIONS.md`
- `Docs/04-WORK-BOARD-FUNCTIONS.md`
- `Docs/05-ADMIN-FUNCTIONS.md`
- `Docs/06-DATA-REALTIME-SECURITY.md`
- `Docs/07-BUILD-STEPS.md`
- `Docs/08-ACCEPTANCE-CRITERIA.md`

Project ini harus dibangun dari nol.

Jangan menggunakan, menyalin, atau melanjutkan implementasi Codex sebelumnya.

Dokumen menjadi source of truth untuk fungsi.

Claude bebas menentukan rekomendasi UI/UX terbaik, teknologi, layout, design system, library UI, dan struktur teknis, tetapi tidak boleh mengubah:

- role;
- navigasi;
- hak akses;
- fungsi Dashboard;
- fungsi board;
- fungsi Admin;
- aturan pegawai pelaku;
- aturan arsip dan penghapusan;
- aturan data agregat;
- fungsi real-time;
- acceptance criteria.

Konfirmasi bahwa seluruh dokumen sudah dibaca.

Jelaskan secara singkat:

1. tujuan aplikasi;
2. role;
3. menu User;
4. menu Admin;
5. fungsi Dashboard;
6. fungsi board;
7. fungsi Admin;
8. delapan fase pembangunan;
9. keputusan teknis awal yang direkomendasikan.

Untuk sekarang jangan coding.

Berhenti setelah ringkasan dan tunggu instruksi fase pertama.

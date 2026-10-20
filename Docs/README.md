# Dashboard Pekerjaan PIP Puslapdik

Paket dokumen untuk membangun aplikasi **dari nol** menggunakan Claude Code.

**Versi:** 3.0.0  
**Pembaruan:** 16 Juli 2026  
**Fokus dokumen:** fungsi aplikasi  
**UI/UX:** ditentukan Claude berdasarkan rekomendasi terbaik

## Prinsip

- Aplikasi dibangun sebagai project baru.
- Tidak menggunakan implementasi Codex atau aplikasi lama.
- Dokumen menjadi sumber utama fungsi.
- Claude bebas menentukan UI/UX terbaik.
- Claude tidak boleh mengubah fungsi, role, navigasi, akses, dan aturan data.

## Struktur

```text
PIP_DASHBOARD_CLAUDE_FROM_SCRATCH/
├── README.md
├── CLAUDE.md
├── RUN-CLAUDE.md
├── MASTER-FUNCTIONAL-SPEC.md
├── 01-APP-FUNCTIONS.md
├── 02-ROLES-ACCESS-AUDIT.md
├── 03-DASHBOARD-FUNCTIONS.md
├── 04-WORK-BOARD-FUNCTIONS.md
├── 05-ADMIN-FUNCTIONS.md
├── 06-DATA-REALTIME-SECURITY.md
├── 07-BUILD-STEPS.md
├── 08-ACCEPTANCE-CRITERIA.md
└── prompts/
    ├── 01-INITIALIZE-PROJECT.md
    ├── 02-UIUX-FOUNDATION.md
    ├── 03-LOGIN-ACCESS.md
    ├── 04-DASHBOARD.md
    ├── 05-WORK-BOARD.md
    ├── 06-ADMIN.md
    ├── 07-BACKEND-REALTIME.md
    └── 08-QA-DEPLOYMENT.md
```

## Cara mulai

1. Salin seluruh folder ke:
   `C:\Users\kaemn\OneDrive\Desktop\PROJECTS\PIP-DASHBOARD\Docs`
2. Buka terminal pada:
   `C:\Users\kaemn\OneDrive\Desktop\PROJECTS\PIP-DASHBOARD`
3. Jalankan Claude Code:
   `claude`
4. Tempel isi `RUN-CLAUDE.md`.
5. Setelah Claude membaca dokumen, jalankan prompt fase pertama:
   `prompts/01-INITIALIZE-PROJECT.md`
6. Jalankan fase berikutnya satu per satu setelah fase sebelumnya diperiksa.

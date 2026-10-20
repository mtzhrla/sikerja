# Catatan Keputusan Teknis

Dokumen ini mencatat keputusan teknis penting beserta alasannya. Fungsi aplikasi mengikuti
`Docs/` dan tidak diubah oleh keputusan di sini.

## D1 — SPA Vite + React, bukan framework SSR

**Keputusan:** Aplikasi dibangun sebagai SPA (Vite + React 19 + TypeScript strict), bukan Next.js/SSR.

**Alasan:**

- Aplikasi bersifat internal, realtime, dan berjalan lama di TV/desktop — tidak butuh SEO/SSR.
- Verifikasi role tetap **server-side** di lapisan backend (Supabase RLS / Postgres policy),
  bukan di client, sesuai `Docs/06-DATA-REALTIME-SECURITY.md`.
- Deploy menjadi statis dan sederhana (nginx/CDN/hosting statis apa pun).

## D2 — Arsitektur service adapter (`local` / `supabase`)

**Keputusan:** Seluruh fitur mengakses data hanya melalui interface `DataService`
(`src/services/types.ts`). Tersedia dua adapter: `local` (data di perangkat, realtime antar-tab
via BroadcastChannel) dan `supabase` (produksi).

**Alasan:**

- Kredensial backend belum tersedia — pembangunan dan pengujian penuh tetap berjalan pada mode
  `local` tanpa mengubah kode fitur.
- Mock data terpisah dari service produksi (aturan pengerjaan): seed hanya ada di adapter lokal.
- Perpindahan ke produksi = mengganti env `VITE_DATA_MODE`, bukan menulis ulang fitur.

## D3 — Supabase sebagai backend produksi

**Keputusan:** Postgres + RLS + Realtime + Storage + Auth dari Supabase (Fase 7).

**Alasan:** kebutuhan spesifikasi terpetakan 1:1 — realtime tanpa reload (Realtime),
role diverifikasi server-side (RLS), lampiran private + signed URL (Storage), audit trail
(tabel append-only + trigger), backup (pg_dump/PITR).

## D4 — Perilaku step lewat `kind`, bukan nama step

**Keputusan:** Step board memiliki properti `kind: NORMAL | BLOCKED | DONE`. Step default
 ber-`kind` BLOCKED dan "Done" ber-`kind` DONE.

**Alasan:** Spesifikasi mengharuskan nama step bebas diubah/ditambah oleh User tanpa hard-code,
sementara Dashboard perlu tahu pekerjaan mana yang "blocked" (Perlu Perhatian) dan "selesai"
(Aktivitas). Menandai *perilaku* pada step menjaga keduanya tetap dinamis. "Terlambat" tetap
bukan step — dihitung dari tenggat.

## D5 — Konflik via optimistic concurrency (kolom `version`)

**Keputusan:** Entitas yang bisa diedit bersama (task, step, board, settings, snapshot) memiliki
kolom `version`. Mutasi menyertakan `expectedVersion`; ketidakcocokan → `ConflictError` dan UI
menawarkan muat ulang. Tidak ada penimpaan diam-diam.

## D6 — Satu board kerja

**Keputusan:** Satu board tim (judul dapat diubah). Multi-board tidak dibuat karena tidak
diminta spesifikasi dan menambah kompleksitas navigasi yang dikunci.

## D7 — Library

- **@dnd-kit** untuk drag-and-drop: dukungan keyboard & screen reader (aksesibilitas board).
- **Recharts v2** untuk grafik: stabil dengan React 19; v3 masih baru — dievaluasi terpisah.
- **exceljs** untuk parsing Excel di browser: paket `xlsx` (SheetJS) versi npm tertinggal dan
  memiliki CVE yang tidak dipatch di npm; exceljs dirawat aktif.
- **date-fns + locale `id`** untuk tanggal Indonesia.
- **Plus Jakarta Sans** (self-host via Fontsource): terbaca baik pada TV, karakter modern
  profesional, mendukung angka tabular; tanpa permintaan CDN eksternal.

## D8 — Desain visual (Fase 2)

- **Identitas:** sidebar navy gelap (gradien slate-900 → brand-950) + konten terang slate-100 —
  kontras tinggi, berkarakter, nyaman dilihat lama di TV; area kerja tetap putih bersih.
- **Font:** Plus Jakarta Sans (variable, self-host). Angka statistik memakai `tabular-nums`.
- **Skala TV:** root font 16px → 18px pada layar ≥1880px; seluruh ukuran berbasis rem ikut
  membesar — memenuhi keterbacaan TV 1920×1080 tanpa membuat "Mode TV" khusus (dilarang spec).
- **Breakpoint navigasi:** ≥1024px sidebar; di bawahnya app bar + bottom tab navigation
  (ramah jempol di ponsel/tablet portrait).
- **Aksesibilitas dasar:** skip-link, focus ring 2px konsisten, landmark & label ARIA,
  `prefers-reduced-motion` dihormati, target sentuh ≥40px pada kontrol utama.
- **Feedback:** toast (sonner) untuk sukses/gagal, dialog konfirmasi berbasis promise untuk
  aksi berisiko, `EmptyState`/`ErrorState`/`LoadingBlock` seragam untuk state konten.
- **Tema:** satu tema terang yang dioptimalkan untuk TV & ruang kerja; dark mode tidak dibangun
  pada versi awal (menjaga cakupan QA), dapat ditambah kemudian karena token sudah terpusat.

## D9 — Backend produksi tanpa kredensial (Fase 7)

Kredensial Supabase belum tersedia saat pembangunan, sehingga:

- **Seluruh backend tetap dikerjakan penuh**: migration (skema + RLS + realtime +
  storage + fungsi RPC atomik), adapter produksi (`src/services/supabase/`),
  edge function `admin-actions` — namun **belum teruji terhadap server nyata**
  (checklist verifikasi ada di `DEPLOYMENT.md`).
- **Operasi rawan balapan dipindah ke server** sebagai fungsi Postgres atomik:
  `activate_snapshot` (satu aktif per scope), `move_task` (reorder konsisten),
  `delete_step_safe` (kartu wajib dipindah dulu).
- **Sesi perangkat** memakai tabel `device_sessions` (bukan ban akun) karena akun
  User dipakai bersama — mencabut satu perangkat tidak boleh menendang semua.
- **Ganti password akun User** butuh service role → edge function; service role
  key tidak pernah menyentuh frontend.
- **Mock data hanya hidup di adapter lokal**; mode `supabase` tidak menyentuh
  seed sama sekali. Mode dipilih lewat `VITE_DATA_MODE`.
- Feed "Aktivitas terbaru" di produksi membaca `audit_log`; RLS default membatasi
  baca ke Admin — kebijakan pelonggaran (kolom terbatas) didokumentasikan di
  DEPLOYMENT.md sebagai keputusan pemilik sistem.

## D10 — Temuan & perbaikan QA (Fase 8)

- **Aksesibilitas (axe, WCAG 2.1 AA):** token `slate-400`/`slate-500` dinaikkan satu
  step khusus aplikasi ini (kontras teks sekunder ≥4.5:1 di putih maupun latar
  slate-100/200); palet avatar dinaikkan ke level 700 (inisial putih AA); tanggal
  tenggat memakai step 700; toggle Aktif/Arsip diganti dari Radix Tabs tanpa
  content (aria-controls invalid) menjadi segmented button `aria-pressed`.
- **Overflow:** Chromium menyatukan overflow scroll-container board ke rentang gulir
  dokumen (area kosong dapat digulir pengguna). Fix: `overflow-x: hidden` pada
  `html`; seluruh scroll horizontal memang hanya di kontainer internal (kanban,
  tabel). Uji responsive menegaskan konten muat (`body.scrollWidth`) + dokumen
  terkunci dari gulir horizontal.
- **Keamanan dependensi:** `uuid` lama (transitif exceljs) dipaksa ke ^11 lewat npm
  `overrides` → `npm audit --omit=dev` bersih. Scan repo: tidak ada secret.
- **Performa:** route di-lazy-load; recharts (112 KB gzip) hanya ikut Dashboard;
  exceljs (271 KB gzip) hanya ikut halaman Admin; muatan awal ± 180 KB gzip
  JS + 12 KB CSS + font lokal. Animasi chart dimatikan (deterministik di TV).
- **Toast (sonner)** dikecualikan dari scan axe: transien, selalu pendamping aksi
  pengguna, style bawaan library.

## D11 — Bahasa antarmuka

Seluruh UI berbahasa Indonesia (pengguna: pimpinan & staf PIP Puslapdik). Kode, komentar, dan
identifier berbahasa Inggris/campuran seperlunya.

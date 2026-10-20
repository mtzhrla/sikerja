# Panduan Development

## Mode data lokal (default)

Tanpa kredensial backend, aplikasi berjalan penuh dengan **adapter lokal**:

- Data tersimpan di perangkat (localStorage; berkas lampiran di IndexedDB).
- Realtime antar-tab lewat BroadcastChannel — buka dua tab untuk melihat sinkronisasi.
- Data contoh (seed) dibuat otomatis pada akses pertama. Seluruh nama pegawai fiktif;
  data penyaluran hanya agregat.
- Badge **“Data lokal”** di header menandakan mode ini (transparansi bagian yang masih mock).

### Kredensial development (hanya mode lokal)

Password default **semua** akun mode lokal = `12345678`. Seed lokal otomatis
membuat akun untuk SETIAP pegawai, jadi setiap user bisa dites login memakai NIP
atau username + `12345678`.

| Akun                | Kredensial                                   |
| ------------------- | -------------------------------------------- |
| Admin               | username: `admin` · password: `12345678`     |
| Demo (read-only)    | username: `user` · password: `12345678`      |
| Pegawai (mana pun)  | NIP atau username (mis. `nur`) · `12345678`  |

> Kredensial ini hanya berlaku pada adapter lokal untuk development/demo dan
> **tidak pernah ditampilkan di UI**. Akun pegawai dapat mengganti passwordnya
> sendiri; Admin dapat meresetnya ke password default.
> Pada mode produksi (Supabase), akun dikelola di backend — lihat `DEPLOYMENT.md` (Fase 7).

### Reset data contoh

Hapus site data (localStorage + IndexedDB) dari DevTools, atau jalankan di console:

```js
localStorage.clear(); indexedDB.deleteDatabase('keyval-store'); location.reload();
```

## Perintah

| Perintah            | Fungsi                                        |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Server development (http://localhost:5173)    |
| `npm run test`      | Unit & integration test                       |
| `npm run e2e`       | E2E Playwright (build preview otomatis)       |
| `npm run lint`      | ESLint                                        |
| `npm run typecheck` | TypeScript strict                             |
| `npm run build`     | Build produksi                                |

### Screenshot multi-ukuran

```powershell
$env:SCREENSHOTS='1'; $env:SHOT_DIR='screenshots/current'
npx playwright test e2e/screenshots.spec.ts
```

### Galeri komponen UI

Hanya pada mode dev: buka `http://localhost:5173/dev/ui`.

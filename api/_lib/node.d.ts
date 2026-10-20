/**
 * Deklarasi minimum lingkungan Node untuk Vercel Functions.
 * tsconfig proyek memakai types: ["vite/client"], sehingga @types/node tidak
 * tersedia secara ambient — cukup `process.env` yang dibutuhkan modul api/.
 */
declare const process: {
  env: Record<string, string | undefined>;
};

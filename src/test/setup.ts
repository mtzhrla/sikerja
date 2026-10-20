import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// jsdom tidak menyediakan IndexedDB; mode lokal memakainya untuk isi berkas
// lampiran. Ganti dengan penyimpanan memori sederhana selama pengujian.
vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: (key: string) => Promise.resolve(store.get(key)),
    set: (key: string, value: unknown) => {
      store.set(key, value);
      return Promise.resolve();
    },
    del: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
});

// jsdom tidak menyediakan crypto.subtle — pakai webcrypto Node.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom belum mengimplementasikan URL.createObjectURL (dipakai unduhan lokal).
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => `blob:uji/${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => undefined;
}

// Tanpa vitest globals, auto-cleanup RTL tidak terpasang — pasang manual.
afterEach(() => {
  cleanup();
});

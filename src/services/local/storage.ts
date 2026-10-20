/**
 * Penyimpanan koleksi mode lokal di atas localStorage.
 * Nilai disimpan sebagai JSON per koleksi dengan cache in-memory.
 * Perubahan dari tab lain diterima lewat event `storage` → cache dibuang.
 */

const PREFIX = 'pipdash:v1:';

const cache = new Map<string, unknown>();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      cache.delete(e.key.slice(PREFIX.length));
    }
  });
}

export function readCollection<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    cache.set(key, parsed);
    return parsed;
  } catch {
    return fallback;
  }
}

export function writeCollection<T>(key: string, value: T): void {
  cache.set(key, value);
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function removeCollection(key: string): void {
  cache.delete(key);
  localStorage.removeItem(PREFIX + key);
}

export function listCollectionKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k.slice(PREFIX.length));
  }
  return keys;
}

/** Kosongkan seluruh data mode lokal (dipakai reset data contoh & impor backup). */
export function clearAllCollections(): void {
  for (const key of listCollectionKeys()) {
    removeCollection(key);
  }
  cache.clear();
}

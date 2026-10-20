/** Gabungkan class Tailwind secara kondisional. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/** Id unik pendek (cukup untuk entitas aplikasi ini). */
export function uid(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 13).replace('-', '')
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rand}` : rand;
}

/** Inisial dari nama, maksimal 2 huruf. Contoh: "Rina Wahyuni" → "RW". */
export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => /[a-zA-Z]/.test(p));
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

const FORBIDDEN_FILENAME_CHARS = new Set([...'<>:"/\\|?*']);

/** Sanitasi nama file lampiran: buang path, karakter kontrol, dan karakter berbahaya. */
export function sanitizeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, '').trim();
  let cleaned = '';
  for (const ch of base) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || FORBIDDEN_FILENAME_CHARS.has(ch)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'berkas';
}

/** Ekstensi file (lowercase, tanpa titik) atau string kosong. */
export function fileExtension(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name);
  return m?.[1]?.toLowerCase() ?? '';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pindahkan elemen array (immutable). */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  if (item !== undefined) copy.splice(to, 0, item);
  return copy;
}

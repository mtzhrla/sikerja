import type { SessionInfo } from '@/services/types';
import { readCollection, writeCollection } from './storage';
import { db } from './db';

const CURRENT = 'currentSessionId';

export function getCurrentSessionId(): string | null {
  return readCollection<string | null>(CURRENT, null);
}

export function setCurrentSessionId(id: string | null): void {
  writeCollection(CURRENT, id);
}

/** Sesi perangkat ini (tanpa validasi kedaluwarsa — validasi di AuthService). */
export function findCurrentSession(): SessionInfo | null {
  const id = getCurrentSessionId();
  if (!id) return null;
  return db.sessions().find((s) => s.id === id) ?? null;
}

/** Label perangkat ringkas dari user agent. */
export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Perangkat';
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Perangkat';
  return `${browser} · ${os}`;
}

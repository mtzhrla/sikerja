/**
 * Konstanta organisasi.
 *
 * Seluruh pegawai aplikasi ini berada pada satu unit kerja. Nilai baku dipakai
 * bersama oleh seed lokal, adapter Supabase, dan form Admin agar tidak muncul
 * variasi penulisan ("PIP", "Puslapdik", "Tim PIP", …).
 */

/** Satu-satunya nilai baku Unit/Tim pegawai. */
export const DEFAULT_TEAM = 'PIP Puslapdik';

/** Rapikan nilai Unit/Tim: kosong → nilai baku. */
export function normalizeTeam(team: string | null | undefined): string {
  return team?.trim() || DEFAULT_TEAM;
}

/** Kebijakan password aplikasi — logika murni, dipakai UI & unit test. */

/** Password sementara yang dibagikan Admin — wajib diganti pada login pertama. */
export const TEMP_PASSWORD = '12345678';

/**
 * Validasi password baru.
 * @returns pesan kesalahan, atau null bila password memenuhi syarat.
 */
export function validatePassword(next: string, confirm: string): string | null {
  if (next.length < 8) return 'Password baru minimal 8 karakter.';
  if (next === TEMP_PASSWORD) {
    return 'Password baru tidak boleh sama dengan password sementara.';
  }
  if (next !== confirm) return 'Konfirmasi password tidak sama.';
  return null;
}

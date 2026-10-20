/**
 * Path route aplikasi.
 *
 * Menu sidebar terkunci pada 5 entri pertama (§G). `profilSaya` & `profilPegawai`
 * SENGAJA bukan menu: dibuka lewat avatar header dan foto/nama pegawai.
 */
export const ROUTES = {
  login: '/login',
  dashboard: '/dashboard',
  pekerjaan: '/pekerjaan',
  rencana: '/rencana-kegiatan',
  pegawai: '/daftar-pegawai',
  admin: '/admin',
  profilSaya: '/profil-saya',
  profilPegawai: '/pegawai',
} as const;

/** Tautan ke profil seorang pegawai. */
export function employeeProfilePath(employeeId: string): string {
  return `${ROUTES.profilPegawai}/${employeeId}`;
}

export type AppRoute = (typeof ROUTES)[keyof typeof ROUTES];

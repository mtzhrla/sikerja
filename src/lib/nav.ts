import {
  CalendarRange,
  LayoutDashboard,
  ShieldCheck,
  SquareKanban,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AccountType } from '@/services/types';
import { ROUTES } from './routes';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Jenis akun yang boleh melihat menu ini. */
  roles: AccountType[];
}

const SEMUA: AccountType[] = ['EMPLOYEE', 'DEMO', 'ADMIN'];

/**
 * Menu utama tetap ringkas (spesifikasi §G):
 * Dashboard · Pekerjaan · Rencana Kegiatan · Daftar Pegawai (+ Admin untuk ADMIN).
 *
 * Profil pribadi dibuka lewat avatar pada header, notifikasi lewat ikon lonceng —
 * keduanya SENGAJA tidak menjadi menu sidebar.
 */
export const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.dashboard, label: 'Dashboard', icon: LayoutDashboard, roles: SEMUA },
  { to: ROUTES.pekerjaan, label: 'Pekerjaan', icon: SquareKanban, roles: SEMUA },
  { to: ROUTES.rencana, label: 'Rencana Kegiatan', icon: CalendarRange, roles: SEMUA },
  { to: ROUTES.pegawai, label: 'Daftar Pegawai', icon: Users, roles: SEMUA },
  { to: ROUTES.admin, label: 'Admin', icon: ShieldCheck, roles: ['ADMIN'] },
];

export function navItemsForRole(role: AccountType | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

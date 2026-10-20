import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import {
  ArrowLeft,
  ChevronRight,
  FileClock,
  Settings,
  Table2,
  Trash2,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { getDataService } from '@/services';
import { useEmployees, useSources } from '@/hooks/queries';
import { useSessionStore } from '@/features/auth/session-store';
import { AccountsSection } from './sections/AccountsSection';
import { AuditSection } from './sections/AuditSection';
import { EmployeesSection } from './sections/EmployeesSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { SettingsSection } from './sections/SettingsSection';
import { TrashSection } from './sections/TrashSection';

interface ModuleDef {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Warna icon container (gradient). */
  iconClass: string;
  element: React.ReactNode;
  /** Jika true, hanya tampil & dapat diakses oleh role ADMIN. */
  adminOnly?: boolean;
}

/**
 * Pusat Admin (Docs/09 §L) — model Admin App Launcher:
 * satu menu "Admin" pada sidebar; di dalamnya card besar per modul,
 * bukan dropdown/daftar submenu di sisi konten.
 */
const MODULES: ModuleDef[] = [
  {
    path: 'integrasi',
    label: 'Integrasi Data',
    description: 'Hubungkan akun Google dan kelola sumber spreadsheet.',
    icon: Table2,
    iconClass: 'from-emerald-500 to-cyan-500',
    element: <IntegrationsSection />,
  },
  {
    path: 'pegawai',
    label: 'Pegawai',
    description: 'Kelola data pegawai, tag board, jabatan, dan foto profil.',
    icon: Users,
    iconClass: 'from-sky-500 to-blue-600',
    element: <EmployeesSection />,
  },
  {
    path: 'pengguna',
    label: 'Pengguna & Akses',
    description:
      'Buat akun pegawai, atur username, tingkat Pimpinan/Staf, dan reset password.',
    icon: UsersRound,
    iconClass: 'from-indigo-500 to-violet-600',
    element: <AccountsSection />,
  },

  {
    path: 'data-terhapus',
    label: 'Data Terhapus',
    description: 'Pulihkan data yang terhapus, atau hapus permanen bila sudah tidak diperlukan.',
    icon: Trash2,
    iconClass: 'from-rose-500 to-orange-500',
    element: <TrashSection />,
    adminOnly: true,
  },
  {
    path: 'audit',
    label: 'Riwayat Aktivitas',
    description: 'Lihat aktivitas penting yang dilakukan melalui aplikasi.',
    icon: FileClock,
    iconClass: 'from-amber-500 to-orange-500',
    element: <AuditSection />,
    adminOnly: true,
  },
  {
    path: 'pengaturan',
    label: 'Pengaturan Aplikasi',
    description: 'Kelola tahun aktif dan preferensi aplikasi.',
    icon: Settings,
    iconClass: 'from-slate-500 to-slate-700',
    element: <SettingsSection />,
    adminOnly: true,
  },
];

/** Jumlah aktivitas audit hari ini (untuk card Audit Log). */
function useAuditTodayCount() {
  return useQuery({
    queryKey: ['audit', 'today-count'] as const,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { total } = await getDataService().audit.list({ dateFrom: today, limit: 1 });
      return total;
    },
  });
}

function AdminHub({ modules }: { modules: ModuleDef[] }) {
  const { data: employees } = useEmployees(true);
  const { data: sources } = useSources({ includeInactive: true });
  const { data: auditToday } = useAuditTodayCount();

  const activeEmployees = (employees ?? []).filter((e) => e.active).length;
  const activeSources = (sources ?? []).filter((s) => s.isActive && !s.deletedAt);
  const lastSync = activeSources
    .map((s) => s.lastSyncedAt)
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1);
  const syncError = activeSources.some(
    (s) => s.lastSyncStatus === 'GAGAL' || s.lastSyncStatus === 'PERLU_VALIDASI',
  );

  const statusFor = (path: string): { text: string; tone?: 'warn' } | null => {
    switch (path) {
      case 'integrasi':
        return {
          text: syncError
            ? 'Ada sumber perlu perhatian'
            : `${activeSources.length} sumber aktif${lastSync ? ` · sinkron ${formatRelative(lastSync)}` : ''}`,
          ...(syncError ? { tone: 'warn' as const } : {}),
        };
      case 'pegawai':
        return { text: `${activeEmployees} pegawai aktif` };
      case 'audit':
        return { text: `${auditToday ?? 0} aktivitas hari ini` };
      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in-up">
      <div className="mb-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Pusat Admin</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Pilih modul untuk mengelola data dan konfigurasi aplikasi.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {modules.map((mod) => {
          const status = statusFor(mod.path);
          return (
            <Link
              key={mod.path}
              to={mod.path}
              className="liftable pressable group flex min-h-32 flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-(--shadow-card)"
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    'inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                    mod.iconClass,
                  )}
                >
                  <mod.icon className="size-5.5" aria-hidden />
                </span>
                <ChevronRight
                  className="size-5 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500"
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">{mod.label}</p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                {mod.description}
              </p>
              {status && (
                <p
                  className={cn(
                    'mt-auto pt-2 text-[11px] font-semibold',
                    status.tone === 'warn' ? 'text-warning-600' : 'text-brand-700',
                  )}
                >
                  {status.text}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Bingkai modul: breadcrumb "Admin › Modul" + tombol kembali ke Pusat Admin. */
function ModuleFrame({ mod }: { mod: ModuleDef }) {
  return (
    <div className="animate-fade-in-up">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to=".."
          relative="route"
          className="pressable inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm hover:bg-brand-50 hover:text-brand-700"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Pusat Admin
        </Link>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
          <Link to=".." relative="route" className="font-semibold text-slate-400 hover:text-brand-700">
            Admin
          </Link>
          <ChevronRight className="size-4 text-slate-300" aria-hidden />
          <span className="font-bold text-slate-800">{mod.label}</span>
        </nav>
      </div>
      {mod.element}
    </div>
  );
}

export default function AdminPage() {
  const location = useLocation();
  const { role } = useSessionStore();

  const visibleModules = MODULES.filter((mod) => !mod.adminOnly || role === 'ADMIN');

  // Redirect path lama (pra-Pusat Admin) agar tautan tersimpan tetap hidup.
  const legacy: Record<string, string> = {
    penyaluran: 'integrasi',
    'kategori-label': 'board',
    template: 'board',
  };
  const seg = location.pathname.split('/')[2] ?? '';
  const legacyTarget = legacy[seg];

  return (
    <Routes>
      <Route index element={<AdminHub modules={visibleModules} />} />
      {visibleModules.map((mod) => (
        <Route key={mod.path} path={mod.path} element={<ModuleFrame mod={mod} />} />
      ))}
      <Route
        path="*"
        element={<Navigate to={legacyTarget ?? ''} replace />}
      />
    </Routes>
  );
}

import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { ShieldX } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { ROUTES } from '@/lib/routes';
import { useSessionStore } from './session-store';

function FullPageLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-100">
      <Spinner label="Memeriksa sesi" />
      <p className="text-sm font-medium text-slate-500">Memeriksa sesi…</p>
    </div>
  );
}

/** Muat sesi sekali di awal aplikasi. */
export function SessionBoot({ children }: { children: ReactNode }) {
  const { status, init } = useSessionStore();
  useEffect(() => {
    void init();
  }, [init]);
  if (status === 'loading') return <FullPageLoading />;
  return <>{children}</>;
}

/** Halaman butuh sesi; tanpa sesi diarahkan ke login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, status } = useSessionStore();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoading />;
  if (!session) {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}

/** State tidak berwenang — ditampilkan bila User membuka area Admin. */
export function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-(--radius-card) bg-white px-6 py-16 text-center shadow-(--shadow-card)">
      <span className="mb-2 inline-flex size-14 items-center justify-center rounded-2xl bg-danger-50 text-danger-500">
        <ShieldX className="size-7" aria-hidden />
      </span>
      <h2 className="text-lg font-bold text-slate-900">Akses ditolak</h2>
      <p className="max-w-sm text-sm text-slate-500">
        Halaman Admin hanya dapat dibuka dengan akun Admin. Akun Tim tidak memiliki akses ini.
      </p>
      <Link
        to={ROUTES.dashboard}
        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}

/** Halaman khusus Admin. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { role } = useSessionStore();
  if (role !== 'ADMIN') return <AccessDeniedPage />;
  return <>{children}</>;
}

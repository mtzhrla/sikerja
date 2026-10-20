import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { RealtimeBridge } from '@/app/RealtimeBridge';
import { ConfirmProvider } from '@/components/feedback/confirm-dialog';
import { AppToaster } from '@/components/feedback/toaster';
import { AppShell } from '@/components/layout/AppShell';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipProvider } from '@/components/ui/tooltip';
import { ActorPickerDialog } from '@/features/auth/ActorPickerDialog';
import { RequireAdmin, RequireAuth, SessionBoot } from '@/features/auth/guards';
import { UserMenu } from '@/features/auth/UserMenu';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useSessionStore } from '@/features/auth/session-store';
import { useAppSettings, useEmployees } from '@/hooks/queries';
import { ROUTES } from '@/lib/routes';
import { getDataService } from '@/services';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'));
const BoardPage = lazy(() => import('@/features/board/BoardPage'));
const PlanPage = lazy(() => import('@/features/plan/PlanPage'));
const EmployeesPage = lazy(() => import('@/features/employees/EmployeesPage'));
const ProfilePage = lazy(() => import('@/features/employees/ProfilePage'));
const AdminPage = lazy(() => import('@/features/admin/AdminPage'));
const UiGalleryPage = import.meta.env.DEV
  ? lazy(() => import('@/features/dev/UiGalleryPage'))
  : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
      Memuat…
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-bold">Halaman tidak ditemukan</h1>
      <p className="text-slate-600">Alamat yang Anda buka tidak tersedia.</p>
      <a href={ROUTES.dashboard} className="font-semibold text-brand-700 underline">
        Kembali ke Dashboard
      </a>
    </main>
  );
}

function DataModeBadge() {
  if (getDataService().mode !== 'local') return null;
  return (
    <Tooltip content="Mode demo tanpa backend — seluruh data tersimpan di perangkat ini dan tersinkron antar-tab.">
      <span>
        <Badge tone="warning">Data lokal</Badge>
      </span>
    </Tooltip>
  );
}

function ShellLayout() {
  const { role, session, actorId, accountEmployeeId, openActorPicker } = useSessionStore();
  const { data: settings } = useAppSettings();
  const { data: employees } = useEmployees(false);
  const promptedRef = useRef<string | null>(null);

  // Akun ADMIN bertindak atas nama pegawai pelaku: minta pilih bila belum ada.
  // Akun EMPLOYEE selalu bertindak atas namanya sendiri (tanpa dialog).
  useEffect(() => {
    if (!session || !employees || accountEmployeeId) return;
    if (role !== 'ADMIN') return;
    const valid = actorId !== null && employees.some((e) => e.id === actorId);
    if (!valid && promptedRef.current !== session.id) {
      promptedRef.current = session.id;
      openActorPicker();
    }
  }, [session, employees, actorId, accountEmployeeId, role, openActorPicker]);

  return (
    <AppShell
      role={role ?? 'DEMO'}
      appName={settings?.appName ?? 'Dashboard PIP'}
      logoDataUrl={settings?.logoDataUrl ?? null}
      headerExtra={
        <div className="flex items-center gap-2.5">
          <DataModeBadge />
          <NotificationBell />
          <UserMenu />
        </div>
      }
    >
      <Outlet />
      <ActorPickerDialog />
    </AppShell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ConfirmProvider>
            <AppToaster />
            <RealtimeBridge />
            <SessionBoot>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
                  <Route path={ROUTES.login} element={<LoginPage />} />
                  <Route
                    element={
                      <RequireAuth>
                        <ShellLayout />
                      </RequireAuth>
                    }
                  >
                    <Route path={ROUTES.dashboard} element={<DashboardPage />} />
                    <Route path={ROUTES.pekerjaan} element={<BoardPage />} />
                    <Route path={ROUTES.rencana} element={<PlanPage />} />
                    <Route path={ROUTES.pegawai} element={<EmployeesPage />} />
                    <Route path={ROUTES.profilSaya} element={<ProfilePage self />} />
                    <Route
                      path={`${ROUTES.profilPegawai}/:id`}
                      element={
                        <RequireAdmin>
                          <ProfilePage />
                        </RequireAdmin>
                      }
                    />
                    <Route path={`${ROUTES.admin}/*`} element={<AdminPage />} />
                  </Route>
                  {UiGalleryPage && <Route path="/dev/ui" element={<UiGalleryPage />} />}
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </SessionBoot>
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

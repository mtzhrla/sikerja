import { useState } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { notify } from '@/components/feedback/toaster';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { ROUTES } from '@/lib/routes';
import { useEmployeePhotos, useEmployees } from '@/hooks/queries';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { useSessionStore } from './session-store';

const ACCOUNT_LABEL: Record<string, string> = {
  ADMIN: 'Admin sistem',
  EMPLOYEE: 'Akun pegawai',
  DEMO: 'Akun demo · hanya lihat',
};

/**
 * Chip pengguna pada header (spesifikasi §O).
 * Menu: Profil Saya · Ganti Password · Keluar. Profil pribadi TIDAK menjadi
 * menu sidebar — hanya dapat diakses lewat avatar ini.
 */
export function UserMenu() {
  const { session, role, actorId, accountEmployeeId, logout } = useSessionStore();
  const { data: employees } = useEmployees(true);
  const { data: photos } = useEmployeePhotos(employees);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const navigate = useNavigate();

  if (!session) return null;

  const actor = employees?.find((e) => e.id === actorId) ?? null;
  const isEmployeeAccount = Boolean(accountEmployeeId);

  async function handleLogout() {
    await logout();
    notify.info('Anda telah keluar.');
    navigate(ROUTES.login, { replace: true });
  }

  return (
    <>
      <DropdownRoot>
        <DropdownTrigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pr-3 pl-1 shadow-sm transition-colors hover:border-brand-300"
            aria-label="Menu pengguna"
          >
            <Avatar employee={actor} size="md" src={photos?.[actor?.avatarPath ?? ''] ?? null} />
            <span className="hidden min-w-0 text-left sm:block">
              <span className="block max-w-32 truncate text-xs leading-tight font-bold text-slate-800">
                {actor ? actor.displayName : role === 'ADMIN' ? 'Admin' : 'Pengguna'}
              </span>
              <span className="block text-[10px] leading-tight font-semibold tracking-wide text-slate-400 uppercase">
                {role === 'ADMIN'
                  ? 'Admin'
                  : role === 'DEMO'
                    ? 'Demo'
                    : actor?.level === 'LEADER'
                      ? 'Pimpinan'
                      : 'Staf'}
              </span>
            </span>
          </button>
        </DropdownTrigger>
        <DropdownContent className="w-64">
          <DropdownLabel>
            {actor ? actor.fullName : role === 'ADMIN' ? 'Administrator sistem' : 'Peninjau'}
          </DropdownLabel>
          <div className="px-2.5 pb-2">
            <Badge tone={role === 'ADMIN' ? 'brand' : role === 'DEMO' ? 'warning' : 'neutral'}>
              {ACCOUNT_LABEL[role ?? 'DEMO']}
            </Badge>
          </div>
          <DropdownSeparator />
          {isEmployeeAccount && (
            <DropdownItem icon={<UserRound />} onSelect={() => navigate(ROUTES.profilSaya)}>
              Profil Saya
            </DropdownItem>
          )}
          {role !== 'DEMO' && (
            <DropdownItem icon={<KeyRound />} onSelect={() => setPasswordOpen(true)}>
              Ganti Password
            </DropdownItem>
          )}
          <DropdownItem
            icon={<RefreshCw />}
            onSelect={() => {
              window.location.reload();
            }}
          >
            Muat ulang data
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem danger icon={<LogOut />} onSelect={() => void handleLogout()}>
            Keluar
          </DropdownItem>
        </DropdownContent>
      </DropdownRoot>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItemsForRole } from '@/lib/nav';
import { Tooltip } from '@/components/ui/tooltip';
import type { Role } from '@/services/types';
import { useClock } from '@/hooks/useClock';
import { BrandMark } from './BrandMark';

/** Mode sidebar (Docs/09 §H) — preferensi disimpan per perangkat. */
export type SidebarState = 'expanded' | 'compact' | 'hidden';

const SIDEBAR_KEY = 'sidebar_state';

function readSidebarState(): SidebarState {
  try {
    const v = localStorage.getItem(SIDEBAR_KEY);
    return v === 'compact' || v === 'hidden' ? v : 'expanded';
  } catch {
    return 'expanded';
  }
}

/** Setelah lebar konten berubah, minta chart/board menghitung ulang ukuran. */
function notifyReflow() {
  window.setTimeout(() => window.dispatchEvent(new Event('resize')), 240);
}

interface AppShellProps {
  children: ReactNode;
  role: Role;
  appName?: string;
  logoDataUrl?: string | null;
  /** Slot kanan header (badge mode data, menu pengguna). */
  headerExtra?: ReactNode;
}

/**
 * Kerangka aplikasi (tema terang, Docs/09 §E–§I):
 * - ≥lg : sidebar terang di kiri dengan tiga mode (expanded/compact/hidden).
 * - <lg : app bar atas + bottom tab navigation.
 * Seluruh kontrol dapat dioperasikan keyboard/D-pad (fokus jelas, target besar).
 */
export function AppShell({
  children,
  role,
  appName = 'Dashboard PIP',
  logoDataUrl = null,
  headerExtra,
}: AppShellProps) {
  const items = navItemsForRole(role);
  const location = useLocation();
  const now = useClock();
  const [sidebar, setSidebar] = useState<SidebarState>(readSidebarState);

  const setSidebarState = useCallback((next: SidebarState) => {
    setSidebar(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // preferensi opsional — abaikan bila storage tidak tersedia
    }
    notifyReflow();
  }, []);

  useEffect(() => {
    notifyReflow();
  }, []);

  const active = items.find(
    (i) => location.pathname === i.to || location.pathname.startsWith(`${i.to}/`),
  );
  const compact = sidebar === 'compact';
  const hidden = sidebar === 'hidden';

  return (
    <div
      className={cn(
        'min-h-dvh transition-[padding] duration-200',
        !hidden && (compact ? 'lg:pl-20' : 'lg:pl-64'),
      )}
    >
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      {/* Sidebar — desktop/TV */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur transition-[width,transform] duration-200 lg:flex',
          compact ? 'w-20' : 'w-64',
          hidden && '-translate-x-full',
        )}
        aria-label="Navigasi utama"
        aria-hidden={hidden || undefined}
      >
        <div
          className={cn(
            'pt-4 pb-5',
            compact ? 'flex flex-col items-center gap-2 px-2' : 'flex items-center gap-3 px-4',
          )}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-2xl bg-(image:--gradient-brand-soft)">
            <BrandMark logoDataUrl={logoDataUrl} className="size-7" />
          </span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] leading-tight font-bold text-slate-900">{appName}</p>
              <p className="text-[11px] font-medium text-slate-500">Puslapdik · Kemendikdasmen</p>
            </div>
          )}
          {/* SATU-SATUNYA kontrol sidebar: expanded → compact → hidden → expanded.
              Saat hidden, kontrol yang sama muncul sebagai tombol melayang kiri-atas. */}
          <Tooltip content={compact ? 'Sembunyikan sidebar' : 'Perkecil sidebar'} side="right">
            <button
              type="button"
              onClick={() => setSidebarState(compact ? 'hidden' : 'compact')}
              aria-label={compact ? 'Sembunyikan sidebar' : 'Perkecil sidebar'}
              className="pressable inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 hover:bg-brand-50 hover:text-brand-700"
            >
              {compact ? (
                <PanelLeftOpen className="size-5 rotate-180" aria-hidden />
              ) : (
                <PanelLeftClose className="size-5" aria-hidden />
              )}
            </button>
          </Tooltip>
        </div>

        <nav className="flex-1 space-y-1.5 px-3" aria-label="Menu">
          {items.map((item) => {
            const link = (
              <NavLink
                key={item.to}
                to={item.to}
                title={compact ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'pressable group flex min-h-11 items-center gap-3 rounded-xl text-sm font-semibold',
                    compact ? 'justify-center px-0' : 'px-3',
                    isActive
                      ? 'bg-(image:--gradient-brand) text-white shadow-(--shadow-lift)'
                      : 'text-slate-500 hover:bg-brand-50 hover:text-brand-800',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      aria-hidden
                      className={cn(
                        'size-5 shrink-0 transition-colors',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-brand-600',
                      )}
                    />
                    {!compact && <span className="truncate">{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
            return compact ? (
              <Tooltip key={item.to} content={item.label} side="right">
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </nav>

        {/* Footer sidebar */}
        {!compact && (
          <p className="px-5 py-3 text-[10px] leading-tight text-slate-400">
            Program Indonesia Pintar
          </p>
        )}
      </aside>

      {/* Kontrol sidebar yang sama saat hidden — koordinat konsisten kiri-atas */}
      {hidden && (
        <Tooltip content="Tampilkan sidebar" side="right">
          <button
            type="button"
            onClick={() => setSidebarState('expanded')}
            aria-label="Tampilkan sidebar"
            className="pressable fixed top-3 left-3 z-50 hidden size-12 cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white/95 text-brand-700 shadow-(--shadow-card) hover:bg-brand-50 lg:inline-flex"
          >
            <PanelLeftOpen className="size-6" aria-hidden />
          </button>
        </Tooltip>
      )}

      {/* App bar — mobile/tablet */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200/70 bg-white/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <BrandMark logoDataUrl={logoDataUrl} className="size-8" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-bold text-slate-900">
            {active?.label ?? appName}
          </p>
          <p className="text-[11px] font-medium text-slate-500">{appName}</p>
        </div>
        {headerExtra}
      </header>

      {/* Header — desktop */}
      <header
        className={cn(
          'sticky top-0 z-30 hidden items-center justify-between gap-4 border-b border-slate-200/60 bg-(image:--gradient-header) px-8 py-3.5 backdrop-blur lg:flex',
          hidden && 'pl-20',
        )}
      >
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          {active?.label ?? appName}
        </h1>
        <div className="flex items-center gap-4">
          {/* Jam & tanggal — kontras dan mudah dibaca dari TV */}
          <div className="text-right leading-tight" aria-label="Waktu saat ini" role="timer">
            <p className="tnum text-xl font-extrabold tracking-tight text-slate-800 2xl:text-2xl">
              {format(now, 'HH.mm')}
            </p>
            <p className="text-[11px] font-semibold text-slate-500 2xl:text-xs">
              {format(now, 'EEEE, d MMMM yyyy', { locale: localeId })}
            </p>
          </div>
          {headerExtra}
        </div>
      </header>

      {/* Konten */}
      <main id="konten-utama" className="px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-6 lg:pb-10">
        {children}
      </main>

      {/* Bottom nav — mobile/tablet portrait */}
      <nav
        aria-label="Navigasi utama"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'pressable flex min-w-16 flex-col items-center gap-0.5 px-2 pt-2 pb-1.5 text-[11px] font-semibold',
                  isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-(image:--gradient-brand-soft)',
                    )}
                  >
                    <item.icon aria-hidden className="size-5" />
                  </span>
                  <span className="max-w-20 truncate">
                    {item.label === 'Rencana Kegiatan'
                      ? 'Rencana'
                      : item.label === 'Daftar Pegawai'
                        ? 'Pegawai'
                        : item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

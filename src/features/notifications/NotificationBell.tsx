import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  FileText,
  Flag,
  MessageSquare,
  Paperclip,
  ShieldAlert,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { formatRelative } from '@/lib/format';
import { ROUTES } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { getDataService } from '@/services';
import type { NotificationItem, NotificationType } from '@/services/types';
import { useEmployees, useNotifications, useUnreadNotificationCount } from '@/hooks/queries';
import { useSessionStore } from '@/features/auth/session-store';

/** Ikon per jenis aktivitas — membantu memindai daftar dengan cepat. */
const ICONS: Record<NotificationType, LucideIcon> = {
  TASK_ASSIGNED: Flag,
  TASK_DISPOSED: FileText,
  MEMBER_ADDED: UserPlus,
  MEMBER_REMOVED: UserMinus,
  PIC_CHANGED: Users,
  DUE_DATE_CHANGED: CalendarClock,
  STATUS_CHANGED: TrendingUp,
  PROGRESS_CHANGED: TrendingUp,
  TASK_BLOCKED: AlertTriangle,
  DUE_SOON: CalendarClock,
  OVERDUE: AlertTriangle,
  MENTIONED: MessageSquare,
  COMMENT_ADDED: MessageSquare,
  COMMENT_REPLY: MessageSquare,
  ATTACHMENT_ADDED: Paperclip,
  ATTACHMENT_VERSION: Paperclip,
  ATTACHMENT_DELETED: Paperclip,
  ATTACHMENT_RESTORED: Paperclip,
  PASSWORD_RESET: ShieldAlert,
};

const URGENT: NotificationType[] = ['OVERDUE', 'TASK_BLOCKED', 'PASSWORD_RESET'];

interface RowProps {
  item: NotificationItem;
  actorName: string | null;
  onOpen(item: NotificationItem): void;
}

function NotificationRow({ item, actorName, onOpen }: RowProps) {
  const Icon = ICONS[item.type] ?? Bell;
  const urgent = URGENT.includes(item.type);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          'pressable flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
          'hover:bg-brand-50/70 focus-visible:bg-brand-50',
          !item.readAt && 'bg-brand-50/40',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl',
            urgent ? 'bg-danger-50 text-danger-600' : 'bg-brand-50 text-brand-700',
          )}
        >
          <Icon className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-bold text-slate-900">{item.title}</span>
            {!item.readAt && (
              <span
                aria-label="Belum dibaca"
                className="size-2 shrink-0 rounded-full bg-brand-600"
              />
            )}
          </span>
          {item.body && (
            <span className="mt-0.5 block truncate text-sm text-slate-600">{item.body}</span>
          )}
          <span className="mt-1 block text-[11px] font-medium text-slate-400">
            {formatRelative(item.createdAt)}
            {actorName ? ` · oleh ${actorName}` : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Lonceng notifikasi pada header (spesifikasi §L).
 * Popup ringkas (maks. 8 terbaru) + modal "Lihat semua" — TIDAK menjadi menu
 * sidebar. Dapat ditutup dengan klik di luar, Esc, dan tombol Back (Android TV).
 */
export function NotificationBell() {
  const accountEmployeeId = useSessionStore((s) => s.accountEmployeeId);
  const enabled = Boolean(accountEmployeeId);
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [tab, setTab] = useState<'semua' | 'belum'>('semua');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const unreadQ = useUnreadNotificationCount(enabled);
  const listQ = useNotifications(false, enabled && (open || allOpen));
  const { data: employees } = useEmployees(true);

  const items = useMemo(() => listQ.data ?? [], [listQ.data]);
  const visible = tab === 'belum' ? items.filter((n) => !n.readAt) : items;
  const unread = unreadQ.data ?? 0;

  // Akun tanpa data pegawai (ADMIN/DEMO) tidak menerima notifikasi personal.
  if (!enabled) return null;

  function employeeName(id: string | null): string | null {
    if (!id) return null;
    return employees?.find((e) => e.id === id)?.displayName ?? null;
  }

  async function refresh() {
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'notifications' });
  }

  async function handleOpen(item: NotificationItem) {
    if (!item.readAt) {
      await getDataService().notifications.markRead(item.id);
      await refresh();
    }
    setOpen(false);
    setAllOpen(false);
    if (item.taskId) navigate(`${ROUTES.pekerjaan}?task=${item.taskId}`);
  }

  async function markAll() {
    await getDataService().notifications.markAllRead();
    await refresh();
  }

  const list = (rows: NotificationItem[], limit?: number) => (
    <ul className="space-y-0.5">
      {(limit ? rows.slice(0, limit) : rows).map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          actorName={employeeName(item.actorEmployeeId)}
          onOpen={(n) => void handleOpen(n)}
        />
      ))}
    </ul>
  );

  const tabs = (
    <div
      role="tablist"
      aria-label="Saringan notifikasi"
      className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1"
    >
      {(
        [
          { value: 'semua', label: 'Semua' },
          { value: 'belum', label: `Belum Dibaca${unread > 0 ? ` (${unread})` : ''}` },
        ] as const
      ).map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={tab === t.value}
          onClick={() => setTab(t.value)}
          className={cn(
            'pressable min-h-8 cursor-pointer rounded-lg px-2.5 text-xs font-semibold transition-colors',
            tab === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={
              unread > 0 ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'
            }
            className="pressable relative inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-brand-300 hover:text-brand-700"
          >
            <Bell className="size-5" aria-hidden />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-danger-500 px-1 text-[10px] leading-4 font-bold text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(23rem,calc(100vw-1.5rem))] p-0"
          aria-label="Notifikasi terbaru"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-bold text-slate-900">Notifikasi</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="pressable inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Tandai semua dibaca
              </button>
            )}
          </div>
          <div className="px-3 py-2">{tabs}</div>
          <div className="max-h-[min(24rem,60vh)] overflow-y-auto px-1.5 pb-1.5">
            {listQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner label="Memuat notifikasi" />
              </div>
            ) : visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-500">
                {tab === 'belum'
                  ? 'Semua notifikasi sudah dibaca.'
                  : 'Belum ada notifikasi.'}
              </p>
            ) : (
              list(visible, 8)
            )}
          </div>
          <div className="border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAllOpen(true);
              }}
              className="pressable inline-flex min-h-9 w-full cursor-pointer items-center justify-center rounded-lg text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              Lihat semua
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Modal
        open={allOpen}
        onOpenChange={setAllOpen}
        title="Semua notifikasi"
        description="Notifikasi terbaru untuk Anda."
        size="lg"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {tabs}
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markAll()}
              className="pressable inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <CheckCheck className="size-4" aria-hidden />
              Tandai semua dibaca
            </button>
          )}
        </div>
        {visible.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Belum ada notifikasi"
            description="Notifikasi muncul saat ada pekerjaan, komentar, atau lampiran yang melibatkan Anda."
          />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">{list(visible)}</div>
        )}
      </Modal>
    </>
  );
}

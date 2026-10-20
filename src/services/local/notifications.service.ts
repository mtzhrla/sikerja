import type { NotificationItem, NotificationService } from '@/services/types';
import { localBus } from './bus';
import { COL, db, ensureSeeded, nowISO } from './db';
import { currentViewer, requireSession } from './guard-util';

/**
 * Notifikasi per pengguna (mode lokal).
 * Hanya notifikasi milik pegawai yang sedang masuk yang dapat dibaca/ditandai —
 * cerminan RLS `notifications read own` / `notifications update own` di produksi.
 */
export const localNotifications: NotificationService = {
  async list(opts): Promise<NotificationItem[]> {
    await ensureSeeded();
    requireSession();
    const { employeeId } = currentViewer();
    if (!employeeId) return [];
    return db
      .notifications()
      .filter((n) => n.recipientEmployeeId === employeeId)
      .filter((n) => (opts?.unreadOnly ? !n.readAt : true))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, opts?.limit ?? 30);
  },

  async unreadCount(): Promise<number> {
    await ensureSeeded();
    requireSession();
    const { employeeId } = currentViewer();
    if (!employeeId) return 0;
    return db.notifications().filter((n) => n.recipientEmployeeId === employeeId && !n.readAt)
      .length;
  },

  async markRead(id): Promise<void> {
    await ensureSeeded();
    requireSession();
    const { employeeId } = currentViewer();
    if (!employeeId) return;
    db.write(
      COL.notifications,
      db
        .notifications()
        .map((n) =>
          n.id === id && n.recipientEmployeeId === employeeId && !n.readAt
            ? { ...n, readAt: nowISO() }
            : n,
        ),
    );
    localBus.emit({ topic: 'notifications' });
  },

  async markAllRead(): Promise<void> {
    await ensureSeeded();
    requireSession();
    const { employeeId } = currentViewer();
    if (!employeeId) return;
    db.write(
      COL.notifications,
      db
        .notifications()
        .map((n) =>
          n.recipientEmployeeId === employeeId && !n.readAt ? { ...n, readAt: nowISO() } : n,
        ),
    );
    localBus.emit({ topic: 'notifications' });
  },
};

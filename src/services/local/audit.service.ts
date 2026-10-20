import { ForbiddenError } from '@/services/errors';
import type {
  ActivityEvent,
  AuditEntry,
  AuditFilter,
  AuditReadService,
} from '@/services/types';
import { db, ensureSeeded } from './db';
import { requireSession } from './guard-util';

/** Proyeksikan entri audit menjadi peristiwa aktivitas ramah pengguna. */
export function toActivityEvent(entry: AuditEntry): ActivityEvent | null {
  if (!entry.success) return null;
  const base = {
    id: entry.id,
    at: entry.at,
    employeeId: entry.employeeId,
    taskId: entry.entityType === 'TASK' ? entry.entityId : null,
    title: entry.entityLabel ?? '',
    detail: null as string | null,
  };
  if (entry.entityType === 'TASK') {
    const after = (entry.after ?? {}) as Record<string, unknown>;
    const before = (entry.before ?? {}) as Record<string, unknown>;
    switch (entry.action) {
      case 'CREATE':
        return { ...base, type: 'TASK_CREATED' };
      case 'MOVE': {
        const from = typeof before.step === 'string' ? before.step : null;
        const to = typeof after.step === 'string' ? after.step : null;
        const detail = from && to ? `${from} → ${to}` : null;
        if (after.stepKind === 'DONE') {
          return { ...base, type: 'TASK_COMPLETED', detail };
        }
        return { ...base, type: 'TASK_MOVED', detail };
      }
      case 'UPDATE': {
        if ('manualProgress' in after || 'checklist' in after || 'progressMode' in after || 'progress' in after) {
          return { ...base, type: 'PROGRESS_CHANGED' };
        }
        if ('picMainId' in after || 'picIds' in after || 'pic' in after) {
          return { ...base, type: 'PIC_CHANGED' };
        }
        return { ...base, type: 'TASK_UPDATED' };
      }
      default:
        return null;
    }
  }
  if (entry.entityType === 'SNAPSHOT' && (entry.action === 'ACTIVATE' || entry.action === 'CORRECTION')) {
    return { ...base, type: 'DISTRIBUTION_UPDATED' };
  }
  return null;
}

export const localAudit: AuditReadService = {
  async list(filter?: AuditFilter): Promise<{ entries: AuditEntry[]; total: number }> {
    await ensureSeeded();
    const session = requireSession();
    // Audit teknis lengkap hanya untuk Admin.
    if (session.role !== 'ADMIN') {
      throw new ForbiddenError('Audit log hanya dapat dilihat Admin.');
    }
    let entries = db.audit();
    if (filter?.action) entries = entries.filter((e) => e.action === filter.action);
    if (filter?.entityType) entries = entries.filter((e) => e.entityType === filter.entityType);
    if (filter?.employeeId) entries = entries.filter((e) => e.employeeId === filter.employeeId);
    if (filter?.dateFrom) entries = entries.filter((e) => e.at >= filter.dateFrom!);
    if (filter?.dateTo) {
      const end = `${filter.dateTo}T23:59:59.999Z`;
      entries = entries.filter((e) => e.at <= end);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      entries = entries.filter(
        (e) =>
          (e.entityLabel ?? '').toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.actorAccount.toLowerCase().includes(q),
      );
    }
    const sorted = [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    const total = sorted.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    return { entries: sorted.slice(offset, offset + limit), total };
  },

  async recentActivity(limit = 20): Promise<ActivityEvent[]> {
    await ensureSeeded();
    requireSession();
    const events: ActivityEvent[] = [];
    for (const entry of [...db.audit()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))) {
      const evt = toActivityEvent(entry);
      if (evt) events.push(evt);
      if (events.length >= limit) break;
    }
    return events;
  },
};

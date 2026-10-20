/**
 * Integrasi spreadsheet & Rencana Kegiatan — mode LOKAL.
 *
 * Mode lokal tidak terhubung Google; sumber, binding, mapping, dan sync run
 * berisi data contoh, sedangkan aksi (tes koneksi, sinkron, preview) berjalan
 * sebagai simulasi supaya seluruh tombol Admin tetap berfungsi saat demo.
 */
import { uid } from '@/lib/utils';
import { NotFoundError, ValidationError } from '@/services/errors';
import type {
  ActivityPlanItem,
  ActivityPlanService,
  ColumnMapping,
  GoogleConnectionStatus,
  IntegrationService,
  SheetBinding,
  SpreadsheetSource,
  SpreadsheetSourceInput,
  SyncRun,
} from '@/services/types';
import { localBus } from './bus';
import { COL, db, ensureSeeded, nowISO, writeAudit } from './db';
import { requireAdmin, requireActor, requireSession } from './guard-util';

/** Ekstrak Spreadsheet ID dari URL Google Sheets (atau kembalikan apa adanya). */
export function extractSpreadsheetId(urlOrId: string): string | null {
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (m?.[1]) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

function findSource(id: string): SpreadsheetSource {
  const source = db.sources().find((s) => s.id === id);
  if (!source) throw new NotFoundError('Sumber spreadsheet tidak ditemukan.');
  return source;
}

function writeSources(next: SpreadsheetSource[]): void {
  db.write(COL.sources, next);
  localBus.emit({ topic: 'integrations' });
}

function appendSyncRun(run: SyncRun): void {
  db.write(COL.syncRuns, [run, ...db.syncRuns()].slice(0, 200));
  localBus.emit({ topic: 'integrations' });
}

export const localIntegrations: IntegrationService = {
  async listSources(opts) {
    await ensureSeeded();
    requireSession();
    return db
      .sources()
      .filter((s) => (opts?.includeDeleted ? true : s.deletedAt === null))
      .filter((s) => (opts?.includeInactive ? true : s.isActive || s.deletedAt !== null))
      .sort((a, b) => b.year - a.year || a.sourceType.localeCompare(b.sourceType));
  },

  async saveSource(input: SpreadsheetSourceInput, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const name = input.name.trim();
    if (!name) throw new ValidationError('Nama sumber wajib diisi.');
    const spreadsheetId = extractSpreadsheetId(input.spreadsheetUrl);
    if (!spreadsheetId) {
      throw new ValidationError('URL/ID spreadsheet tidak valid. Tempel tautan Google Sheets.');
    }
    const sources = db.sources();
    const prev = input.id ? sources.find((s) => s.id === input.id) : undefined;
    if (input.id && !prev) throw new NotFoundError('Sumber spreadsheet tidak ditemukan.');

    const next: SpreadsheetSource = prev
      ? {
          ...prev,
          sourceType: input.sourceType,
          year: input.year,
          name,
          spreadsheetUrl: input.spreadsheetUrl.trim(),
          spreadsheetId,
          isActive: input.isActive ?? prev.isActive,
          syncMode: input.syncMode ?? prev.syncMode,
          updatedByEmployeeId: employeeId,
          updatedAt: nowISO(),
        }
      : {
          id: uid('src'),
          sourceType: input.sourceType,
          year: input.year,
          name,
          spreadsheetUrl: input.spreadsheetUrl.trim(),
          spreadsheetId,
          isActive: input.isActive ?? true,
          // Sumber pertama untuk (jenis, tahun) otomatis jadi utama.
          isPrimary: !sources.some(
            (s) =>
              s.sourceType === input.sourceType && s.year === input.year && s.deletedAt === null,
          ),
          syncMode: input.syncMode ?? 'WEBHOOK_DAN_INTERVAL',
          lastSyncedAt: null,
          lastSyncStatus: 'BELUM_SINKRON',
          lastError: null,
          createdByEmployeeId: employeeId,
          updatedByEmployeeId: employeeId,
          createdAt: nowISO(),
          updatedAt: nowISO(),
          deletedAt: null,
        };

    writeSources(prev ? sources.map((s) => (s.id === next.id ? next : s)) : [...sources, next]);
    if (!prev) {
      // Binding bawaan sesuai jenis sumber — mapping menunggu konfirmasi Admin.
      const bindings: SheetBinding[] =
        input.sourceType === 'pip_progress'
          ? [
              { id: uid('bind'), sourceId: next.id, bindingType: 'detail_realisasi', sheetName: 'Pemberian', headerRow: 1, dataStartRow: 2, optionalRange: null, mappingStatus: 'BELUM_DIKONFIRMASI' },
              { id: uid('bind'), sourceId: next.id, bindingType: 'allocation_summary', sheetName: 'REKAP PROGRESS', headerRow: 1, dataStartRow: 2, optionalRange: null, mappingStatus: 'BELUM_DIKONFIRMASI' },
            ]
          : [
              { id: uid('bind'), sourceId: next.id, bindingType: 'activity_rows', sheetName: 'Sheet1', headerRow: 1, dataStartRow: 2, optionalRange: null, mappingStatus: 'BELUM_DIKONFIRMASI' },
            ];
      db.write(COL.bindings, [...db.bindings(), ...bindings]);
    }
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: prev ? 'UPDATE' : 'CREATE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: next.id,
      entityLabel: `${next.name} (${next.year})`,
      before: prev ? { name: prev.name, spreadsheetId: prev.spreadsheetId } : null,
      after: { name: next.name, spreadsheetId: next.spreadsheetId },
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return next;
  },

  async setSourceActive(id, active, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(id);
    const next = { ...source, isActive: active, updatedAt: nowISO(), updatedByEmployeeId: employeeId };
    writeSources(db.sources().map((s) => (s.id === id ? next : s)));
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: active ? 'ACTIVATE' : 'DEACTIVATE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: id,
      entityLabel: `${source.name} (${source.year})`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return next;
  },

  async archiveSource(id, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(id);
    writeSources(
      db.sources().map((s) =>
        s.id === id
          ? { ...s, deletedAt: nowISO(), isActive: false, isPrimary: false, updatedByEmployeeId: employeeId, updatedAt: nowISO() }
          : s,
      ),
    );
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: 'SOFT_DELETE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: id,
      entityLabel: `${source.name} (${source.year})`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
  },

  async restoreSource(id, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(id);
    if (!source.deletedAt) return source;
    const next = { ...source, deletedAt: null, updatedAt: nowISO(), updatedByEmployeeId: employeeId };
    writeSources(db.sources().map((s) => (s.id === id ? next : s)));
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: 'RESTORE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: id,
      entityLabel: `${source.name} (${source.year})`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return next;
  },

  async setPrimary(id, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(id);
    if (source.deletedAt) throw new ValidationError('Sumber terhapus tidak dapat dijadikan utama.');
    const next = db.sources().map((s) => {
      if (s.sourceType !== source.sourceType || s.year !== source.year) return s;
      return { ...s, isPrimary: s.id === id, updatedAt: nowISO() };
    });
    writeSources(next);
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: 'UPDATE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: id,
      entityLabel: `${source.name} (${source.year}) dijadikan sumber utama`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return next.find((s) => s.id === id) ?? source;
  },

  async listBindings(sourceId) {
    await ensureSeeded();
    requireSession();
    return db.bindings().filter((b) => b.sourceId === sourceId);
  },

  async listMappings(bindingId) {
    await ensureSeeded();
    requireSession();
    return db.columnMappings().filter((m) => m.bindingId === bindingId);
  },

  async confirmMapping(sourceId, bindingId, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(sourceId);
    const binding = db.bindings().find((b) => b.id === bindingId && b.sourceId === sourceId);
    if (!binding) throw new NotFoundError('Sheet binding tidak ditemukan.');
    if (db.columnMappings().filter((m) => m.bindingId === bindingId).length === 0) {
      throw new ValidationError(
        'Belum ada header terdeteksi — jalankan tes koneksi/preview terlebih dahulu.',
      );
    }
    const next: SheetBinding = { ...binding, mappingStatus: 'TERKONFIRMASI' };
    db.write(
      COL.bindings,
      db.bindings().map((b) => (b.id === bindingId ? next : b)),
    );
    localBus.emit({ topic: 'integrations' });
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: 'UPDATE',
      entityType: 'SPREADSHEET_SOURCE',
      entityId: sourceId,
      entityLabel: `Mapping "${binding.sheetName}" (${source.name}) dikonfirmasi`,
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    return next;
  },

  async listSyncRuns(opts) {
    await ensureSeeded();
    requireSession();
    const limit = opts?.limit ?? 50;
    return db
      .syncRuns()
      .filter((r) => (opts?.sourceId ? r.sourceId === opts.sourceId : true))
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
      .slice(0, limit);
  },

  async googleStatus(): Promise<GoogleConnectionStatus> {
    await ensureSeeded();
    requireSession();
    // Mode lokal tidak memiliki server OAuth — status: belum dikonfigurasi.
    return {
      configured: false,
      accessMode: 'none',
      serviceAccountEmail: null,
      connected: false,
      email: null,
      connectedAt: null,
      lastUsedAt: null,
      tokenStatus: null,
    };
  },

  async testConnection(sourceId) {
    await ensureSeeded();
    requireAdmin();
    const source = findSource(sourceId);
    const sheets = db
      .bindings()
      .filter((b) => b.sourceId === sourceId)
      .map((b) => b.sheetName);
    return {
      ok: true,
      message: `Simulasi mode lokal — spreadsheet "${source.name}" dianggap dapat diakses.`,
      sheets,
    };
  },

  async preview(sourceId, bindingId) {
    await ensureSeeded();
    requireAdmin();
    findSource(sourceId);
    const binding = db.bindings().find((b) => b.id === bindingId && b.sourceId === sourceId);
    if (!binding) throw new NotFoundError('Sheet binding tidak ditemukan.');
    const mappings = db.columnMappings().filter((m) => m.bindingId === bindingId);
    if (mappings.length === 0) return null;
    const headers = mappings.map((m) => m.detectedHeader);
    const sample = (m: ColumnMapping): string => {
      switch (m.parserType) {
        case 'number': return '1.250';
        case 'currency': return 'Rp562.500.000';
        case 'date': return '15/07/2026';
        case 'time': return '09:00';
        case 'percent': return '82,5%';
        default: return 'Contoh';
      }
    };
    return {
      headers,
      rows: [mappings.map(sample), mappings.map(sample)],
    };
  },

  async syncNow(sourceId, ctx) {
    await ensureSeeded();
    const session = requireAdmin();
    const employeeId = requireActor(ctx);
    const source = findSource(sourceId);
    const startedAt = nowISO();
    const run: SyncRun = {
      id: uid('run'),
      sourceId,
      trigger: 'MANUAL',
      status: 'BERHASIL',
      startedAt,
      finishedAt: nowISO(),
      rowsRead: source.sourceType === 'pip_progress' ? 42 : db.activities().length,
      rowsUpserted: 0,
      message: 'Simulasi mode lokal — tidak ada pembacaan Google Sheets sungguhan.',
      errorMessage: null,
    };
    appendSyncRun(run);
    writeSources(
      db.sources().map((s) =>
        s.id === sourceId
          ? { ...s, lastSyncedAt: run.finishedAt, lastSyncStatus: run.status, lastError: null, updatedAt: nowISO() }
          : s,
      ),
    );
    writeAudit({
      actorRole: session.role,
      actorAccount: session.account,
      employeeId,
      action: 'SYNC',
      entityType: 'SYNC',
      entityId: sourceId,
      entityLabel: `Sinkronisasi manual: ${source.name} (${source.year})`,
      after: { status: run.status, rowsRead: run.rowsRead },
      sessionId: session.id,
      deviceLabel: session.deviceLabel,
    });
    localBus.emit({ topic: source.sourceType === 'pip_progress' ? 'distribution' : 'activities' });
    return run;
  },
};

export const localActivities: ActivityPlanService = {
  async list(opts): Promise<ActivityPlanItem[]> {
    await ensureSeeded();
    requireSession();
    return db
      .activities()
      .filter((a) => (opts?.year ? a.year === opts.year : true))
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  },

  async listYears() {
    await ensureSeeded();
    requireSession();
    const years = new Set<number>(db.activities().map((a) => a.year));
    for (const s of db.sources()) {
      if (s.sourceType === 'activity_plan' && s.deletedAt === null) years.add(s.year);
    }
    return [...years].sort((a, b) => b - a);
  },

  async syncInfo(year) {
    await ensureSeeded();
    requireSession();
    const sources = db
      .sources()
      .filter((s) => s.sourceType === 'activity_plan' && s.deletedAt === null)
      .filter((s) => (year ? s.year === year : true))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.year - a.year);
    const source = sources[0] ?? null;
    const lastRun = source
      ? (db
          .syncRuns()
          .filter((r) => r.sourceId === source.id)
          .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null)
      : null;
    return { source, lastRun };
  },
};

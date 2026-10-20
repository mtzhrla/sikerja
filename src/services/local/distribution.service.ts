import { uid } from '@/lib/utils';
import { NotFoundError, ValidationError } from '@/services/errors';
import { validateRows, validateScope } from '@/services/distribution-validation';
import type { DistributionService, DistributionSnapshot, PipSkRecord } from '@/services/types';
import { localBus } from './bus';
import { COL, db, ensureSeeded, nowISO, writeAudit } from './db';
import { requireActor, requireAdmin, requireSession } from './guard-util';

// Re-export agar pemakai lama tetap berfungsi (kini modul bersama).
export { validateRows, validateScope } from '@/services/distribution-validation';

function auditBase(employeeId: string) {
  const session = requireAdmin();
  return {
    actorRole: session.role,
    actorAccount: session.account,
    employeeId,
    sessionId: session.id,
    deviceLabel: session.deviceLabel,
  } as const;
}

export function snapshotLabel(s: Pick<DistributionSnapshot, 'year' | 'period'>): string {
  return `Penyaluran ${s.year} · ${s.period}`;
}

function getSnapshotOrThrow(id: string): DistributionSnapshot {
  const snap = db.snapshots().find((s) => s.id === id);
  if (!snap) throw new NotFoundError('Snapshot tidak ditemukan.');
  return snap;
}

function save(snapshots: DistributionSnapshot[]): void {
  db.write(COL.snapshots, snapshots);
  localBus.emit({ topic: 'distribution' });
}

export const localDistribution: DistributionService = {
  async getActive(year, period): Promise<DistributionSnapshot | null> {
    await ensureSeeded();
    requireSession();
    const candidates = db
      .snapshots()
      .filter(
        (s) =>
          s.status === 'ACTIVE' &&
          (year === undefined || s.year === year) &&
          (period === undefined || s.period === period),
      )
      .sort(
        (a, b) =>
          Date.parse(b.activatedAt ?? b.createdAt) - Date.parse(a.activatedAt ?? a.createdAt),
      );
    return candidates[0] ?? null;
  },

  async list(): Promise<DistributionSnapshot[]> {
    await ensureSeeded();
    requireSession();
    return [...db.snapshots()].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      if (a.period !== b.period) return a.period.localeCompare(b.period);
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
  },

  async get(id): Promise<DistributionSnapshot> {
    await ensureSeeded();
    requireSession();
    return getSnapshotOrThrow(id);
  },

  async createDraft(input, ctx): Promise<DistributionSnapshot> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const scopeErrors = validateScope(input.year, input.period);
    const rowErrors = validateRows(input.rows);
    const errors = [...scopeErrors, ...rowErrors];
    if (errors.length > 0) {
      throw new ValidationError(errors[0] ?? 'Data tidak valid.');
    }
    const snapshot: DistributionSnapshot = {
      id: uid('snap'),
      year: input.year,
      period: input.period.trim(),
      status: 'DRAFT',
      rows: input.rows,
      sourceFileName: input.sourceFileName ?? null,
      note: input.note ?? null,
      createdAt: nowISO(),
      createdByEmployeeId: employeeId,
      activatedAt: null,
      updatedAt: nowISO(),
      version: 1,
    };
    save([snapshot, ...db.snapshots()]);
    writeAudit({
      ...auditBase(employeeId),
      action: 'IMPORT',
      entityType: 'SNAPSHOT',
      entityId: snapshot.id,
      entityLabel: snapshotLabel(snapshot),
      after: { fileName: snapshot.sourceFileName, rows: snapshot.rows.length },
    });
    return snapshot;
  },

  async activate(id, ctx): Promise<DistributionSnapshot> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const snap = getSnapshotOrThrow(id);
    const rowErrors = validateRows(snap.rows);
    if (rowErrors.length > 0) {
      throw new ValidationError('Snapshot tidak valid dan tidak dapat diaktifkan.');
    }
    const next = db.snapshots().map((s): DistributionSnapshot => {
      if (s.id === id) {
        return {
          ...s,
          status: 'ACTIVE',
          activatedAt: nowISO(),
          updatedAt: nowISO(),
          version: s.version + 1,
        };
      }
      // Hanya satu snapshot aktif untuk scope (tahun, periode) yang sama.
      if (s.status === 'ACTIVE' && s.year === snap.year && s.period === snap.period) {
        return { ...s, status: 'ARCHIVED', updatedAt: nowISO(), version: s.version + 1 };
      }
      return s;
    });
    save(next);
    writeAudit({
      ...auditBase(employeeId),
      action: 'ACTIVATE',
      entityType: 'SNAPSHOT',
      entityId: id,
      entityLabel: snapshotLabel(snap),
      before: { status: snap.status },
      after: { status: 'ACTIVE' },
    });
    return getSnapshotOrThrow(id);
  },

  async deactivate(id, ctx): Promise<DistributionSnapshot> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const snap = getSnapshotOrThrow(id);
    if (snap.status !== 'ACTIVE') {
      throw new ValidationError('Hanya snapshot aktif yang dapat dibatalkan aktivasinya.');
    }
    save(
      db
        .snapshots()
        .map((s) =>
          s.id === id
            ? {
                ...s,
                status: 'DRAFT',
                activatedAt: null,
                updatedAt: nowISO(),
                version: s.version + 1,
              }
            : s,
        ),
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'DEACTIVATE',
      entityType: 'SNAPSHOT',
      entityId: id,
      entityLabel: snapshotLabel(snap),
      before: { status: 'ACTIVE' },
      after: { status: 'DRAFT' },
    });
    return getSnapshotOrThrow(id);
  },

  async correct(id, rows, reason, ctx): Promise<DistributionSnapshot> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const source = getSnapshotOrThrow(id);
    if (!reason.trim()) throw new ValidationError('Alasan koreksi wajib diisi.');
    const rowErrors = validateRows(rows);
    if (rowErrors.length > 0) {
      throw new ValidationError(rowErrors[0] ?? 'Data koreksi tidak valid.');
    }
    const wasActive = source.status === 'ACTIVE';
    const corrected: DistributionSnapshot = {
      id: uid('snap'),
      year: source.year,
      period: source.period,
      status: 'DRAFT',
      rows,
      sourceFileName: source.sourceFileName,
      note: `Koreksi manual: ${reason.trim()}`,
      createdAt: nowISO(),
      createdByEmployeeId: employeeId,
      activatedAt: null,
      updatedAt: nowISO(),
      version: 1,
    };
    save([corrected, ...db.snapshots()]);
    writeAudit({
      ...auditBase(employeeId),
      action: 'CORRECTION',
      entityType: 'SNAPSHOT',
      entityId: corrected.id,
      entityLabel: snapshotLabel(corrected),
      before: { sourceSnapshotId: id },
      after: { reason: reason.trim() },
    });
    if (wasActive) {
      return localDistribution.activate(corrected.id, ctx);
    }
    return corrected;
  },

  async remove(id, ctx): Promise<void> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const snap = getSnapshotOrThrow(id);
    if (snap.status === 'ACTIVE') {
      throw new ValidationError('Snapshot aktif tidak dapat dihapus. Batalkan aktivasi dahulu.');
    }
    save(db.snapshots().filter((s) => s.id !== id));
    writeAudit({
      ...auditBase(employeeId),
      action: 'PERMANENT_DELETE',
      entityType: 'SNAPSHOT',
      entityId: id,
      entityLabel: snapshotLabel(snap),
    });
  },

  async listSkRecords(opts): Promise<PipSkRecord[]> {
    await ensureSeeded();
    requireSession();
    // Mode lokal tidak menyimpan baris SK hasil sinkronisasi. Untuk demo,
    // agregat snapshot aktif dipecah DETERMINISTIK menjadi beberapa SK per
    // jenjang (tahap tetap, tanggal tetap) supaya panel SK Dashboard hidup.
    const snap = await localDistribution.getActive(opts?.year);
    if (!snap) return [];
    // Bobot tahap tetap; jumlah baris terakhir menampung sisa pembulatan agar
    // total siswa/dana per jenjang identik dengan agregat snapshot.
    const stages = [
      { w: 0.35, month: 3, day: 30 },
      { w: 0.25, month: 4, day: 23 },
      { w: 0.25, month: 5, day: 18 },
      { w: 0.15, month: 6, day: 12 },
    ];
    const records: PipSkRecord[] = [];
    for (const row of snap.rows) {
      if (row.skSiswa <= 0) continue;
      let siswaLeft = row.skSiswa;
      let danaLeft = row.skAnggaran;
      stages.forEach((stage, i) => {
        const last = i === stages.length - 1;
        const siswa = last ? siswaLeft : Math.round(row.skSiswa * stage.w);
        const dana = last ? danaLeft : Math.round(row.skAnggaran * stage.w);
        siswaLeft -= siswa;
        danaLeft -= dana;
        if (siswa <= 0 && dana <= 0) return;
        records.push({
          jenjang: row.jenjang,
          skNomor: `${i + 1}/PLPP/${row.jenjang}/SK.${i + 1}/${snap.year}`,
          skTanggal: `${snap.year}-${String(stage.month).padStart(2, '0')}-${String(stage.day).padStart(2, '0')}`,
          jumlahSiswa: Math.max(siswa, 0),
          jumlahDana: Math.max(dana, 0),
        });
      });
    }
    return records;
  },

  async listScopes(): Promise<{ year: number; period: string }[]> {
    await ensureSeeded();
    requireSession();
    const seen = new Set<string>();
    const scopes: { year: number; period: string }[] = [];
    for (const s of db.snapshots()) {
      const key = `${s.year}|${s.period}`;
      if (!seen.has(key)) {
        seen.add(key);
        scopes.push({ year: s.year, period: s.period });
      }
    }
    return scopes.sort((a, b) => b.year - a.year || a.period.localeCompare(b.period));
  },
};

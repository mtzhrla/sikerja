import { normalizeTeam } from '@/lib/org';
import { uid } from '@/lib/utils';
import { ConflictError, NotFoundError, ValidationError } from '@/services/errors';
import type {
  AppSettings,
  BackupPayload,
  Category,
  Employee,
  EmployeeInput,
  EmployeeService,
  Label,
  SettingsService,
  TaskTemplate,
  TaxonomyService,
  TemplateService,
} from '@/services/types';
import { localBus } from './bus';
import { COL, db, ensureSeeded, hashPassword, nowISO, resetSeedMemo, writeAudit } from './db';
import { requireActor, requireAdmin, requireSession } from './guard-util';
import { clearAllCollections, listCollectionKeys, readCollection, writeCollection } from './storage';

function auditBase(employeeId: string) {
  const session = requireSession();
  return {
    actorRole: session.role,
    actorAccount: session.account,
    employeeId,
    sessionId: session.id,
    deviceLabel: session.deviceLabel,
  } as const;
}

// ---------------------------------------------------------------------------
// Pegawai & PIC
// ---------------------------------------------------------------------------

function validateEmployeeInput(input: Partial<EmployeeInput>): void {
  if (input.fullName !== undefined && !input.fullName.trim()) {
    throw new ValidationError('Nama lengkap wajib diisi.');
  }
  if (input.displayName !== undefined) {
    const tag = input.displayName.trim();
    if (!tag) throw new ValidationError('Tag board wajib diisi.');
    if (/\s/.test(tag)) throw new ValidationError('Tag board harus satu kata (tanpa spasi).');
  }
  if (input.initials !== undefined) {
    const ini = input.initials.trim();
    if (!ini || ini.length > 3) throw new ValidationError('Inisial 1–3 karakter.');
  }
}

/** Tag board harus unik di antara pegawai aktif. */
function assertUniqueTag(tag: string, active: boolean, excludeId?: string): void {
  if (!active) return;
  const dup = db
    .employees()
    .some(
      (e) =>
        e.id !== excludeId && e.active && e.displayName.toLowerCase() === tag.toLowerCase(),
    );
  if (dup) throw new ValidationError(`Tag "${tag}" sudah dipakai pegawai aktif lain.`);
}

export const localEmployees: EmployeeService = {
  async list(opts): Promise<Employee[]> {
    await ensureSeeded();
    requireSession();
    const all = [...db.employees()].sort((a, b) => a.sortOrder - b.sortOrder);
    return opts?.includeInactive ? all : all.filter((e) => e.active);
  },

  async create(input, ctx): Promise<Employee> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    validateEmployeeInput(input);
    assertUniqueTag(input.displayName.trim(), input.active ?? true);
    const employees = db.employees();
    const employee: Employee = {
      id: uid('emp'),
      fullName: input.fullName.trim(),
      displayName: input.displayName.trim(),
      initials: input.initials.trim().toUpperCase(),
      color: input.color,
      nip: input.nip?.trim() || null,
      nipNormalized: input.nip?.trim().replace(/[^0-9]/g, '') || null,
      username: input.username?.trim().toLowerCase() || null,
      position: input.position.trim(),
      team: normalizeTeam(input.team),
      level: input.level ?? 'STAFF',
      supervisorId: input.supervisorId ?? null,
      sortOrder: input.sortOrder ?? employees.length,
      active: input.active ?? true,
      avatarPath: null,
      avatarUpdatedAt: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.write(COL.employees, [...employees, employee]);
    localBus.emit({ topic: 'employees' });
    writeAudit({
      ...auditBase(employeeId),
      action: 'CREATE',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      entityLabel: employee.fullName,
      after: { fullName: employee.fullName, position: employee.position },
    });
    return employee;
  },

  async update(id, patch, ctx): Promise<Employee> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    validateEmployeeInput(patch);
    const employees = db.employees();
    const prev = employees.find((e) => e.id === id);
    if (!prev) throw new NotFoundError('Pegawai tidak ditemukan.');
    const nextTag = patch.displayName?.trim() ?? prev.displayName;
    assertUniqueTag(nextTag, patch.active ?? prev.active, id);
    const next: Employee = {
      ...prev,
      fullName: patch.fullName?.trim() ?? prev.fullName,
      displayName: nextTag,
      initials: patch.initials?.trim().toUpperCase() ?? prev.initials,
      color: patch.color ?? prev.color,
      nip: patch.nip !== undefined ? patch.nip?.trim() || null : prev.nip,
      position: patch.position?.trim() ?? prev.position,
      team: patch.team !== undefined ? normalizeTeam(patch.team) : prev.team,
      sortOrder: patch.sortOrder ?? prev.sortOrder,
      active: patch.active ?? prev.active,
      updatedAt: nowISO(),
    };
    db.write(
      COL.employees,
      employees.map((e) => (e.id === id ? next : e)),
    );
    localBus.emit({ topic: 'employees' });
    writeAudit({
      ...auditBase(employeeId),
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      entityLabel: next.fullName,
      before: {
        fullName: prev.fullName,
        displayName: prev.displayName,
        position: prev.position,
        team: prev.team,
        active: prev.active,
      },
      after: {
        fullName: next.fullName,
        displayName: next.displayName,
        position: next.position,
        team: next.team,
        active: next.active,
      },
    });
    return next;
  },

  async setActive(id, active, ctx): Promise<Employee> {
    return localEmployees.update(id, { active }, ctx);
  },

  async setPhoto(id, photo, ctx): Promise<Employee> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    if (photo.size <= 0) throw new ValidationError('Berkas foto kosong.');
    if (photo.size > 300 * 1024) {
      throw new ValidationError('Ukuran foto maksimal 300 KB setelah kompresi.');
    }
    const employees = db.employees();
    const prev = employees.find((e) => e.id === id);
    if (!prev) throw new NotFoundError('Pegawai tidak ditemukan.');
    const path = `local-avatar:${uid('pho')}`;
    const { set: idbSet, del: idbDel } = await import('idb-keyval');
    await idbSet(path, photo);
    if (prev.avatarPath) await idbDel(prev.avatarPath).catch(() => undefined);
    const next: Employee = {
      ...prev,
      avatarPath: path,
      avatarUpdatedAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.write(
      COL.employees,
      employees.map((e) => (e.id === id ? next : e)),
    );
    localBus.emit({ topic: 'employees' });
    writeAudit({
      ...auditBase(employeeId),
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      entityLabel: `Foto profil ${next.fullName} diperbarui`,
      after: { avatarPath: path },
    });
    return next;
  },

  async removePhoto(id, ctx): Promise<Employee> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const employees = db.employees();
    const prev = employees.find((e) => e.id === id);
    if (!prev) throw new NotFoundError('Pegawai tidak ditemukan.');
    if (prev.avatarPath) {
      const { del: idbDel } = await import('idb-keyval');
      await idbDel(prev.avatarPath).catch(() => undefined);
    }
    const next: Employee = {
      ...prev,
      avatarPath: null,
      avatarUpdatedAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.write(
      COL.employees,
      employees.map((e) => (e.id === id ? next : e)),
    );
    localBus.emit({ topic: 'employees' });
    writeAudit({
      ...auditBase(employeeId),
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityId: id,
      entityLabel: `Foto profil ${next.fullName} dihapus`,
      before: { avatarPath: prev.avatarPath },
    });
    return next;
  },

  async photoUrls(paths): Promise<Record<string, string>> {
    await ensureSeeded();
    requireSession();
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return {};
    const { get: idbGet } = await import('idb-keyval');
    const map: Record<string, string> = {};
    await Promise.all(
      unique.map(async (p) => {
        const blob = await idbGet<Blob>(p).catch(() => undefined);
        if (blob) map[p] = URL.createObjectURL(blob);
      }),
    );
    return map;
  },

  async reorder(orderedIds, ctx): Promise<void> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    const employees = db.employees();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    db.write(
      COL.employees,
      employees.map((e) => {
        const idx = orderMap.get(e.id);
        return idx === undefined ? e : { ...e, sortOrder: idx, updatedAt: nowISO() };
      }),
    );
    localBus.emit({ topic: 'employees' });
    writeAudit({
      ...auditBase(employeeId),
      action: 'UPDATE',
      entityType: 'EMPLOYEE',
      entityLabel: 'Urutan pegawai diubah',
    });
  },
};

// // ---------------------------------------------------------------------------
// // Kategori & Label
// // ---------------------------------------------------------------------------

// function saveTaxonomyItem<T extends Category | Label>(
//   collection: 'categories' | 'labels',
//   items: T[],
//   input: { id?: string; name: string; color: string; active?: boolean },
//   entityType: 'CATEGORY' | 'LABEL',
//   employeeId: string,
// ): T {
//   const name = input.name.trim();
//   if (!name) throw new ValidationError('Nama wajib diisi.');
//   if (name.length > 40) throw new ValidationError('Nama maksimal 40 karakter.');
//   const duplicate = items.some(
//     (i) => i.name.toLowerCase() === name.toLowerCase() && i.id !== input.id,
//   );
//   if (duplicate) throw new ValidationError(`"${name}" sudah ada.`);

//   let result: T;
//   let next: T[];
//   if (input.id) {
//     const prev = items.find((i) => i.id === input.id);
//     if (!prev) throw new NotFoundError('Data tidak ditemukan.');
//     result = { ...prev, name, color: input.color, active: input.active ?? prev.active };
//     next = items.map((i) => (i.id === input.id ? result : i));
//     writeAudit({
//       ...auditBase(employeeId),
//       action: 'UPDATE',
//       entityType,
//       entityId: prev.id,
//       entityLabel: name,
//       before: { name: prev.name, color: prev.color, active: prev.active },
//       after: { name, color: input.color, active: result.active },
//     });
//   } else {
//     result = {
//       id: uid(entityType === 'CATEGORY' ? 'cat' : 'lbl'),
//       name,
//       color: input.color,
//       sortOrder: items.length,
//       active: input.active ?? true,
//     } as T;
//     next = [...items, result];
//     writeAudit({
//       ...auditBase(employeeId),
//       action: 'CREATE',
//       entityType,
//       entityId: result.id,
//       entityLabel: name,
//       after: { name, color: input.color },
//     });
//   }
//   db.write(collection === 'categories' ? COL.categories : COL.labels, next);
//   localBus.emit({ topic: collection });
//   return result;
// }

 export const localTaxonomy: TaxonomyService = {
   async listCategories(opts): Promise<Category[]> {
     await ensureSeeded();
     requireSession();
     const all = [...db.categories()].sort((a, b) => a.sortOrder - b.sortOrder);
     return opts?.includeInactive ? all : all.filter((c) => c.active);
   },
   async saveCategory(input, ctx): Promise<Category> {
     await ensureSeeded();
     requireAdmin();
     const employeeId = requireActor(ctx);
     return saveTaxonomyItem('categories', db.categories(), input, 'CATEGORY', employeeId);
   },
   async reorderCategories(orderedIds, ctx): Promise<void> {
     await ensureSeeded();
     requireAdmin();
     requireActor(ctx);
     const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
     db.write(
       COL.categories,
       db.categories().map((c) => {
         const idx = orderMap.get(c.id);
         return idx === undefined ? c : { ...c, sortOrder: idx };
       }),
     );
     localBus.emit({ topic: 'categories' });
   },
   async listLabels(opts): Promise<Label[]> {
     await ensureSeeded();
     requireSession();
     const all = [...db.labels()].sort((a, b) => a.sortOrder - b.sortOrder);
     return opts?.includeInactive ? all : all.filter((l) => l.active);
   },
   async saveLabel(input, ctx): Promise<Label> {
     await ensureSeeded();
     requireAdmin();
     const employeeId = requireActor(ctx);
     return saveTaxonomyItem('labels', db.labels(), input, 'LABEL', employeeId);
   },
   async reorderLabels(orderedIds, ctx): Promise<void> {
     await ensureSeeded();
     requireAdmin();
     requireActor(ctx);
     const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    db.write(
       COL.labels,
       db.labels().map((l) => {
         const idx = orderMap.get(l.id);
         return idx === undefined ? l : { ...l, sortOrder: idx };
       }),
     );
     localBus.emit({ topic: 'labels' });
   },
 };

// // ---------------------------------------------------------------------------
// // Template pekerjaan
// // ---------------------------------------------------------------------------

 export const localTemplates: TemplateService = {
   async list(opts): Promise<TaskTemplate[]> {
     await ensureSeeded();
     requireSession();
     const all = [...db.templates()].sort((a, b) => a.sortOrder - b.sortOrder);
     return opts?.includeInactive ? all : all.filter((t) => t.active);
   },

   async save(input, ctx): Promise<TaskTemplate> {
     await ensureSeeded();
     requireAdmin();
     const employeeId = requireActor(ctx);
     const name = input.name.trim();
     if (!name) throw new ValidationError('Nama template wajib diisi.');
     if (!input.title.trim()) throw new ValidationError('Judul pekerjaan template wajib diisi.');
     const templates = db.templates();
     let result: TaskTemplate;
     if (input.id) {
       const prev = templates.find((t) => t.id === input.id);
       if (!prev) throw new NotFoundError('Template tidak ditemukan.');
       result = {
         ...prev,
         ...input,
         id: prev.id,
         name,
         updatedAt: nowISO(),
       };
       db.write(
         COL.templates,
         templates.map((t) => (t.id === prev.id ? result : t)),
       );
       writeAudit({
         ...auditBase(employeeId),
         action: 'UPDATE',
         entityType: 'TEMPLATE',
         entityId: prev.id,
         entityLabel: name,
       });
     } else {
       result = {
         ...input,
         id: uid('tpl'),
         name,
         sortOrder: templates.length,
         createdAt: nowISO(),
         updatedAt: nowISO(),
       };
       db.write(COL.templates, [...templates, result]);
       writeAudit({
         ...auditBase(employeeId),
         action: 'CREATE',
         entityType: 'TEMPLATE',
         entityId: result.id,
         entityLabel: name,
       });
     }
     localBus.emit({ topic: 'templates' });
     return result;
   },

   async remove(id, ctx): Promise<void> {
     await ensureSeeded();
     requireAdmin();
     const employeeId = requireActor(ctx);
     const prev = db.templates().find((t) => t.id === id);
     if (!prev) throw new NotFoundError('Template tidak ditemukan.');
     db.write(
       COL.templates,
       db.templates().filter((t) => t.id !== id),
     );
     localBus.emit({ topic: 'templates' });
     writeAudit({
      ...auditBase(employeeId),
       action: 'PERMANENT_DELETE',
       entityType: 'TEMPLATE',
       entityId: id,
       entityLabel: prev.name,
     });
   },

   async reorder(orderedIds, ctx): Promise<void> {
     await ensureSeeded();
     requireAdmin();
     requireActor(ctx);
     const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
     db.write(
      COL.templates,
       db.templates().map((t) => {
         const idx = orderMap.get(t.id);
         return idx === undefined ? t : { ...t, sortOrder: idx };
       }),
     );
     localBus.emit({ topic: 'templates' });
   },
 };

// ---------------------------------------------------------------------------
// Pengaturan & backup
// ---------------------------------------------------------------------------

function validateSettingsPatch(patch: Partial<AppSettings>): void {
  if (patch.appName !== undefined && !patch.appName.trim()) {
    throw new ValidationError('Nama aplikasi wajib diisi.');
  }
  if (patch.activeYear !== undefined && (patch.activeYear < 2020 || patch.activeYear > 2100)) {
    throw new ValidationError('Tahun aktif tidak valid.');
  }
  if (
    patch.userSessionDays !== undefined &&
    (patch.userSessionDays < 1 || patch.userSessionDays > 730)
  ) {
    throw new ValidationError('Durasi sesi User 1–730 hari.');
  }
  if (patch.staleDays !== undefined && (patch.staleDays < 1 || patch.staleDays > 90)) {
    throw new ValidationError('Ambang tidak diperbarui 1–90 hari.');
  }
  if (
    patch.attachmentMaxMB !== undefined &&
    (patch.attachmentMaxMB < 1 || patch.attachmentMaxMB > 50)
  ) {
    throw new ValidationError('Batas lampiran 1–50 MB.');
  }
  if (patch.attachmentAllowedExt !== undefined && patch.attachmentAllowedExt.length === 0) {
    throw new ValidationError('Minimal satu tipe file lampiran diizinkan.');
  }
  if (patch.logoDataUrl !== undefined && patch.logoDataUrl && patch.logoDataUrl.length > 300_000) {
    throw new ValidationError('Ukuran logo terlalu besar (maks ±200 KB).');
  }
}

export const localSettings: SettingsService = {
  async get(): Promise<AppSettings> {
    await ensureSeeded();
    const settings = db.settings();
    if (!settings) throw new NotFoundError('Pengaturan tidak ditemukan.');
    return settings;
  },

  async update(patch, expectedVersion, ctx): Promise<AppSettings> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    validateSettingsPatch(patch);
    const prev = await localSettings.get();
    if (prev.version !== expectedVersion) throw new ConflictError();
    const next: AppSettings = {
      ...prev,
      ...patch,
      appName: patch.appName?.trim() ?? prev.appName,
      updatedAt: nowISO(),
      version: prev.version + 1,
    };
    db.write(COL.settings, next);
    localBus.emit({ topic: 'settings' });
    const { logoDataUrl: _pl, ...prevLog } = prev;
    const { logoDataUrl: _nl, ...nextLog } = next;
    writeAudit({
      ...auditBase(employeeId),
      action: 'SETTINGS_UPDATE',
      entityType: 'SETTINGS',
      entityLabel: 'Pengaturan aplikasi',
      before: prevLog,
      after: nextLog,
    });
    return next;
  },

  async changeUserPassword(newPassword, ctx): Promise<void> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    if (newPassword.length < 8) {
      throw new ValidationError('Password User minimal 8 karakter.');
    }
    const auth = db.auth();
    if (!auth) throw new NotFoundError('Penyimpanan autentikasi tidak ditemukan.');
    const hash = await hashPassword(newPassword);
    db.write(COL.auth, { ...auth, userPasswordHash: hash, updatedAt: nowISO() });
    // Akun bersama lama kini berjenis DEMO (read-only) — password ikut diperbarui.
    db.write(
      COL.accounts,
      db.accounts().map((a) => (a.accountType === 'DEMO' ? { ...a, passwordHash: hash } : a)),
    );
    writeAudit({
      ...auditBase(employeeId),
      action: 'PASSWORD_CHANGE',
      entityType: 'SETTINGS',
      entityLabel: 'Password akun demo diganti',
    });
  },

  async exportBackup(): Promise<BackupPayload> {
    await ensureSeeded();
    requireAdmin();
    const data: Record<string, unknown> = {};
    for (const key of listCollectionKeys()) {
      if (key === 'currentSessionId') continue;
      data[key] = readCollection(key, null);
    }
    return { exportedAt: nowISO(), appVersion: '1.0', data };
  },

  async importBackup(payload, ctx): Promise<void> {
    await ensureSeeded();
    requireAdmin();
    const employeeId = requireActor(ctx);
    if (!payload || typeof payload !== 'object' || typeof payload.data !== 'object') {
      throw new ValidationError('Berkas backup tidak valid.');
    }
    const required = [COL.settings, COL.employees, COL.tasks, COL.steps, COL.board];
    for (const key of required) {
      if (!(key in payload.data)) {
        throw new ValidationError(`Berkas backup tidak lengkap (kolom "${key}" tidak ada).`);
      }
    }
    writeAudit({
      ...auditBase(employeeId),
      action: 'RESTORE_BACKUP',
      entityType: 'SETTINGS',
      entityLabel: `Pulihkan backup ${payload.exportedAt}`,
    });
    const preservedSession = readCollection<string | null>('currentSessionId', null);
    clearAllCollections();
    for (const [key, value] of Object.entries(payload.data)) {
      if (value !== null && value !== undefined) {
        writeCollection(key, value);
      }
    }
    writeCollection('currentSessionId', preservedSession);
    resetSeedMemo();
    for (const topic of [
      'board',
      'steps',
      'tasks',
      'comments',
      'attachments',
      'employees',
      'categories',
      'labels',
      'templates',
      'distribution',
      'activities',
      'integrations',
      'settings',
      'sessions',
      'audit',
    ] as const) {
      localBus.emit({ topic });
    }
  },
};

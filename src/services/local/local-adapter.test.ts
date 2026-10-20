import { beforeEach, describe, expect, it } from 'vitest';
import {
  AuthError,
  ConflictError,
  ForbiddenError,
  RateLimitError,
  ValidationError,
} from '@/services/errors';
import { localAdapter } from './adapter';
import { resetSeedMemo } from './db';
import { clearAllCollections } from './storage';

const svc = localAdapter;
/** Pegawai pelaku default untuk akun ADMIN. */
const ACTOR = { employeeId: 'emp-hesti' };
const TEMP_PASSWORD = '12345678';

async function loginDemo() {
  return svc.auth.login('user', TEMP_PASSWORD);
}
async function loginAdmin() {
  return svc.auth.login('admin', TEMP_PASSWORD);
}

/** Siapkan akun pegawai (Admin membuat akun, lalu keluar). */
async function provision(employeeId: string) {
  await loginAdmin();
  await svc.accounts.provision(employeeId);
  await svc.auth.logout();
}

/** Masuk sebagai pegawai & langsung selesaikan wajib-ganti-password. */
async function loginEmployee(identifier: string, password = TEMP_PASSWORD) {
  const session = await svc.auth.login(identifier, password);
  const state = await svc.auth.getState();
  if (state.mustChangePassword) {
    await svc.auth.changeOwnPassword('rahasiaBaru123');
  }
  return session;
}

beforeEach(() => {
  clearAllCollections();
  resetSeedMemo();
});

// ---------------------------------------------------------------------------
// Autentikasi
// ---------------------------------------------------------------------------

describe('auth — login NIP / username', () => {
  it('pegawai dapat masuk memakai username', async () => {
    await provision('emp-nur');
    const session = await svc.auth.login('nur', TEMP_PASSWORD);
    expect(session.role).toBe('EMPLOYEE');
    const state = await svc.auth.getState();
    expect(state.employeeId).toBe('emp-nur');
  });

  it('pegawai dapat masuk memakai NIP', async () => {
    await provision('emp-nur');
    const session = await svc.auth.login('199503102025211034', TEMP_PASSWORD);
    expect(session.role).toBe('EMPLOYEE');
    expect((await svc.auth.getState()).employeeId).toBe('emp-nur');
  });

  it('username tidak membedakan huruf besar/kecil', async () => {
    await provision('emp-ulfi');
    const session = await svc.auth.login('  ULFI  ', TEMP_PASSWORD);
    expect(session.role).toBe('EMPLOYEE');
  });

  it('NIP/username tidak dikenal ditolak dengan pesan generik', async () => {
    await expect(svc.auth.login('tidakada', TEMP_PASSWORD)).rejects.toBeInstanceOf(AuthError);
    await expect(svc.auth.login('tidakada', TEMP_PASSWORD)).rejects.toThrow(
      /NIP\/username atau password salah/,
    );
  });

  it('password salah ditolak dengan pesan yang sama (anti-enumerasi)', async () => {
    await provision('emp-nur');
    await expect(svc.auth.login('nur', 'salah')).rejects.toThrow(
      /NIP\/username atau password salah/,
    );
  });

  it('akun nonaktif tidak dapat masuk', async () => {
    await loginAdmin();
    await svc.accounts.provision('emp-nur');
    await svc.accounts.setActive('emp-nur', false);
    await svc.auth.logout();
    await expect(svc.auth.login('nur', TEMP_PASSWORD)).rejects.toBeInstanceOf(AuthError);
  });

  it('pegawai nonaktif tidak dapat masuk walau akunnya aktif', async () => {
    await loginAdmin();
    await svc.accounts.provision('emp-ferry');
    await svc.employees.setActive('emp-ferry', false, ACTOR);
    await svc.auth.logout();
    await expect(svc.auth.login('ferry', TEMP_PASSWORD)).rejects.toBeInstanceOf(AuthError);
  });

  it('rate limiting: 5 kegagalan mengunci login', async () => {
    for (let i = 0; i < 5; i += 1) {
      await expect(svc.auth.login('user', 'salah')).rejects.toBeInstanceOf(AuthError);
    }
    await expect(svc.auth.login('user', TEMP_PASSWORD)).rejects.toBeInstanceOf(RateLimitError);
  });

  it('login gagal tercatat pada audit', async () => {
    await expect(svc.auth.login('user', 'salah')).rejects.toBeInstanceOf(AuthError);
    await loginAdmin();
    const { entries } = await svc.audit.list({ action: 'LOGIN_FAILED' });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('logout mengakhiri sesi', async () => {
    await loginDemo();
    await svc.auth.logout();
    expect((await svc.auth.getState()).session).toBeNull();
  });
});

describe('auth — password default & reset', () => {
  it('akun baru langsung bisa masuk tanpa dipaksa ganti password', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    expect((await svc.auth.getState()).mustChangePassword).toBe(false);
  });

  it('pegawai dapat mengganti password sendiri dengan password lama', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await svc.auth.changeOwnPassword('passwordAman123', TEMP_PASSWORD);
    const state = await svc.auth.getState();
    expect(state.mustChangePassword).toBe(false);
  });

  it('ganti password menolak password lama yang salah', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await expect(svc.auth.changeOwnPassword('passwordAman123', 'salahsalah')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('password baru tidak boleh sama dengan password default', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await expect(svc.auth.changeOwnPassword(TEMP_PASSWORD, TEMP_PASSWORD)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('password baru minimal 8 karakter', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await expect(svc.auth.changeOwnPassword('pendek', TEMP_PASSWORD)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('password baru berlaku untuk login berikutnya', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await svc.auth.changeOwnPassword('passwordAman123', TEMP_PASSWORD);
    await svc.auth.logout();
    await expect(svc.auth.login('nur', TEMP_PASSWORD)).rejects.toBeInstanceOf(AuthError);
    const session = await svc.auth.login('nur', 'passwordAman123');
    expect(session.role).toBe('EMPLOYEE');
  });

  it('reset password Admin mengembalikan password default tanpa memaksa ganti', async () => {
    await provision('emp-nur');
    await svc.auth.login('nur', TEMP_PASSWORD);
    await svc.auth.changeOwnPassword('passwordAman123', TEMP_PASSWORD);
    await svc.auth.logout();

    await loginAdmin();
    await svc.accounts.resetPassword('emp-nur');
    await svc.auth.logout();

    await expect(svc.auth.login('nur', 'passwordAman123')).rejects.toBeInstanceOf(AuthError);
    await svc.auth.login('nur', TEMP_PASSWORD);
    expect((await svc.auth.getState()).mustChangePassword).toBe(false);
  });

  it('provisioning bersifat idempotent (tidak membuat akun ganda)', async () => {
    await loginAdmin();
    // Seed sudah menyediakan akun untuk SEMUA pegawai (password default 12345678),
    // jadi provisionAll bersifat aman diulang: tidak ada akun baru, semua dilewati.
    const first = await svc.accounts.provisionAll();
    const second = await svc.accounts.provisionAll();
    expect(first.created).toBe(0);
    expect(first.skipped).toBeGreaterThan(0);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(first.skipped);
  });

  it('hanya Admin yang dapat mengelola akun pegawai', async () => {
    await loginDemo();
    await expect(svc.accounts.list()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.accounts.provision('emp-nur')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// Akun DEMO — read-only
// ---------------------------------------------------------------------------

describe('akun DEMO read-only', () => {
  it('DEMO tidak dapat membuat pekerjaan', async () => {
    await loginDemo();
    await expect(
      svc.tasks.create(
        { title: 'Uji', stepId: 'step-todo', durationType: 'JANGKA_PENDEK', priority: 'SEDANG' },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('DEMO tidak dapat mengubah board maupun step', async () => {
    await loginDemo();
    await expect(svc.board.createStep({ name: 'X' }, ACTOR)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(svc.board.rename('Judul Baru', 1, ACTOR)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('DEMO tetap dapat membaca pekerjaan & pegawai', async () => {
    await loginDemo();
    expect((await svc.tasks.list()).length).toBeGreaterThan(0);
    expect((await svc.employees.list()).length).toBeGreaterThan(0);
  });

  it('DEMO tidak dapat melihat daftar sesi maupun audit log lengkap', async () => {
    await loginDemo();
    await expect(svc.auth.listSessions()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.audit.list()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// Hak akses pekerjaan: Staf, anggota tim, Pimpinan, Admin
// ---------------------------------------------------------------------------

describe('hak akses pekerjaan', () => {
  const NEW_TASK = {
    stepId: 'step-todo',
    durationType: 'JANGKA_PENDEK',
    priority: 'SEDANG',
  } as const;

  it('Staf membuat pekerjaan untuk dirinya sendiri (owner & PIC utama otomatis)', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    const task = await svc.tasks.create(
      { ...NEW_TASK, title: 'Tugas mandiri', picMainIds: ['emp-nur'] },
      { employeeId: 'emp-nur' },
    );
    expect(task.ownerEmployeeId).toBe('emp-nur');
    expect(task.taskType).toBe('MANDIRI');
    expect(task.picMainIds).toEqual(['emp-nur']);
  });

  it('Staf TIDAK dapat membuat pekerjaan yang hanya ditugaskan ke pegawai lain', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    await expect(
      svc.tasks.create(
        { ...NEW_TASK, title: 'Untuk orang lain', picMainIds: ['emp-ulfi'] },
        { employeeId: 'emp-nur' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Staf tidak dapat membuat disposisi', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    await expect(
      svc.tasks.create(
        { ...NEW_TASK, title: 'Disposisi ilegal', taskType: 'DISPOSISI', picMainIds: ['emp-ulfi'] },
        { employeeId: 'emp-nur' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Staf dapat mengundang rekan sebagai anggota tim', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    const task = await svc.tasks.create(
      {
        ...NEW_TASK,
        title: 'Tugas bersama',
        picMainIds: ['emp-nur'],
        picIds: ['emp-ulfi'],
      },
      { employeeId: 'emp-nur' },
    );
    expect(task.picIds).toContain('emp-ulfi');
  });

  it('Pimpinan dapat mendisposisikan pekerjaan kepada pegawai lain', async () => {
    await provision('emp-rakean');
    await loginEmployee('rakean');
    const task = await svc.tasks.create(
      {
        ...NEW_TASK,
        title: 'Disposisi resmi',
        taskType: 'DISPOSISI',
        picMainIds: ['emp-nur'],
        picIds: ['emp-ulfi'],
      },
      { employeeId: 'emp-rakean' },
    );
    expect(task.taskType).toBe('DISPOSISI');
    expect(task.disposedByEmployeeId).toBe('emp-rakean');
    expect(task.ownerEmployeeId).toBe('emp-rakean');
    expect(task.picMainIds).toEqual(['emp-nur']);
  });

  it('anggota tim dapat memperbarui progres, tetapi tidak dapat mengganti PIC utama', async () => {
    await loginAdmin();
    await svc.accounts.provision('emp-nur');
    await svc.accounts.provision('emp-ulfi');
    const task = await svc.tasks.create(
      {
        ...NEW_TASK,
        title: 'Kerja tim',
        picMainIds: ['emp-nur'],
        picIds: ['emp-ulfi'],
      },
      ACTOR,
    );
    await svc.auth.logout();

    await loginEmployee('ulfi');
    const updated = await svc.tasks.update(
      task.id,
      { manualProgress: 60 },
      task.version,
      { employeeId: 'emp-ulfi' },
    );
    expect(updated.manualProgress).toBe(60);
    await expect(
      svc.tasks.update(
        task.id,
        { picMainIds: ['emp-ulfi'] },
        updated.version,
        { employeeId: 'emp-ulfi' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pegawai di luar tim tidak dapat mengubah pekerjaan', async () => {
    await loginAdmin();
    await svc.accounts.provision('emp-nur');
    await svc.accounts.provision('emp-dhani');
    const task = await svc.tasks.create(
      { ...NEW_TASK, title: 'Bukan urusan Dhani', picMainIds: ['emp-nur'] },
      ACTOR,
    );
    await svc.auth.logout();

    await loginEmployee('dhani');
    await expect(
      svc.tasks.update(task.id, { manualProgress: 10 }, task.version, {
        employeeId: 'emp-dhani',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pegawai di luar tim tidak dapat melihat pekerjaan pegawai lain', async () => {
    await provision('emp-dhani');
    await loginEmployee('dhani');
    expect(await svc.tasks.list()).toHaveLength(0);
  });

  it('profil pekerjaan pegawai dibatasi ke diri sendiri dan 10 item per halaman', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');

    const own = await svc.tasks.listForEmployeeProfile('emp-nur', {
      filter: 'SEMUA',
      page: 1,
      today: '2026-08-12',
    });
    expect(own.pageSize).toBe(10);
    expect(own.items.length).toBeLessThanOrEqual(10);
    expect(own.total).toBe(own.summary.total);

    await expect(
      svc.tasks.listForEmployeeProfile('emp-ulfi', {
        filter: 'SEMUA',
        page: 1,
        today: '2026-08-12',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('hapus permanen hanya Admin', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    const task = await svc.tasks.create(
      { ...NEW_TASK, title: 'Milik sendiri', picMainIds: ['emp-nur'] },
      { employeeId: 'emp-nur' },
    );
    await expect(
      svc.tasks.permanentDelete(task.id, { employeeId: 'emp-nur' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('Admin memiliki akses penuh atas seluruh pekerjaan', async () => {
    await loginAdmin();
    const deleted = (await svc.tasks.list({ includeDeleted: true })).find((t) => t.deletedAt);
    expect(deleted).toBeDefined();
    await svc.tasks.permanentDelete(deleted!.id, { employeeId: 'emp-sucianingsih' });
    const after = await svc.tasks.list({ includeDeleted: true });
    expect(after.find((t) => t.id === deleted!.id)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Notifikasi per pengguna
// ---------------------------------------------------------------------------

describe('notifikasi per pengguna', () => {
  it('disposisi membuat notifikasi untuk PIC utama & anggota tim', async () => {
    await loginAdmin();
    await svc.accounts.provisionAll();
    await svc.tasks.create(
      {
        title: 'Susun laporan',
        stepId: 'step-todo',
        durationType: 'JANGKA_PENDEK',
        priority: 'SEDANG',
        taskType: 'DISPOSISI',
        picMainIds: ['emp-nur'],
        picIds: ['emp-ulfi'],
      },
      ACTOR,
    );
    await svc.auth.logout();

    await loginEmployee('nur');
    const nurNotifs = await svc.notifications.list();
    expect(nurNotifs.some((n) => n.type === 'TASK_DISPOSED')).toBe(true);
    expect(await svc.notifications.unreadCount()).toBeGreaterThan(0);
    await svc.auth.logout();

    await loginEmployee('ulfi');
    const ulfiNotifs = await svc.notifications.list();
    expect(ulfiNotifs.some((n) => n.type === 'MEMBER_ADDED')).toBe(true);
  });

  it('pengguna hanya melihat notifikasi miliknya sendiri', async () => {
    await loginAdmin();
    await svc.accounts.provisionAll();
    await svc.tasks.create(
      {
        title: 'Hanya untuk Nur',
        stepId: 'step-todo',
        durationType: 'JANGKA_PENDEK',
        priority: 'SEDANG',
        taskType: 'DISPOSISI',
        picMainIds: ['emp-nur'],
      },
      ACTOR,
    );
    await svc.auth.logout();

    await loginEmployee('dhani');
    const dhani = await svc.notifications.list();
    expect(dhani.every((n) => n.recipientEmployeeId === 'emp-dhani')).toBe(true);
    expect(dhani.some((n) => n.title.includes('Disposisi'))).toBe(false);
  });

  it('tandai dibaca & tandai semua dibaca mengubah unread count', async () => {
    await loginAdmin();
    await svc.accounts.provisionAll();
    await svc.tasks.create(
      {
        title: 'Notifikasi uji',
        stepId: 'step-todo',
        durationType: 'JANGKA_PENDEK',
        priority: 'SEDANG',
        taskType: 'DISPOSISI',
        picMainIds: ['emp-nur'],
      },
      ACTOR,
    );
    await svc.auth.logout();

    await loginEmployee('nur');
    const before = await svc.notifications.unreadCount();
    expect(before).toBeGreaterThan(0);
    const [first] = await svc.notifications.list({ unreadOnly: true });
    await svc.notifications.markRead(first!.id);
    expect(await svc.notifications.unreadCount()).toBe(before - 1);
    await svc.notifications.markAllRead();
    expect(await svc.notifications.unreadCount()).toBe(0);
  });

  it('notifikasi menyimpan tautan ke pekerjaan terkait (deep link)', async () => {
    await loginAdmin();
    await svc.accounts.provisionAll();
    const task = await svc.tasks.create(
      {
        title: 'Deep link',
        stepId: 'step-todo',
        durationType: 'JANGKA_PENDEK',
        priority: 'SEDANG',
        taskType: 'DISPOSISI',
        picMainIds: ['emp-nur'],
      },
      ACTOR,
    );
    await svc.auth.logout();
    await loginEmployee('nur');
    const notifs = await svc.notifications.list();
    expect(notifs.some((n) => n.taskId === task.id)).toBe(true);
  });

  it('reset password oleh Admin memberi notifikasi kepada pegawai', async () => {
    await provision('emp-nur');
    await loginAdmin();
    await svc.accounts.resetPassword('emp-nur');
    await svc.auth.logout();
    await svc.auth.login('nur', TEMP_PASSWORD);
    await svc.auth.changeOwnPassword('passwordAman123', TEMP_PASSWORD);
    const notifs = await svc.notifications.list();
    expect(notifs.some((n) => n.type === 'PASSWORD_RESET')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lampiran berkelompok + riwayat versi
// ---------------------------------------------------------------------------

describe('lampiran & riwayat versi', () => {
  const file = (name: string, content = 'isi') =>
    new File([content], name, { type: 'text/plain' });

  async function siapkanTugas() {
    await loginAdmin();
    const task = await svc.tasks.create(
      {
        title: 'Lampiran uji',
        stepId: 'step-todo',
        durationType: 'JANGKA_PENDEK',
        priority: 'SEDANG',
        picMainIds: ['emp-hesti'],
      },
      ACTOR,
    );
    return task;
  }

  it('unggah versi pertama membuat kelompok lampiran v1', async () => {
    const task = await siapkanTugas();
    const group = await svc.attachments.createGroup(
      task.id,
      { title: 'Dokumen Utama', file: file('draft.txt'), changeNote: 'Versi awal' },
      ACTOR,
    );
    expect(group.versions).toHaveLength(1);
    expect(group.versions[0]!.version).toBe(1);
    expect(group.versions[0]!.changeNote).toBe('Versi awal');
  });

  it('versi berikutnya bertambah dan versi lama tetap tersimpan', async () => {
    const task = await siapkanTugas();
    const group = await svc.attachments.createGroup(
      task.id,
      { title: 'Dokumen Utama', file: file('v1.txt') },
      ACTOR,
    );
    const updated = await svc.attachments.addVersion(
      group.id,
      { file: file('v2.txt'), changeNote: 'Perbaikan angka' },
      ACTOR,
    );
    expect(updated.versions).toHaveLength(2);
    expect(updated.versions[0]!.version).toBe(2);
    expect(updated.versions.map((v) => v.fileName)).toContain('v1.txt');
  });

  it('versi lama tetap dapat diunduh', async () => {
    const task = await siapkanTugas();
    const group = await svc.attachments.createGroup(
      task.id,
      { title: 'Dokumen', file: file('lama.txt') },
      ACTOR,
    );
    await svc.attachments.addVersion(group.id, { file: file('baru.txt') }, ACTOR);
    const url = await svc.attachments.versionDownloadUrl(group.versions[0]!.id);
    expect(url).toBeTruthy();
  });

  it('soft delete versi dapat dipulihkan', async () => {
    const task = await siapkanTugas();
    const group = await svc.attachments.createGroup(
      task.id,
      { title: 'Dokumen', file: file('a.txt') },
      ACTOR,
    );
    const versionId = group.versions[0]!.id;
    await svc.attachments.softDeleteVersion(versionId, ACTOR);
    const setelahHapus = await svc.attachments.listGroups(task.id, { includeDeleted: true });
    expect(setelahHapus[0]!.versions[0]!.deletedAt).toBeTruthy();
    await svc.attachments.restoreVersion(versionId, ACTOR);
    const setelahPulih = await svc.attachments.listGroups(task.id);
    expect(setelahPulih[0]!.versions[0]!.deletedAt).toBeNull();
  });

  it('hapus permanen kelompok lampiran hanya Admin', async () => {
    const task = await siapkanTugas();
    const group = await svc.attachments.createGroup(
      task.id,
      { title: 'Dokumen', file: file('a.txt') },
      ACTOR,
    );
    await svc.auth.logout();
    await provision('emp-hesti');
    await loginEmployee('hesti');
    await expect(
      svc.attachments.permanentDeleteGroup(group.id, { employeeId: 'emp-hesti' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('pegawai di luar tim tidak dapat mengunggah lampiran', async () => {
    const task = await siapkanTugas();
    await svc.auth.logout();
    await provision('emp-dhani');
    await loginEmployee('dhani');
    await expect(
      svc.attachments.createGroup(
        task.id,
        { title: 'Selundupan', file: file('x.txt') },
        { employeeId: 'emp-dhani' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// Pemeriksaan lama yang tetap berlaku
// ---------------------------------------------------------------------------

describe('pegawai pelaku (actor)', () => {
  it('mutasi tanpa pegawai pelaku valid ditolak', async () => {
    await loginAdmin();
    await expect(
      svc.tasks.create(
        { title: 'Uji', stepId: 'step-todo', durationType: 'JANGKA_PENDEK', priority: 'SEDANG' },
        { employeeId: 'tidak-ada' },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('pegawai nonaktif tidak dapat menjadi pelaku maupun PIC baru', async () => {
    await loginAdmin();
    await svc.employees.setActive('emp-ferry', false, { employeeId: 'emp-sucianingsih' });
    await expect(
      svc.tasks.create(
        { title: 'Uji', stepId: 'step-todo', durationType: 'JANGKA_PENDEK', priority: 'SEDANG' },
        { employeeId: 'emp-ferry' },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      svc.tasks.create(
        {
          title: 'Uji PIC',
          stepId: 'step-todo',
          durationType: 'JANGKA_PENDEK',
          priority: 'SEDANG',
          picMainId: 'emp-ferry',
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('konflik (optimistic concurrency)', () => {
  it('update dengan versi usang memicu ConflictError', async () => {
    await loginAdmin();
    const created = await svc.tasks.create(
      { title: 'Konflik', stepId: 'step-todo', durationType: 'JANGKA_PENDEK', priority: 'SEDANG' },
      ACTOR,
    );
    await svc.tasks.update(created.id, { title: 'Versi A' }, created.version, ACTOR);
    await expect(
      svc.tasks.update(created.id, { title: 'Versi B' }, created.version, ACTOR),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('pengamanan step', () => {
  it('step berisi kartu tidak dapat dihapus tanpa step tujuan', async () => {
    await loginAdmin();
    await expect(svc.board.deleteStep('step-onprogress', {}, ACTOR)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('hapus step dengan tujuan memindahkan seluruh kartu (tidak ada yang hilang)', async () => {
    await loginAdmin();
    const before = await svc.tasks.list({ includeArchived: true });
    const moving = before.filter((t) => t.stepId === 'step-onprogress');
    expect(moving.length).toBeGreaterThan(0);
    await svc.board.deleteStep('step-onprogress', { moveCardsToStepId: 'step-todo' }, ACTOR);
    const after = await svc.tasks.list({ includeArchived: true });
    expect(after.length).toBe(before.length);
    expect(after.filter((t) => t.stepId === 'step-onprogress')).toHaveLength(0);
    const steps = await svc.board.listSteps();
    expect(steps.find((s) => s.id === 'step-onprogress')).toBeUndefined();
  });

  it('step kosong terhapus sebagai soft delete', async () => {
    await loginAdmin();
    const created = await svc.board.createStep({ name: 'Step Uji' }, ACTOR);
    await svc.board.deleteStep(created.id, {}, ACTOR);
    const steps = await svc.board.listSteps({ includeDeleted: true });
    expect(steps.find((s) => s.id === created.id)?.deletedAt).toBeTruthy();
  });
});

describe('hak akses master data', () => {
  it('pegawai biasa tidak dapat mengelola master pegawai / pengaturan / penyaluran', async () => {
    await provision('emp-nur');
    await loginEmployee('nur');
    await expect(
      svc.employees.create(
        {
          fullName: 'Baru',
          displayName: 'Baru',
          initials: 'BR',
          color: 'blue',
          position: 'Staf',
          team: 'Tim',
        },
        { employeeId: 'emp-nur' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      svc.settings.update({ appName: 'X' }, 1, { employeeId: 'emp-nur' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      svc.distribution.createDraft({ year: 2026, period: 'Termin 2', rows: [] }, {
        employeeId: 'emp-nur',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

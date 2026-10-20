import { describe, expect, it } from 'vitest';
import type { Task } from '@/services/types';
import {
  canCreateTask,
  canDispose,
  canEditTask,
  canManageTask,
  canPermanentDelete,
  canWrite,
  isMyTask,
  taskParticipantIds,
  taskRole,
  type Viewer,
} from './permissions';

const ADMIN: Viewer = { accountType: 'ADMIN', employeeId: null, level: null };
const DEMO: Viewer = { accountType: 'DEMO', employeeId: null, level: null };
const STAF: Viewer = { accountType: 'EMPLOYEE', employeeId: 'nur', level: 'STAFF' };
const ANGGOTA: Viewer = { accountType: 'EMPLOYEE', employeeId: 'ulfi', level: 'STAFF' };
const LUAR: Viewer = { accountType: 'EMPLOYEE', employeeId: 'dhani', level: 'STAFF' };
const PIMPINAN: Viewer = { accountType: 'EMPLOYEE', employeeId: 'thoriq', level: 'LEADER' };

function makeTask(partial: Partial<Task> = {}): Task {
  return {
    id: 't1',
    boardId: 'b',
    stepId: 's1',
    title: 'Tugas',
    description: '',
    durationType: 'JANGKA_PENDEK',
    categoryId: null,
    labelIds: [],
    priority: 'SEDANG',
    startDate: null,
    dueDate: null,
    progressMode: 'MANUAL',
    manualProgress: 0,
    picMainIds: ['nur'],
    picMainId: 'nur',
    picIds: ['ulfi'],
    ownerEmployeeId: 'nur',
    taskType: 'MANDIRI',
    disposedByEmployeeId: null,
    driveFolderId: null,
    checklist: [],
    isFocus: false,
    sortOrder: 0,
    archivedAt: null,
    deletedAt: null,
    deleteReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    version: 1,
    createdByEmployeeId: 'nur',
    updatedByEmployeeId: 'nur',
    ...partial,
  };
}

describe('hak tulis dasar', () => {
  it('akun DEMO tidak pernah boleh menulis', () => {
    expect(canWrite(DEMO)).toBe(false);
    expect(canCreateTask(DEMO)).toBe(false);
    expect(canDispose(DEMO)).toBe(false);
    expect(canEditTask(DEMO, makeTask())).toBe(false);
  });

  it('ADMIN & EMPLOYEE boleh menulis', () => {
    expect(canWrite(ADMIN)).toBe(true);
    expect(canWrite(STAF)).toBe(true);
  });

  it('hapus permanen hanya Admin', () => {
    expect(canPermanentDelete(ADMIN)).toBe(true);
    expect(canPermanentDelete(PIMPINAN)).toBe(false);
    expect(canPermanentDelete(STAF)).toBe(false);
  });

  it('hanya Pimpinan & Admin yang dapat mendisposisikan', () => {
    expect(canDispose(PIMPINAN)).toBe(true);
    expect(canDispose(ADMIN)).toBe(true);
    expect(canDispose(STAF)).toBe(false);
  });
});

describe('peran terhadap pekerjaan', () => {
  const task = makeTask();

  it('pemilik dikenali sebagai OWNER', () => {
    expect(taskRole(STAF, task)).toBe('OWNER');
    expect(canManageTask(STAF, task)).toBe(true);
  });

  it('anggota tim dikenali sebagai MEMBER dan tidak dapat mengelola', () => {
    expect(taskRole(ANGGOTA, task)).toBe('MEMBER');
    expect(canEditTask(ANGGOTA, task)).toBe(true);
    expect(canManageTask(ANGGOTA, task)).toBe(false);
  });

  it('pegawai di luar tim tidak memiliki hak ubah', () => {
    expect(taskRole(LUAR, task)).toBe('NONE');
    expect(canEditTask(LUAR, task)).toBe(false);
  });

  it('Admin selalu memiliki akses penuh', () => {
    expect(taskRole(ADMIN, task)).toBe('ADMIN');
    expect(canManageTask(ADMIN, task)).toBe(true);
  });

  it('Pimpinan pendisposisi memegang kendali pekerjaan yang ia buat', () => {
    const disposisi = makeTask({
      ownerEmployeeId: 'thoriq',
      createdByEmployeeId: 'thoriq',
      disposedByEmployeeId: 'thoriq',
      taskType: 'DISPOSISI',
      picMainIds: ['nur'],
      picMainId: 'nur',
    });
    expect(taskRole(PIMPINAN, disposisi)).toBe('OWNER');
    expect(canManageTask(PIMPINAN, disposisi)).toBe(true);
    // PIC utama tetap hanya anggota operasional.
    expect(taskRole(STAF, disposisi)).toBe('MEMBER');
    expect(canManageTask(STAF, disposisi)).toBe(false);
  });
});

describe('Pekerjaan Saya', () => {
  it('mencakup pemilik, PIC utama, anggota, dan pembuat', () => {
    const task = makeTask();
    expect(isMyTask(STAF, task)).toBe(true);
    expect(isMyTask(ANGGOTA, task)).toBe(true);
    expect(isMyTask(LUAR, task)).toBe(false);
  });

  it('untuk Pimpinan mencakup pekerjaan yang ia disposisikan', () => {
    const disposisi = makeTask({
      ownerEmployeeId: 'thoriq',
      createdByEmployeeId: 'thoriq',
      disposedByEmployeeId: 'thoriq',
      taskType: 'DISPOSISI',
    });
    expect(isMyTask(PIMPINAN, disposisi)).toBe(true);
  });

  it('daftar peserta tidak memuat duplikat maupun nilai kosong', () => {
    const ids = taskParticipantIds(
      makeTask({ picMainIds: ['nur', 'nur'], picIds: ['nur', 'ulfi'], disposedByEmployeeId: null }),
    );
    expect(ids).toEqual(['nur', 'ulfi']);
  });
});

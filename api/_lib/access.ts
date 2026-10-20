/**
 * Pemeriksaan hak akses pekerjaan di SISI SERVER.
 *
 * Cerminan fungsi `task_role_for_current` / `can_edit_task` pada migrasi 0008.
 * Diperlukan karena endpoint server memakai service role (melewati RLS),
 * sehingga izin harus diperiksa secara eksplisit di sini.
 */
import type { ServerEnv } from './env.js';
import { dbClient, type AccountInfo } from './supabase.js';

export interface TaskAccessRow {
  id: string;
  title: string;
  owner_employee_id: string | null;
  created_by_employee_id: string | null;
  disposed_by_employee_id: string | null;
  pic_main_id: string | null;
  pic_main_ids: string[] | null;
  pic_ids: string[] | null;
  drive_folder_id: string | null;
  deleted_at: string | null;
}

const TASK_FIELDS =
  'id,title,owner_employee_id,created_by_employee_id,disposed_by_employee_id,' +
  'pic_main_id,pic_main_ids,pic_ids,drive_folder_id,deleted_at';

export async function getTask(env: ServerEnv, taskId: string): Promise<TaskAccessRow | null> {
  const rows = await dbClient(env).select<TaskAccessRow>(
    'tasks',
    `select=${TASK_FIELDS}&id=eq.${taskId}&limit=1`,
  );
  return rows[0] ?? null;
}

export type TaskRole = 'ADMIN' | 'OWNER' | 'MEMBER' | 'NONE';

export function taskRole(account: AccountInfo, task: TaskAccessRow): TaskRole {
  if (account.role === 'ADMIN') return 'ADMIN';
  const me = account.employeeId;
  if (!me || account.role !== 'EMPLOYEE') return 'NONE';
  if (
    task.owner_employee_id === me ||
    task.created_by_employee_id === me ||
    task.disposed_by_employee_id === me
  ) {
    return 'OWNER';
  }
  if (
    task.pic_main_id === me ||
    (task.pic_main_ids ?? []).includes(me) ||
    (task.pic_ids ?? []).includes(me)
  ) {
    return 'MEMBER';
  }
  return 'NONE';
}

/** Boleh menambah/mengubah lampiran & komentar pekerjaan ini. */
export function canEditTask(account: AccountInfo, task: TaskAccessRow): boolean {
  return taskRole(account, task) !== 'NONE';
}

import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { loginAsAdmin } from './helpers';

function readDotEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const entries: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line) || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (key && entries[key] === undefined) entries[key] = value;
  }
  return entries;
}

function env(name: string, dotEnv = readDotEnv()): string {
  return process.env[name] ?? dotEnv[name] ?? '';
}

function supabaseServiceClient() {
  const dotEnv = readDotEnv();
  const url = env('VITE_SUPABASE_URL', dotEnv) || env('NEXT_PUBLIC_SUPABASE_URL', dotEnv);
  const key = env('SUPABASE_SERVICE_ROLE_KEY', dotEnv);
  if (!url || !key) throw new Error('Supabase service env wajib tersedia untuk audit E2E.');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });
}

test.describe('audit metadata', () => {
  test('mencatat account_user_id dan employee_actor_id pada aksi pekerjaan', async ({ page }) => {
    const sb = supabaseServiceClient();
    const { data: actor, error: actorError } = await sb
      .from('employees')
      .select('id')
      .eq('full_name', 'Tri Hesti Wahyudiati')
      .single();
    expect(actorError).toBeNull();
    if (!actor?.id) throw new Error('Pegawai pelaku E2E tidak ditemukan.');
    const actorId = actor.id as string;

    const title = `E2E audit metadata ${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto('/pekerjaan');
    await page.getByRole('button', { name: 'Pekerjaan baru' }).click();
    const dialog = page.getByRole('dialog', { name: 'Pekerjaan Baru' });
    await dialog.getByLabel(/Judul pekerjaan/).fill(title);
    await dialog.getByLabel(/^Step/).selectOption({ label: 'To Do' });
    // PIC utama kini multi-select searchable (checkbox)
    await dialog.getByLabel('PIC utama').click();
    await page.getByRole('checkbox', { name: 'Tri Hesti Wahyudiati' }).click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Buat pekerjaan' }).click();
    await expect(page.getByText('Pekerjaan dibuat.')).toBeVisible();

    let auditRow: {
      employee_id: string | null;
      after: { account_user_id?: string; employee_actor_id?: string } | null;
    } | null = null;
    const deadline = Date.now() + 10_000;
    while (!auditRow && Date.now() < deadline) {
      const { data: task } = await sb.from('tasks').select('id').eq('title', title).maybeSingle();
      if (task?.id) {
        const { data } = await sb
          .from('audit_log')
          .select('employee_id, after')
          .eq('entity_type', 'TASK')
          .eq('action', 'CREATE')
          .eq('entity_id', task.id)
          .maybeSingle();
        auditRow = data as typeof auditRow;
      }
      if (!auditRow) await page.waitForTimeout(250);
    }
    expect(auditRow).not.toBeNull();

    const row = auditRow!;
    expect(row.employee_id).toBe(actorId);
    expect(row.after?.account_user_id).toEqual(expect.any(String));
    expect(row.after?.employee_actor_id).toBe(actorId);
  });
});

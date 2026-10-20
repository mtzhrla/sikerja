import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

type TableName =
  | 'steps'
  | 'tasks'
  | 'task_comments'
  | 'attachments'
  | 'attachment_groups'
  | 'attachment_versions'
  | 'notifications'
  | 'device_sessions'
  | 'audit_log'
  | 'distribution_snapshots';

interface TableConfig {
  name: TableName;
  pk: string;
}

interface SnapshotFile {
  takenAt: string;
  tables: Record<TableName, Array<Record<string, unknown>>>;
}

const SNAPSHOT_PATH = path.resolve(process.cwd(), 'test-results', 'supabase-e2e-snapshot.json');



const DELETE_ORDER: TableName[] = [
  'distribution_snapshots',
  'notifications',
  'attachment_versions',
  'attachment_groups',
  'attachments',
  'task_comments',
  'audit_log',
  'device_sessions',
  'tasks',
  'steps',
];

const RESTORE_ORDER: TableName[] = [
  'steps',
  'tasks',
  'task_comments',
  'attachments',
  'attachment_groups',
  'attachment_versions',
  'notifications',
  'device_sessions',
  'audit_log',
  'distribution_snapshots',
];

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

function shouldSnapshot(dotEnv = readDotEnv()): boolean {
  if (process.env.E2E_SUPABASE_SNAPSHOT === '0') return false;
  const mode = (
    env('VITE_DATA_MODE', dotEnv) || env('NEXT_PUBLIC_DATA_MODE', dotEnv)
  ).toLowerCase();
  const hasSupabaseUrl = Boolean(
    env('VITE_SUPABASE_URL', dotEnv) || env('NEXT_PUBLIC_SUPABASE_URL', dotEnv),
  );
  return mode === 'supabase' || (mode !== 'local' && hasSupabaseUrl);
}

function serviceClient() {
  const dotEnv = readDotEnv();
  const url = env('VITE_SUPABASE_URL', dotEnv) || env('NEXT_PUBLIC_SUPABASE_URL', dotEnv);
  const key = env('SUPABASE_SERVICE_ROLE_KEY', dotEnv);
  if (!url || !key) {
    throw new Error(
      'E2E Supabase snapshot membutuhkan URL Supabase dan SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as never },
  });
}

async function readAllRows(
  client: ReturnType<typeof serviceClient>,
  table: TableConfig,
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from(table.name)
      .select('*')
      .order(table.pk, { ascending: true })
      .range(from, to);
    if (error) throw new Error(`Gagal snapshot tabel ${table.name}: ${error.message}`);
    rows.push(...((data ?? []) as Array<Record<string, unknown>>));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function snapshotSupabase(): Promise<void> {
  if (!shouldSnapshot()) return;
  const client = serviceClient();
  const snapshot: SnapshotFile = {
    takenAt: new Date().toISOString(),
    tables: {} as SnapshotFile['tables'],
  };
  for (const table of TABLES) {
    snapshot.tables[table.name] = await readAllRows(client, table);
  }
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot), 'utf8');
}

function chunks<T>(items: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function restoreSupabase(): Promise<void> {
  if (!shouldSnapshot() || !fs.existsSync(SNAPSHOT_PATH)) return;
  const client = serviceClient();
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8')) as SnapshotFile;
  const tableByName = new Map(TABLES.map((table) => [table.name, table]));

  for (const name of DELETE_ORDER) {
    const table = tableByName.get(name)!;
    const { error } = await client.from(name).delete().not(table.pk, 'is', null);
    if (error) throw new Error(`Gagal membersihkan tabel ${name}: ${error.message}`);
  }

  for (const name of RESTORE_ORDER) {
    const rows = snapshot.tables[name] ?? [];
    for (const part of chunks(rows)) {
      const { error } = await client.from(name).insert(part);
      if (error) throw new Error(`Gagal restore tabel ${name}: ${error.message}`);
    }
  }
}

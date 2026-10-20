/**
 * /api/sync/run
 * POST (Admin): { sourceId, mode: 'test' | 'preview' | 'sync', bindingId? }
 *   - test    → cek akses spreadsheet + keberadaan sheet + deteksi header.
 *   - preview → baris awal sheet untuk wizard mapping.
 *   - sync    → sinkronisasi manual "Sinkronkan Sekarang".
 * GET (cron Vercel / rekonsiliasi terjadwal): sinkronkan seluruh sumber aktif.
 *   Dilindungi header Authorization: Bearer <CRON_SECRET|GOOGLE_WEBHOOK_SECRET>.
 */
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { requireAdmin } from '../_lib/supabase.js';
import { previewBinding, syncAllActive, syncSource, testSource } from '../_lib/sync.js';
import { timingSafeEqual } from '../_lib/crypto.js';

interface RunBody {
  sourceId?: string;
  bindingId?: string;
  mode?: 'test' | 'preview' | 'sync';
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Supabase belum dikonfigurasi di server.', 503);
  if (!(await requireAdmin(env, request))) {
    return fail('Hanya Admin yang dapat menjalankan sinkronisasi.', 403);
  }

  let body: RunBody;
  try {
    body = (await request.json()) as RunBody;
  } catch {
    return fail('Body JSON tidak valid.');
  }
  if (!body.sourceId) return fail('sourceId wajib diisi.');

  try {
    switch (body.mode ?? 'sync') {
      case 'test':
        return json(await testSource(env, body.sourceId));
      case 'preview': {
        if (!body.bindingId) return fail('bindingId wajib diisi untuk preview.');
        const preview = await previewBinding(env, body.sourceId, body.bindingId);
        return json(preview);
      }
      case 'sync':
      default:
        return json(await syncSource(env, body.sourceId, 'MANUAL'));
    }
  } catch (err) {
    // Log server aman (tanpa credential); pengguna menerima pesan singkat.
    console.error('[sync/run]', err instanceof Error ? err.message : err);
    return fail('Sinkronisasi gagal. Periksa histori sinkronisasi untuk detail.', 500);
  }
}

export async function GET(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Supabase belum dikonfigurasi di server.', 503);
  const secret = process.env.CRON_SECRET || env.webhookSecret;
  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || !provided || !timingSafeEqual(provided, secret)) {
    return fail('Tidak berwenang.', 401);
  }
  try {
    const runs = await syncAllActive(env);
    // Notifikasi tenggat (mendekati tenggat / terlambat) — idempotent per hari.
    let dueNotifications = 0;
    try {
      const res = await fetch(`${env.supabaseUrl}/rest/v1/rpc/generate_due_notifications`, {
        method: 'POST',
        headers: {
          apikey: env.serviceRoleKey,
          Authorization: `Bearer ${env.serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (res.ok) dueNotifications = Number(await res.text()) || 0;
    } catch {
      // Notifikasi tenggat tidak boleh menggagalkan sinkronisasi terjadwal.
    }
    return json({ ok: true, runs: runs.length, dueNotifications });
  } catch (err) {
    console.error('[sync/cron]', err instanceof Error ? err.message : err);
    return fail('Rekonsiliasi terjadwal gagal.', 500);
  }
}

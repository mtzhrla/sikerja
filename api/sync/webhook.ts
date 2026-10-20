/**
 * POST /api/sync/webhook — dipanggil Google Apps Script saat spreadsheet
 * berubah (lihat google-apps-script/Code.gs).
 *
 * Keamanan (Docs/09 §X):
 *  - memverifikasi secret (header X-Webhook-Secret);
 *  - menolak request tidak sah;
 *  - TIDAK mempercayai payload mentah — server membaca ulang sheet sendiri;
 *  - idempotent: upsert berdasar source_row_key.
 */
import { timingSafeEqual } from '../_lib/crypto.js';
import { getEnv, supabaseConfigured } from '../_lib/env.js';
import { fail, json } from '../_lib/http.js';
import { syncBySpreadsheetId } from '../_lib/sync.js';

interface WebhookBody {
  spreadsheetId?: string;
}

export async function POST(request: Request): Promise<Response> {
  const env = getEnv();
  if (!supabaseConfigured(env)) return fail('Supabase belum dikonfigurasi di server.', 503);
  if (!env.webhookSecret) return fail('Webhook belum dikonfigurasi.', 503);

  const provided = request.headers.get('x-webhook-secret') ?? '';
  if (!provided || !timingSafeEqual(provided, env.webhookSecret)) {
    return fail('Tidak berwenang.', 401);
  }

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return fail('Body JSON tidak valid.');
  }
  const spreadsheetId = (body.spreadsheetId ?? '').trim();
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(spreadsheetId)) {
    return fail('spreadsheetId tidak valid.');
  }

  try {
    // Payload hanya dipakai sebagai PEMICU — data dibaca ulang dari Google.
    const runs = await syncBySpreadsheetId(env, spreadsheetId, 'WEBHOOK');
    return json({ ok: true, runs: runs.map((r) => ({ id: r.id, status: r.status })) });
  } catch (err) {
    console.error('[sync/webhook]', err instanceof Error ? err.message : err);
    return fail('Sinkronisasi webhook gagal.', 500);
  }
}

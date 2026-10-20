/**
 * Server Node minimal untuk deployment Render (Web Service).
 *
 * Menyajikan hasil build frontend (dist/) sebagai SPA dan meneruskan seluruh
 * route `/api/*` ke handler existing (api/**) TANPA menduplikasi logika bisnis.
 * Handler ditulis dengan Web standar (Request → Response); server ini hanya
 * menjembatani Node http ⇄ Web Fetch API.
 *
 * Prinsip (paritas dengan Vercel Functions):
 *  - `/api/*` tidak pernah jatuh ke index.html (404 JSON bila tak dikenal);
 *  - route SPA (mis. /dashboard, /pekerjaan, /admin) → index.html;
 *  - bind ke 0.0.0.0 dan process.env.PORT;
 *  - endpoint /health untuk health check Render;
 *  - tidak pernah mencetak nilai rahasia ke log;
 *  - graceful shutdown pada SIGTERM/SIGINT.
 *
 * Dijalankan lewat `tsx` (lihat script `start:render`) sehingga handler .ts
 * dipakai langsung tanpa build server terpisah.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type WebHandler = (request: Request) => Promise<Response> | Response;
type HandlerModule = { GET?: WebHandler; POST?: WebHandler };

const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(here, '..', 'dist');
const indexHtml = join(distDir, 'index.html');

/**
 * Peta route API → modul handler existing. Import literal agar resolver ESM/tsx
 * dapat memuat file .ts secara statis. Metode HTTP diambil dari export modul.
 */
const apiRoutes: Record<string, () => Promise<HandlerModule>> = {
  '/api/auth/login': () => import('../api/auth/login.ts'),
  '/api/auth/password': () => import('../api/auth/password.ts'),
  '/api/admin/accounts': () => import('../api/admin/accounts.ts'),
  '/api/attachments': () => import('../api/attachments/index.ts'),
  '/api/attachments/download': () => import('../api/attachments/download.ts'),
  '/api/sync/run': () => import('../api/sync/run.ts'),
  '/api/sync/webhook': () => import('../api/sync/webhook.ts'),
  '/api/integrations/google/start': () => import('../api/integrations/google/start.ts'),
  '/api/integrations/google/callback': () => import('../api/integrations/google/callback.ts'),
  '/api/integrations/google/status': () => import('../api/integrations/google/status.ts'),
  '/api/integrations/google/disconnect': () => import('../api/integrations/google/disconnect.ts'),
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Buka body request Node menjadi Buffer (kosong untuk GET/HEAD). */
function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? 'GET';
  if (method === 'GET' || method === 'HEAD') return Promise.resolve(undefined);
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolvePromise(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

/** Node IncomingMessage → Web Request (URL absolut dari header Host). */
async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? 'localhost';
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? 'http';
  const url = `${proto}://${host}${req.url ?? '/'}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  const body = await readBody(req);
  return new Request(url, {
    method: req.method,
    headers,
    body,
    // Diperlukan Node/undici saat body disertakan.
    ...(body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

/** Web Response → Node ServerResponse. */
async function sendWebResponse(res: ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  const buf = Buffer.from(await webRes.arrayBuffer());
  res.end(buf);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(body);
}

/** Selesaikan path statis dalam distDir dengan aman (cegah path traversal). */
function resolveStaticPath(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const candidate = normalize(join(distDir, clean));
  if (candidate !== distDir && !candidate.startsWith(distDir + sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

function serveFile(res: ServerResponse, filePath: string, cacheControl: string): void {
  const type = CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', cacheControl);
  createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    })
    .pipe(res);
}

async function serveIndex(res: ServerResponse): Promise<void> {
  try {
    const html = await readFile(indexHtml);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(html);
  } catch {
    sendJson(res, 500, { error: 'Build frontend tidak ditemukan. Jalankan `npm run build`.' });
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const pathname = (req.url ?? '/').split('?')[0] ?? '/';

  // Health check Render — ringan, tanpa dependensi eksternal.
  if (pathname === '/health' || pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok', uptime: process.uptime() });
    return;
  }

  // API: teruskan ke handler existing; JANGAN pernah fallback ke index.html.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const load = apiRoutes[pathname];
    if (!load) {
      sendJson(res, 404, { error: 'Endpoint tidak ditemukan.' });
      return;
    }
    let mod: HandlerModule;
    try {
      mod = await load();
    } catch (err) {
      console.error('[api] gagal memuat handler', pathname, err instanceof Error ? err.message : err);
      sendJson(res, 500, { error: 'Kesalahan server.' });
      return;
    }
    const handler = method === 'POST' ? mod.POST : method === 'GET' ? mod.GET : undefined;
    if (!handler) {
      sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
      return;
    }
    try {
      const webReq = await toWebRequest(req);
      const webRes = await handler(webReq);
      await sendWebResponse(res, webRes);
    } catch (err) {
      // Pesan aman untuk pengguna; detail hanya ke log server (tanpa secret).
      console.error('[api]', pathname, err instanceof Error ? err.message : err);
      sendJson(res, 500, { error: 'Kesalahan server.' });
    }
    return;
  }

  // GET/HEAD statis + SPA fallback. Metode lain di luar /api tidak didukung.
  if (method !== 'GET' && method !== 'HEAD') {
    sendJson(res, 405, { error: 'Metode tidak diizinkan.' });
    return;
  }

  const staticFile = resolveStaticPath(pathname);
  if (staticFile) {
    // Aset ber-hash Vite (/assets/*) aman di-cache lama; berkas lain konservatif.
    const cache = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600';
    serveFile(res, staticFile, cache);
    return;
  }

  // Route SPA (mis. /dashboard, /pekerjaan, /rencana-kegiatan, /daftar-pegawai,
  // /admin) → index.html agar React Router menangani navigasi di klien.
  await serveIndex(res);
}

const port = Number(process.env.PORT) || 10000;
const host = '0.0.0.0';

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[server]', err instanceof Error ? err.message : err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Kesalahan server.' });
    else res.end();
  });
});

server.listen(port, host, () => {
  // Tidak mencetak satu pun nilai environment/rahasia.
  console.log(`PIP Dashboard siap di http://${host}:${port} (health: /health)`);
});

// Graceful shutdown: hentikan koneksi baru, tunggu yang berjalan, lalu keluar.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Menerima ${signal} — mematikan server dengan rapi...`);
  server.close(() => {
    console.log('Server ditutup.');
    process.exit(0);
  });
  // Jaring pengaman bila koneksi menggantung.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

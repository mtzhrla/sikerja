/** Util respons HTTP untuk Vercel Web Handlers. */

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

/** Pesan error singkat untuk pengguna — tanpa stack trace / detail internal. */
export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
}

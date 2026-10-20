// Edge Function: admin-actions
// Operasi yang membutuhkan service role — hanya dapat dipanggil akun ADMIN.
// Deploy: supabase functions deploy admin-actions
//
// Aksi yang didukung:
//   { action: "change-user-password", newPassword: string }
//     → mengganti password akun bersama Tim PIP (role USER).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Tidak terautentikasi' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);

    // Verifikasi pemanggil & role ADMIN (server-side).
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'Sesi tidak valid' }, 401);

    const { data: roleRow } = await admin
      .from('account_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (roleRow?.role !== 'ADMIN') {
      return json({ error: 'Hanya Admin yang dapat melakukan tindakan ini' }, 403);
    }

    const body = (await req.json()) as { action?: string; newPassword?: string };

    if (body.action === 'change-user-password') {
      const newPassword = body.newPassword ?? '';
      if (newPassword.length < 8) {
        return json({ error: 'Password minimal 8 karakter' }, 400);
      }
      // Cari user id akun bersama (role USER).
      const { data: userRole } = await admin
        .from('account_roles')
        .select('user_id')
        .eq('role', 'USER')
        .maybeSingle();
      if (!userRole) return json({ error: 'Akun USER tidak ditemukan' }, 404);

      const { error: updErr } = await admin.auth.admin.updateUserById(userRole.user_id, {
        password: newPassword,
      });
      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Aksi tidak dikenal' }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

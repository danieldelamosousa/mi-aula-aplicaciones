import { ensureDb } from '../_lib/db.js';

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const origin = new URL(request.url).origin;

  try {
    await ensureDb(env.DB);
    const raw = decodeURIComponent(String(params.code || '')).trim().toUpperCase().replace(/\s+/g, '');
    const code = raw.includes('-') ? raw : (raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw);

    const session = await env.DB.prepare(
      'SELECT token, app_id, expires_at, ended_at FROM sessions WHERE code = ?'
    ).bind(code).first();

    if (!session || session.ended_at || new Date(session.expires_at).getTime() < Date.now()) {
      return Response.redirect(`${origin}/?codigo_invalido=1`, 302);
    }

    const dest = `${origin}/apps/${encodeURIComponent(session.app_id)}/index.html?aula=1#sesion=${encodeURIComponent(session.token)}`;
    return Response.redirect(dest, 302);
  } catch {
    return Response.redirect(`${origin}/?codigo_invalido=1`, 302);
  }
}

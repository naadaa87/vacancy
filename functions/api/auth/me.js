// GET /api/auth/me — 현재 로그인한 회원 정보
import { handle, json, hasDb, currentUser, publicUser, clearSessionCookies, mailConfigured } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  if (!hasDb(env)) return json({ ok: true, user: null, configured: false });
  const u = await currentUser(env, request);
  if (!u) return json({ ok: true, user: null, configured: true, mail: mailConfigured(env) }, 200, { 'Set-Cookie': clearSessionCookies(request) });
  return json({ ok: true, user: publicUser(env, u), configured: true, mail: mailConfigured(env) });
});

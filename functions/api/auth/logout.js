// POST /api/auth/logout — 로그아웃
import { handle, json, destroySession, clearSessionCookies } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  await destroySession(env, request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookies(request) });
});

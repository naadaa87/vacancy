// GET /api/auth/verify?token=… — 이메일 인증 링크
import { handle, db, consumeUserToken, nowIso } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  const token = new URL(request.url).searchParams.get('token');
  const userId = token ? await consumeUserToken(env, token, 'verify') : null;
  if (!userId) return Response.redirect(new URL('/account?verify=fail', request.url).toString(), 302);
  const DB = await db(env);
  await DB.prepare(`UPDATE users SET email_verified = 1, updated_at = ?1 WHERE id = ?2`).bind(nowIso(), userId).run();
  return Response.redirect(new URL('/account?verify=ok', request.url).toString(), 302);
});

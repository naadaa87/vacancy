// POST /api/account/password — 비밀번호 변경
import { handle, readJson, json, HttpError, db, requireUser, verifyPassword, hashPassword, passwordProblem, nowIso, getCookie, sha256, SESSION_COOKIE } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const u = await requireUser(env, request);
  if (!(await verifyPassword(String(b.current || ''), u.password_hash))) throw new HttpError('wrong_password', 401, { fields: ['current'] });
  const pwErr = passwordProblem(b.password);
  if (pwErr) throw new HttpError('validation', 422, { fields: ['password'], message: pwErr });
  const DB = await db(env);
  await DB.prepare(`UPDATE users SET password_hash=?1, updated_at=?2 WHERE id=?3`).bind(await hashPassword(b.password), nowIso(), u.id).run();
  // 지금 쓰는 기기를 제외한 다른 로그인은 모두 해제
  const keep = await sha256(getCookie(request, SESSION_COOKIE) || '');
  await DB.prepare(`DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2`).bind(u.id, keep).run();
  return json({ ok: true });
});

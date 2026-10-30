// POST /api/auth/reset — 새 비밀번호 저장 (재설정 링크의 token 필요)
import { handle, readJson, json, HttpError, db, consumeUserToken, hashPassword, passwordProblem, nowIso } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const pwErr = passwordProblem(b.password);
  if (pwErr) throw new HttpError('validation', 422, { fields: ['password'], message: pwErr });
  const userId = await consumeUserToken(env, b.token, 'reset');
  if (!userId) throw new HttpError('invalid_token', 400);
  const DB = await db(env);
  await DB.prepare(`UPDATE users SET password_hash = ?1, failed_logins = 0, locked_until = NULL, email_verified = 1, updated_at = ?2 WHERE id = ?3`)
    .bind(await hashPassword(b.password), nowIso(), userId).run();
  await DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run();
  return json({ ok: true });
});

// POST /api/account/delete — 회원 탈퇴 (비밀번호 확인)
import { handle, readJson, json, HttpError, db, requireUser, verifyPassword, clearSessionCookies } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const u = await requireUser(env, request);
  if (!(await verifyPassword(String(b.password || ''), u.password_hash))) throw new HttpError('wrong_password', 401, { fields: ['password'] });
  const DB = await db(env);
  await DB.batch([
    DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(u.id),
    DB.prepare(`DELETE FROM user_tokens WHERE user_id = ?1`).bind(u.id),
    // 상담 이력은 개인정보처리방침의 보유기간(상담 종료 후 1년)에 따라 남기되 회원 연결만 끊습니다
    DB.prepare(`UPDATE inquiries SET user_id = NULL WHERE user_id = ?1`).bind(u.id),
    DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(u.id),
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookies(request) });
});

// POST /api/auth/login — 로그인
import { handle, readJson, json, HttpError, db, normEmail, nowIso, verifyPassword, createSession } from '../../../lib/server.js';

const MAX_FAILS = 5, LOCK_MIN = 15;

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const email = normEmail(b.email);
  const password = String(b.password || '');
  if (!email || !password) throw new HttpError('validation', 422);
  const DB = await db(env);
  const u = await DB.prepare(`SELECT * FROM users WHERE email = ?1`).bind(email).first();
  if (!u) { await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAA'); throw new HttpError('invalid_credentials', 401); }
  if (u.locked_until && u.locked_until > nowIso()) throw new HttpError('locked', 429, { until: u.locked_until });
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) {
    const fails = (u.failed_logins || 0) + 1;
    const lock = fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MIN * 6e4).toISOString() : null;
    await DB.prepare(`UPDATE users SET failed_logins = ?1, locked_until = ?2 WHERE id = ?3`).bind(lock ? 0 : fails, lock, u.id).run();
    throw new HttpError(lock ? 'locked' : 'invalid_credentials', lock ? 429 : 401, lock ? { until: lock } : {});
  }
  await DB.prepare(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ?1 WHERE id = ?2`).bind(nowIso(), u.id).run();
  const cookies = await createSession(env, request, u.id);
  return json({ ok: true }, 200, { 'Set-Cookie': cookies });
});

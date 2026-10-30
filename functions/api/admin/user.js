// GET  /api/admin/user?id= — 회원 상세
// POST /api/admin/user {id, action: 'verify' | 'delete'} — 관리 작업
import { handle, readJson, json, HttpError, db, requireAdmin, nowIso, isAdmin } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  const DB = await db(env);
  const u = await DB.prepare(`SELECT id, email, name, phone, role, company, marketing, email_verified, is_admin, created_at, updated_at, last_login_at FROM users WHERE id = ?1`).bind(id).first();
  if (!u) throw new HttpError('not_found', 404);
  const [inqs, dels] = await DB.batch([
    DB.prepare(`SELECT id, created_at, type, address, stage FROM inquiries WHERE user_id = ?1 OR email = ?2 ORDER BY id DESC`).bind(id, u.email),
    DB.prepare(`SELECT d.id, d.sent_at, d.mail_ok, d.opened_at, d.downloaded_at, doc.title, doc.id document_id FROM deliveries d JOIN documents doc ON doc.id = d.document_id WHERE d.user_id = ?1 ORDER BY d.id DESC`).bind(id),
  ]);
  return json({ ok: true, user: { ...u, admin: isAdmin(env, u) }, inquiries: inqs.results || [], deliveries: dels.results || [] });
});
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const admin = await requireAdmin(env, request);
  const id = parseInt(b.id, 10);
  const DB = await db(env);
  if (b.action === 'verify') {
    await DB.prepare(`UPDATE users SET email_verified = 1, updated_at = ?1 WHERE id = ?2`).bind(nowIso(), id).run();
  } else if (b.action === 'delete') {
    if (id === admin.id) throw new HttpError('cannot_delete_self', 400);
    await DB.batch([
      DB.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(id),
      DB.prepare(`DELETE FROM user_tokens WHERE user_id = ?1`).bind(id),
      DB.prepare(`UPDATE inquiries SET user_id = NULL WHERE user_id = ?1`).bind(id),
      DB.prepare(`UPDATE deliveries SET user_id = NULL WHERE user_id = ?1`).bind(id),
      DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(id),
    ]);
  } else throw new HttpError('validation', 422);
  return json({ ok: true });
});

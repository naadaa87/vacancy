// POST /api/account/profile — 내 정보 수정
import { handle, readJson, json, HttpError, db, requireUser, clip, nowIso, publicUser } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const u = await requireUser(env, request);
  const name = clip(b.name, 60), phone = clip(b.phone, 30), role = clip(b.role, 30), company = clip(b.company, 100);
  const fields = [];
  if (!name) fields.push('name');
  if (phone && phone.replace(/\D/g, '').length < 9) fields.push('phone');
  if (!role) fields.push('role');
  if (fields.length) throw new HttpError('validation', 422, { fields });
  const DB = await db(env);
  await DB.prepare(`UPDATE users SET name=?1, phone=?2, role=?3, company=?4, marketing=?5, updated_at=?6 WHERE id=?7`)
    .bind(name, phone, role, company, b.marketing ? 1 : 0, nowIso(), u.id).run();
  const fresh = await DB.prepare(`SELECT * FROM users WHERE id = ?1`).bind(u.id).first();
  return json({ ok: true, user: publicUser(env, fresh) });
});

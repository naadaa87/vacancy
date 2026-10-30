// GET /api/account/inquiries — 내 문의 내역
import { handle, json, db, requireUser } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  const u = await requireUser(env, request);
  const DB = await db(env);
  const { results } = await DB.prepare(
    `SELECT id, created_at, type, address, floor_area, message, handled, stage FROM inquiries WHERE user_id = ?1 ORDER BY id DESC LIMIT 50`
  ).bind(u.id).all();
  return json({ ok: true, items: results || [] });
});

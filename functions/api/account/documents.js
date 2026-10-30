// GET /api/account/documents — 내가 받은 자료 목록
import { handle, json, db, requireUser } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  const u = await requireUser(env, request);
  const DB = await db(env);
  const { results = [] } = await DB.prepare(`SELECT d.id, d.sent_at, d.opened_at, doc.title, doc.kind, doc.file_name, doc.file_size, doc.link_url
    FROM deliveries d JOIN documents doc ON doc.id = d.document_id WHERE d.user_id = ?1 OR d.email = ?2 ORDER BY d.id DESC LIMIT 100`).bind(u.id, u.email).all();
  return json({ ok: true, items: results });
});

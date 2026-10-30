// GET  /api/admin/documents — 발송 자료 목록 (+ 발송·열람 집계)
// GET  /api/admin/documents?id= — 자료 상세와 받는 사람별 열람 현황
// POST /api/admin/documents {id, action:'delete'} — 자료 삭제 (파일·발송 기록 포함)
import { handle, readJson, json, HttpError, db, requireAdmin } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await db(env);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  if (id) {
    const doc = await DB.prepare(`SELECT id, created_at, created_by, kind, title, body, link_url, file_name, file_type, file_size, is_ad FROM documents WHERE id = ?1`).bind(id).first();
    if (!doc) throw new HttpError('not_found', 404);
    const { results = [] } = await DB.prepare(`SELECT id, user_id, inquiry_id, email, name, sent_at, mail_ok, opened_at, open_count, downloaded_at FROM deliveries WHERE document_id = ?1 ORDER BY id`).bind(id).all();
    return json({ ok: true, item: doc, deliveries: results });
  }
  const { results = [] } = await DB.prepare(`SELECT doc.id, doc.created_at, doc.created_by, doc.kind, doc.title, doc.file_name, doc.file_size, doc.link_url, doc.is_ad,
      COUNT(d.id) sent, SUM(CASE WHEN d.mail_ok=1 THEN 1 ELSE 0 END) mailed, SUM(CASE WHEN d.opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,
      SUM(CASE WHEN d.downloaded_at IS NOT NULL THEN 1 ELSE 0 END) downloaded
    FROM documents doc LEFT JOIN deliveries d ON d.document_id = doc.id GROUP BY doc.id ORDER BY doc.id DESC LIMIT 300`).all();
  return json({ ok: true, items: results });
});
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  await requireAdmin(env, request);
  const id = parseInt(b.id, 10);
  if (b.action !== 'delete' || !id) throw new HttpError('validation', 422);
  const DB = await db(env);
  await DB.batch([
    DB.prepare(`DELETE FROM file_chunks WHERE document_id = ?1`).bind(id),
    DB.prepare(`DELETE FROM deliveries WHERE document_id = ?1`).bind(id),
    DB.prepare(`DELETE FROM documents WHERE id = ?1`).bind(id),
  ]);
  return json({ ok: true });
});

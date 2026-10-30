// GET /api/docs/view?t=… | ?d=… — 받은 자료 보기 (열람 기록)
import { handle, json, nowIso } from '../../../lib/server.js';
import { findDelivery } from '../../../lib/find-delivery.js';
export const onRequestGet = handle(async ({ request, env }) => {
  const { DB, del, doc } = await findDelivery(env, request);
  await DB.prepare(`UPDATE deliveries SET opened_at = COALESCE(opened_at, ?1), open_count = open_count + 1 WHERE id = ?2`).bind(nowIso(), del.id).run();
  return json({ ok: true, item: { title: doc.title, body: doc.body, kind: doc.kind, link_url: doc.link_url, file_name: doc.file_name, file_size: doc.file_size,
    sent_at: del.sent_at, name: del.name, is_ad: !!doc.is_ad } });
});

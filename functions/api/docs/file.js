// GET /api/docs/file?t=… | ?d=… — 받은 자료 파일 내려받기
import { handle, HttpError, nowIso, fileResponse } from '../../../lib/server.js';
import { findDelivery } from '../../../lib/find-delivery.js';
export const onRequestGet = handle(async ({ request, env }) => {
  const { DB, del, doc } = await findDelivery(env, request);
  if (!doc.file_name) throw new HttpError('not_found', 404);
  await DB.prepare(`UPDATE deliveries SET downloaded_at = COALESCE(downloaded_at, ?1), opened_at = COALESCE(opened_at, ?1) WHERE id = ?2`).bind(nowIso(), del.id).run();
  return fileResponse(env, doc, new URL(request.url).searchParams.get('inline') === '1');
});

// GET /api/admin/file?id= — 관리자: 올린 파일 내려받기
import { handle, HttpError, db, requireAdmin, fileResponse } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await db(env);
  const doc = await DB.prepare(`SELECT * FROM documents WHERE id = ?1`).bind(parseInt(new URL(request.url).searchParams.get('id'), 10)).first();
  if (!doc || !doc.file_name) throw new HttpError('not_found', 404);
  return fileResponse(env, doc);
});

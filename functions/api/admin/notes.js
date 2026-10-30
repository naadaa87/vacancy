// POST /api/admin/notes {inquiry_id, body} — 처리 이력에 메모 남기기
import { handle, readJson, json, HttpError, requireAdmin, addNote, clip } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const admin = await requireAdmin(env, request);
  const id = parseInt(b.inquiry_id, 10), body = clip(b.body, 4000);
  if (!id || !body) throw new HttpError('validation', 422);
  await addNote(env, id, 'note', body, admin.name);
  return json({ ok: true });
});

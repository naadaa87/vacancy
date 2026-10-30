// GET  /api/admin/inquiry?id= — 문의 상세 (이력·발송자료·같은 고객의 다른 문의 포함)
// POST /api/admin/inquiry {id, stage?, admin_memo?} — 단계·메모 변경
import { handle, readJson, json, HttpError, db, requireAdmin, clip, nowIso, STAGE_IDS, stageLabel, isOpenStage, addNote } from '../../../lib/server.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
  const DB = await db(env);
  const inq = await DB.prepare(`SELECT * FROM inquiries WHERE id = ?1`).bind(id).first();
  if (!inq) throw new HttpError('not_found', 404);
  const [notes, dels, others, member] = await DB.batch([
    DB.prepare(`SELECT * FROM inquiry_notes WHERE inquiry_id = ?1 ORDER BY id DESC`).bind(id),
    DB.prepare(`SELECT d.id, d.sent_at, d.mail_ok, d.opened_at, d.downloaded_at, d.email, doc.title, doc.file_name, doc.id document_id
      FROM deliveries d JOIN documents doc ON doc.id = d.document_id WHERE d.inquiry_id = ?1 OR (d.email = ?2) ORDER BY d.id DESC`).bind(id, inq.email),
    DB.prepare(`SELECT id, created_at, type, address, stage FROM inquiries WHERE (email = ?1 OR phone = ?2) AND id != ?3 ORDER BY id DESC LIMIT 10`).bind(inq.email, inq.phone, id),
    DB.prepare(`SELECT id, name, email, phone, role, company, created_at, email_verified, marketing FROM users WHERE id = ?1 OR email = ?2 LIMIT 1`).bind(inq.user_id || -1, inq.email),
  ]);
  return json({ ok: true, item: inq, notes: notes.results || [], deliveries: dels.results || [], others: others.results || [], member: (member.results || [])[0] || null });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const admin = await requireAdmin(env, request);
  const id = parseInt(b.id, 10);
  const DB = await db(env);
  const inq = await DB.prepare(`SELECT id, stage, admin_memo FROM inquiries WHERE id = ?1`).bind(id).first();
  if (!inq) throw new HttpError('not_found', 404);
  const stage = b.stage !== undefined ? String(b.stage) : (inq.stage || 'new');
  if (!STAGE_IDS.includes(stage)) throw new HttpError('validation', 422);
  const memo = b.admin_memo !== undefined ? clip(b.admin_memo, 1000) : inq.admin_memo;
  await DB.prepare(`UPDATE inquiries SET stage = ?1, handled = ?2, admin_memo = ?3, updated_at = ?4 WHERE id = ?5`)
    .bind(stage, isOpenStage(stage) ? 0 : 1, memo, nowIso(), id).run();
  if (stage !== (inq.stage || 'new')) await addNote(env, id, 'stage', `${stageLabel(inq.stage)} → ${stageLabel(stage)}`, admin.name);
  return json({ ok: true });
});

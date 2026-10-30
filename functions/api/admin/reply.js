// POST /api/admin/reply {inquiry_id, subject, body, next_stage?} — 문의 고객에게 이메일 회신
import { handle, readJson, json, HttpError, db, requireAdmin, clip, nowIso, sendMail, mailConfigured, mailLayout, textToHtml, addNote, STAGE_IDS, isOpenStage, stageLabel } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const admin = await requireAdmin(env, request);
  if (!mailConfigured(env)) throw new HttpError('mail_not_configured', 503);
  const id = parseInt(b.inquiry_id, 10), subject = clip(b.subject, 150), body = clip(b.body, 8000);
  if (!id || !subject || !body) throw new HttpError('validation', 422);
  const DB = await db(env);
  const inq = await DB.prepare(`SELECT * FROM inquiries WHERE id = ?1`).bind(id).first();
  if (!inq) throw new HttpError('not_found', 404);
  const replyTo = (env.CONTACT_TO || 'spaceblank0100@gmail.com').split(',')[0].trim();
  const ok = await sendMail(env, {
    to: inq.email, replyTo, subject,
    html: mailLayout(subject, `<p style="margin:0 0 14px">${inq.name}님, 안녕하세요. 공백입니다.</p>${textToHtml(body)}
      <p style="margin-top:20px;color:#7a8087;font-size:13px">이 메일에 답장하시면 담당자에게 바로 전달됩니다. 문의 번호 #${inq.id}</p>`),
    text: `${inq.name}님, 안녕하세요. 공백입니다.\n\n${body}\n\n(문의 번호 #${inq.id})`,
  });
  if (!ok) throw new HttpError('mail_failed', 502);
  await addNote(env, id, 'email', `[메일 회신] ${subject}\n\n${body}`, admin.name);
  const next = STAGE_IDS.includes(b.next_stage) ? b.next_stage : (isOpenStage(inq.stage) ? 'replied' : inq.stage);
  if (next !== inq.stage) {
    await DB.prepare(`UPDATE inquiries SET stage = ?1, handled = ?2, updated_at = ?3 WHERE id = ?4`).bind(next, isOpenStage(next) ? 0 : 1, nowIso(), id).run();
    await addNote(env, id, 'stage', `${stageLabel(inq.stage)} → ${stageLabel(next)}`, admin.name);
  }
  return json({ ok: true });
});

/**
 * 확인 요청 — 공백이 임대인(또는 파트너)에게 승인·확인을 요청하고, 응답을 기록으로 남깁니다.
 * POST /api/center/approvals
 *  {project_id, action:'create', kind('approve'|'confirm'), title, detail, target('l'|'m:참여자ID'), due_date, file_id, notify}  (관리자)
 *  {project_id, action:'respond', id, status('approved'|'changes'|'declined'), response}                                      (요청받은 사람)
 *  {project_id, action:'remind', id} · {action:'reopen', id} · {action:'cancel', id} · {action:'delete', id}                  (관리자)
 * 응답 기록은 진행 의사를 확인하는 용도입니다. 계약의 체결·변경은 별도 계약서에 따릅니다.
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, canSeeApproval, whoOf, pick, toInt, toDate, APPROVAL_KINDS, logp, touch, ownerLabel } from '../../../lib/center.js';
import { emit, ownerTarget } from '../../../lib/workspace.js';

const ST = { approved: '승인', changes: '수정 요청', declined: '보류', pending: '응답 대기', cancel: '요청 취소' };

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, role, user } = ctx;
  const now = nowIso();

  if (b.action === 'create') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    const title = clip(b.title, 160);
    if (!title) throw new HttpError('validation', 422, { message: '확인받을 내용을 한 줄로 입력해 주세요.' });
    const target = String(b.target || '');
    if (target === 'l') { if (!ctx.landlord) throw new HttpError('validation', 422, { message: '연결된 임대인이 없습니다.' }); }
    else if (!ctx.members.some(m => 'm:' + m.id === target && m.status === 'active')) throw new HttpError('validation', 422, { message: '요청받을 사람을 선택해 주세요.' });
    let fileId = toInt(b.file_id);
    if (fileId) { const f = await DB.prepare(`SELECT id FROM project_files WHERE id = ?1 AND project_id = ?2`).bind(fileId, project.id).first(); if (!f) fileId = null; }
    const kind = pick(b.kind, APPROVAL_KINDS, 'approve');
    const due = toDate(b.due_date);
    const r = await DB.prepare(`INSERT INTO project_approvals (project_id, kind, title, detail, target, file_id, due_date, status, created_by, created_at, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'pending',?8,?9,?9)`).bind(project.id, kind, title, clip(b.detail, 4000) || null, target, fileId, due, user.name, now).run();
    await touch(DB, project.id);
    await logp(DB, project.id, user.name, 'approval', `확인 요청: ${title} → ${ownerLabel(ctx, target)}${due ? ' (기한 ' + due + ')' : ''}`);
    const mailed = await emit(ctx, request, [ownerTarget(ctx, target)], { kind: 'approval', tab: 'overview', text: `확인을 요청드립니다: ${title}`, mail: b.notify !== false, subject: '확인 요청',
      lead: `'${title}' 건의 확인을 요청드립니다.${due ? ' 기한: ' + due + '.' : ''} 임대인센터에서 내용을 보시고 응답해 주세요.`, body: b.detail || '', button: '확인하고 응답하기' });
    return json({ ok: true, id: r.meta.last_row_id, mailed }, 201);
  }

  const a = await DB.prepare(`SELECT * FROM project_approvals WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).first();
  if (!a || !canSeeApproval(ctx, a)) throw new HttpError('not_found', 404);

  if (b.action === 'respond') {
    if (whoOf(ctx) !== a.target) throw new HttpError('forbidden', 403, { message: '요청받은 분만 응답할 수 있습니다.' });
    if (a.status !== 'pending') throw new HttpError('validation', 422, { message: '이미 응답한 요청입니다. 바꾸시려면 소통 탭으로 알려 주세요.' });
    const status = pick(b.status, ['approved', 'changes', 'declined'], null);
    if (!status) throw new HttpError('validation', 422);
    const response = clip(b.response, 2000) || null;
    if (status !== 'approved' && !response) throw new HttpError('validation', 422, { message: '어떤 점을 바꾸거나 더 확인하면 좋을지 적어 주세요.' });
    await DB.prepare(`UPDATE project_approvals SET status = ?1, response = ?2, responded_at = ?3, responded_by = ?4, updated_at = ?3 WHERE id = ?5`).bind(status, response, now, user.id, a.id).run();
    await touch(DB, project.id);
    const who = ownerLabel({ ...ctx, role: 'admin' }, a.target);
    await logp(DB, project.id, who, 'approval', `확인 요청 응답: ${a.title} → ${ST[status]}${response ? ' — ' + response : ''}`);
    await emit(ctx, request, ['admin'], { kind: 'approval', tab: 'approvals', text: `${who}님 응답: ${ST[status]} — ${a.title}`, body: response, mail: true, subject: `확인 요청 응답 (${ST[status]})`,
      lead: `${who}님이 '${a.title}' 건에 '${ST[status]}'(으)로 응답했습니다.`, authorType: role, memberId: ctx.member ? ctx.member.id : null });
    return json({ ok: true });
  }

  if (role !== 'admin') throw new HttpError('forbidden', 403);

  if (b.action === 'remind') {
    if (a.status !== 'pending') throw new HttpError('validation', 422, { message: '응답을 기다리는 요청만 다시 알릴 수 있습니다.' });
    const mailed = await emit(ctx, request, [ownerTarget(ctx, a.target)], { kind: 'approval', tab: 'overview', text: `확인 요청에 응답을 부탁드립니다: ${a.title}`, mail: true, subject: '확인 요청 (다시 알림)',
      lead: `'${a.title}' 건의 응답을 기다리고 있습니다.${a.due_date ? ' 기한: ' + a.due_date + '.' : ''}`, body: a.detail || '', button: '확인하고 응답하기' });
    return json({ ok: true, mailed });
  }
  if (b.action === 'reopen' || b.action === 'cancel') {
    const status = b.action === 'reopen' ? 'pending' : 'cancel';
    await DB.prepare(`UPDATE project_approvals SET status = ?1, updated_at = ?2 WHERE id = ?3`).bind(status, now, a.id).run();
    await logp(DB, project.id, user.name, 'approval', `확인 요청 ${status === 'pending' ? '다시 요청' : '취소'}: ${a.title}`);
    if (status === 'pending') await emit(ctx, request, [ownerTarget(ctx, a.target)], { kind: 'approval', tab: 'overview', text: `다시 확인을 요청드립니다: ${a.title}` });
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    await DB.prepare(`DELETE FROM project_approvals WHERE id = ?1`).bind(a.id).run();
    await logp(DB, project.id, user.name, 'approval', `확인 요청 삭제: ${a.title}`);
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

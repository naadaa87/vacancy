/**
 * GET  /api/center/project?id=&as=  — 프로젝트 상세 (보는 사람 권한에 맞춰 거른 데이터)
 * POST /api/center/project {id, action}
 *   update  — 건물·의뢰 정보 수정 (관리자)
 *   stage   — 진행 단계 변경 {stage, notify}
 *   access  — 임대인 열람 허용 {landlord_access}
 *   landlord — 임대인 연결 변경 {landlord_id}
 *   invite_landlord — 임대인에게 임대인센터 안내 메일
 *   delete  — 프로젝트 삭제 {confirm: code}
 */
import { handle, readJson, json, HttpError, clip, nowIso, deleteFileChunks } from '../../../lib/server.js';
import { projectCtx, projectPayload, markSeen, requireProjectAdmin, PSTAGE_IDS, ACTIVE_STAGES, pstageLabel, PSTAGES, cleanKinds, pick, toDate, toInt,
  logp, touch, notify, KINDS } from '../../../lib/center.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const u = new URL(request.url);
  const ctx = await projectCtx(env, request, u.searchParams.get('id'), { as: u.searchParams.get('as') });
  const data = await projectPayload(ctx);
  await markSeen(ctx);
  return json({ ok: true, ...data });
});

const TEXT_FIELDS = { title: 120, address: 200, building_name: 100, building_use: 100, scale: 100, land_area: 50, gross_area: 50, built_year: 20,
  vacancy: 2000, request: 4000, goal: 2000, finance: 4000, internal_memo: 4000, next_action: 300 };

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.id);
  requireProjectAdmin(ctx);
  const { DB, project, user } = ctx;
  const now = nowIso();

  if (b.action === 'update') {
    const sets = []; const args = [];
    for (const [k, n] of Object.entries(TEXT_FIELDS)) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(clip(b[k], n) || null); }
    if (b.title !== undefined && !clip(b.title, 120)) throw new HttpError('validation', 422, { message: '프로젝트 이름을 입력해 주세요.' });
    if (b.kinds !== undefined) { sets.push('kinds = ?'); args.push(cleanKinds(b.kinds)); }
    if (b.priority !== undefined) { sets.push('priority = ?'); args.push(pick(b.priority, ['high', 'normal', 'low'], 'normal')); }
    for (const k of ['start_date', 'due_date']) if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(toDate(b[k])); }
    if (!sets.length) return json({ ok: true });
    sets.push('updated_at = ?'); args.push(now);
    await DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...args, project.id).run();
    const changed = Object.keys(b).filter(k => TEXT_FIELDS[k] || ['kinds', 'priority', 'start_date', 'due_date'].includes(k));
    if (changed.some(k => k !== 'internal_memo' && k !== 'next_action')) await logp(DB, project.id, user.name, 'update', '프로젝트 정보 수정');
    return json({ ok: true });
  }

  if (b.action === 'stage') {
    const stage = pick(b.stage, PSTAGE_IDS, null);
    if (!stage) throw new HttpError('validation', 422);
    if (stage === project.stage) return json({ ok: true });
    const closed = ACTIVE_STAGES.includes(stage) ? null : (project.closed_at || now);
    await DB.prepare(`UPDATE projects SET stage = ?1, closed_at = ?2, updated_at = ?3 WHERE id = ?4`).bind(stage, closed, now, project.id).run();
    await logp(DB, project.id, user.name, 'stage', `${pstageLabel(project.stage)} → ${pstageLabel(stage)}`);
    let mailed = 0;
    if (b.notify) {
      const ext = (PSTAGES.find(s => s.id === stage) || {}).ext;
      const targets = ['landlord', ...ctx.members.filter(m => m.status === 'active')];
      mailed = await notify({ ...ctx, project: { ...project, stage } }, request, targets, { subject: '진행 단계 안내', lead: `진행 단계가 '${ext}'(으)로 바뀌었습니다.` });
    }
    return json({ ok: true, mailed });
  }

  if (b.action === 'access') {
    const v = b.landlord_access ? 1 : 0;
    await DB.prepare(`UPDATE projects SET landlord_access = ?1, updated_at = ?2 WHERE id = ?3`).bind(v, now, project.id).run();
    await logp(DB, project.id, user.name, 'access', v ? '임대인 열람 허용' : '임대인 열람 중지');
    return json({ ok: true });
  }

  if (b.action === 'landlord') {
    const lid = toInt(b.landlord_id);
    if (lid) { const l = await DB.prepare(`SELECT id, name FROM landlords WHERE id = ?1`).bind(lid).first(); if (!l) throw new HttpError('not_found', 404); }
    await DB.prepare(`UPDATE projects SET landlord_id = ?1, updated_at = ?2 WHERE id = ?3`).bind(lid || null, now, project.id).run();
    await logp(DB, project.id, user.name, 'landlord', lid ? '임대인 연결 변경' : '임대인 연결 해제');
    return json({ ok: true });
  }

  if (b.action === 'invite_landlord') {
    if (!ctx.landlord || !ctx.landlord.email) throw new HttpError('validation', 422, { message: '임대인 이메일이 등록되어 있지 않습니다.' });
    if (!project.landlord_access) throw new HttpError('validation', 422, { message: '먼저 임대인 열람을 허용해 주세요.' });
    const mailed = await notify(ctx, request, ['landlord'], { subject: '임대인센터 안내', button: '진행 상황 보기',
      lead: '의뢰하신 건의 진행 상황, 공백의 보고, 요청 자료를 임대인센터에서 한곳에서 확인하실 수 있습니다.' });
    if (!mailed) throw new HttpError('mail_failed', 502, { message: '메일을 보내지 못했습니다. 이메일 발송 설정을 확인해 주세요.' });
    await DB.prepare(`UPDATE landlords SET invited_at = ?1 WHERE id = ?2`).bind(now, ctx.landlord.id).run();
    await logp(DB, project.id, user.name, 'invite', '임대인에게 임대인센터 안내 메일 발송');
    return json({ ok: true });
  }

  if (b.action === 'delete') {
    if (String(b.confirm || '') !== String(project.code || project.id)) throw new HttpError('validation', 422, { message: '확인용 프로젝트 코드가 맞지 않습니다.' });
    const { results: files = [] } = await DB.prepare(`SELECT id FROM project_files WHERE project_id = ?1`).bind(project.id).all();
    for (const f of files) await deleteFileChunks(env, f.id, 'pfile');
    await DB.batch(['project_files', 'project_posts', 'project_tasks', 'project_units', 'project_money', 'project_log', 'project_members', 'project_seen']
      .map(t => DB.prepare(`DELETE FROM ${t} WHERE project_id = ?1`).bind(project.id)).concat([DB.prepare(`DELETE FROM projects WHERE id = ?1`).bind(project.id)]));
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

/**
 * POST /api/center/tasks — 추진사항
 *  {project_id, action:'create', title, detail, phase, owner, due_date, kind('task'|'doc'), visibility, notify}
 *  {project_id, action:'update', id, ...바꿀 값}
 *  {project_id, action:'delete', id}
 *  {project_id, action:'template', kinds:[...]}  — 유형별 기본 추진사항 추가 (관리자)
 * owner: 'gb'(공백) | 'm:참여자ID' | 'l'(임대인)
 * visibility: internal(공백만) | team(참여자) | all(임대인 포함)
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, can, canSeeTask, pick, toInt, toDate, TASK_STATUS, PHASES, logp, touch, notify, templateRows, insertTasks, ownerLabel } from '../../../lib/center.js';

function checkOwner(ctx, owner) {
  if (owner === 'gb') return 'gb';
  if (owner === 'l') { if (!ctx.landlord) throw new HttpError('validation', 422, { message: '연결된 임대인이 없습니다.' }); return 'l'; }
  if (ctx.members.some(m => 'm:' + m.id === owner && m.status === 'active')) return owner;
  throw new HttpError('validation', 422, { message: '담당을 다시 선택해 주세요.' });
}
function cleanVis(ctx, v, owner) {
  let vis = pick(v, ['internal', 'team', 'all'], 'team');
  if (ctx.role !== 'admin') { if (vis === 'internal') vis = 'team'; if (vis === 'all' && !can(ctx, 'publish')) vis = 'team'; }
  if (owner === 'l') vis = 'all';
  return vis;
}

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, role, member, user } = ctx;
  const manager = role === 'admin' || (role === 'partner' && can(ctx, 'tasks'));
  const now = nowIso();
  const actor = role === 'admin' ? user.name : role === 'partner' ? ownerLabel({ ...ctx, role: 'admin' }, 'm:' + member.id) : '임대인';

  if (b.action === 'create') {
    if (!manager) throw new HttpError('forbidden', 403);
    const title = clip(b.title, 200);
    if (!title) throw new HttpError('validation', 422, { message: '할 일을 입력해 주세요.' });
    const owner = checkOwner(ctx, String(b.owner || 'gb'));
    const kind = b.kind === 'doc' ? 'doc' : 'task';
    const vis = cleanVis(ctx, b.visibility, owner);
    const sortRow = await DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 s FROM project_tasks WHERE project_id = ?1`).bind(project.id).first();
    const r = await DB.prepare(`INSERT INTO project_tasks (project_id, kind, phase, title, detail, owner, due_date, status, visibility, sort, created_at, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'todo',?8,?9,?10,?10)`)
      .bind(project.id, kind, PHASES.includes(b.phase) ? b.phase : null, title, clip(b.detail, 2000) || null, owner, toDate(b.due_date), vis, sortRow.s, now).run();
    await touch(DB, project.id);
    await logp(DB, project.id, actor, 'task', `추진사항 추가: ${title} (담당 ${ownerLabel({ ...ctx, role: 'admin' }, owner)})`);
    let mailed = 0;
    if (b.notify && owner !== 'gb') {
      const target = owner === 'l' ? 'landlord' : ctx.members.find(m => 'm:' + m.id === owner);
      mailed = await notify(ctx, request, [target], { subject: kind === 'doc' ? '자료 요청' : '담당 업무 안내',
        lead: kind === 'doc' ? `'${title}' 자료를 요청드립니다. 임대인센터에서 바로 올려 주실 수 있습니다.` : `'${title}' 업무를 맡아 주시길 요청드립니다.${b.due_date ? ' 기한: ' + b.due_date : ''}`, body: b.detail || '' });
    }
    return json({ ok: true, id: r.meta.last_row_id, mailed }, 201);
  }

  if (b.action === 'template') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    const { results: existing = [] } = await DB.prepare(`SELECT title FROM project_tasks WHERE project_id = ?1`).bind(project.id).all();
    const have = new Set(existing.map(t => t.title));
    const rows = templateRows((b.kinds || []).join(','), !!ctx.landlord).filter(r => !have.has(r.title));
    const sortRow = await DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 s FROM project_tasks WHERE project_id = ?1`).bind(project.id).first();
    await insertTasks(DB, project.id, rows, sortRow.s);
    if (rows.length) { await touch(DB, project.id); await logp(DB, project.id, user.name, 'task', `기본 추진사항 ${rows.length}건 추가`); }
    return json({ ok: true, added: rows.length });
  }

  const task = await DB.prepare(`SELECT * FROM project_tasks WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).first();
  if (!task || !canSeeTask(ctx, task)) throw new HttpError('not_found', 404);
  const mine = (role === 'partner' && task.owner === 'm:' + member.id) || (role === 'landlord' && task.owner === 'l');
  if (role === 'partner' && task.visibility === 'internal' && !mine) throw new HttpError('forbidden', 403);

  if (b.action === 'update') {
    const sets = []; const args = [];
    if (manager) {
      if (b.title !== undefined) { const t = clip(b.title, 200); if (!t) throw new HttpError('validation', 422); sets.push('title = ?'); args.push(t); }
      if (b.detail !== undefined) { sets.push('detail = ?'); args.push(clip(b.detail, 2000) || null); }
      if (b.phase !== undefined) { sets.push('phase = ?'); args.push(PHASES.includes(b.phase) ? b.phase : null); }
      if (b.due_date !== undefined) { sets.push('due_date = ?'); args.push(toDate(b.due_date)); }
      let owner = task.owner;
      if (b.owner !== undefined) { owner = checkOwner(ctx, String(b.owner)); sets.push('owner = ?'); args.push(owner); }
      if (b.visibility !== undefined || owner === 'l') { sets.push('visibility = ?'); args.push(cleanVis(ctx, b.visibility !== undefined ? b.visibility : task.visibility, owner)); }
      if (b.kind !== undefined) { sets.push('kind = ?'); args.push(b.kind === 'doc' ? 'doc' : 'task'); }
    } else if (!mine) throw new HttpError('forbidden', 403);
    if (b.status !== undefined) {
      const st = pick(b.status, TASK_STATUS, null); if (!st) throw new HttpError('validation', 422);
      sets.push('status = ?'); args.push(st); sets.push('done_at = ?'); args.push(st === 'done' ? (task.done_at || now) : null);
      if (st !== task.status) await logp(DB, project.id, actor, 'task', `추진사항 ${st === 'done' ? '완료' : '상태 변경'}: ${task.title}`);
    }
    if (!sets.length) return json({ ok: true });
    sets.push('updated_at = ?'); args.push(now);
    await DB.prepare(`UPDATE project_tasks SET ${sets.join(', ')} WHERE id = ?`).bind(...args, task.id).run();
    await touch(DB, project.id);
    return json({ ok: true });
  }

  if (b.action === 'delete') {
    if (!manager) throw new HttpError('forbidden', 403);
    await DB.prepare(`DELETE FROM project_tasks WHERE id = ?1`).bind(task.id).run();
    await DB.prepare(`UPDATE project_files SET task_id = NULL WHERE task_id = ?1`).bind(task.id).run();
    await logp(DB, project.id, actor, 'task', `추진사항 삭제: ${task.title}`);
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

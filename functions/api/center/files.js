/**
 * 프로젝트 자료실
 * GET  /api/center/files?id=&inline=1         — 내려받기 (권한 확인)
 * POST /api/center/files (multipart)          — 올리기: project_id, file, category, audience, note, task_id
 * POST /api/center/files (JSON)
 *   {project_id, action:'update', id, audience, category}  — 공개 범위 정하기 (관리자, 확인 완료 처리)
 *   {project_id, action:'approve', id}                     — 임대인 공개 승인 (관리자)
 *   {project_id, action:'delete', id}                      — 삭제 (관리자 또는 올린 사람)
 * audience: internal(공백만, 올린 사람 포함) | team(참여 파트너) | all(임대인 포함)
 * 임대인이 올린 자료는 공백이 확인한 뒤 필요한 파트너와 공유합니다(status=pending).
 */
import { handle, readJson, json, HttpError, clip, nowIso, checkOrigin, saveFile, deleteFileChunks, fileResponse, MAX_FILE_BYTES, fmtSize } from '../../../lib/server.js';
import { cdb, projectCtx, requireWrite, can, canSeeFile, canSeeTask, makeMasker, pick, toInt, FILE_CATS, logp, touch, notify, memberLabel, landlordLabel } from '../../../lib/center.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const u = new URL(request.url);
  const DB = await cdb(env);
  const f = await DB.prepare(`SELECT * FROM project_files WHERE id = ?1`).bind(toInt(u.searchParams.get('id')) || 0).first();
  if (!f) throw new HttpError('not_found', 404);
  const ctx = await projectCtx(env, request, f.project_id);
  if (!canSeeFile(ctx, f)) throw new HttpError('not_found', 404);
  const mask = makeMasker(ctx);
  const own = (f.uploader_type === ctx.role) && (f.uploader_user_id === ctx.user.id);
  const name = mask(f.name, { own, strict: mask.authorHidden(f.uploader_type, f.member_id) }).replace(/\[연락처 비공개\]/g, '').trim() || 'file';
  return fileResponse(env, { id: f.id, file_name: name, file_type: f.mime }, u.searchParams.get('inline') === '1' && /^(image\/|application\/pdf)/.test(f.mime || ''), 'pfile');
});

export const onRequestPost = handle(async ({ request, env }) => {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) return upload(request, env);
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, role, user } = ctx;
  const f = await DB.prepare(`SELECT * FROM project_files WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).first();
  if (!f || !canSeeFile(ctx, f)) throw new HttpError('not_found', 404);

  if (b.action === 'update') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    const audience = pick(b.audience, ['internal', 'team', 'all'], f.audience);
    const category = pick(b.category, FILE_CATS, f.category || 'etc');
    await DB.prepare(`UPDATE project_files SET audience = ?1, category = ?2, status = 'published' WHERE id = ?3`).bind(audience, category, f.id).run();
    if (audience !== f.audience || f.status === 'pending') await logp(DB, project.id, user.name, 'file', `자료 공개 범위: ${f.name} → ${{ internal: '공백만', team: '참여자', all: '임대인 포함' }[audience]}`);
    return json({ ok: true });
  }
  if (b.action === 'approve') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    await DB.prepare(`UPDATE project_files SET status = 'published' WHERE id = ?1`).bind(f.id).run();
    await logp(DB, project.id, user.name, 'file', `자료 공개 승인: ${f.name}`);
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    const own = f.uploader_user_id === user.id && f.uploader_type === role;
    if (role !== 'admin' && !own) throw new HttpError('forbidden', 403);
    await deleteFileChunks(env, f.id, 'pfile');
    await DB.prepare(`DELETE FROM project_files WHERE id = ?1`).bind(f.id).run();
    await logp(DB, project.id, role === 'admin' ? user.name : '참여자', 'file', `자료 삭제: ${f.name}`);
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

async function upload(request, env) {
  checkOrigin(request);
  let fd;
  try { fd = await request.formData(); } catch { throw new HttpError('bad_request', 400); }
  const ctx = await projectCtx(env, request, fd.get('project_id'));
  requireWrite(ctx);
  const { DB, project, role, member, user } = ctx;
  const file = fd.get('file');
  if (!file || typeof file === 'string' || !file.size) throw new HttpError('validation', 422, { message: '파일을 선택해 주세요.' });
  if (file.size > MAX_FILE_BYTES) throw new HttpError('file_too_large', 413, { message: '파일은 10MB 이하만 올릴 수 있습니다.' });

  // 연결할 추진사항(자료 요청)
  let task = null;
  if (toInt(fd.get('task_id'))) {
    task = await DB.prepare(`SELECT * FROM project_tasks WHERE id = ?1 AND project_id = ?2`).bind(toInt(fd.get('task_id')), project.id).first();
    if (!task || !canSeeTask(ctx, task)) throw new HttpError('not_found', 404);
  }
  const taskOwner = task && ((role === 'partner' && task.owner === 'm:' + member.id) || (role === 'landlord' && task.owner === 'l'));
  if (role === 'partner' && !can(ctx, 'upload') && !taskOwner) throw new HttpError('forbidden', 403, { message: '자료를 올릴 권한이 없습니다.' });

  let audience = pick(fd.get('audience'), ['internal', 'team', 'all'], role === 'admin' ? 'team' : 'internal');
  let status = 'published';
  if (role === 'partner' && audience === 'all' && !can(ctx, 'publish')) status = 'pending';
  if (role === 'landlord') { audience = 'internal'; status = 'pending'; }
  const name = clip(file.name || 'file', 150);
  const now = nowIso();
  const r = await DB.prepare(`INSERT INTO project_files (project_id, task_id, name, mime, size, chunks, category, audience, status, uploader_type, uploader_user_id, member_id, note, created_at)
    VALUES (?1,?2,?3,?4,?5,0,?6,?7,?8,?9,?10,?11,?12,?13)`)
    .bind(project.id, task ? task.id : null, name, clip(file.type, 100) || 'application/octet-stream', file.size, pick(fd.get('category'), FILE_CATS, 'etc'), audience, status,
      role, user.id, role === 'partner' ? member.id : null, clip(fd.get('note'), 300) || null, now).run();
  const id = r.meta.last_row_id;
  try {
    const chunks = await saveFile(env, id, await file.arrayBuffer(), 'pfile');
    await DB.prepare(`UPDATE project_files SET chunks = ?1 WHERE id = ?2`).bind(chunks, id).run();
  } catch (e) {
    await deleteFileChunks(env, id, 'pfile'); await DB.prepare(`DELETE FROM project_files WHERE id = ?1`).bind(id).run();
    throw e;
  }
  if (task && task.kind === 'doc' && taskOwner && task.status !== 'done') {
    await DB.prepare(`UPDATE project_tasks SET status = 'done', done_at = ?1, updated_at = ?1 WHERE id = ?2`).bind(now, task.id).run();
  }
  const who = role === 'admin' ? user.name : role === 'partner' ? memberLabel({ ...ctx, role: 'admin' }, member) : landlordLabel({ ...ctx, role: 'admin' });
  await logp(DB, project.id, who, 'file', `자료 올림: ${name} (${fmtSize(file.size)})${task ? ' — ' + task.title : ''}`);
  await touch(DB, project.id);
  if (role !== 'admin') {
    await notify(ctx, request, ['admin'], { subject: role === 'landlord' ? '임대인 자료 도착' : '새 자료', lead: `${who}님이 '${name}' 자료를 올렸습니다.${status === 'pending' ? ' 공유 범위를 정해 주세요.' : ''}` });
  }
  return json({ ok: true, id, status }, 201);
}

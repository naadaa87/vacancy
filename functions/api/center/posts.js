/**
 * POST /api/center/posts — 프로젝트 소통
 *  {project_id, action:'create', body, kind, audience, direct_to, parent_id, notify}
 *  {project_id, action:'approve', id, body?, notify}   — 파트너 글을 임대인에게 공개 (관리자)
 *  {project_id, action:'reject', id}                   — 임대인 공개 보류, 참여자 공유로 유지 (관리자)
 *  {project_id, action:'delete', id}                   — 삭제 (관리자 또는 본인)
 *
 * 공개 범위
 *  internal: 공백 내부 메모 (관리자만)
 *  team:     공백 + 참여 파트너
 *  all:      공백 + 참여 파트너 + 임대인 (파트너 글은 공백 승인 후 임대인에게 보임)
 *  direct:   공백 ↔ 한 사람 (direct_to = 'm:참여자ID' 또는 'l'(임대인))
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, canSeePost, can, pick, toInt, POST_KINDS, AUDIENCES, logp, touch, notify, memberLabel, landlordLabel } from '../../../lib/center.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, role, member, user } = ctx;
  const now = nowIso();

  if (b.action === 'create') {
    const body = clip(b.body, 8000);
    if (!body) throw new HttpError('validation', 422, { message: '내용을 입력해 주세요.' });
    let kind = pick(b.kind, POST_KINDS, 'opinion');
    let audience, directTo = null, status = 'published', parentId = null;

    if (toInt(b.parent_id)) {
      let parent = await DB.prepare(`SELECT * FROM project_posts WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.parent_id), project.id).first();
      if (parent && parent.parent_id) parent = await DB.prepare(`SELECT * FROM project_posts WHERE id = ?1`).bind(parent.parent_id).first();
      if (!parent || !canSeePost(ctx, parent)) throw new HttpError('not_found', 404);
      parentId = parent.id; audience = parent.audience; directTo = parent.direct_to; kind = 'reply';
      if (audience === 'internal' && role !== 'admin') throw new HttpError('forbidden', 403);
      if (role === 'partner' && audience === 'all' && !can(ctx, 'publish')) status = 'pending';
      if (role === 'partner' && parent.status === 'pending' && audience === 'all') status = 'pending';
    } else if (role === 'admin') {
      audience = pick(b.audience, AUDIENCES, 'team');
      if (audience === 'direct') {
        directTo = String(b.direct_to || '');
        if (directTo === 'l') { if (!ctx.landlord) throw new HttpError('validation', 422, { message: '연결된 임대인이 없습니다.' }); }
        else if (!ctx.members.some(m => 'm:' + m.id === directTo && m.status === 'active')) throw new HttpError('validation', 422, { message: '받는 사람을 선택해 주세요.' });
      }
    } else if (role === 'partner') {
      audience = pick(b.audience, ['team', 'all', 'direct'], 'team');
      if (audience === 'direct') directTo = 'm:' + member.id;
      if (audience === 'all' && !can(ctx, 'publish')) status = 'pending';
    } else {
      audience = pick(b.audience, ['all', 'direct'], 'all');
      if (audience === 'direct') directTo = 'l';
      kind = pick(b.kind, ['request', 'opinion'], 'request');
    }

    const r = await DB.prepare(`INSERT INTO project_posts (project_id, parent_id, author_type, author_user_id, member_id, kind, audience, direct_to, status, body, task_id, created_at, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`)
      .bind(project.id, parentId, role, user.id, role === 'partner' ? member.id : null, kind, audience, directTo, status, body, toInt(b.task_id), now).run();
    await touch(DB, project.id);

    // 알림: 파트너·임대인이 쓴 글은 공백(관리자)에게, 관리자가 '메일로 알리기'를 고르면 공개 범위의 사람에게
    let mailed = 0;
    if (role !== 'admin') {
      const who = role === 'partner' ? memberLabel({ ...ctx, role: 'admin' }, member) : landlordLabel({ ...ctx, role: 'admin' });
      mailed = await notify(ctx, request, ['admin'], { subject: status === 'pending' ? '임대인 공개 승인 요청' : '새 소통 글', lead: `${who}님이 글을 남겼습니다.${status === 'pending' ? ' 임대인에게 공개하려면 승인이 필요합니다.' : ''}`, body });
    } else if (b.notify && audience !== 'internal') {
      const active = ctx.members.filter(m => m.status === 'active');
      let targets = [];
      if (audience === 'team') targets = active;
      else if (audience === 'all') targets = [...active, 'landlord'];
      else if (directTo === 'l') targets = ['landlord'];
      else targets = active.filter(m => 'm:' + m.id === directTo);
      mailed = await notify(ctx, request, targets, { subject: parentId ? '새 답글' : '새 소식', lead: '공백이 프로젝트 소식을 남겼습니다.', body, authorType: 'admin' });
    }
    return json({ ok: true, id: r.meta.last_row_id, status, mailed }, 201);
  }

  const id = toInt(b.id);
  const post = await DB.prepare(`SELECT * FROM project_posts WHERE id = ?1 AND project_id = ?2`).bind(id, project.id).first();
  if (!post) throw new HttpError('not_found', 404);

  if (b.action === 'approve' || b.action === 'reject') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    if (b.action === 'approve') {
      const body = b.body !== undefined ? clip(b.body, 8000) : post.body;
      if (!body) throw new HttpError('validation', 422);
      await DB.prepare(`UPDATE project_posts SET status = 'published', audience = 'all', body = ?1, approved_at = ?2, approved_by = ?3, updated_at = ?2 WHERE id = ?4`).bind(body, now, user.name, id).run();
      await logp(DB, project.id, user.name, 'approve', `파트너 글 임대인 공개 승인 (#${id})`);
      let mailed = 0;
      if (b.notify) mailed = await notify(ctx, request, ['landlord'], { subject: '새 소식', lead: '프로젝트에 새 소식이 올라왔습니다.', body, authorType: post.author_type, memberId: post.member_id });
      await touch(DB, project.id);
      return json({ ok: true, mailed });
    }
    await DB.prepare(`UPDATE project_posts SET status = 'published', audience = 'team', updated_at = ?1, approved_by = ?2 WHERE id = ?3`).bind(now, user.name, id).run();
    await logp(DB, project.id, user.name, 'reject', `파트너 글 임대인 비공개 처리, 참여자 공유로 유지 (#${id})`);
    return json({ ok: true });
  }

  if (b.action === 'delete') {
    const own = post.author_user_id === user.id && post.author_type === role;
    if (role !== 'admin' && !own) throw new HttpError('forbidden', 403);
    await DB.prepare(`DELETE FROM project_posts WHERE id = ?1 OR parent_id = ?1`).bind(id).run();
    if (role === 'admin' && !own) await logp(DB, project.id, user.name, 'delete', `소통 글 삭제 (#${id})`);
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

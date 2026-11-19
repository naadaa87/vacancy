/**
 * POST /api/center/posts — 프로젝트 소통
 *  {project_id, action:'create', body, kind, audience, direct_to, parent_id, notify}
 *  {project_id, action:'approve', id, body?, notify}   — 파트너 글을 임대인에게 공개 (관리자)
 *  {project_id, action:'reject', id}                   — 임대인 공개 보류, 참여자 공유로 유지 (관리자)
 *  {project_id, action:'delete', id}                   — 삭제 (관리자 또는 본인)
 *  {project_id, action:'pin', id, pinned}              — 공지로 맨 위에 고정 (관리자)
 *  {project_id, action:'resolve', id, resolved}        — 문의·요청 글을 해결됨으로 표시 (관리자 또는 글쓴이)
 *
 * 공개 범위
 *  internal: 공백 내부 메모 (관리자만)
 *  team:     공백 + 참여 파트너
 *  all:      공백 + 참여 파트너 + 임대인 (파트너 글은 공백 승인 후 임대인에게 보임)
 *  direct:   공백 ↔ 한 사람 (direct_to = 'm:참여자ID' 또는 'l'(임대인))
 */
import { handle, readJson, json, HttpError, clip, nowIso, deleteFileChunks } from '../../../lib/server.js';
import { projectCtx, requireWrite, canSeePost, can, pick, toInt, POST_KINDS, AUDIENCES, logp, touch, memberLabel, landlordLabel } from '../../../lib/center.js';
import { emit, audienceTargets } from '../../../lib/workspace.js';

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
    // 공백이 답글을 달면 문의·요청 글은 '답변 완료'가 됩니다
    if (parentId && role === 'admin') await DB.prepare(`UPDATE project_posts SET answered_at = ?1 WHERE id = ?2 AND author_type != 'admin' AND answered_at IS NULL`).bind(now, parentId).run();

    // 알림: 화면 알림은 글을 볼 수 있는 사람 모두에게. 메일은 파트너·임대인의 글 → 공백, 관리자가 '메일로 알리기'를 고른 글 → 공개 범위의 사람
    let mailed = 0;
    const word = parentId ? '답글' : '글';
    if (role !== 'admin') {
      const memberId = role === 'partner' ? member.id : null;
      const name = r => (role === 'partner' ? memberLabel(r, member) : landlordLabel(r));
      mailed = await emit(ctx, request, ['admin'], { kind: 'post', tab: 'feed', text: r => `${name(r)}님이 ${word}을 남겼습니다.${status === 'pending' ? ' 임대인 공개 승인이 필요합니다.' : ''}`, body,
        mail: true, subject: status === 'pending' ? '임대인 공개 승인 요청' : '새 소통 글', authorType: role, memberId });
      if (audience !== 'direct') {
        // 승인 대기 글은 임대인에게 아직 보이지 않으므로 파트너에게만 알립니다
        const others = audienceTargets(ctx, audience, directTo, { exceptMemberId: memberId, landlord: role !== 'landlord' && status === 'published' });
        await emit(ctx, request, others, { kind: 'post', tab: 'feed', text: r => `${name(r)}님이 ${word}을 남겼습니다.`, body, authorType: role, memberId });
      }
    } else if (audience !== 'internal') {
      mailed = await emit(ctx, request, audienceTargets(ctx, audience, directTo), { kind: 'post', tab: 'feed', text: `공백이 ${parentId ? '답글' : '새 소식'}을 남겼습니다.`, body,
        mail: !!b.notify, subject: parentId ? '새 답글' : '새 소식', lead: '공백이 프로젝트 소식을 남겼습니다.', authorType: 'admin' });
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
      const mailed = await emit(ctx, request, ['landlord'], { kind: 'post', tab: 'feed', text: '프로젝트에 새 소식이 올라왔습니다.', body, mail: !!b.notify, subject: '새 소식', authorType: post.author_type, memberId: post.member_id });
      const author = ctx.members.find(m => m.id === post.member_id);
      if (author) await emit(ctx, request, [author], { kind: 'post', tab: 'feed', text: '남기신 글을 공백이 확인하고 임대인에게 공개했습니다.', body });
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
    // 글과 답글, 거기에 첨부된 파일·확인 표시까지 함께 지웁니다
    const { results: fs = [] } = await DB.prepare(`SELECT id FROM project_files WHERE project_id = ?2 AND post_id IN (SELECT id FROM project_posts WHERE id = ?1 OR parent_id = ?1)`).bind(id, project.id).all();
    for (const f of fs) await deleteFileChunks(env, f.id, 'pfile');
    await DB.batch([
      DB.prepare(`DELETE FROM project_files WHERE project_id = ?2 AND post_id IN (SELECT id FROM project_posts WHERE id = ?1 OR parent_id = ?1)`).bind(id, project.id),
      DB.prepare(`DELETE FROM post_acks WHERE post_id IN (SELECT id FROM project_posts WHERE id = ?1 OR parent_id = ?1)`).bind(id),
      DB.prepare(`DELETE FROM project_posts WHERE id = ?1 OR parent_id = ?1`).bind(id),
    ]);
    if (role === 'admin' && !own) await logp(DB, project.id, user.name, 'delete', `소통 글 삭제 (#${id})`);
    return json({ ok: true });
  }

  if (b.action === 'pin') {
    if (role !== 'admin') throw new HttpError('forbidden', 403);
    if (post.parent_id) throw new HttpError('validation', 422);
    await DB.prepare(`UPDATE project_posts SET pinned = ?1 WHERE id = ?2`).bind(b.pinned ? 1 : 0, id).run();
    return json({ ok: true });
  }

  if (b.action === 'resolve') {
    const own = post.author_user_id === user.id && post.author_type === role;
    if (role !== 'admin' && !own) throw new HttpError('forbidden', 403);
    if (post.parent_id) throw new HttpError('validation', 422);
    await DB.prepare(`UPDATE project_posts SET resolved_at = ?1 WHERE id = ?2`).bind(b.resolved === false ? null : now, id).run();
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

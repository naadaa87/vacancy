/**
 * 피드백 — 글 확인(확인했습니다), 프로젝트 만족도 평가
 * POST /api/center/feedback
 *  {project_id, action:'ack', post_id}             — 임대인·파트너가 글을 확인했다고 표시 (다시 누르면 취소)
 *  {project_id, action:'review', rating(1~5), comment}  — 임대인·파트너의 만족도 평가 (다시 보내면 고쳐 씀)
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, canSeePost, whoOf, toInt, logp, ownerLabel } from '../../../lib/center.js';
import { emit } from '../../../lib/workspace.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, user } = ctx;
  const who = whoOf(ctx);
  if (!who) throw new HttpError('forbidden', 403, { message: '임대인과 파트너가 남기는 기능입니다.' });
  const now = nowIso();

  if (b.action === 'ack') {
    const post = await DB.prepare(`SELECT * FROM project_posts WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.post_id), project.id).first();
    if (!post || !canSeePost(ctx, post)) throw new HttpError('not_found', 404);
    const ex = await DB.prepare(`SELECT 1 FROM post_acks WHERE post_id = ?1 AND user_id = ?2`).bind(post.id, user.id).first();
    if (ex) { await DB.prepare(`DELETE FROM post_acks WHERE post_id = ?1 AND user_id = ?2`).bind(post.id, user.id).run(); return json({ ok: true, acked: false }); }
    await DB.prepare(`INSERT INTO post_acks (post_id, user_id, project_id, who, at) VALUES (?1,?2,?3,?4,?5)`).bind(post.id, user.id, project.id, who, now).run();
    return json({ ok: true, acked: true });
  }

  if (b.action === 'review') {
    const rating = toInt(b.rating);
    if (!(rating >= 1 && rating <= 5)) throw new HttpError('validation', 422, { message: '만족도를 1~5점으로 골라 주세요.' });
    const comment = clip(b.comment, 1000) || null;
    await DB.prepare(`INSERT INTO project_reviews (project_id, user_id, who, rating, comment, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6)
      ON CONFLICT (project_id, user_id) DO UPDATE SET who = excluded.who, rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`).bind(project.id, user.id, who, rating, comment, now).run();
    const name = ownerLabel({ ...ctx, role: 'admin' }, who);
    await logp(DB, project.id, name, 'review', `만족도 평가 ${rating}점${comment ? ' — ' + comment : ''}`);
    await emit(ctx, request, ['admin'], { kind: 'review', tab: 'log', text: `${name}님이 만족도 평가를 남겼습니다 (${rating}점)`, body: comment });
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

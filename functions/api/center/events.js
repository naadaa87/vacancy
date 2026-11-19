/**
 * 프로젝트 일정 (미팅·현장·계약·공사 등)
 * GET  /api/center/events?project_id=&ics=1[&id=]  — 캘린더 파일(.ics) 내려받기 (보이는 일정만)
 * POST /api/center/events
 *  {project_id, action:'save', id?, kind, title, date, time, end_date, end_time, place, detail, audience, direct_to, notify}
 *  {project_id, action:'status', id, status('plan'|'done'|'cancel'), result, notify}
 *  {project_id, action:'rsvp', id, answer('yes'|'no'|'maybe'), note}   — 임대인·파트너의 참석 응답
 *  {project_id, action:'delete', id}
 * audience: internal(공백만) | team(참여 파트너) | all(임대인 포함) | direct(공백 ↔ 한 사람)
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, can, canSeeEvent, makeMasker, whoOf, pick, toInt, toDate, EVENT_KINDS, EVENT_STATUS, RSVP, logp, touch, ownerLabel } from '../../../lib/center.js';
import { emit, audienceTargets, toTime, icsFile } from '../../../lib/workspace.js';

const KIND = { meeting: '미팅', site: '현장', contract: '계약', work: '공사·작업', open: '오픈', pay: '납부·정산', etc: '일정' };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (d, t) => { const x = new Date(d + 'T00:00:00Z'); return `${x.getUTCMonth() + 1}/${x.getUTCDate()}(${DOW[x.getUTCDay()]})${t ? ' ' + t : ''}`; };
const ANS = { yes: '참석', no: '불참', maybe: '미정' };

export const onRequestGet = handle(async ({ request, env }) => {
  const u = new URL(request.url);
  const ctx = await projectCtx(env, request, u.searchParams.get('project_id'));
  const mask = makeMasker(ctx);
  const one = toInt(u.searchParams.get('id'));
  const { results = [] } = await ctx.DB.prepare(`SELECT * FROM project_events WHERE project_id = ?1 ORDER BY date, COALESCE(time, '00:00')`).bind(ctx.project.id).all();
  const list = results.filter(e => canSeeEvent(ctx, e) && (one ? e.id === one : e.status !== 'cancel'));
  if (one && !list.length) throw new HttpError('not_found', 404);
  const title = mask(ctx.project.title);
  const body = icsFile(list.map(e => ({ id: e.id, date: e.date, time: e.time, end_date: e.end_date, end_time: e.end_time, title: mask(e.title), place: mask(e.place), detail: mask(e.detail), status: e.status, ptitle: title })),
    `공백 ${title}`, new URL(request.url).hostname);
  const name = `gongbaek-${ctx.project.code || ctx.project.id}${one ? '-' + one : ''}.ics`;
  return new Response(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store' } });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireWrite(ctx);
  const { DB, project, role, user } = ctx;
  const manager = role === 'admin' || (role === 'partner' && can(ctx, 'tasks'));
  const now = nowIso();
  const actor = role === 'admin' ? user.name : role === 'partner' ? ownerLabel({ ...ctx, role: 'admin' }, whoOf(ctx)) : '임대인';

  if (b.action === 'save') {
    if (!manager) throw new HttpError('forbidden', 403);
    const id = toInt(b.id);
    let ex = null;
    if (id) {
      ex = await DB.prepare(`SELECT * FROM project_events WHERE id = ?1 AND project_id = ?2`).bind(id, project.id).first();
      if (!ex || !canSeeEvent(ctx, ex)) throw new HttpError('not_found', 404);
      if (role !== 'admin' && (ex.audience === 'internal' || ex.audience === 'direct')) throw new HttpError('forbidden', 403);
    }
    const title = clip(b.title, 120);
    if (!title) throw new HttpError('validation', 422, { message: '일정 이름을 입력해 주세요.' });
    const date = toDate(b.date);
    if (!date) throw new HttpError('validation', 422, { message: '날짜를 선택해 주세요.' });
    const time = toTime(b.time);
    let endDate = toDate(b.end_date), endTime = time ? toTime(b.end_time) : null;
    if (endDate && endDate <= date) endDate = null;
    if (endTime && !endDate && endTime <= time) endTime = null;
    // 공개 범위: 파트너는 참여자 공유까지, '임대인 직접 공유' 권한이 있으면 임대인까지
    let audience, directTo = null;
    if (role === 'admin') {
      audience = pick(b.audience, ['internal', 'team', 'all', 'direct'], 'team');
      if (audience === 'direct') {
        directTo = String(b.direct_to || '');
        if (directTo === 'l') { if (!ctx.landlord) throw new HttpError('validation', 422, { message: '연결된 임대인이 없습니다.' }); }
        else if (!ctx.members.some(m => 'm:' + m.id === directTo && m.status === 'active')) throw new HttpError('validation', 422, { message: '함께할 사람을 선택해 주세요.' });
      }
    } else {
      audience = pick(b.audience, ['team', 'all'], 'team');
      if (audience === 'all' && !can(ctx, 'publish')) audience = 'team';
    }
    const v = [pick(b.kind, EVENT_KINDS, 'meeting'), title, date, time, endDate, endTime, clip(b.place, 200) || null, clip(b.detail, 2000) || null, audience, directTo];
    let eid = id, changed = false;
    if (ex) {
      changed = ex.date !== date || (ex.time || null) !== time || (ex.place || null) !== v[6];
      await DB.prepare(`UPDATE project_events SET kind=?1, title=?2, date=?3, time=?4, end_date=?5, end_time=?6, place=?7, detail=?8, audience=?9, direct_to=?10, updated_at=?11 WHERE id=?12`).bind(...v, now, id).run();
      if (changed) await logp(DB, project.id, actor, 'event', `일정 변경: ${title} → ${fmt(date, time)}`);
    } else {
      const r = await DB.prepare(`INSERT INTO project_events (project_id, kind, title, date, time, end_date, end_time, place, detail, audience, direct_to, status, created_by, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'plan',?12,?13,?13)`).bind(project.id, ...v, actor, now).run();
      eid = r.meta.last_row_id;
      await logp(DB, project.id, actor, 'event', `일정 등록: ${title} (${fmt(date, time)})`);
    }
    await touch(DB, project.id);
    let mailed = 0;
    if (audience !== 'internal' && (!ex || changed)) {
      const targets = audienceTargets(ctx, audience, directTo, { exceptMemberId: role === 'partner' ? ctx.member.id : null });
      if (role !== 'admin') targets.push('admin');
      const head = `${ex ? '일정이 바뀌었습니다' : '새 일정'}: ${fmt(date, time)} ${title}`;
      mailed = await emit(ctx, request, targets, { kind: 'event', tab: 'schedule', text: head, mail: !!b.notify, subject: ex ? '일정 변경 안내' : '일정 안내',
        lead: `${KIND[v[0]]} 일정${ex ? '이 바뀌었습니다' : '을 안내드립니다'}. ${fmt(date, time)}${v[6] ? ' · ' + v[6] : ''}`, body: `${title}${v[7] ? '\n' + v[7] : ''}`, button: '일정 보기' });
    }
    return json({ ok: true, id: eid, mailed }, ex ? 200 : 201);
  }

  const ev = await DB.prepare(`SELECT * FROM project_events WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).first();
  if (!ev || !canSeeEvent(ctx, ev)) throw new HttpError('not_found', 404);

  if (b.action === 'rsvp') {
    const who = whoOf(ctx);
    if (!who) throw new HttpError('forbidden', 403, { message: '참석 응답은 임대인과 파트너가 남깁니다.' });
    if (ev.status !== 'plan') throw new HttpError('validation', 422, { message: '이미 끝났거나 취소된 일정입니다.' });
    const answer = pick(b.answer, RSVP, null);
    if (!answer) throw new HttpError('validation', 422);
    const note = clip(b.note, 200) || null;
    await DB.prepare(`INSERT INTO event_rsvp (event_id, who, answer, note, at) VALUES (?1,?2,?3,?4,?5)
      ON CONFLICT (event_id, who) DO UPDATE SET answer = excluded.answer, note = excluded.note, at = excluded.at`).bind(ev.id, who, answer, note, now).run();
    await emit(ctx, request, ['admin'], { kind: 'event', tab: 'schedule', text: r => `${ownerLabel(r, who)}님 참석 응답: ${ANS[answer]} — ${fmt(ev.date, ev.time)} ${ev.title}`, body: note });
    return json({ ok: true });
  }

  if (!manager || (role !== 'admin' && (ev.audience === 'internal' || ev.audience === 'direct'))) throw new HttpError('forbidden', 403);

  if (b.action === 'status') {
    const status = pick(b.status, EVENT_STATUS, ev.status);
    const result = b.result !== undefined ? (clip(b.result, 4000) || null) : ev.result;
    await DB.prepare(`UPDATE project_events SET status = ?1, result = ?2, updated_at = ?3 WHERE id = ?4`).bind(status, result, now, ev.id).run();
    if (status !== ev.status) await logp(DB, project.id, actor, 'event', `일정 ${status === 'done' ? '완료' : status === 'cancel' ? '취소' : '다시 예정'}: ${ev.title} (${fmt(ev.date, ev.time)})`);
    await touch(DB, project.id);
    let mailed = 0;
    if (ev.audience !== 'internal') {
      const targets = audienceTargets(ctx, ev.audience, ev.direct_to, { exceptMemberId: role === 'partner' ? ctx.member.id : null });
      if (status === 'cancel' && ev.status !== 'cancel') {
        mailed = await emit(ctx, request, targets, { kind: 'event', tab: 'schedule', text: `일정이 취소되었습니다: ${fmt(ev.date, ev.time)} ${ev.title}`, mail: !!b.notify, subject: '일정 취소 안내', button: '일정 보기' });
      } else if (result && result !== ev.result) {
        mailed = await emit(ctx, request, targets, { kind: 'event', tab: 'schedule', text: `일정 결과가 정리되었습니다: ${ev.title}`, body: result, mail: !!b.notify, subject: '일정 결과 안내', button: '결과 보기' });
      }
    }
    return json({ ok: true, mailed });
  }

  if (b.action === 'delete') {
    await DB.batch([DB.prepare(`DELETE FROM event_rsvp WHERE event_id = ?1`).bind(ev.id), DB.prepare(`DELETE FROM project_events WHERE id = ?1`).bind(ev.id)]);
    await logp(DB, project.id, actor, 'event', `일정 삭제: ${ev.title} (${fmt(ev.date, ev.time)})`);
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

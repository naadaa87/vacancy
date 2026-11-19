/**
 * 여러 프로젝트의 일정·기한 모아 보기 (센터 홈, 달력, 관리자 전체 일정)
 * GET /api/center/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD   — 일정, 추진사항 기한, 납부·지급 예정, 임대차 만기, 대기 중인 확인 요청
 * GET /api/center/agenda?ics=1                            — 내 프로젝트 일정 전체를 캘린더 파일(.ics)로
 * 보는 사람에게 허락된 프로젝트·항목만 내려주고, 이름·연락처는 권한에 맞춰 가립니다.
 */
import { handle, json, HttpError } from '../../../lib/server.js';
import { requireCenter, toDate, todayKst } from '../../../lib/center.js';
import { agenda, addDays, icsFile } from '../../../lib/workspace.js';

export const onRequestGet = handle(async ({ request, env }) => {
  const acc = await requireCenter(env, request);
  const u = new URL(request.url);
  const today = todayKst();
  if (u.searchParams.get('ics') === '1') {
    const data = await agenda(env, acc, addDays(today, -30), addDays(today, 365));
    const evs = data.items.filter(x => x.type === 'event' && x.status !== 'cancel').map(x => ({ id: x.id, date: x.date, time: x.time, end_date: x.end_date, end_time: x.end_time, title: x.title, place: x.sub, status: x.status, ptitle: x.ptitle }));
    return new Response(icsFile(evs, '공백 임대인센터 일정', u.hostname), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="gongbaek-schedule.ics"', 'Cache-Control': 'private, no-store' } });
  }
  let from = toDate(u.searchParams.get('from')) || addDays(today, -7);
  let to = toDate(u.searchParams.get('to')) || addDays(today, 60);
  if (to < from) [from, to] = [to, from];
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) throw new HttpError('validation', 400, { message: '조회 기간은 400일까지입니다.' });
  const data = await agenda(env, acc, from, to);
  return json({ ok: true, from, to, today, role: acc.role, ...data });
});

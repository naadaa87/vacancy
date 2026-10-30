/**
 * POST /api/center/money — 프로젝트 정산 (관리자)
 *  {project_id, action:'save', id?, direction:'in'|'out', member_id, label, base_amount, rate, amount, status, due_date, done_date, memo}
 *  {project_id, action:'delete', id}
 * in: 공백이 받을 돈(컨설팅비·성과보수·중개보수 등) / out: 파트너에게 지급할 돈
 * 금액 단위: 원. amount를 비우면 base_amount × rate% 로 계산합니다.
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireProjectAdmin, pick, toInt, toNum, toDate, MONEY_STATUS, logp, touch } from '../../../lib/center.js';

const won = n => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
const ST = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' };

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireProjectAdmin(ctx);
  const { DB, project, user, members } = ctx;
  const now = nowIso();

  if (b.action === 'save') {
    const direction = b.direction === 'out' ? 'out' : 'in';
    let memberId = null;
    if (direction === 'out') {
      memberId = toInt(b.member_id);
      if (!members.some(m => m.id === memberId)) throw new HttpError('validation', 422, { message: '지급받을 파트너를 선택해 주세요.' });
    }
    const base = toInt(b.base_amount), rate = toNum(b.rate);
    let amount = toInt(b.amount);
    if (amount == null && base != null && rate != null) amount = Math.round(base * rate / 100);
    if (amount == null) throw new HttpError('validation', 422, { message: '금액을 입력하거나 기준 금액과 비율을 입력해 주세요.' });
    const status = pick(b.status, MONEY_STATUS, 'plan');
    const label = clip(b.label, 60) || (direction === 'in' ? '수입' : '지급');
    const doneDate = toDate(b.done_date) || (status === 'done' ? now.slice(0, 10) : null);
    const id = toInt(b.id);
    if (id) {
      const ex = await DB.prepare(`SELECT * FROM project_money WHERE id = ?1 AND project_id = ?2`).bind(id, project.id).first();
      if (!ex) throw new HttpError('not_found', 404);
      await DB.prepare(`UPDATE project_money SET direction=?1, member_id=?2, label=?3, base_amount=?4, rate=?5, amount=?6, status=?7, due_date=?8, done_date=?9, memo=?10, updated_at=?11 WHERE id=?12`)
        .bind(direction, memberId, label, base, rate, amount, status, toDate(b.due_date), doneDate, clip(b.memo, 500) || null, now, id).run();
      if (ex.status !== status || ex.amount !== amount) await logp(DB, project.id, user.name, 'money', `정산 수정: ${label} ${won(amount)} (${ST[status]})`);
    } else {
      await DB.prepare(`INSERT INTO project_money (project_id, direction, member_id, label, base_amount, rate, amount, status, due_date, done_date, memo, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12)`).bind(project.id, direction, memberId, label, base, rate, amount, status, toDate(b.due_date), doneDate, clip(b.memo, 500) || null, now).run();
      await logp(DB, project.id, user.name, 'money', `정산 ${direction === 'in' ? '수입' : '지급'} 등록: ${label} ${won(amount)} (${ST[status]})`);
    }
    await touch(DB, project.id);
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    const ex = await DB.prepare(`SELECT * FROM project_money WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).first();
    if (!ex) throw new HttpError('not_found', 404);
    await DB.prepare(`DELETE FROM project_money WHERE id = ?1`).bind(ex.id).run();
    await logp(DB, project.id, user.name, 'money', `정산 삭제: ${ex.label} ${won(ex.amount)}`);
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

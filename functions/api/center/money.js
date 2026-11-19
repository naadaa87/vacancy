/**
 * POST /api/center/money — 프로젝트 정산
 *  {project_id, action:'save', id?, direction:'in'|'out', member_id, label, base_amount, rate, amount, status, due_date, done_date, memo,
 *     landlord_visible, invoice('issued'|''), notify}                                        (관리자)
 *  {project_id, action:'delete', id}                                                         (관리자)
 *  {project_id, action:'claim', label, amount, memo}   — 파트너의 지급 요청 (관리자가 확인해 확정)
 *  {project_id, action:'claim_cancel', id}             — 파트너가 확정 전 요청을 거둠
 * in: 공백이 받을 돈(컨설팅비·성과보수·중개보수 등) / out: 파트너에게 지급할 돈
 * landlord_visible: 받을 돈 중 임대인 화면의 '비용·정산'에 청구 내역으로 보일 항목
 * 금액 단위: 원. amount를 비우면 base_amount × rate% 로 계산합니다.
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireWrite, requireProjectAdmin, pick, toInt, toNum, toDate, todayKst, MONEY_STATUS, logp, touch, ownerLabel } from '../../../lib/center.js';
import { emit } from '../../../lib/workspace.js';

const won = n => (n == null ? '-' : Math.round(n).toLocaleString('ko-KR') + '원');
const ST = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' };

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  const { DB, project, user, members } = ctx;
  const now = nowIso();

  // 파트너의 지급 요청
  if (b.action === 'claim' || b.action === 'claim_cancel') {
    requireWrite(ctx);
    if (ctx.role !== 'partner') throw new HttpError('forbidden', 403);
    const me = ctx.member;
    if (b.action === 'claim_cancel') {
      const ex = await DB.prepare(`SELECT * FROM project_money WHERE id = ?1 AND project_id = ?2 AND member_id = ?3 AND claim = 1 AND status = 'plan'`).bind(toInt(b.id), project.id, me.id).first();
      if (!ex) throw new HttpError('not_found', 404, { message: '이미 확정되었거나 찾을 수 없는 요청입니다.' });
      await DB.prepare(`DELETE FROM project_money WHERE id = ?1`).bind(ex.id).run();
      await logp(DB, project.id, ownerLabel({ ...ctx, role: 'admin' }, 'm:' + me.id), 'money', `지급 요청 취소: ${ex.label} ${won(ex.amount)}`);
      return json({ ok: true });
    }
    const amount = toInt(b.amount);
    if (!amount || amount <= 0) throw new HttpError('validation', 422, { message: '요청 금액을 입력해 주세요.' });
    const label = clip(b.label, 60) || '지급 요청';
    const open = await DB.prepare(`SELECT COUNT(*) n FROM project_money WHERE project_id = ?1 AND member_id = ?2 AND claim = 1 AND status = 'plan'`).bind(project.id, me.id).first();
    if (open && open.n >= 10) throw new HttpError('validation', 422, { message: '확인을 기다리는 요청이 많습니다. 공백의 확인 후 다시 요청해 주세요.' });
    const memo = clip(b.memo, 500) || null;
    const r = await DB.prepare(`INSERT INTO project_money (project_id, direction, member_id, label, amount, status, memo, claim, created_at, updated_at) VALUES (?1,'out',?2,?3,?4,'plan',?5,1,?6,?6)`)
      .bind(project.id, me.id, label, amount, memo, now).run();
    const who = ownerLabel({ ...ctx, role: 'admin' }, 'm:' + me.id);
    await logp(DB, project.id, who, 'money', `지급 요청: ${label} ${won(amount)}`);
    await touch(DB, project.id);
    await emit(ctx, request, ['admin'], { kind: 'money', tab: 'money', text: `${who}님 지급 요청: ${label} ${won(amount)}`, body: memo, mail: true, subject: '파트너 지급 요청', lead: `${who}님이 '${label}' ${won(amount)} 지급을 요청했습니다. 정산 탭에서 확인해 주세요.` });
    return json({ ok: true, id: r.meta.last_row_id }, 201);
  }

  requireProjectAdmin(ctx);

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
    const doneDate = toDate(b.done_date) || (status === 'done' ? todayKst() : null); // 한국시간 날짜
    const id = toInt(b.id);
    let ex = null;
    if (id) {
      ex = await DB.prepare(`SELECT * FROM project_money WHERE id = ?1 AND project_id = ?2`).bind(id, project.id).first();
      if (!ex) throw new HttpError('not_found', 404);
    }
    // 임대인에게 보일지(받을 돈만), 세금계산서 발행 여부 — 값을 보내지 않으면 기존 값을 그대로 둡니다
    const visible = direction === 'in' ? (b.landlord_visible !== undefined ? (b.landlord_visible ? 1 : 0) : (ex ? ex.landlord_visible || 0 : 0)) : 0;
    const invoice = b.invoice !== undefined ? (b.invoice === 'issued' ? 'issued' : null) : (ex ? ex.invoice : null);
    if (ex) {
      await DB.prepare(`UPDATE project_money SET direction=?1, member_id=?2, label=?3, base_amount=?4, rate=?5, amount=?6, status=?7, due_date=?8, done_date=?9, memo=?10, updated_at=?11, landlord_visible=?13, invoice=?14 WHERE id=?12`)
        .bind(direction, memberId, label, base, rate, amount, status, toDate(b.due_date), doneDate, clip(b.memo, 500) || null, now, id, visible, invoice).run();
      if (ex.status !== status || ex.amount !== amount) await logp(DB, project.id, user.name, 'money', `정산 수정: ${label} ${won(amount)} (${ST[status]})`);
      if (!!ex.landlord_visible !== !!visible) await logp(DB, project.id, user.name, 'money', `임대인 청구 내역 ${visible ? '표시' : '숨김'}: ${label}`);
    } else {
      await DB.prepare(`INSERT INTO project_money (project_id, direction, member_id, label, base_amount, rate, amount, status, due_date, done_date, memo, created_at, updated_at, landlord_visible, invoice)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?12,?13,?14)`).bind(project.id, direction, memberId, label, base, rate, amount, status, toDate(b.due_date), doneDate, clip(b.memo, 500) || null, now, visible, invoice).run();
      await logp(DB, project.id, user.name, 'money', `정산 ${direction === 'in' ? '수입' : '지급'} 등록: ${label} ${won(amount)} (${ST[status]})${visible ? ' · 임대인 청구 내역 표시' : ''}`);
    }
    await touch(DB, project.id);
    // 알림: 임대인 청구(청구·확정이 되거나 새로 보이게 된 때, 입금 확인 때), 파트너 지급(확정·완료 때)
    let mailed = 0;
    const was = ex ? ex.status : null;
    if (direction === 'in' && visible) {
      if (status === 'due' && (was !== 'due' || !ex.landlord_visible)) {
        mailed = await emit(ctx, request, ['landlord'], { kind: 'money', tab: 'bills', text: `청구 안내: ${label} ${won(amount)}${b.due_date ? ' (기한 ' + toDate(b.due_date) + ')' : ''}`, mail: !!b.notify, subject: '청구 안내',
          lead: `'${label}' ${won(amount)} 청구 내역을 안내드립니다.${toDate(b.due_date) ? ' 납부 기한: ' + toDate(b.due_date) + '.' : ''} 자세한 내용은 임대인센터의 비용·정산에서 확인하실 수 있습니다.`, button: '청구 내역 보기' });
      } else if (status === 'done' && was !== 'done') {
        await emit(ctx, request, ['landlord'], { kind: 'money', tab: 'bills', text: `입금이 확인되었습니다: ${label} ${won(amount)}` });
      }
    }
    if (direction === 'out' && memberId && (status === 'due' || status === 'done') && was !== status) {
      const m = members.find(x => x.id === memberId);
      if (m) await emit(ctx, request, [m], { kind: 'money', tab: 'terms', text: `${status === 'done' ? '지급이 완료되었습니다' : '지급이 확정되었습니다'}: ${label} ${won(amount)}` });
    }
    return json({ ok: true, mailed });
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

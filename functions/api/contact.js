/**
 * POST /api/contact — 문의 접수
 * 설정(Cloudflare Pages > Settings):
 *   Bindings  : D1 데이터베이스, 변수명 DB  → 문의 저장 + 관리자 페이지에서 확인
 *   Variables : RESEND_API_KEY(Secret), CONTACT_TO, CONTACT_FROM → 이메일 알림
 * 둘 중 하나만 설정돼도 접수됩니다. 둘 다 없으면 화면에서 '이메일로 보내기'로 대체 안내합니다.
 */
import { json, fail, esc, clip, isEmail, nowIso, hasDb, db, currentUser, sendMail, mailConfigured, mailLayout, siteOrigin, LABEL } from '../../lib/server.js';

const ALLOWED = ['name', 'role', 'phone', 'email', 'type', 'address', 'floor_area', 'status', 'conditions', 'message', 'agree', 'marketing', 'source', 'page'];

export async function onRequestPost({ request, env }) {
  let body;
  try {
    const ct = request.headers.get('content-type') || '';
    body = ct.includes('application/json') ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch { return fail('bad_request', 400); }

  if (body.website) return json({ ok: true }); // 허니팟

  const d = {};
  for (const k of ALLOWED) d[k] = clip(body[k], k === 'message' ? 4000 : 300);
  const fields = [];
  if (!d.name) fields.push('name');
  if (!d.phone || d.phone.replace(/\D/g, '').length < 9) fields.push('phone');
  if (!isEmail(d.email)) fields.push('email');
  if (!d.type) fields.push('type');
  if (!d.address) fields.push('address');
  if (!d.message) fields.push('message');
  if (d.agree !== 'yes') fields.push('agree');
  if (fields.length) return fail('validation', 422, { fields });

  const now = nowIso();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = clip(request.headers.get('User-Agent'), 200);

  // 1) DB 저장
  let saved = false, id = null, user = null;
  if (hasDb(env)) {
    try {
      user = await currentUser(env, request);
      const DB = await db(env);
      const r = await DB.prepare(
        `INSERT INTO inquiries (created_at, user_id, name, role, phone, email, type, address, floor_area, status, conditions, message, marketing, source, page, ip, user_agent, stage)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,'new')`
      ).bind(now, user ? user.id : null, d.name, d.role, d.phone, d.email, d.type, d.address, d.floor_area, d.status, d.conditions, d.message,
        d.marketing === 'yes' ? 1 : 0, d.source, d.page, ip, ua).run();
      saved = true; id = r.meta.last_row_id;
    } catch (e) { console.error('inquiry save', e); }
  }

  // 2) 담당자 알림 메일 + 문의자 접수 확인 메일
  let mailed = false;
  if (mailConfigured(env)) {
    const to = env.CONTACT_TO || 'spaceblank0100@gmail.com';
    const typeLabel = LABEL.type[d.type] || d.type;
    const rows = [
      ['이름 / 소속', d.name], ['구분', LABEL.role[d.role] || d.role], ['연락처', d.phone], ['이메일', d.email],
      ['문의 유형', typeLabel], ['공간 주소', d.address], ['층수 · 전용면적', d.floor_area], ['현재 용도 · 상태', d.status],
      ['임대조건 · 공실기간 · 예산', d.conditions], ['마케팅 수신 동의', d.marketing === 'yes' ? '예' : '아니오'],
      ['회원 여부', user ? `회원 (${user.email})` : '비회원'], ['유입 경로', d.source], ['접수 시각', now], ['접수 번호', id ? `#${id}` : '-'],
    ];
    const table = `<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#7a8087;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v) || '-'}</td></tr>`).join('')}</table>`;
    mailed = await sendMail(env, {
      to, replyTo: d.email,
      subject: `[공백 문의] ${d.name} · ${typeLabel} · ${d.address}`,
      html: mailLayout(`새 문의 — ${typeLabel}`, `${table}<h3 style="margin:18px 0 6px">문의 내용</h3><pre style="white-space:pre-wrap;font:inherit;background:#f4f5f3;padding:12px;border-radius:6px">${esc(d.message)}</pre>
        <p style="color:#7a8087;font-size:12px">이 메일에 답장하면 문의자(${esc(d.email)})에게 바로 회신됩니다.</p>${saved ? `<p><a href="${siteOrigin(env, request)}/admin#/inquiry/${id}" style="display:inline-block;background:#0b2138;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">관리자 화면에서 처리하기</a></p>` : ''}`),
      text: rows.map(([k, v]) => `${k}: ${v || '-'}`).join('\n') + '\n\n문의 내용:\n' + d.message,
    });
    if (mailed && env.SEND_CONFIRMATION !== 'off') {
      await sendMail(env, {
        to: d.email, replyTo: to,
        subject: '[공백] 문의가 접수되었습니다',
        html: mailLayout('문의가 접수되었습니다', `<p>${esc(d.name)}님, 공백에 문의해 주셔서 감사합니다.</p>
          <p>보내주신 내용을 확인한 뒤 <b>영업일 기준 2~3일 안에</b> 1차 검토 방향을 회신드리겠습니다. 도면이나 사진이 있다면 이 메일에 답장으로 보내주세요.</p>
          <p style="background:#f4f5f3;padding:12px;border-radius:6px;font-size:14px">문의 유형: ${esc(typeLabel)}<br>공간 주소: ${esc(d.address)}</p>`),
        text: `${d.name}님, 공백에 문의해 주셔서 감사합니다.\n영업일 기준 2~3일 안에 1차 검토 방향을 회신드리겠습니다.`,
      });
    }
  }

  if (!saved && !mailed) return fail('not_configured', 503);
  return json({ ok: true, id, saved, mailed });
}

export const onRequestGet = () => fail('method_not_allowed', 405);

/**
 * 문의 접수 API — Cloudflare Pages Functions
 * 경로: POST /api/contact
 *
 * 환경 변수 (Cloudflare Pages > Settings > Environment variables):
 *   RESEND_API_KEY   : Resend(https://resend.com) API 키  — 설정하면 이메일로 접수 알림을 보냅니다.
 *   CONTACT_TO       : 접수 알림을 받을 이메일 (기본값: spaceblank0100@gmail.com)
 *   CONTACT_FROM     : 발신 주소 (Resend에 인증된 도메인 주소. 예: "공백 <noreply@vacancy.co.kr>")
 *   TURNSTILE_SECRET : (선택) Cloudflare Turnstile 비밀키 — 설정하면 봇 검증을 요구합니다.
 *
 * 바인딩 (선택):
 *   DB : D1 데이터베이스 — 바인딩하면 접수 내용을 inquiries 테이블에도 저장합니다. (schema.sql 참고)
 */

const ALLOWED = ['name', 'role', 'phone', 'email', 'type', 'address', 'floor_area', 'status', 'conditions', 'message', 'agree', 'marketing', 'source', 'page'];
const LABEL = {
  role: { owner: '임대인·건물주', seller: '매각 예정 소유주·투자자', broker: '중개법인·공인중개사', developer: '시행사·디벨로퍼', operator: '운영사·브랜드', other: '기타' },
  type: { develop: '공실개발 검토', valueup: '매각 전 밸류업', partner: '파트너 제안', tenant: '입점·운영 파트너 등록', other: '기타' },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function clip(s, n) { return String(s || '').trim().slice(0, n); }

export async function onRequestPost({ request, env }) {
  let body;
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await request.json();
    else { const fd = await request.formData(); body = Object.fromEntries(fd.entries()); }
  } catch (e) {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  // 허니팟: 봇이 채우는 숨은 필드
  if (body.website) return json({ ok: true });

  const d = {};
  for (const k of ALLOWED) d[k] = clip(body[k], k === 'message' ? 4000 : 300);

  const errors = [];
  if (!d.name) errors.push('name');
  if (!d.phone || d.phone.replace(/\D/g, '').length < 9) errors.push('phone');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.push('email');
  if (!d.type) errors.push('type');
  if (!d.address) errors.push('address');
  if (!d.message) errors.push('message');
  if (d.agree !== 'yes') errors.push('agree');
  if (errors.length) return json({ ok: false, error: 'validation', fields: errors }, 422);

  // (선택) Turnstile 검증
  if (env.TURNSTILE_SECRET) {
    const token = body['cf-turnstile-response'];
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
    }).then(r => r.json()).catch(() => ({ success: false }));
    if (!r.success) return json({ ok: false, error: 'turnstile' }, 403);
  }

  const now = new Date().toISOString();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';

  // (선택) D1 저장
  let saved = false;
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO inquiries (created_at, name, role, phone, email, type, address, floor_area, status, conditions, message, marketing, source, page, ip, user_agent)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)`
      ).bind(now, d.name, d.role, d.phone, d.email, d.type, d.address, d.floor_area, d.status, d.conditions, d.message, d.marketing === 'yes' ? 1 : 0, d.source, d.page, ip, ua).run();
      saved = true;
    } catch (e) { /* 저장 실패는 접수 자체를 막지 않음 */ }
  }

  // 이메일 알림 (Resend)
  let mailed = false;
  if (env.RESEND_API_KEY) {
    const to = env.CONTACT_TO || 'spaceblank0100@gmail.com';
    const from = env.CONTACT_FROM || '공백 홈페이지 <onboarding@resend.dev>';
    const rows = [
      ['이름 / 소속', d.name], ['구분', LABEL.role[d.role] || d.role], ['연락처', d.phone], ['이메일', d.email],
      ['문의 유형', LABEL.type[d.type] || d.type], ['공간 주소', d.address], ['층수 · 전용면적', d.floor_area],
      ['현재 용도 · 상태', d.status], ['임대조건 · 공실기간 · 예산', d.conditions], ['마케팅 수신 동의', d.marketing === 'yes' ? '예' : '아니오'],
      ['유입 경로', d.source], ['접수 페이지', d.page], ['접수 시각', now],
    ];
    const html = `<div style="font-family:Pretendard,Apple SD Gothic Neo,Malgun Gothic,sans-serif;font-size:14px;color:#141619">
      <h2 style="margin:0 0 12px">[공백] 새 문의 접수 — ${esc(LABEL.type[d.type] || d.type)}</h2>
      <table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#7a8087;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v) || '-'}</td></tr>`).join('')}</table>
      <h3 style="margin:18px 0 6px">문의 내용</h3>
      <pre style="white-space:pre-wrap;font:inherit;background:#f4f5f3;padding:12px;border-radius:6px">${esc(d.message)}</pre>
      <p style="color:#7a8087;font-size:12px">이 메일에 답장하면 문의자(${esc(d.email)})에게 바로 회신됩니다.</p></div>`;
    const text = rows.map(([k, v]) => `${k}: ${v || '-'}`).join('\n') + '\n\n문의 내용:\n' + d.message;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], reply_to: d.email, subject: `[공백 문의] ${d.name} · ${LABEL.type[d.type] || d.type} · ${d.address}`, html, text }),
      });
      mailed = r.ok;
    } catch (e) { mailed = false; }
  }

  if (!mailed && !saved) {
    // 아무 채널도 설정되지 않음 → 프런트에서 이메일 대체 안내
    return json({ ok: false, error: 'not_configured' }, 503);
  }
  return json({ ok: true, mailed, saved });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'method_not_allowed' }, 405);
}

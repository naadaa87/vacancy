/**
 * 임대인센터 파트너(협력 담당자·제휴사) 명단 — 관리자
 * GET  /api/admin/partners            — 목록
 * GET  /api/admin/partners?id=        — 상세 (참여 프로젝트·정산)
 * POST /api/admin/partners {action:'create'|'update'|'delete'|'invite'|'link', ...}
 */
import { handle, readJson, json, HttpError, requireAdmin, clip, isEmail, normEmail, nowIso, sendMail, mailConfigured, mailLayout, siteOrigin, esc } from '../../../lib/server.js';
import { cdb, ROLES, ACTIVE_STAGES, toInt, toNum, pick } from '../../../lib/center.js';

const act = ACTIVE_STAGES.map(s => `'${s}'`).join(',');

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await cdb(env);
  const id = toInt(new URL(request.url).searchParams.get('id'));
  if (id) {
    const p = await DB.prepare(`SELECT p.*, u.name user_name, u.email user_email, u.email_verified FROM partners p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?1`).bind(id).first();
    if (!p) throw new HttpError('not_found', 404);
    const [pr, money] = await DB.batch([
      DB.prepare(`SELECT m.id member_id, m.role, m.alias, m.perms, m.status, m.fee_rate, m.fee_base, m.success_fee, m.consulting_fee, m.fee_note,
          pj.id, pj.code, pj.title, pj.stage, pj.address, pj.updated_at FROM project_members m JOIN projects pj ON pj.id = m.project_id WHERE m.partner_id = ?1 ORDER BY pj.updated_at DESC`).bind(id),
      DB.prepare(`SELECT x.*, pj.code, pj.title FROM project_money x JOIN project_members m ON m.id = x.member_id JOIN projects pj ON pj.id = x.project_id
          WHERE m.partner_id = ?1 AND x.direction = 'out' ORDER BY COALESCE(x.due_date, x.created_at) DESC`).bind(id),
    ]);
    return json({ ok: true, item: p, projects: pr.results || [], money: money.results || [] });
  }
  const { results = [] } = await DB.prepare(`SELECT p.*, u.name user_name, u.email_verified,
      (SELECT COUNT(*) FROM project_members m JOIN projects pj ON pj.id = m.project_id WHERE m.partner_id = p.id AND m.status = 'active' AND pj.stage IN (${act})) active_projects,
      (SELECT COUNT(*) FROM project_members m WHERE m.partner_id = p.id) projects,
      (SELECT COALESCE(SUM(x.amount), 0) FROM project_money x JOIN project_members m ON m.id = x.member_id WHERE m.partner_id = p.id AND x.direction = 'out' AND x.status = 'done') paid,
      (SELECT COALESCE(SUM(x.amount), 0) FROM project_money x JOIN project_members m ON m.id = x.member_id WHERE m.partner_id = p.id AND x.direction = 'out' AND x.status IN ('plan','due')) unpaid
    FROM partners p LEFT JOIN users u ON u.id = p.user_id ORDER BY CASE p.status WHEN 'active' THEN 0 ELSE 1 END, p.company, p.name`).all();
  return json({ ok: true, items: results });
});

function fields(b) {
  return {
    name: clip(b.name, 60), company: clip(b.company, 100) || null, title: clip(b.title, 60) || null, field: ROLES[b.field] ? b.field : 'etc',
    phone: clip(b.phone, 30) || null, email: normEmail(b.email), agreement: pick(b.agreement, ['none', 'nda', 'signed'], 'none'),
    fee_rate: toNum(b.fee_rate), fee_base: clip(b.fee_base, 40) || null, success_fee: clip(b.success_fee, 200) || null, consulting_fee: toNum(b.consulting_fee),
    fee_note: clip(b.fee_note, 500) || null, memo: clip(b.memo, 2000) || null, status: b.status === 'paused' ? 'paused' : 'active',
  };
}

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const admin = await requireAdmin(env, request);
  const DB = await cdb(env);
  const now = nowIso();

  if (b.action === 'create' || b.action === 'update') {
    const f = fields(b);
    const bad = [];
    if (!f.name) bad.push('name');
    if (!isEmail(f.email)) bad.push('email');
    if (bad.length) throw new HttpError('validation', 422, { fields: bad, message: '이름과 이메일을 확인해 주세요.' });
    const dup = await DB.prepare(`SELECT id FROM partners WHERE email = ?1 AND id != ?2`).bind(f.email, toInt(b.id) || 0).first();
    if (dup) throw new HttpError('validation', 422, { fields: ['email'], message: '같은 이메일의 파트너가 이미 있습니다.' });
    const vals = [f.name, f.company, f.title, f.field, f.phone, f.email, f.agreement, f.fee_rate, f.fee_base, f.success_fee, f.consulting_fee, f.fee_note, f.memo, f.status];
    if (b.action === 'create') {
      // 같은 이메일로 가입·인증한 회원이 있으면 바로 연결
      const u = await DB.prepare(`SELECT id FROM users WHERE email = ?1 AND email_verified = 1`).bind(f.email).first();
      const r = await DB.prepare(`INSERT INTO partners (name, company, title, field, phone, email, agreement, fee_rate, fee_base, success_fee, consulting_fee, fee_note, memo, status, user_id, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?16)`).bind(...vals, u ? u.id : null, now).run();
      return json({ ok: true, id: r.meta.last_row_id, linked: !!u }, 201);
    }
    const ex = await DB.prepare(`SELECT * FROM partners WHERE id = ?1`).bind(toInt(b.id)).first();
    if (!ex) throw new HttpError('not_found', 404);
    // 이메일이 바뀌면 기존 회원 연결을 풀고, 새 이메일로 인증한 회원과 다시 연결합니다
    let userId = ex.user_id;
    if (normEmail(ex.email) !== f.email) { const u = await DB.prepare(`SELECT id FROM users WHERE email = ?1 AND email_verified = 1`).bind(f.email).first(); userId = u ? u.id : null; }
    await DB.prepare(`UPDATE partners SET name=?1, company=?2, title=?3, field=?4, phone=?5, email=?6, agreement=?7, fee_rate=?8, fee_base=?9, success_fee=?10, consulting_fee=?11, fee_note=?12, memo=?13, status=?14, user_id=?15, updated_at=?16 WHERE id=?17`)
      .bind(...vals, userId, now, ex.id).run();
    return json({ ok: true });
  }

  const p = await DB.prepare(`SELECT * FROM partners WHERE id = ?1`).bind(toInt(b.id)).first();
  if (!p) throw new HttpError('not_found', 404);

  if (b.action === 'delete') {
    const used = await DB.prepare(`SELECT COUNT(*) n FROM project_members WHERE partner_id = ?1`).bind(p.id).first();
    if (used.n) throw new HttpError('validation', 422, { message: '프로젝트 참여 기록이 있어 삭제할 수 없습니다. 대신 이용 중지로 바꿔 주세요.' });
    await DB.prepare(`DELETE FROM partners WHERE id = ?1`).bind(p.id).run();
    return json({ ok: true });
  }
  if (b.action === 'link') {
    const uid = toInt(b.user_id);
    if (uid) { const u = await DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(uid).first(); if (!u) throw new HttpError('not_found', 404); }
    await DB.prepare(`UPDATE partners SET user_id = ?1, updated_at = ?2 WHERE id = ?3`).bind(uid || null, now, p.id).run();
    return json({ ok: true });
  }
  if (b.action === 'invite') {
    if (!mailConfigured(env)) throw new HttpError('mail_not_configured', 503);
    const origin = siteOrigin(env, request);
    const link = p.user_id ? `${origin}/center` : `${origin}/signup?email=${encodeURIComponent(p.email)}&next=${encodeURIComponent('/center')}`;
    const ok = await sendMail(env, { to: p.email, subject: '[공백] 임대인센터 파트너 등록 안내',
      html: mailLayout('임대인센터 파트너 등록 안내', `<p>${esc(p.name)}님, 공백입니다.</p><p>공백 임대인센터에 협력 파트너로 등록되었습니다. 함께 진행하는 프로젝트의 정보, 추진사항, 소통 내용을 임대인센터에서 확인하실 수 있습니다.</p>
        ${p.user_id ? '' : '<p>처음이시면 <b>' + esc(p.email) + '</b> 주소로 회원가입하고 이메일 인증을 마쳐 주세요. 인증이 끝나면 자동으로 연결됩니다.</p>'}
        <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">임대인센터 열기</a></p>
        <p style="color:#7a8087;font-size:13px">임대인센터의 정보는 프로젝트 진행 목적으로만 사용해 주세요.</p>`),
      text: `${p.name}님, 공백입니다.\n공백 임대인센터에 협력 파트너로 등록되었습니다.\n${link}` });
    if (!ok) throw new HttpError('mail_failed', 502);
    await DB.prepare(`UPDATE partners SET invited_at = ?1 WHERE id = ?2`).bind(now, p.id).run();
    return json({ ok: true, by: admin.name });
  }
  throw new HttpError('bad_action', 400);
});

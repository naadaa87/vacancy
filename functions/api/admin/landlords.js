/**
 * 임대인(의뢰인) 명단 — 관리자
 * GET  /api/admin/landlords           — 목록
 * GET  /api/admin/landlords?id=       — 상세 (프로젝트)
 * POST /api/admin/landlords {action:'create'|'update'|'delete'|'invite'|'link', ...}
 */
import { handle, readJson, json, HttpError, requireAdmin, clip, isEmail, normEmail, nowIso, sendMail, mailConfigured, mailLayout, siteOrigin, esc } from '../../../lib/server.js';
import { cdb, ACTIVE_STAGES, toInt } from '../../../lib/center.js';

const act = ACTIVE_STAGES.map(s => `'${s}'`).join(',');

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await cdb(env);
  const id = toInt(new URL(request.url).searchParams.get('id'));
  if (id) {
    const l = await DB.prepare(`SELECT l.*, u.name user_name, u.email user_email, u.email_verified FROM landlords l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?1`).bind(id).first();
    if (!l) throw new HttpError('not_found', 404);
    const { results = [] } = await DB.prepare(`SELECT id, code, title, stage, kinds, address, landlord_access, updated_at FROM projects WHERE landlord_id = ?1 ORDER BY updated_at DESC`).bind(id).all();
    const inquiries = l.email || l.phone ? (await DB.prepare(`SELECT id, created_at, type, address, stage FROM inquiries WHERE email = ?1 OR phone = ?2 ORDER BY id DESC LIMIT 10`).bind(l.email || '-', l.phone || '-').all()).results || [] : [];
    return json({ ok: true, item: l, projects: results, inquiries });
  }
  const { results = [] } = await DB.prepare(`SELECT l.*, u.name user_name, u.email_verified,
      (SELECT COUNT(*) FROM projects p WHERE p.landlord_id = l.id) projects,
      (SELECT COUNT(*) FROM projects p WHERE p.landlord_id = l.id AND p.stage IN (${act})) active_projects,
      (SELECT group_concat(p.title, ' / ') FROM projects p WHERE p.landlord_id = l.id) project_titles
    FROM landlords l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.updated_at DESC, l.id DESC`).all();
  return json({ ok: true, items: results });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  await requireAdmin(env, request);
  const DB = await cdb(env);
  const now = nowIso();

  if (b.action === 'create' || b.action === 'update') {
    const f = { name: clip(b.name, 60), kind: b.kind === 'corp' ? 'corp' : 'person', company: clip(b.company, 100) || null, phone: clip(b.phone, 30) || null,
      email: b.email ? normEmail(b.email) : null, portal: b.portal === false ? 0 : 1, memo: clip(b.memo, 2000) || null };
    const bad = [];
    if (!f.name) bad.push('name');
    if (f.email && !isEmail(f.email)) bad.push('email');
    if (bad.length) throw new HttpError('validation', 422, { fields: bad, message: '이름과 이메일을 확인해 주세요.' });
    if (f.email) {
      const dup = await DB.prepare(`SELECT id FROM landlords WHERE email = ?1 AND id != ?2`).bind(f.email, toInt(b.id) || 0).first();
      if (dup) throw new HttpError('validation', 422, { fields: ['email'], message: '같은 이메일의 임대인이 이미 있습니다.' });
    }
    const vals = [f.name, f.kind, f.company, f.phone, f.email, f.portal, f.memo];
    if (b.action === 'create') {
      const u = f.email ? await DB.prepare(`SELECT id FROM users WHERE email = ?1 AND email_verified = 1`).bind(f.email).first() : null;
      const r = await DB.prepare(`INSERT INTO landlords (name, kind, company, phone, email, portal, memo, user_id, inquiry_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)`)
        .bind(...vals, u ? u.id : null, toInt(b.inquiry_id), now).run();
      return json({ ok: true, id: r.meta.last_row_id, linked: !!u }, 201);
    }
    const ex = await DB.prepare(`SELECT * FROM landlords WHERE id = ?1`).bind(toInt(b.id)).first();
    if (!ex) throw new HttpError('not_found', 404);
    let userId = ex.user_id;
    if ((ex.email || '') !== (f.email || '')) { const u = f.email ? await DB.prepare(`SELECT id FROM users WHERE email = ?1 AND email_verified = 1`).bind(f.email).first() : null; userId = u ? u.id : null; }
    await DB.prepare(`UPDATE landlords SET name=?1, kind=?2, company=?3, phone=?4, email=?5, portal=?6, memo=?7, user_id=?8, updated_at=?9 WHERE id=?10`).bind(...vals, userId, now, ex.id).run();
    return json({ ok: true });
  }

  const l = await DB.prepare(`SELECT * FROM landlords WHERE id = ?1`).bind(toInt(b.id)).first();
  if (!l) throw new HttpError('not_found', 404);

  if (b.action === 'delete') {
    const used = await DB.prepare(`SELECT COUNT(*) n FROM projects WHERE landlord_id = ?1`).bind(l.id).first();
    if (used.n) throw new HttpError('validation', 422, { message: '연결된 프로젝트가 있어 삭제할 수 없습니다. 임대인센터 접속만 막으려면 접속 허용을 끄세요.' });
    await DB.prepare(`DELETE FROM landlords WHERE id = ?1`).bind(l.id).run();
    return json({ ok: true });
  }
  if (b.action === 'link') {
    const uid = toInt(b.user_id);
    if (uid) { const u = await DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(uid).first(); if (!u) throw new HttpError('not_found', 404); }
    await DB.prepare(`UPDATE landlords SET user_id = ?1, updated_at = ?2 WHERE id = ?3`).bind(uid || null, now, l.id).run();
    return json({ ok: true });
  }
  if (b.action === 'invite') {
    if (!l.email) throw new HttpError('validation', 422, { message: '임대인 이메일을 먼저 등록해 주세요.' });
    if (!mailConfigured(env)) throw new HttpError('mail_not_configured', 503);
    const origin = siteOrigin(env, request);
    const link = l.user_id ? `${origin}/center` : `${origin}/signup?email=${encodeURIComponent(l.email)}&next=${encodeURIComponent('/center')}`;
    const ok = await sendMail(env, { to: l.email, subject: '[공백] 임대인센터 이용 안내',
      html: mailLayout('임대인센터 이용 안내', `<p>${esc(l.name)}님, 공백입니다.</p><p>의뢰하신 건물의 진행 상황, 공백의 보고, 요청 자료를 임대인센터에서 한곳에서 확인하실 수 있습니다.</p>
        ${l.user_id ? '' : '<p>처음이시면 <b>' + esc(l.email) + '</b> 주소로 회원가입하고 이메일 인증을 마쳐 주세요. 인증이 끝나면 자동으로 연결됩니다.</p>'}
        <p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">임대인센터 열기</a></p>`),
      text: `${l.name}님, 공백입니다.\n의뢰하신 건물의 진행 상황을 임대인센터에서 확인하실 수 있습니다.\n${link}` });
    if (!ok) throw new HttpError('mail_failed', 502);
    await DB.prepare(`UPDATE landlords SET invited_at = ?1 WHERE id = ?2`).bind(now, l.id).run();
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

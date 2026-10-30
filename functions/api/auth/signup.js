// POST /api/auth/signup — 회원가입
import { handle, readJson, json, HttpError, db, clip, isEmail, normEmail, nowIso, hashPassword, passwordProblem,
  createSession, issueUserToken, sendMail, mailLayout, siteOrigin, mailConfigured, esc } from '../../../lib/server.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  if (b.website) return json({ ok: true }); // 허니팟
  const email = normEmail(b.email);
  const name = clip(b.name, 60);
  const phone = clip(b.phone, 30);
  const role = clip(b.role, 30);
  const company = clip(b.company, 100);
  const fields = [];
  if (!name) fields.push('name');
  if (!isEmail(email)) fields.push('email');
  if (phone && phone.replace(/\D/g, '').length < 9) fields.push('phone');
  if (!role) fields.push('role');
  if (b.agree_terms !== true || b.agree_privacy !== true) fields.push('agree');
  const pwErr = passwordProblem(b.password);
  if (pwErr) fields.push('password');
  if (fields.length) throw new HttpError('validation', 422, { fields, message: pwErr || undefined });

  const DB = await db(env);
  const exists = await DB.prepare(`SELECT id FROM users WHERE email = ?1`).bind(email).first();
  if (exists) throw new HttpError('email_taken', 409);

  const now = nowIso();
  const res = await DB.prepare(
    `INSERT INTO users (email, password_hash, name, phone, role, company, marketing, terms_agreed_at, created_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)`
  ).bind(email, await hashPassword(b.password), name, phone, role, company, b.marketing ? 1 : 0, now, now).run();
  const userId = res.meta.last_row_id;

  let mailed = false;
  if (mailConfigured(env)) {
    const token = await issueUserToken(env, userId, 'verify', 48);
    const link = `${siteOrigin(env, request)}/api/auth/verify?token=${encodeURIComponent(token)}`;
    mailed = await sendMail(env, {
      to: email, subject: '[공백] 이메일 인증을 완료해 주세요',
      html: mailLayout('이메일 인증', `<p>${esc(name)}님, 공백 회원가입을 환영합니다.</p><p>아래 버튼을 눌러 이메일 인증을 완료해 주세요. 링크는 48시간 동안 유효합니다.</p>
        <p><a href="${link}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">이메일 인증하기</a></p>
        <p style="color:#7a8087;font-size:13px">본인이 가입하지 않았다면 이 메일을 무시하세요.</p>`),
      text: `${name}님, 공백 회원가입을 환영합니다.\n아래 링크로 이메일 인증을 완료해 주세요 (48시간 유효)\n${link}`,
    });
  }
  const cookies = await createSession(env, request, userId);
  return json({ ok: true, verification_sent: mailed }, 201, { 'Set-Cookie': cookies });
});

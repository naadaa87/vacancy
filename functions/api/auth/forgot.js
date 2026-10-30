// POST /api/auth/forgot — 비밀번호 재설정 메일 요청
import { handle, readJson, json, HttpError, db, normEmail, isEmail, issueUserToken, sendMail, mailLayout, siteOrigin, mailConfigured, esc } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const email = normEmail(b.email);
  if (!isEmail(email)) throw new HttpError('validation', 422, { fields: ['email'] });
  if (!mailConfigured(env)) throw new HttpError('mail_not_configured', 503);
  const DB = await db(env);
  const u = await DB.prepare(`SELECT id, name, email FROM users WHERE email = ?1`).bind(email).first();
  // 가입 여부를 노출하지 않기 위해 항상 같은 응답
  if (u) {
    const token = await issueUserToken(env, u.id, 'reset', 1);
    const link = `${siteOrigin(env, request)}/reset-password?token=${encodeURIComponent(token)}`;
    await sendMail(env, {
      to: u.email, subject: '[공백] 비밀번호 재설정 안내',
      html: mailLayout('비밀번호 재설정', `<p>${esc(u.name)}님, 비밀번호 재설정을 요청하셨습니다. 아래 버튼을 눌러 새 비밀번호를 정해 주세요. 링크는 1시간 동안 유효합니다.</p>
        <p><a href="${link}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">비밀번호 재설정</a></p>
        <p style="color:#7a8087;font-size:13px">요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.</p>`),
      text: `비밀번호 재설정 링크 (1시간 유효)\n${link}`,
    });
  }
  return json({ ok: true });
});

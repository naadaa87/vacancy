// POST /api/auth/resend-verification — 인증 메일 다시 보내기
import { handle, readJson, json, HttpError, requireUser, issueUserToken, sendMail, mailLayout, siteOrigin, mailConfigured, esc } from '../../../lib/server.js';
export const onRequestPost = handle(async ({ request, env }) => {
  await readJson(request);
  const u = await requireUser(env, request);
  if (u.email_verified) return json({ ok: true, already: true });
  if (!mailConfigured(env)) throw new HttpError('mail_not_configured', 503);
  const token = await issueUserToken(env, u.id, 'verify', 48);
  const link = `${siteOrigin(env, request)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendMail(env, {
    to: u.email, subject: '[공백] 이메일 인증을 완료해 주세요',
    html: mailLayout('이메일 인증', `<p>${esc(u.name)}님, 아래 버튼을 눌러 이메일 인증을 완료해 주세요. 링크는 48시간 동안 유효합니다.</p>
      <p><a href="${link}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">이메일 인증하기</a></p>`),
    text: `아래 링크로 이메일 인증을 완료해 주세요 (48시간 유효)\n${link}`,
  });
  if (!sent) throw new HttpError('mail_failed', 502);
  return json({ ok: true });
});

// GET /api/health — 설정 상태 확인 (민감 정보 없음)
import { json, hasDb, db, mailConfigured, mailFrom } from '../../lib/server.js';
export async function onRequestGet({ env }) {
  let dbOk = false, dbError = null;
  if (hasDb(env)) {
    try { const DB = await db(env); await DB.prepare('SELECT COUNT(*) AS n FROM users').first(); dbOk = true; }
    catch (e) { dbError = String(e && e.message || e).slice(0, 120); }
  }
  return json({
    ok: true,
    db_bound: hasDb(env),
    db_ready: dbOk,
    db_error: dbError,
    mail: mailConfigured(env),
    // 값을 넣지 않아도 기본값(관리자·알림: spaceblank0100@gmail.com, 보내는 주소: noreply@vacancy.co.kr)으로 동작합니다
    mail_from_set: true, mail_from_default: !env.CONTACT_FROM, mail_from_domain: (String(mailFrom(env)).match(/@([^\s>]+)/) || [])[1] || '',
    contact_to_set: true, contact_to_default: !env.CONTACT_TO,
    admin_set: true, admin_default: !String(env.ADMIN_EMAILS || '').trim(),
    site_url_default: !env.SITE_URL,
  });
}

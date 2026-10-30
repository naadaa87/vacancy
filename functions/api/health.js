// GET /api/health — 설정 상태 확인 (민감 정보 없음)
import { json, hasDb, db, mailConfigured } from '../../lib/server.js';
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
    mail_from_set: !!env.CONTACT_FROM,
    contact_to_set: !!env.CONTACT_TO,
    admin_set: !!String(env.ADMIN_EMAILS || '').trim(),
  });
}

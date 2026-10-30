// GET /api/admin/stats — 대시보드 지표
import { handle, json, db, requireAdmin, mailConfigured } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await db(env);
  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5).toISOString(), d2 = new Date(now - 2 * 864e5).toISOString(), d30 = new Date(now - 30 * 864e5).toISOString();
  const [inq, mem, docs, series, byType, byRole, byStage, recent, overdue] = await DB.batch([
    DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN stage IN ('new','review') THEN 1 ELSE 0 END) open, SUM(CASE WHEN stage='new' THEN 1 ELSE 0 END) fresh,
      SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) week, SUM(CASE WHEN stage='new' AND created_at < ?2 THEN 1 ELSE 0 END) overdue FROM inquiries`).bind(d7, d2),
    DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN created_at >= ?1 THEN 1 ELSE 0 END) week, SUM(CASE WHEN email_verified=0 THEN 1 ELSE 0 END) unverified,
      SUM(CASE WHEN marketing=1 THEN 1 ELSE 0 END) marketing FROM users`).bind(d7),
    DB.prepare(`SELECT (SELECT COUNT(*) FROM documents) docs, COUNT(*) sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) opened,
      SUM(CASE WHEN mail_ok=0 THEN 1 ELSE 0 END) failed, SUM(CASE WHEN sent_at >= ?1 THEN 1 ELSE 0 END) week FROM deliveries`).bind(d7),
    DB.prepare(`SELECT date(created_at,'+9 hours') d, COUNT(*) n FROM inquiries WHERE created_at >= ?1 GROUP BY d ORDER BY d`).bind(d30),
    DB.prepare(`SELECT type k, COUNT(*) n FROM inquiries GROUP BY type ORDER BY n DESC`),
    DB.prepare(`SELECT role k, COUNT(*) n FROM inquiries GROUP BY role ORDER BY n DESC`),
    DB.prepare(`SELECT COALESCE(stage,'new') k, COUNT(*) n FROM inquiries GROUP BY k`),
    DB.prepare(`SELECT id, created_at, name, type, address, stage, user_id FROM inquiries ORDER BY id DESC LIMIT 6`),
    DB.prepare(`SELECT id, created_at, name, type, address FROM inquiries WHERE stage='new' AND created_at < ?1 ORDER BY id LIMIT 10`).bind(d2),
  ]);
  const one = r => (r.results && r.results[0]) || {};
  return json({
    ok: true,
    inquiries: one(inq), members: one(mem), deliveries: one(docs),
    series: series.results || [], by_type: byType.results || [], by_role: byRole.results || [], by_stage: byStage.results || [],
    recent: recent.results || [], overdue: overdue.results || [],
    setup: { mail: mailConfigured(env), from: true, site_url: !!env.SITE_URL },
  });
});

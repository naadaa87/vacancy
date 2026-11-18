// GET /api/admin/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD — KPI 리포트 (관리자)
//     /api/admin/kpi?brief=1 — 대시보드용 요약
// 날짜는 한국시간 기준. 이전 기간(같은 일수)과 비교 값을 함께 돌려줍니다.
import { handle, json, requireAdmin, HttpError } from '../../../lib/server.js';
import { adb, kstDay, kstStartIso, addDays, KEEP_DAYS } from '../../../lib/analytics.js';
import { cdb } from '../../../lib/center.js';

const isDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v + 'T00:00:00Z'));
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const rows = r => (r && r.results) || [];
const one = r => rows(r)[0] || {};

let lastCleanup = '';
async function cleanup(DB, today) {
  if (lastCleanup === today) return;
  lastCleanup = today;
  const cut = addDays(today, -KEEP_DAYS);
  await DB.batch([DB.prepare(`DELETE FROM an_pv WHERE day < ?1`).bind(cut), DB.prepare(`DELETE FROM an_ev WHERE day < ?1`).bind(cut)]);
}

const SUMMARY = `SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) sessions,
    SUM(is_new) new_visitors, SUM(CASE WHEN member = 1 THEN 1 ELSE 0 END) member_pv,
    AVG(CASE WHEN dwell > 0 THEN dwell END) avg_dwell_pv, AVG(CASE WHEN dwell > 0 THEN scroll END) avg_scroll
  FROM an_pv WHERE day BETWEEN ?1 AND ?2`;
const SESSIONS = `WITH s AS (SELECT sid, COUNT(*) n, SUM(dwell) d FROM an_pv WHERE day BETWEEN ?1 AND ?2 GROUP BY sid),
    g AS (SELECT DISTINCT sid FROM an_ev WHERE type = 'goal' AND day BETWEEN ?1 AND ?2)
  SELECT COUNT(*) sessions, SUM(CASE WHEN s.n = 1 AND s.d < 10000 AND g.sid IS NULL THEN 1 ELSE 0 END) bounces,
    AVG(s.d) avg_session_dwell, AVG(s.n) pages_per_session
  FROM s LEFT JOIN g ON g.sid = s.sid`;
const GOALS = `SELECT kind, COUNT(*) n, COUNT(DISTINCT sid) ss FROM an_ev WHERE type = 'goal' AND day BETWEEN ?1 AND ?2 GROUP BY kind`;

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await adb(env);
  const sp = new URL(request.url).searchParams;
  const now = Date.now(), today = kstDay(now);
  try { await cleanup(DB, today); } catch (e) { console.error(e); }

  /* 대시보드 요약 */
  if (sp.get('brief')) {
    const w0 = addDays(today, -6), p1 = addDays(today, -13), p0 = addDays(today, -7);
    const [td, wk, pw, act, since] = await DB.batch([
      DB.prepare(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv FROM an_pv WHERE day = ?1`).bind(today),
      DB.prepare(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) sessions FROM an_pv WHERE day BETWEEN ?1 AND ?2`).bind(w0, today),
      DB.prepare(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) sessions FROM an_pv WHERE day BETWEEN ?1 AND ?2`).bind(p1, p0),
      DB.prepare(`SELECT COUNT(DISTINCT sid) n FROM an_pv WHERE ts > ?1`).bind(now - 5 * 6e4),
      DB.prepare(`SELECT MIN(day) d FROM an_pv`),
    ]);
    return json({ ok: true, today: one(td), week: one(wk), prev_week: one(pw), active: one(act).n || 0, data_since: one(since).d || null });
  }

  /* 기간 */
  let from = sp.get('from'), to = sp.get('to');
  if (!isDay(from) || !isDay(to)) { to = today; from = addDays(today, -29); }
  if (from > to) [from, to] = [to, from];
  if (daysBetween(from, to) > 400) throw new HttpError('range_too_long', 400);
  const days = daysBetween(from, to) + 1;
  const pTo = addDays(from, -1), pFrom = addDays(from, -days);
  const a = kstStartIso(from), b = kstStartIso(addDays(to, 1)), pa = kstStartIso(pFrom);
  const P = (sql, ...args) => DB.prepare(sql).bind(...args);

  const [
    sumC, sumP, sesC, sesP, series, pages, exits, notfound, channels, chConv, refs, keywords, campaigns, landings,
    tech, heat, clicks, clickKinds, goalsC, goalsP, funnel, assessContact, act, actPages, todayRow, since,
  ] = await DB.batch([
    P(SUMMARY, from, to), P(SUMMARY, pFrom, pTo), P(SESSIONS, from, to), P(SESSIONS, pFrom, pTo),
    P(`SELECT day, COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) ss FROM an_pv WHERE day BETWEEN ?1 AND ?2 GROUP BY day ORDER BY day`, from, to),
    P(`SELECT path, MAX(title) title, COUNT(*) pv, COUNT(DISTINCT vid) uv, AVG(CASE WHEN dwell > 0 THEN dwell END) dwell,
        AVG(CASE WHEN dwell > 0 THEN scroll END) scroll, SUM(CASE WHEN scroll >= 75 THEN 1 ELSE 0 END) deep, SUM(entry) entries
      FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND COALESCE(title, '') <> '__404' GROUP BY path ORDER BY pv DESC LIMIT 200`, from, to),
    P(`SELECT p.path, COUNT(*) n FROM an_pv p JOIN (SELECT sid, MAX(ts) mt FROM an_pv WHERE day BETWEEN ?1 AND ?2 GROUP BY sid) l ON l.sid = p.sid AND l.mt = p.ts GROUP BY p.path`, from, to),
    P(`SELECT path, COUNT(*) n, MAX(ts) last FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND title = '__404' GROUP BY path ORDER BY n DESC LIMIT 30`, from, to),
    P(`SELECT COALESCE(ch, 'direct') ch, COUNT(*) sessions, COUNT(DISTINCT vid) uv FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND entry = 1 GROUP BY ch ORDER BY sessions DESC`, from, to),
    P(`SELECT COALESCE(p.ch, 'direct') ch, COUNT(DISTINCT e.sid) conv FROM an_ev e JOIN an_pv p ON p.sid = e.sid AND p.entry = 1
      WHERE e.type = 'goal' AND e.kind = 'contact_submit' AND e.day BETWEEN ?1 AND ?2 GROUP BY p.ch`, from, to),
    P(`SELECT ref, COUNT(*) n FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND entry = 1 AND ref <> '' AND ref <> '(내부)' GROUP BY ref ORDER BY n DESC LIMIT 30`, from, to),
    P(`SELECT kw, MAX(ref) ref, COUNT(*) n FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND entry = 1 AND kw <> '' GROUP BY kw ORDER BY n DESC LIMIT 30`, from, to),
    P(`SELECT p.utm_source source, p.utm_medium medium, p.utm_campaign campaign, COUNT(*) sessions,
        COUNT(DISTINCT CASE WHEN e.sid IS NOT NULL THEN p.sid END) conv
      FROM an_pv p LEFT JOIN (SELECT DISTINCT sid FROM an_ev WHERE type = 'goal' AND kind = 'contact_submit' AND day BETWEEN ?1 AND ?2) e ON e.sid = p.sid
      WHERE p.day BETWEEN ?1 AND ?2 AND p.entry = 1 AND p.utm_source <> '' GROUP BY 1, 2, 3 ORDER BY sessions DESC LIMIT 30`, from, to),
    P(`SELECT path, COUNT(*) n FROM an_pv WHERE day BETWEEN ?1 AND ?2 AND entry = 1 GROUP BY path ORDER BY n DESC LIMIT 15`, from, to),
    P(`SELECT device, os, browser, COUNT(DISTINCT sid) n FROM an_pv WHERE day BETWEEN ?1 AND ?2 GROUP BY 1, 2, 3`, from, to),
    P(`SELECT CAST(strftime('%w', ts / 1000 + 32400, 'unixepoch') AS INTEGER) w, CAST(strftime('%H', ts / 1000 + 32400, 'unixepoch') AS INTEGER) h, COUNT(*) n
      FROM an_pv WHERE day BETWEEN ?1 AND ?2 GROUP BY w, h`, from, to),
    P(`SELECT kind, label, target, area, COUNT(*) n, COUNT(DISTINCT sid) ss FROM an_ev WHERE type = 'click' AND day BETWEEN ?1 AND ?2
      GROUP BY kind, label, target, area ORDER BY n DESC LIMIT 100`, from, to),
    P(`SELECT kind, COUNT(*) n, COUNT(DISTINCT sid) ss FROM an_ev WHERE type = 'click' AND day BETWEEN ?1 AND ?2 GROUP BY kind ORDER BY n DESC`, from, to),
    P(GOALS, from, to), P(GOALS, pFrom, pTo),
    P(`SELECT COUNT(DISTINCT sid) s_all,
        COUNT(DISTINCT CASE WHEN path IN ('/solution', '/models', '/cases', '/brands', '/about', '/partners') OR path LIKE '/insights%' THEN sid END) s_explore,
        COUNT(DISTINCT CASE WHEN path = '/assessment' THEN sid END) s_assess,
        COUNT(DISTINCT CASE WHEN path = '/contact' THEN sid END) s_contact
      FROM an_pv WHERE day BETWEEN ?1 AND ?2`, from, to),
    P(`SELECT COUNT(DISTINCT p.sid) n FROM an_pv p JOIN (SELECT sid, MIN(ts) t FROM an_ev WHERE type = 'goal' AND kind = 'assessment_done' AND day BETWEEN ?1 AND ?2 GROUP BY sid) g
      ON g.sid = p.sid AND p.ts > g.t WHERE p.path = '/contact'`, from, to),
    P(`SELECT COUNT(DISTINCT sid) n FROM an_pv WHERE ts > ?1`, now - 5 * 6e4),
    P(`SELECT path, COUNT(DISTINCT sid) n FROM an_pv WHERE ts > ?1 GROUP BY path ORDER BY n DESC LIMIT 5`, now - 5 * 6e4),
    P(`SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv FROM an_pv WHERE day = ?1`, today),
    P(`SELECT MIN(day) d FROM an_pv`),
  ]);

  /* 회원·문의·자료 발송 */
  const [mem, memRole, memRecent, signSeries, inqC, inqP, inqOpen, inqStage, inqType, inqRole, inqSeries, inqReply, inqRecent, deliv] = await DB.batch([
    P(`SELECT COUNT(*) total, SUM(email_verified) verified, SUM(marketing) marketing,
        SUM(CASE WHEN created_at >= ?1 AND created_at < ?2 THEN 1 ELSE 0 END) new_cur,
        SUM(CASE WHEN created_at >= ?3 AND created_at < ?1 THEN 1 ELSE 0 END) new_prev,
        SUM(CASE WHEN last_login_at >= ?1 AND last_login_at < ?2 THEN 1 ELSE 0 END) active_cur
      FROM users`, a, b, pa),
    P(`SELECT COALESCE(role, '') k, COUNT(*) n FROM users GROUP BY k ORDER BY n DESC`),
    P(`SELECT id, name, email, role, company, email_verified, created_at FROM users ORDER BY created_at DESC, id DESC LIMIT 8`),
    P(`SELECT date(created_at, '+9 hours') d, COUNT(*) n FROM users WHERE created_at >= ?1 AND created_at < ?2 GROUP BY d`, a, b),
    P(`SELECT COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2`, a, b),
    P(`SELECT COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2`, pa, a),
    P(`SELECT COUNT(*) n FROM inquiries WHERE COALESCE(stage, 'new') IN ('new', 'review')`),
    P(`SELECT COALESCE(stage, 'new') k, COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2 GROUP BY k`, a, b),
    P(`SELECT type k, COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2 GROUP BY k ORDER BY n DESC`, a, b),
    P(`SELECT COALESCE(role, '') k, COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2 GROUP BY k ORDER BY n DESC`, a, b),
    P(`SELECT date(created_at, '+9 hours') d, COUNT(*) n FROM inquiries WHERE created_at >= ?1 AND created_at < ?2 GROUP BY d`, a, b),
    P(`SELECT COUNT(*) n, AVG((julianday(f.t) - julianday(i.created_at)) * 24) hrs FROM inquiries i
      JOIN (SELECT inquiry_id, MIN(created_at) t FROM inquiry_notes WHERE kind IN ('email', 'doc') GROUP BY inquiry_id) f ON f.inquiry_id = i.id
      WHERE i.created_at >= ?1 AND i.created_at < ?2`, a, b),
    P(`SELECT id, created_at, name, type, address, stage FROM inquiries WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC, id DESC LIMIT 8`, a, b),
    P(`SELECT COUNT(*) sent, SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) opened FROM deliveries WHERE sent_at >= ?1 AND sent_at < ?2`, a, b),
  ]);

  /* 임대인센터 */
  let center = null;
  try {
    const C = await cdb(env);
    const [st, nw] = await C.batch([
      C.prepare(`SELECT COALESCE(stage, 'intake') k, COUNT(*) n FROM projects GROUP BY k`),
      C.prepare(`SELECT COUNT(*) n FROM projects WHERE created_at >= ?1 AND created_at < ?2`).bind(a, b),
    ]);
    const by = rows(st);
    center = { by_stage: by, new_cur: one(nw).n || 0, active: by.filter(r => !['done', 'hold', 'dropped'].includes(r.k)).reduce((s, r) => s + r.n, 0) };
  } catch (e) { console.error(e); }

  const exitMap = {}; rows(exits).forEach(r => { exitMap[r.path] = r.n; });
  const convMap = {}; rows(chConv).forEach(r => { convMap[r.ch] = r.conv; });
  const merge = (s, x) => ({ ...one(s), ...one(x) });

  return json({
    ok: true,
    range: { from, to, days, prev_from: pFrom, prev_to: pTo, today },
    data_since: one(since).d || null,
    realtime: { active: one(act).n || 0, pages: rows(actPages), today: one(todayRow) },
    traffic: { cur: merge(sumC, sesC), prev: merge(sumP, sesP) },
    series: rows(series), inq_series: rows(inqSeries), sign_series: rows(signSeries),
    pages: rows(pages).map(r => ({ ...r, exits: exitMap[r.path] || 0 })),
    notfound: rows(notfound),
    channels: rows(channels).map(r => ({ ...r, conv: convMap[r.ch] || 0 })),
    refs: rows(refs), keywords: rows(keywords), campaigns: rows(campaigns), landings: rows(landings),
    tech: rows(tech), heat: rows(heat),
    clicks: rows(clicks), click_kinds: rows(clickKinds),
    goals: { cur: rows(goalsC), prev: rows(goalsP) },
    funnel: { ...one(funnel), assess_to_contact: one(assessContact).n || 0 },
    members: { ...one(mem), by_role: rows(memRole), recent: rows(memRecent) },
    inquiries: { cur: one(inqC).n || 0, prev: one(inqP).n || 0, open: one(inqOpen).n || 0, by_stage: rows(inqStage), by_type: rows(inqType), by_role: rows(inqRole),
      reply: one(inqReply), recent: rows(inqRecent) },
    deliveries: one(deliv),
    center,
  });
});

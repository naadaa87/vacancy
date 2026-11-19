/**
 * 알림함
 * GET  /api/center/notifs?count=1            — 읽지 않은 알림 수만 (홈페이지 상단 표시용)
 * GET  /api/center/notifs?limit=30&before=ID — 알림 목록 + 알림 수신 설정
 * POST {action:'read', id} · {action:'read_all'} · {action:'prefs', mail_now, mail_digest}
 */
import { handle, readJson, json, hasDb, currentUser, requireUser, nowIso } from '../../../lib/server.js';
import { cdb, toInt } from '../../../lib/center.js';
import { listNotifs, dailyTick } from '../../../lib/workspace.js';

export const onRequestGet = handle(async (c) => {
  const { request, env } = c;
  const u = new URL(request.url);
  if (u.searchParams.get('count') === '1') {
    if (!hasDb(env)) return json({ ok: true, unread: 0 });
    const user = await currentUser(env, request);
    if (!user) return json({ ok: true, unread: 0 });
    const DB = await cdb(env);
    try { c.waitUntil(dailyTick(env, request)); } catch (_) {}
    const r = await DB.prepare(`SELECT COUNT(*) n FROM notifs WHERE user_id = ?1 AND read_at IS NULL`).bind(user.id).first();
    return json({ ok: true, unread: r ? r.n : 0 });
  }
  const user = await requireUser(env, request);
  const DB = await cdb(env);
  const data = await listNotifs(DB, user.id, { limit: toInt(u.searchParams.get('limit')) || 30, before: toInt(u.searchParams.get('before')) || 0 });
  const p = await DB.prepare(`SELECT mail_now, mail_digest FROM user_prefs WHERE user_id = ?1`).bind(user.id).first();
  return json({ ok: true, ...data, prefs: { mail_now: !p || p.mail_now !== 0, mail_digest: !p || p.mail_digest !== 0 } });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const user = await requireUser(env, request);
  const DB = await cdb(env);
  const now = nowIso();
  if (b.action === 'read') {
    await DB.prepare(`UPDATE notifs SET read_at = ?1 WHERE id = ?2 AND user_id = ?3 AND read_at IS NULL`).bind(now, toInt(b.id), user.id).run();
    return json({ ok: true });
  }
  if (b.action === 'read_all') {
    await DB.prepare(`UPDATE notifs SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL`).bind(now, user.id).run();
    return json({ ok: true });
  }
  if (b.action === 'prefs') {
    await DB.prepare(`INSERT INTO user_prefs (user_id, mail_now, mail_digest, updated_at) VALUES (?1,?2,?3,?4)
      ON CONFLICT (user_id) DO UPDATE SET mail_now = excluded.mail_now, mail_digest = excluded.mail_digest, updated_at = excluded.updated_at`).bind(user.id, b.mail_now === false ? 0 : 1, b.mail_digest === false ? 0 : 1, now).run();
    return json({ ok: true });
  }
  return json({ ok: false, error: 'bad_action' }, 400);
});

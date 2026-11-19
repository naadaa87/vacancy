/**
 * 임대인센터 운영 설정 (관리자)
 * GET  /api/admin/settings
 * POST {action:'save', pay_note, digest('on'|'off'), digest_admin('on'|'off')}
 *   digest: 임대인·파트너에게 보내는 아침 요약 메일 (기본 꺼짐) / digest_admin: 관리자 요약 메일 (기본 켜짐)
 * POST {action:'run_daily'}   — 기한·일정 알림과 요약 메일을 지금 한 번 보내기 (점검용)
 */
import { handle, readJson, json, requireAdmin, clip } from '../../../lib/server.js';
import { cdb } from '../../../lib/center.js';
import { kvGet, kvSet, runDaily } from '../../../lib/workspace.js';

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await cdb(env);
  return json({ ok: true, pay_note: await kvGet(DB, 'pay_note', ''), digest: await kvGet(DB, 'digest', 'off'), digest_admin: await kvGet(DB, 'digest_admin', 'on'), daily_last: await kvGet(DB, 'daily', '') });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  await requireAdmin(env, request);
  const DB = await cdb(env);
  if (b.action === 'save') {
    if (b.pay_note !== undefined) await kvSet(DB, 'pay_note', clip(b.pay_note, 1000));
    if (b.digest !== undefined) await kvSet(DB, 'digest', b.digest === 'off' ? 'off' : 'on');
    if (b.digest_admin !== undefined) await kvSet(DB, 'digest_admin', b.digest_admin === 'off' ? 'off' : 'on');
    return json({ ok: true });
  }
  if (b.action === 'run_daily') return json({ ok: true, result: await runDaily(env, request) });
  return json({ ok: false, error: 'bad_action' }, 400);
});

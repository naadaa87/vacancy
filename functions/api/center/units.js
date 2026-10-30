/**
 * POST /api/center/units — 층별 임대 현황 (관리자)
 *  {project_id, action:'save', id?, floor, unit, area, use, tenant, status, deposit, rent, mgmt, lease_end, note}
 *  {project_id, action:'delete', id}
 * 금액 단위: 만원, 면적: ㎡
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireProjectAdmin, pick, toInt, toNum, toDate, UNIT_STATUS, touch } from '../../../lib/center.js';

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireProjectAdmin(ctx);
  const { DB, project } = ctx;
  const now = nowIso();

  if (b.action === 'save') {
    const v = [clip(b.floor, 20) || null, clip(b.unit, 30) || null, toNum(b.area), clip(b.use, 60) || null, clip(b.tenant, 100) || null,
      pick(b.status, UNIT_STATUS, 'vacant'), toInt(b.deposit), toInt(b.rent), toInt(b.mgmt), toDate(b.lease_end), clip(b.note, 300) || null];
    if (!v[0] && !v[1]) throw new HttpError('validation', 422, { message: '층 또는 호실을 입력해 주세요.' });
    const id = toInt(b.id);
    if (id) {
      const ex = await DB.prepare(`SELECT id FROM project_units WHERE id = ?1 AND project_id = ?2`).bind(id, project.id).first();
      if (!ex) throw new HttpError('not_found', 404);
      await DB.prepare(`UPDATE project_units SET floor=?1, unit=?2, area=?3, use=?4, tenant=?5, status=?6, deposit=?7, rent=?8, mgmt=?9, lease_end=?10, note=?11, updated_at=?12 WHERE id=?13`)
        .bind(...v, now, id).run();
    } else {
      const s = await DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 s FROM project_units WHERE project_id = ?1`).bind(project.id).first();
      await DB.prepare(`INSERT INTO project_units (project_id, floor, unit, area, use, tenant, status, deposit, rent, mgmt, lease_end, note, sort, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)`)
        .bind(project.id, ...v, s.s, now).run();
    }
    await touch(DB, project.id);
    return json({ ok: true });
  }
  if (b.action === 'delete') {
    await DB.prepare(`DELETE FROM project_units WHERE id = ?1 AND project_id = ?2`).bind(toInt(b.id), project.id).run();
    return json({ ok: true });
  }
  throw new HttpError('bad_action', 400);
});

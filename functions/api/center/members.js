/**
 * POST /api/center/members — 프로젝트 참여 파트너 (관리자)
 *  {project_id, action:'add', partner_id, role, alias, perms:[...], fee_rate, fee_base, success_fee, consulting_fee, fee_note, notify}
 *  {project_id, action:'update', member_id, ...}
 *  {project_id, action:'remove', member_id}
 *  {project_id, action:'invite', member_id}   — 참여 안내 메일 다시 보내기
 * 별칭(alias): 임대인과 다른 파트너(실명 공개 권한이 없는 경우)에게 보이는 이름
 */
import { handle, readJson, json, HttpError, clip, nowIso } from '../../../lib/server.js';
import { projectCtx, requireProjectAdmin, ROLES, PERMS, splitPerms, toInt, toNum, logp, touch, notify, aliasOf } from '../../../lib/center.js';

const permStr = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).filter(p => PERMS.includes(p)))].join(',');
const PERM_KO = { owner: '임대인 정보', leases: '임대 현황', finance: '가격·재무', files: '자료실', upload: '자료 올리기', tasks: '추진사항 관리', team: '참여자 공개', publish: '임대인 직접 공유' };

function uniqueAlias(members, base, exceptId) {
  const used = new Set(members.filter(m => m.id !== exceptId && m.status === 'active').map(m => aliasOf(m)));
  if (!used.has(base)) return base;
  for (const s of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) if (!used.has(`${base} ${s}`)) return `${base} ${s}`;
  return `${base} ${members.length + 1}`;
}

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const ctx = await projectCtx(env, request, b.project_id);
  requireProjectAdmin(ctx);
  const { DB, project, user, members } = ctx;
  const now = nowIso();

  if (b.action === 'add') {
    const partner = await DB.prepare(`SELECT * FROM partners WHERE id = ?1`).bind(toInt(b.partner_id)).first();
    if (!partner) throw new HttpError('not_found', 404, { message: '파트너를 찾을 수 없습니다.' });
    if (partner.status !== 'active') throw new HttpError('validation', 422, { message: '이용 중지된 파트너입니다. 파트너 정보에서 먼저 다시 활성화해 주세요.' });
    const role = ROLES[b.role] ? b.role : (ROLES[partner.field] ? partner.field : 'etc');
    const existing = members.find(m => m.partner_id === partner.id);
    if (existing && existing.status === 'active') throw new HttpError('validation', 422, { message: '이미 참여 중인 파트너입니다.' });
    const alias = clip(b.alias, 30) || uniqueAlias(members, `${ROLES[role]} 파트너`, existing && existing.id);
    const perms = permStr(b.perms);
    const fee = [toNum(b.fee_rate ?? partner.fee_rate), clip(b.fee_base ?? partner.fee_base, 40) || null, clip(b.success_fee ?? partner.success_fee, 200) || null,
      toNum(b.consulting_fee ?? partner.consulting_fee), clip(b.fee_note ?? partner.fee_note, 500) || null];
    let memberId;
    if (existing) {
      await DB.prepare(`UPDATE project_members SET role=?1, alias=?2, perms=?3, fee_rate=?4, fee_base=?5, success_fee=?6, consulting_fee=?7, fee_note=?8, status='active', updated_at=?9 WHERE id=?10`)
        .bind(role, alias, perms, ...fee, now, existing.id).run();
      memberId = existing.id;
    } else {
      const r = await DB.prepare(`INSERT INTO project_members (project_id, partner_id, role, alias, perms, fee_rate, fee_base, success_fee, consulting_fee, fee_note, status, created_at, updated_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active',?11,?11)`).bind(project.id, partner.id, role, alias, perms, ...fee, now).run();
      memberId = r.meta.last_row_id;
    }
    await touch(DB, project.id);
    await logp(DB, project.id, user.name, 'member', `참여 추가: ${partner.name}${partner.company ? '(' + partner.company + ')' : ''} — ${ROLES[role]}, 별칭 '${alias}'`);
    let mailed = 0;
    if (b.notify) {
      const m = { ...partner, id: memberId, project_id: project.id, partner_id: partner.id, role, alias, perms, status: 'active', pstatus: partner.status };
      mailed = await notify({ ...ctx, members: [...members.filter(x => x.id !== memberId), m] }, request, [m], { subject: '프로젝트 참여 요청',
        lead: `${ROLES[role]} 파트너로 참여를 요청드립니다. 건물 정보와 진행 사항은 임대인센터에서 확인하실 수 있습니다.` });
    }
    return json({ ok: true, member_id: memberId, alias, mailed }, 201);
  }

  const m = members.find(x => x.id === toInt(b.member_id));
  if (!m) throw new HttpError('not_found', 404);

  if (b.action === 'update') {
    const sets = []; const args = []; const notes = [];
    if (b.role !== undefined && ROLES[b.role]) { sets.push('role = ?'); args.push(b.role); }
    if (b.alias !== undefined) {
      const a = clip(b.alias, 30) || uniqueAlias(members, `${ROLES[b.role || m.role] || '협력'} 파트너`, m.id);
      if (members.some(x => x.id !== m.id && x.status === 'active' && aliasOf(x) === a)) throw new HttpError('validation', 422, { message: '다른 참여자와 같은 별칭입니다.' });
      sets.push('alias = ?'); args.push(a); if (a !== aliasOf(m)) notes.push(`별칭 '${a}'`);
    }
    if (b.perms !== undefined) {
      const p = permStr(b.perms); sets.push('perms = ?'); args.push(p);
      const before = new Set(splitPerms(m.perms)), after = new Set(splitPerms(p));
      const add = [...after].filter(x => !before.has(x)).map(x => PERM_KO[x]), del = [...before].filter(x => !after.has(x)).map(x => PERM_KO[x]);
      if (add.length || del.length) notes.push(`권한 ${add.length ? '+' + add.join('·') : ''}${del.length ? ' −' + del.join('·') : ''}`.trim());
    }
    for (const [k, f] of [['fee_rate', toNum], ['consulting_fee', toNum], ['fee_base', v => clip(v, 40) || null], ['success_fee', v => clip(v, 200) || null], ['fee_note', v => clip(v, 500) || null]]) {
      if (b[k] !== undefined) { sets.push(`${k} = ?`); args.push(f(b[k])); }
    }
    if (['fee_rate', 'consulting_fee', 'fee_base', 'success_fee', 'fee_note'].some(k => b[k] !== undefined)) notes.push('정산 조건 저장');
    if (!sets.length) return json({ ok: true });
    sets.push('updated_at = ?'); args.push(now);
    await DB.prepare(`UPDATE project_members SET ${sets.join(', ')} WHERE id = ?`).bind(...args, m.id).run();
    if (notes.length) await logp(DB, project.id, user.name, 'member', `${m.name}: ${notes.join(', ')}`);
    return json({ ok: true });
  }

  if (b.action === 'remove') {
    await DB.prepare(`UPDATE project_members SET status = 'removed', updated_at = ?1 WHERE id = ?2`).bind(now, m.id).run();
    await logp(DB, project.id, user.name, 'member', `참여 종료: ${m.name}${m.company ? '(' + m.company + ')' : ''}`);
    await touch(DB, project.id);
    return json({ ok: true });
  }

  if (b.action === 'invite') {
    if (m.status !== 'active') throw new HttpError('validation', 422);
    const mailed = await notify(ctx, request, [m], { subject: '프로젝트 참여 안내', lead: `${ROLES[m.role] || '협력'} 파트너로 참여 중인 프로젝트입니다. 진행 사항은 임대인센터에서 확인하실 수 있습니다.` });
    if (!mailed) throw new HttpError('mail_failed', 502, { message: '메일을 보내지 못했습니다. 이메일 발송 설정을 확인해 주세요.' });
    await DB.prepare(`UPDATE partners SET invited_at = ?1 WHERE id = ?2`).bind(now, m.partner_id).run();
    return json({ ok: true });
  }

  throw new HttpError('bad_action', 400);
});

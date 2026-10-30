/**
 * GET  /api/center/projects — 보는 사람에게 허락된 프로젝트 목록 (+ 내 할 일)
 * POST /api/center/projects — 새 프로젝트 만들기 (관리자)
 */
import { handle, readJson, json, HttpError, clip, normEmail, isEmail, nowIso, addNote } from '../../../lib/server.js';
import { requireCenter, makeMasker, KINDS, PSTAGE_IDS, pick, cleanKinds, toDate, toInt, todayKst, nextCode, logp, templateRows, insertTasks, aliasOf } from '../../../lib/center.js';

const inList = ids => ids.map(() => '?').join(',') || 'NULL';

export const onRequestGet = handle(async ({ request, env }) => {
  const acc = await requireCenter(env, request);
  const { DB, user } = acc;
  const today = todayKst();

  if (acc.admin) {
    const { results = [] } = await DB.prepare(
      `SELECT p.id, p.code, p.title, p.stage, p.kinds, p.priority, p.address, p.building_name, p.due_date, p.start_date, p.created_at, p.updated_at, p.landlord_access, p.next_action,
        l.id landlord_id, l.name landlord_name, l.company landlord_company, l.user_id landlord_user,
        (SELECT COUNT(*) FROM project_members m WHERE m.project_id = p.id AND m.status = 'active') members,
        (SELECT group_concat(pt.name || CASE WHEN pt.company IS NOT NULL AND pt.company != '' THEN '(' || pt.company || ')' ELSE '' END, ', ') FROM project_members m JOIN partners pt ON pt.id = m.partner_id WHERE m.project_id = p.id AND m.status = 'active') member_names,
        (SELECT group_concat(m.partner_id) FROM project_members m WHERE m.project_id = p.id AND m.status = 'active') partner_ids,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id) tasks_total,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'done') tasks_done,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ?1) overdue,
        (SELECT COUNT(*) FROM project_posts x WHERE x.project_id = p.id AND x.status = 'pending') pending_posts,
        (SELECT COUNT(*) FROM project_files f WHERE f.project_id = p.id AND f.status = 'pending') pending_files,
        (SELECT COUNT(*) FROM project_posts x WHERE x.project_id = p.id AND x.author_type != 'admin'
           AND x.created_at > COALESCE((SELECT seen_at FROM project_seen s WHERE s.user_id = ?2 AND s.project_id = p.id), '')) unread
       FROM projects p LEFT JOIN landlords l ON l.id = p.landlord_id ORDER BY p.updated_at DESC, p.id DESC`).bind(today, user.id).all();
    return json({ ok: true, viewer: { role: 'admin', name: user.name }, items: results });
  }

  const items = []; const myTasks = [];
  // 파트너로 참여 중인 프로젝트
  if (acc.partner) {
    const { results = [] } = await DB.prepare(
      `SELECT p.id, p.code, p.title, p.stage, p.kinds, p.address, p.due_date, p.updated_at, p.landlord_id, m.id member_id, m.role, m.alias, m.perms,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND (t.visibility != 'internal' OR t.owner = 'm:' || m.id)) tasks_total,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND (t.visibility != 'internal' OR t.owner = 'm:' || m.id) AND t.status = 'done') tasks_done,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.owner = 'm:' || m.id AND t.status != 'done') my_open,
        (SELECT COUNT(*) FROM project_posts x WHERE x.project_id = p.id AND NOT (x.author_type = 'partner' AND x.member_id = m.id)
           AND (x.audience IN ('team','all') OR (x.audience = 'direct' AND x.direct_to = 'm:' || m.id))
           AND x.created_at > COALESCE((SELECT seen_at FROM project_seen s WHERE s.user_id = ?2 AND s.project_id = p.id), '')) unread
       FROM project_members m JOIN projects p ON p.id = m.project_id
       WHERE m.partner_id = ?1 AND m.status = 'active' ORDER BY p.updated_at DESC`).bind(acc.partner.id, user.id).all();
    results.forEach(r => items.push({ ...r, as: 'partner' }));
    const { results: t = [] } = await DB.prepare(
      `SELECT t.id, t.project_id, t.title, t.due_date, t.status, t.kind FROM project_tasks t
        JOIN project_members m ON m.project_id = t.project_id AND t.owner = 'm:' || m.id
       WHERE m.partner_id = ?1 AND m.status = 'active' AND t.status != 'done' ORDER BY COALESCE(t.due_date, '9999-12-31'), t.id LIMIT 50`).bind(acc.partner.id).all();
    t.forEach(x => myTasks.push(x));
  }
  // 임대인으로 의뢰한 프로젝트
  const lids = acc.landlords.map(l => l.id);
  if (lids.length) {
    const { results = [] } = await DB.prepare(
      `SELECT p.id, p.code, p.title, p.stage, p.kinds, p.address, p.due_date, p.updated_at, p.landlord_id,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND (t.visibility = 'all' OR t.owner = 'l')) tasks_total,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND (t.visibility = 'all' OR t.owner = 'l') AND t.status = 'done') tasks_done,
        (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id = p.id AND t.owner = 'l' AND t.status != 'done') my_open,
        (SELECT COUNT(*) FROM project_posts x WHERE x.project_id = p.id AND x.author_type != 'landlord'
           AND ((x.audience = 'all' AND x.status = 'published') OR (x.audience = 'direct' AND x.direct_to = 'l'))
           AND x.created_at > COALESCE((SELECT seen_at FROM project_seen s WHERE s.user_id = ?1 AND s.project_id = p.id), '')) unread
       FROM projects p WHERE p.landlord_access = 1 AND p.landlord_id IN (${inList(lids)}) ORDER BY p.updated_at DESC`).bind(user.id, ...lids).all();
    results.forEach(r => { if (!items.some(i => i.id === r.id)) items.push({ ...r, as: 'landlord' }); });
    const pids = results.map(r => r.id);
    if (pids.length) {
      const { results: t = [] } = await DB.prepare(`SELECT id, project_id, title, due_date, status, kind FROM project_tasks WHERE owner = 'l' AND status != 'done' AND project_id IN (${inList(pids)}) ORDER BY COALESCE(due_date, '9999-12-31'), id LIMIT 50`).bind(...pids).all();
      t.forEach(x => myTasks.push(x));
    }
  }

  // 이름·연락처 익명 처리 (프로젝트별 참여자 기준)
  const pids = items.map(i => i.id);
  let mem = [], lls = [];
  if (pids.length) {
    mem = (await DB.prepare(`SELECT m.*, p.name, p.company, p.phone, p.email FROM project_members m JOIN partners p ON p.id = m.partner_id WHERE m.project_id IN (${inList(pids)})`).bind(...pids).all()).results || [];
    const lidAll = [...new Set(items.map(i => i.landlord_id).filter(Boolean))];
    if (lidAll.length) lls = (await DB.prepare(`SELECT * FROM landlords WHERE id IN (${inList(lidAll)})`).bind(...lidAll).all()).results || [];
  }
  const maskers = {};
  for (const it of items) {
    const members = mem.filter(m => m.project_id === it.id);
    const member = it.as === 'partner' ? members.find(m => m.id === it.member_id) : null;
    const perms = new Set(['building', ...String(member ? member.perms : '').split(',').filter(Boolean)]);
    maskers[it.id] = makeMasker({ env, role: it.as, member, perms, members, landlord: lls.find(l => l.id === it.landlord_id) || null });
  }
  const out = items.map(it => {
    const mask = maskers[it.id];
    const o = { id: it.id, code: it.code, title: mask(it.title), stage: it.stage, kinds: it.kinds, address: it.address, due_date: it.due_date, updated_at: it.updated_at,
      as: it.as, tasks_total: it.tasks_total, tasks_done: it.tasks_done, my_open: it.my_open, unread: it.unread };
    if (it.as === 'partner') { o.role = it.role; o.alias = aliasOf(it); }
    return o;
  });
  const tasks = myTasks.map(t => ({ id: t.id, project_id: t.project_id, title: maskers[t.project_id] ? maskers[t.project_id](t.title) : t.title, due_date: t.due_date, status: t.status, kind: t.kind,
    project_title: (out.find(o => o.id === t.project_id) || {}).title || '' }));
  const viewer = { role: acc.role, name: user.name, partner: !!acc.partner, landlord: lids.length > 0 };
  return json({ ok: true, viewer, items: out, my_tasks: tasks });
});

export const onRequestPost = handle(async ({ request, env }) => {
  const b = await readJson(request);
  const acc = await requireCenter(env, request);
  if (!acc.admin) throw new HttpError('forbidden', 403);
  const { DB, user } = acc;
  const title = clip(b.title, 120);
  if (!title) throw new HttpError('validation', 422, { fields: ['title'], message: '프로젝트 이름을 입력해 주세요.' });
  const now = nowIso();

  // 임대인: 기존 선택 또는 새로 등록 (같은 이메일이 있으면 그 임대인으로 연결)
  let landlordId = toInt(b.landlord_id);
  if (landlordId) {
    const l = await DB.prepare(`SELECT id FROM landlords WHERE id = ?1`).bind(landlordId).first();
    if (!l) throw new HttpError('validation', 422, { message: '선택한 임대인을 찾을 수 없습니다.' });
  } else if (b.landlord && clip(b.landlord.name, 60)) {
    const L = b.landlord; const email = isEmail(L.email) ? normEmail(L.email) : null;
    const ex = email ? await DB.prepare(`SELECT id FROM landlords WHERE email = ?1`).bind(email).first() : null;
    if (ex) landlordId = ex.id;
    else {
      const r = await DB.prepare(`INSERT INTO landlords (name, kind, company, phone, email, portal, inquiry_id, memo, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?7,?8,?8)`)
        .bind(clip(L.name, 60), L.kind === 'corp' ? 'corp' : 'person', clip(L.company, 100) || null, clip(L.phone, 30) || null, email, toInt(b.inquiry_id), clip(L.memo, 1000) || null, now).run();
      landlordId = r.meta.last_row_id;
    }
  }

  const kinds = cleanKinds(b.kinds);
  const code = await nextCode(DB);
  const r = await DB.prepare(`INSERT INTO projects (code, title, landlord_id, inquiry_id, kinds, stage, priority, address, building_name, building_use, scale, land_area, gross_area, built_year,
      vacancy, request, goal, finance, internal_memo, next_action, start_date, due_date, landlord_access, created_by, created_at, updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?25)`)
    .bind(code, title, landlordId || null, toInt(b.inquiry_id), kinds, pick(b.stage, PSTAGE_IDS, 'intake'), pick(b.priority, ['high', 'normal', 'low'], 'normal'),
      clip(b.address, 200) || null, clip(b.building_name, 100) || null, clip(b.building_use, 100) || null, clip(b.scale, 100) || null, clip(b.land_area, 50) || null, clip(b.gross_area, 50) || null, clip(b.built_year, 20) || null,
      clip(b.vacancy, 2000) || null, clip(b.request, 4000) || null, clip(b.goal, 2000) || null, clip(b.finance, 4000) || null, clip(b.internal_memo, 4000) || null, clip(b.next_action, 300) || null,
      toDate(b.start_date) || now.slice(0, 10), toDate(b.due_date), b.landlord_access === false ? 0 : 1, user.name, now).run();
  const id = r.meta.last_row_id;
  if (b.template !== false) await insertTasks(DB, id, templateRows(kinds, !!landlordId));
  await logp(DB, id, user.name, 'create', `프로젝트 생성 (${code})${kinds ? ' · ' + kinds.split(',').map(k => KINDS[k]).join(', ') : ''}`);
  if (toInt(b.inquiry_id)) { try { await addNote(env, toInt(b.inquiry_id), 'note', `임대인센터 프로젝트 ${code} 생성 — ${title}`, user.name); } catch (_) {} }
  return json({ ok: true, id, code }, 201);
});

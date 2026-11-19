/**
 * 임대인센터 업무 기능 공통 모듈
 * - 알림함(화면 알림 + 메일), 알림 수신 설정
 * - 일정·확인 요청·만족도 평가 데이터 (보는 사람 권한에 맞춰 거름)
 * - 여러 프로젝트를 한 번에 보는 일정(agenda), 캘린더 파일(.ics)
 * - 하루 한 번 보내는 기한·일정 알림과 요약 메일
 */
import { nowIso, clip, esc, adminEmails, sendMailBatch, mailConfigured, mailLayout, siteOrigin } from './server.js';
import { trackableHost } from './analytics.js';
import { cdb, makeMasker, recipientCtx, notify, canSeeEvent, canSeeApproval, canSeeTask, whoOf, ownerLabel,
  todayKst, ACTIVE_STAGES, PSTAGES, splitPerms, adminInbox } from './center.js';

const excerpt = (t, n = 160) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const toTime = v => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null);
const inList = ids => ids.map(() => '?').join(',') || 'NULL';
const ACT = ACTIVE_STAGES.map(s => `'${s}'`).join(',');

/* ---------------- 운영 설정 (app_kv) ---------------- */
export async function kvGet(DB, k, def = null) { const r = await DB.prepare(`SELECT v FROM app_kv WHERE k = ?1`).bind(k).first(); return r && r.v != null ? r.v : def; }
export async function kvSet(DB, k, v) {
  await DB.prepare(`INSERT INTO app_kv (k, v, updated_at) VALUES (?1,?2,?3) ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at`).bind(k, String(v ?? ''), nowIso()).run();
}

/* ---------------- 알림 ---------------- */
export async function adminUserIds(env, DB) {
  const emails = adminEmails(env);
  const { results = [] } = await DB.prepare(`SELECT id FROM users WHERE is_admin = 1 OR (email_verified = 1 AND lower(email) IN (${inList(emails)}))`).bind(...emails).all();
  return results.map(r => r.id);
}
export async function prefsOf(DB, userIds) {
  const map = new Map(); const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return map;
  const { results = [] } = await DB.prepare(`SELECT * FROM user_prefs WHERE user_id IN (${inList(ids)})`).bind(...ids).all();
  results.forEach(r => map.set(r.user_id, r));
  return map;
}
const SUBJECT = { post: '새 소식', task: '업무 안내', event: '일정 안내', approval: '확인 요청', stage: '진행 단계 안내', file: '새 자료', money: '정산 안내', review: '만족도 평가', info: '안내' };

/**
 * 프로젝트 소식을 알립니다. 화면 알림은 항상 남기고, mail 이 참이면 메일도 보냅니다(받는 사람이 메일 알림을 끈 경우 제외).
 * targets: ['admin' | 'landlord' | 참여자 객체]
 * o: { kind, text(한 줄; 함수면 받는 사람 문맥을 받음), body, tab, mail(true|false|'force'), subject, lead, button, authorType, memberId }
 * 이름·회사·연락처는 받는 사람 기준으로 가려서 저장합니다.
 */
export async function emit(ctx, request, targets, o) {
  const { DB, env, project } = ctx;
  const list = (targets || []).filter(Boolean);
  if (!list.length) return 0;
  const now = nowIso(); const rows = []; const mailTargets = []; const seen = new Set();
  let admins = null;
  const uidOf = t => (t === 'landlord' ? (ctx.landlord && ctx.landlord.user_id) : t === 'admin' ? null : t.user_id);
  const prefs = o.mail && o.mail !== 'force' ? await prefsOf(DB, list.map(uidOf)) : new Map();
  for (const t of list) {
    let ids, link;
    if (t === 'admin') { admins = admins || await adminUserIds(env, DB); ids = admins; link = `/admin#/project/${project.id}`; }
    else if (t === 'landlord') {
      if (!ctx.landlord || !project.landlord_access) continue;
      ids = ctx.landlord.user_id ? [ctx.landlord.user_id] : []; link = `/center#/p/${project.id}`;
    } else {
      if (t.status !== 'active' || t.pstatus === 'paused') continue;
      ids = t.user_id ? [t.user_id] : []; link = `/center#/p/${project.id}`;
    }
    if (o.tab) link += `?tab=${o.tab}`;
    const rctx = recipientCtx(ctx, t);
    const mask = makeMasker(rctx);
    const strict = o.authorType ? mask.authorHidden(o.authorType, o.memberId) : false;
    const title = clip(mask(typeof o.text === 'function' ? o.text(rctx) : o.text), 200);
    const body = o.body ? mask(excerpt(o.body), { strict }) : null;
    const ptitle = clip(mask(project.title), 120);
    for (const id of ids) {
      if (seen.has(id) || (ctx.user && id === ctx.user.id)) continue; // 본인이 한 일은 본인에게 알리지 않음
      seen.add(id);
      rows.push(DB.prepare(`INSERT INTO notifs (user_id, project_id, ptitle, kind, title, body, link, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(id, project.id, ptitle, o.kind || 'info', title, body, link, now));
    }
    if (o.mail) {
      if (t === 'admin') mailTargets.push(t);
      else { const pf = prefs.get(uidOf(t)); if (o.mail === 'force' || !pf || pf.mail_now !== 0) mailTargets.push(t); }
    }
  }
  if (rows.length) await DB.batch(rows);
  if (!mailTargets.length) return 0;
  return notify(ctx, request, mailTargets, { subject: o.subject || SUBJECT[o.kind] || SUBJECT.info, lead: o.lead || o.text, body: o.body, authorType: o.authorType, memberId: o.memberId, button: o.button });
}

// 공개 범위에 해당하는 받는 사람 목록
export function audienceTargets(ctx, audience, directTo, { exceptMemberId = null, landlord = true } = {}) {
  const active = ctx.members.filter(m => m.status === 'active' && m.id !== exceptMemberId);
  if (audience === 'team') return active;
  if (audience === 'all') return landlord ? [...active, 'landlord'] : active;
  if (audience === 'direct') return directTo === 'l' ? ['landlord'] : active.filter(m => 'm:' + m.id === directTo);
  return [];
}
// 담당('gb' | 'l' | 'm:ID') → 알림 받는 사람
export function ownerTarget(ctx, owner) {
  if (owner === 'l') return 'landlord';
  if (owner === 'gb' || !owner) return 'admin';
  return ctx.members.find(m => 'm:' + m.id === owner && m.status === 'active') || null;
}

export async function listNotifs(DB, userId, { limit = 30, before = 0 } = {}) {
  const lim = Math.max(1, Math.min(100, limit | 0));
  const [c, l] = await DB.batch([
    DB.prepare(`SELECT COUNT(*) n FROM notifs WHERE user_id = ?1 AND read_at IS NULL`).bind(userId),
    DB.prepare(`SELECT id, project_id, ptitle, kind, title, body, link, created_at, read_at FROM notifs WHERE user_id = ?1 AND (?2 = 0 OR id < ?2) ORDER BY id DESC LIMIT ${lim}`).bind(userId, before | 0),
  ]);
  return { unread: (c.results[0] || {}).n || 0, items: l.results || [] };
}

/* ---------------- 프로젝트 화면: 일정·확인 요청·평가 ---------------- */
const STAGE_BY_LABEL = Object.fromEntries(PSTAGES.map(s => [s.label, s.id]));
export function eventOut(ctx, mask, e, rsvps) {
  const me = whoOf(ctx);
  const o = { id: e.id, kind: e.kind, title: mask(e.title), date: e.date, time: e.time, end_date: e.end_date, end_time: e.end_time, place: mask(e.place), detail: mask(e.detail),
    status: e.status, result: mask(e.result) };
  if (ctx.role !== 'landlord') o.audience = e.audience;
  if (e.audience === 'direct') o.direct_label = ctx.role === 'admin' ? '공백 ↔ ' + ownerLabel(ctx, e.direct_to) : '공백과 1:1';
  const mine = (rsvps || []).filter(r => r.event_id === e.id);
  if (ctx.role === 'admin') { o.direct_to = e.direct_to; o.created_by = e.created_by; o.rsvps = mine.map(r => ({ who: ownerLabel(ctx, r.who), answer: r.answer, note: r.note, at: r.at })); }
  else { const r = mine.find(x => x.who === me); if (r) o.rsvp = { answer: r.answer, note: r.note }; }
  return o;
}
export function approvalOut(ctx, mask, a, files) {
  const me = whoOf(ctx); const mine = a.target === me;
  const o = { id: a.id, kind: a.kind, title: mask(a.title), detail: mask(a.detail), due_date: a.due_date, status: a.status,
    response: mine ? a.response : mask(a.response), responded_at: a.responded_at, created_at: a.created_at, mine };
  if (a.file_id) { const f = (files || []).find(x => x.id === a.file_id); if (f) o.file = { id: f.id, name: mask(f.name), size: f.size }; }
  if (ctx.role === 'admin') { o.target = a.target; o.target_label = ownerLabel(ctx, a.target); o.created_by = a.created_by; }
  return o;
}
export async function workspacePayload(ctx) {
  const { DB, project, role, env } = ctx; const mask = makeMasker(ctx); const pid = project.id;
  const [evR, rsR, apR, rvR, stR, fR] = await DB.batch([
    DB.prepare(`SELECT * FROM project_events WHERE project_id = ?1 ORDER BY date, COALESCE(time, '00:00'), id`).bind(pid),
    DB.prepare(`SELECT r.* FROM event_rsvp r JOIN project_events e ON e.id = r.event_id WHERE e.project_id = ?1`).bind(pid),
    DB.prepare(`SELECT * FROM project_approvals WHERE project_id = ?1 ORDER BY id DESC`).bind(pid),
    DB.prepare(`SELECT * FROM project_reviews WHERE project_id = ?1 ORDER BY id DESC`).bind(pid),
    DB.prepare(`SELECT created_at, body FROM project_log WHERE project_id = ?1 AND kind = 'stage' ORDER BY id`).bind(pid),
    DB.prepare(`SELECT id, name, size FROM project_files WHERE project_id = ?1 AND id IN (SELECT file_id FROM project_approvals WHERE project_id = ?1 AND file_id IS NOT NULL)`).bind(pid),
  ]);
  const events = (evR.results || []).filter(e => canSeeEvent(ctx, e)).map(e => eventOut(ctx, mask, e, rsR.results || []));
  const approvals = (apR.results || []).filter(a => canSeeApproval(ctx, a)).map(a => approvalOut(ctx, mask, a, fR.results || []));
  const out = { events, approvals };
  // 단계 이력: '접수 → 진단·검토' 기록을 단계 ID로 되돌립니다
  const hist = [];
  for (const r of stR.results || []) {
    const m = String(r.body || '').split(' → ');
    if (m.length === 2 && STAGE_BY_LABEL[m[1]]) hist.push({ at: r.created_at, from: STAGE_BY_LABEL[m[0]] || null, to: STAGE_BY_LABEL[m[1]] });
  }
  out.stage_log = [{ at: project.created_at, from: null, to: hist.length ? (hist[0].from || 'intake') : project.stage }, ...hist];
  const reviews = rvR.results || [];
  if (role === 'admin') out.reviews = reviews.map(r => ({ who: ownerLabel(ctx, r.who), rating: r.rating, comment: r.comment, at: r.updated_at || r.created_at }));
  else { const r = reviews.find(x => x.user_id === ctx.user.id); out.review = r ? { rating: r.rating, comment: r.comment } : null; }
  if (role === 'landlord' || role === 'admin') out.pay_note = await kvGet(DB, 'pay_note', '');
  if (role === 'admin') out.stats_plus = { approvals_wait: (apR.results || []).filter(a => a.status === 'pending').length };
  return out;
}

/* ---------------- 내 프로젝트 범위 (파트너·임대인) ---------------- */
// 로그인한 사람이 볼 수 있는 프로젝트마다 '보는 사람 문맥'을 만듭니다 (가림·권한 판단용)
export async function scopeOf(env, acc) {
  const { DB, user } = acc; let rows = [];
  if (acc.partner) {
    const { results = [] } = await DB.prepare(`SELECT p.*, m.id member_id FROM project_members m JOIN projects p ON p.id = m.project_id WHERE m.partner_id = ?1 AND m.status = 'active'`).bind(acc.partner.id).all();
    rows = results.map(r => ({ ...r, _as: 'partner' }));
  }
  const lids = acc.landlords.map(l => l.id);
  if (lids.length) {
    const { results = [] } = await DB.prepare(`SELECT * FROM projects WHERE landlord_access = 1 AND landlord_id IN (${inList(lids)})`).bind(...lids).all();
    for (const r of results) if (!rows.some(x => x.id === r.id)) rows.push({ ...r, _as: 'landlord' });
  }
  if (!rows.length) return [];
  const pids = rows.map(r => r.id);
  const mem = (await DB.prepare(`SELECT m.*, p.name, p.company, p.title, p.phone, p.email, p.field, p.user_id, p.status AS pstatus FROM project_members m JOIN partners p ON p.id = m.partner_id WHERE m.project_id IN (${inList(pids)})`).bind(...pids).all()).results || [];
  const lidAll = [...new Set(rows.map(r => r.landlord_id).filter(Boolean))];
  const lls = lidAll.length ? ((await DB.prepare(`SELECT * FROM landlords WHERE id IN (${inList(lidAll)})`).bind(...lidAll).all()).results || []) : [];
  return rows.map(r => {
    const members = mem.filter(m => m.project_id === r.id);
    const member = r._as === 'partner' ? members.find(m => m.id === r.member_id) || null : null;
    const perms = r._as === 'partner' ? new Set(['building', ...splitPerms(member && member.perms)]) : new Set(['building', 'leases', 'finance', 'files', 'upload']);
    return { DB, env, user, acc, project: r, members, landlord: lls.find(l => l.id === r.landlord_id) || null, role: r._as, member, perms, preview: false, isAdmin: false };
  }).filter(c => c.role !== 'partner' || c.member);
}

/**
 * 기간 안의 일정·기한 모음 (센터 홈, 달력, 관리자 전체 일정)
 * 반환: { items: [{type, id, project_id, code, ptitle, date, time, end_date, title, sub, status, mine, kind}], approvals: [...대기 중인 확인 요청] }
 */
export async function agenda(env, acc, from, to) {
  const { DB } = acc; const items = []; const approvals = [];
  let scopes;
  if (acc.admin) {
    const { results = [] } = await DB.prepare(`SELECT * FROM projects`).all();
    scopes = results.map(p => ({ DB, env, user: acc.user, project: p, members: [], landlord: null, role: 'admin', member: null, perms: new Set(), preview: false }));
    if (scopes.length) {
      const mem = (await DB.prepare(`SELECT m.*, p.name, p.company, p.title, p.phone, p.email, p.field, p.user_id, p.status AS pstatus FROM project_members m JOIN partners p ON p.id = m.partner_id`).all()).results || [];
      const lls = (await DB.prepare(`SELECT * FROM landlords`).all()).results || [];
      for (const c of scopes) { c.members = mem.filter(m => m.project_id === c.project.id); c.landlord = lls.find(l => l.id === c.project.landlord_id) || null; }
    }
  } else scopes = await scopeOf(env, acc);
  if (!scopes.length) return { items, approvals };
  const pids = scopes.map(c => c.project.id); const q = pids.map((_, i) => '?' + (i + 1)).join(',');
  const [evR, tkR, apR, moR, unR] = await DB.batch([
    DB.prepare(`SELECT * FROM project_events WHERE project_id IN (${q}) AND date <= ?${pids.length + 2} AND COALESCE(end_date, date) >= ?${pids.length + 1} ORDER BY date, COALESCE(time, '00:00')`).bind(...pids, from, to),
    DB.prepare(`SELECT * FROM project_tasks WHERE project_id IN (${q}) AND status != 'done' AND due_date IS NOT NULL AND due_date <= ?${pids.length + 1}`).bind(...pids, to),
    DB.prepare(`SELECT * FROM project_approvals WHERE project_id IN (${q}) AND status = 'pending' ORDER BY COALESCE(due_date, '9999-12-31'), id`).bind(...pids),
    DB.prepare(`SELECT * FROM project_money WHERE project_id IN (${q}) AND status IN ('plan','due') AND due_date BETWEEN ?${pids.length + 1} AND ?${pids.length + 2}`).bind(...pids, from, to),
    DB.prepare(`SELECT * FROM project_units WHERE project_id IN (${q}) AND lease_end BETWEEN ?${pids.length + 1} AND ?${pids.length + 2}`).bind(...pids, from, to),
  ]);
  const today = todayKst();
  for (const c of scopes) {
    const P = c.project, pid = P.id, mask = makeMasker(c), me = whoOf(c);
    const live = ACTIVE_STAGES.includes(P.stage);
    const base = { project_id: pid, code: P.code, ptitle: mask(P.title) };
    for (const e of (evR.results || []).filter(x => x.project_id === pid && canSeeEvent(c, x))) {
      items.push({ ...base, type: 'event', id: e.id, kind: e.kind, date: e.date, time: e.time, end_date: e.end_date, end_time: e.end_time, title: mask(e.title), sub: mask(e.place) || '', status: e.status });
    }
    if (live) for (const t of (tkR.results || []).filter(x => x.project_id === pid && canSeeTask(c, x))) {
      // 지난 기한은 '지연'으로 오늘 날짜가 아니라 원래 기한에 표시하되, 조회 시작일 이전 것도 지연 목록으로 함께 내려줍니다
      const mine = c.role === 'admin' ? t.owner === 'gb' : t.owner === me;
      if (t.due_date < from && !(mine || c.role === 'admin')) continue;
      items.push({ ...base, type: 'task', id: t.id, kind: t.kind, date: t.due_date, title: mask(t.title), sub: ownerLabel(c, t.owner), status: t.status, mine, late: t.due_date < today });
    }
    for (const a of (apR.results || []).filter(x => x.project_id === pid && canSeeApproval(c, x))) {
      const row = { ...base, type: 'approval', id: a.id, kind: a.kind, date: a.due_date, title: mask(a.title), status: a.status, mine: a.target === me, late: !!a.due_date && a.due_date < today, created_at: a.created_at };
      if (c.role === 'admin') row.sub = ownerLabel(c, a.target);
      approvals.push(row);
      if (a.due_date && a.due_date >= from && a.due_date <= to) items.push(row);
    }
    for (const x of (moR.results || []).filter(m => m.project_id === pid)) {
      const ok = c.role === 'admin' || (c.role === 'landlord' && x.direction === 'in' && x.landlord_visible) || (c.role === 'partner' && x.direction === 'out' && x.member_id === c.member.id);
      if (!ok) continue;
      items.push({ ...base, type: 'money', id: x.id, kind: x.direction, date: x.due_date, title: mask(x.label), amount: x.amount, status: x.status,
        sub: c.role === 'admin' ? (x.direction === 'in' ? '받을 돈' : '줄 돈') : c.role === 'landlord' ? '납부 예정' : '지급 예정' });
    }
    if (c.role === 'admin' || c.perms.has('leases')) for (const u of (unR.results || []).filter(x => x.project_id === pid && x.status === 'leased')) {
      items.push({ ...base, type: 'lease', id: u.id, date: u.lease_end, title: `임대차 만기 ${[u.floor, u.unit].filter(Boolean).join(' ')}`.trim(), sub: c.role === 'admin' || c.role === 'landlord' || c.perms.has('owner') ? (u.tenant || '') : mask(u.tenant || '') });
    }
  }
  items.sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')));
  return { items, approvals };
}

/* ---------------- 캘린더 파일 (.ics) ---------------- */
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) { // 한 줄 75바이트 제한 (UTF-8 기준)
  const enc = new TextEncoder(); const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const n = enc.encode(ch).length; if (bytes + n > 73) { out.push(cur); cur = ' ' + ch; bytes = 1 + n; } else { cur += ch; bytes += n; } }
  out.push(cur); return out.join('\r\n');
}
const kstToUtc = (date, time) => new Date(Date.parse(`${date}T${time}:00+09:00`)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
export function icsFile(events, calName, host) {
  const stamp = nowIso().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GONG BAEK//Landlord Center//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(calName)}`, 'X-WR-TIMEZONE:Asia/Seoul'];
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:gb-event-${e.id}@${host}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const end = e.end_time ? kstToUtc(e.end_date || e.date, e.end_time) : new Date(Date.parse(`${e.date}T${e.time}:00+09:00`) + 36e5).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      L.push(`DTSTART:${kstToUtc(e.date, e.time)}`, `DTEND:${end}`);
    } else L.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.end_date || e.date, 1).replace(/-/g, '')}`);
    L.push(`SUMMARY:${icsEsc((e.ptitle ? '[' + e.ptitle + '] ' : '') + e.title)}`);
    if (e.place) L.push(`LOCATION:${icsEsc(e.place)}`);
    if (e.detail) L.push(`DESCRIPTION:${icsEsc(e.detail)}`);
    if (e.status === 'cancel') L.push('STATUS:CANCELLED');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

/* ---------------- 하루 한 번: 기한·일정 알림과 요약 메일 ---------------- */
let dailyChecked = '';
// 방문·접속 요청에 얹혀 하루 한 번(한국시간 오전 8시 이후 첫 요청) 실행됩니다. 실패해도 원래 요청에는 영향이 없습니다.
export async function dailyTick(env, request) {
  try {
    const kst = new Date(Date.now() + 9 * 36e5); const today = kst.toISOString().slice(0, 10);
    // 운영 주소에서만 실행합니다 (미리보기 주소 *.pages.dev 에서는 메일이 나가지 않도록)
    if (dailyChecked === today || kst.getUTCHours() < 8 || !env || !env.DB || !trackableHost(request, env)) return null;
    const DB = await cdb(env);
    const r = await DB.prepare(`INSERT INTO app_kv (k, v, updated_at) VALUES ('daily', ?1, ?2)
      ON CONFLICT (k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at WHERE app_kv.v IS NOT excluded.v`).bind(today, nowIso()).run();
    dailyChecked = today;
    if (!r.meta || !r.meta.changes) return null;
    return await runDaily(env, request, today);
  } catch (e) { console.error('daily', e); return null; }
}

const EV_KIND = { meeting: '미팅', site: '현장', contract: '계약', work: '공사·작업', open: '오픈', pay: '납부·정산', etc: '일정' };
export async function runDaily(env, request, today = todayKst()) {
  const DB = await cdb(env);
  const tomorrow = addDays(today, 1), yesterday = addDays(today, -1);
  const [tkR, evR, apR] = await DB.batch([
    DB.prepare(`SELECT t.* FROM project_tasks t JOIN projects p ON p.id = t.project_id WHERE t.status != 'done' AND t.due_date IS NOT NULL AND p.stage IN (${ACT})
      AND (t.due_date IN (?1, ?2, ?3) OR (t.due_date < ?3 AND CAST(julianday(?1) - julianday(t.due_date) AS INTEGER) % 7 = 0))`).bind(today, tomorrow, yesterday),
    DB.prepare(`SELECT e.* FROM project_events e JOIN projects p ON p.id = e.project_id WHERE e.status = 'plan' AND e.date IN (?1, ?2) AND p.stage IN (${ACT})`).bind(today, tomorrow),
    DB.prepare(`SELECT a.* FROM project_approvals a JOIN projects p ON p.id = a.project_id WHERE a.status = 'pending' AND a.due_date IN (?1, ?2, ?3) AND p.stage IN (${ACT})`).bind(today, tomorrow, yesterday),
  ]);
  const tasks = tkR.results || [], events = evR.results || [], apps = apR.results || [];
  const pids = [...new Set([...tasks, ...events, ...apps].map(x => x.project_id))];
  const stat = { notifs: 0, mails: 0, admin_mail: false };
  const digest = new Map(); // 받는 사람(user_id) → { to, name, lines }
  const adminLines = [];
  const origin = siteOrigin(env, request);
  if (pids.length) {
    const projs = (await DB.prepare(`SELECT * FROM projects WHERE id IN (${inList(pids)})`).bind(...pids).all()).results || [];
    const mem = (await DB.prepare(`SELECT m.*, p.name, p.company, p.title, p.phone, p.email, p.field, p.user_id, p.status AS pstatus FROM project_members m JOIN partners p ON p.id = m.partner_id WHERE m.project_id IN (${inList(pids)})`).bind(...pids).all()).results || [];
    const lidAll = [...new Set(projs.map(p => p.landlord_id).filter(Boolean))];
    const lls = lidAll.length ? ((await DB.prepare(`SELECT * FROM landlords WHERE id IN (${inList(lidAll)})`).bind(...lidAll).all()).results || []) : [];
    const rows = []; const now = nowIso();
    const push = (ctx, target, kind, tab, textFn) => {
      // target: 'landlord' | 참여자 객체 | 'admin'
      if (target === 'admin') { adminLines.push(`${ctx.project.code || ''} ${ctx.project.title} — ${textFn(recipientCtx(ctx, 'admin'))}`.trim()); return; }
      const isL = target === 'landlord';
      if (isL ? (!ctx.landlord || !ctx.project.landlord_access) : (target.status !== 'active' || target.pstatus === 'paused')) return;
      const uid = isL ? ctx.landlord.user_id : target.user_id; if (!uid) return;
      const rctx = recipientCtx(ctx, target); const mask = makeMasker(rctx);
      const text = clip(mask(textFn(rctx)), 200), ptitle = clip(mask(ctx.project.title), 120), link = `/center#/p/${ctx.project.id}?tab=${tab}`;
      rows.push(DB.prepare(`INSERT INTO notifs (user_id, project_id, ptitle, kind, title, link, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(uid, ctx.project.id, ptitle, kind, text, link, now));
      const d = digest.get(uid) || { to: isL ? ctx.landlord.email : target.email, name: isL ? ctx.landlord.name : target.name, lines: [] };
      d.lines.push({ ptitle, text, link: origin + link }); digest.set(uid, d);
    };
    const when = d => (d === today ? '오늘' : d === tomorrow ? '내일' : null);
    for (const P of projs) {
      const members = mem.filter(m => m.project_id === P.id);
      const ctx = { DB, env, user: null, project: P, members, landlord: lls.find(l => l.id === P.landlord_id) || null, role: 'admin', member: null, perms: new Set(), preview: false };
      const targetOf = owner => (owner === 'l' ? 'landlord' : owner === 'gb' || !owner ? 'admin' : members.find(m => 'm:' + m.id === owner) || null);
      for (const t of tasks.filter(x => x.project_id === P.id)) {
        const tg = targetOf(t.owner); if (!tg) continue;
        const w = when(t.due_date);
        const label = t.kind === 'doc' ? '요청드린 자료' : '담당 업무';
        push(ctx, tg, 'task', tg === 'landlord' ? 'overview' : 'tasks', () => (w ? `${label} 기한이 ${w}입니다: ${t.title}` : `${label} 기한이 지났습니다(${t.due_date}): ${t.title}`));
      }
      for (const e of events.filter(x => x.project_id === P.id)) {
        const w = when(e.date); const txt = () => `${w} ${EV_KIND[e.kind] || '일정'}${e.time ? ' ' + e.time : ''}: ${e.title}${e.place ? ' (' + e.place + ')' : ''}`;
        for (const tg of audienceTargets(ctx, e.audience, e.direct_to)) push(ctx, tg, 'event', 'schedule', txt);
        push(ctx, 'admin', 'event', 'schedule', txt);
      }
      for (const a of apps.filter(x => x.project_id === P.id)) {
        const tg = targetOf(a.target); if (!tg || tg === 'admin') continue;
        const w = when(a.due_date);
        push(ctx, tg, 'approval', 'overview', () => (w ? `확인 요청 기한이 ${w}입니다: ${a.title}` : `확인 요청에 아직 응답하지 않으셨습니다: ${a.title}`));
        if (!w) push(ctx, 'admin', 'approval', 'approvals', r => `확인 요청 기한 지남(${ownerLabel(r, a.target)}): ${a.title}`);
      }
    }
    for (let i = 0; i < rows.length; i += 50) await DB.batch(rows.slice(i, i + 50));
    stat.notifs = rows.length;
  }
  // 임대인·파트너 요약 메일: 관리자가 설정에서 켠 경우에만, 받는 사람이 끄지 않았으면 하루 한 통 (기본값은 꺼짐)
  if (mailConfigured(env) && (await kvGet(DB, 'digest', 'off')) === 'on') {
    const prefs = await prefsOf(DB, [...digest.keys()]);
    const mails = [];
    for (const [uid, d] of digest) {
      const pf = prefs.get(uid); if (!d.to || (pf && pf.mail_digest === 0)) continue;
      const list = d.lines.map(l => `<li style="margin:0 0 8px"><span style="color:#7a8087;font-size:13px">${esc(l.ptitle)}</span><br>${esc(l.text)}</li>`).join('');
      mails.push({ to: d.to, subject: `[공백] 오늘 확인할 일 ${d.lines.length}건`,
        html: mailLayout('오늘 확인할 일', `<p>${esc(d.name)}님, 공백입니다. 임대인센터에서 확인하실 내용을 모아 보내드립니다.</p><ul style="padding-left:18px">${list}</ul>
          <p style="margin:22px 0"><a href="${origin}/center" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">임대인센터 열기</a></p>
          <p style="color:#7a8087;font-size:13px">이 요약 메일은 임대인센터 &gt; 알림 &gt; 알림 설정에서 끌 수 있습니다.</p>`),
        text: `${d.name}님, 공백입니다.\n\n${d.lines.map(l => `- [${l.ptitle}] ${l.text}`).join('\n')}\n\n${origin}/center` });
    }
    if (mails.length) stat.mails = (await sendMailBatch(env, mails)).filter(Boolean).length;
  }
  // 관리자 요약: 답변 대기 문의, 승인 대기, 지급 요청까지 함께
  const [w, pend, claims] = await DB.batch([
    DB.prepare(`SELECT COUNT(*) n FROM project_posts x JOIN projects p ON p.id = x.project_id WHERE x.parent_id IS NULL AND x.kind = 'request' AND x.author_type != 'admin' AND x.answered_at IS NULL AND x.resolved_at IS NULL AND p.stage IN (${ACT})`),
    DB.prepare(`SELECT (SELECT COUNT(*) FROM project_posts WHERE status = 'pending') + (SELECT COUNT(*) FROM project_files WHERE status = 'pending') n`),
    DB.prepare(`SELECT COUNT(*) n FROM project_money WHERE claim = 1 AND status = 'plan'`),
  ]);
  const extra = [];
  const n = r => ((r.results || [])[0] || {}).n || 0;
  if (n(w)) extra.push(`답변을 기다리는 문의·요청 ${n(w)}건`);
  if (n(pend)) extra.push(`공개 승인·확인 대기 ${n(pend)}건`);
  if (n(claims)) extra.push(`파트너 지급 요청 ${n(claims)}건`);
  if ((adminLines.length || extra.length) && mailConfigured(env) && (await kvGet(DB, 'digest_admin', 'on')) !== 'off') {
    const li = a => a.map(t => `<li style="margin:0 0 6px">${esc(t)}</li>`).join('');
    const ok = await sendMailBatch(env, [{ to: adminInbox(env), subject: `[공백] 임대인센터 오늘 확인할 일 ${adminLines.length + extra.length}건`,
      html: mailLayout('임대인센터 오늘 확인할 일', `${extra.length ? `<ul style="padding-left:18px">${li(extra)}</ul>` : ''}${adminLines.length ? `<p style="margin:14px 0 6px"><b>기한·일정</b></p><ul style="padding-left:18px">${li(adminLines)}</ul>` : ''}
        <p style="margin:22px 0"><a href="${origin}/admin#/projects" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">관리자 화면 열기</a></p>
        <p style="color:#7a8087;font-size:13px">이 요약 메일은 관리자 화면 &gt; 설정 점검 &gt; 임대인센터 설정에서 끌 수 있습니다.</p>`),
      text: [...extra, ...adminLines].map(t => '- ' + t).join('\n') + `\n\n${origin}/admin#/projects` }]);
    stat.admin_mail = !!ok[0];
  }
  // 오래된 알림 정리 (읽은 알림 180일)
  await DB.prepare(`DELETE FROM notifs WHERE read_at IS NOT NULL AND created_at < ?1`).bind(new Date(Date.now() - 180 * 864e5).toISOString()).run();
  return stat;
}

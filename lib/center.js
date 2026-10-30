/**
 * 임대인센터 공통 모듈
 * - 프로젝트·참여자·소통·추진사항·자료·임대현황·정산 테이블 자동 생성
 * - 역할별 접근 권한 (관리자 / 파트너 / 임대인)
 * - 익명 처리: 임대인 화면에는 파트너 이름·회사·연락처가 나가지 않음
 */
import { db, HttpError, requireUser, isAdmin, adminEmails, mailFrom, DEFAULTS, normEmail, nowIso, clip, esc, sendMailBatch, mailConfigured, mailLayout, siteOrigin } from './server.js';

/* ---------------- 기준 값 ---------------- */
export const PSTAGES = [
  { id: 'intake', label: '접수', ext: '접수' },
  { id: 'diagnosis', label: '진단·검토', ext: '검토 중' },
  { id: 'proposal', label: '제안', ext: '제안' },
  { id: 'contract', label: '수임·계약', ext: '계약' },
  { id: 'execution', label: '실행', ext: '진행 중' },
  { id: 'closing', label: '마무리·정산', ext: '마무리' },
  { id: 'done', label: '완료', ext: '완료' },
  { id: 'hold', label: '보류', ext: '보류' },
  { id: 'dropped', label: '중단', ext: '종료' },
];
export const PSTAGE_IDS = PSTAGES.map(s => s.id);
export const ACTIVE_STAGES = ['intake', 'diagnosis', 'proposal', 'contract', 'execution', 'closing'];
export const pstageLabel = id => (PSTAGES.find(s => s.id === id) || PSTAGES[0]).label;

export const KINDS = {
  vacancy: '공실해결', leasing: '임차유치', md: '상가MD', buy: '건물매입', sell: '건물매각', evict: '명도전략',
  exit: '매각전략', invest: '투자전략', valueup: '밸류업·리모델링', develop: '공간개발·운영', etc: '기타',
};
export const ROLES = {
  broker: '중개', leasing: '임차유치', retail: '리테일·MD', asset: '자산운용', evict: '명도', invest: '투자유치·금융',
  legal: '법무·세무', design: '설계·시공', appraisal: '감정평가', operator: '운영', etc: '협력',
};
// 파트너별 열람·작업 권한. 'building'(건물·의뢰 기본 정보)과 '소통'은 참여자 모두에게 열립니다.
export const PERMS = ['owner', 'leases', 'finance', 'files', 'upload', 'tasks', 'team', 'publish'];
export const PRESETS = {
  view: ['files'],
  work: ['leases', 'files', 'upload'],
  core: ['owner', 'leases', 'finance', 'files', 'upload', 'tasks', 'team'],
};
export const TASK_STATUS = ['todo', 'doing', 'done', 'blocked'];
export const POST_KINDS = ['opinion', 'report', 'request', 'decision'];
export const AUDIENCES = ['internal', 'team', 'all', 'direct'];
export const FILE_CATS = ['legal', 'drawing', 'lease', 'finance', 'report', 'photo', 'etc'];
export const UNIT_STATUS = ['leased', 'vacant', 'nego', 'owner'];
export const MONEY_STATUS = ['plan', 'due', 'done', 'cancel'];
export const PHASES = ['진단', '제안', '실행', '마무리'];

// 유형별 기본 추진사항 [단계, 할 일] 과 임대인에게 요청할 자료
export const TEMPLATES = {
  vacancy: { tasks: [['진단', '현장 조사와 공실 원인 진단'], ['진단', '개발모델별 수지 비교'], ['제안', '공실 해결 방안 제안·보고'], ['실행', '운영사·임차인 매칭'], ['실행', '계약 조건 협의와 체결'], ['실행', '오픈 준비 일정 관리']],
    docs: ['건축물대장', '층별 도면 (있는 경우)', '현재 임대차 현황표'] },
  leasing: { tasks: [['진단', '임대 조건 정리 (보증금·임대료·렌트프리·허용 업종)'], ['제안', '임대 안내 자료 제작'], ['실행', '중개 네트워크 공유와 홍보'], ['실행', '임차 희망자 안내·조건 협상'], ['실행', '임대차 계약 체결']],
    docs: ['임대 가능 면적과 도면', '관리비 내역'] },
  md: { tasks: [['진단', '상권·유동 인구 분석'], ['진단', '현재 임차 구성 진단'], ['제안', '층별 MD 구성안 작성'], ['실행', '목표 브랜드·임차인 목록 작성'], ['실행', '입점 제안과 협상']],
    docs: ['현재 임대차 현황표', '관리비 내역'] },
  buy: { tasks: [['진단', '매입 기준 정리 (예산·지역·수익률·용도)'], ['진단', '후보 매물 탐색과 1차 검토'], ['제안', '실사 (권리관계·건축·임대차)'], ['실행', '가격 협상과 매매 조건 정리'], ['마무리', '계약·잔금·인수인계']],
    docs: ['자금 계획 (대출 포함)'] },
  sell: { tasks: [['진단', '매각 가치 검토 (주변 거래 사례·수익률)'], ['제안', '매각 안내 자료 작성'], ['실행', '매수 후보 탐색과 접촉'], ['실행', '매수 제안 검토·협상'], ['마무리', '계약·잔금·인도']],
    docs: ['건축물대장', '등기사항전부증명서', '임대차계약서 사본', '최근 1년 관리비·수선 내역'] },
  evict: { tasks: [['진단', '임대차 계약과 권리관계 확인'], ['제안', '명도 방식과 일정 전략 수립'], ['실행', '임차인 협의 (이전 지원·합의 조건)'], ['실행', '합의서 작성 또는 법적 절차 진행'], ['마무리', '인도 완료와 원상복구 확인']],
    docs: ['임대차계약서 사본', '임차인과 주고받은 기록 (문자·내용증명 등)'] },
  exit: { tasks: [['진단', '보유·매각 시나리오 비교'], ['진단', '밸류업 후 매각 효과 검토'], ['제안', '매각 시기와 방식 제안'], ['마무리', '의사결정 보고']],
    docs: ['대출 현황', '최근 임대 수입 내역'] },
  invest: { tasks: [['진단', '투자 목표와 조건 정리'], ['진단', '시장·상품 비교 분석'], ['제안', '자금 구조 검토 (대출·지분)'], ['마무리', '투자 전략 보고']], docs: [] },
  valueup: { tasks: [['진단', '건물 현황 진단 (건축·설비·법규)'], ['제안', '개선안과 공사비 검토'], ['실행', '공사 일정과 업체 선정'], ['마무리', '준공과 임대 재개']],
    docs: ['건축물대장', '층별 도면 (있는 경우)'] },
  develop: { tasks: [['진단', '공간 기획과 운영 모델 선정'], ['제안', '수지 분석과 운영 구조 설계'], ['실행', '인테리어·인허가 진행'], ['마무리', '오픈과 운영 안정화']], docs: ['건축물대장'] },
  etc: { tasks: [], docs: [] },
};

/* ---------------- 테이블 ---------------- */
let centerReady = false;
const CENTER_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS landlords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, kind TEXT, company TEXT, phone TEXT, email TEXT,
    user_id INTEGER, portal INTEGER DEFAULT 1, inquiry_id INTEGER, memo TEXT,
    created_at TEXT NOT NULL, updated_at TEXT, invited_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_landlords_email ON landlords (email)`,
  `CREATE INDEX IF NOT EXISTS idx_landlords_user ON landlords (user_id)`,
  `CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, company TEXT, title TEXT, field TEXT, phone TEXT, email TEXT NOT NULL UNIQUE,
    user_id INTEGER, status TEXT DEFAULT 'active', agreement TEXT,
    fee_rate REAL, fee_base TEXT, success_fee TEXT, consulting_fee INTEGER, fee_note TEXT,
    memo TEXT, created_at TEXT NOT NULL, updated_at TEXT, invited_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_partners_user ON partners (user_id)`,
  `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT, title TEXT NOT NULL, landlord_id INTEGER, inquiry_id INTEGER,
    kinds TEXT, stage TEXT DEFAULT 'intake', priority TEXT DEFAULT 'normal',
    address TEXT, building_name TEXT, building_use TEXT, scale TEXT, land_area TEXT, gross_area TEXT, built_year TEXT,
    vacancy TEXT, request TEXT, goal TEXT, finance TEXT, internal_memo TEXT, next_action TEXT,
    start_date TEXT, due_date TEXT, landlord_access INTEGER DEFAULT 1,
    created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT, closed_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_landlord ON projects (landlord_id)`,
  `CREATE TABLE IF NOT EXISTS project_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, partner_id INTEGER NOT NULL, role TEXT, alias TEXT, perms TEXT,
    fee_rate REAL, fee_base TEXT, success_fee TEXT, consulting_fee INTEGER, fee_note TEXT,
    status TEXT DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT,
    UNIQUE (project_id, partner_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pm_partner ON project_members (partner_id)`,
  `CREATE TABLE IF NOT EXISTS project_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, parent_id INTEGER,
    author_type TEXT NOT NULL, author_user_id INTEGER, member_id INTEGER,
    kind TEXT, audience TEXT NOT NULL, direct_to TEXT, status TEXT DEFAULT 'published',
    body TEXT NOT NULL, task_id INTEGER,
    created_at TEXT NOT NULL, updated_at TEXT, approved_at TEXT, approved_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_posts_project ON project_posts (project_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, kind TEXT DEFAULT 'task', phase TEXT, title TEXT NOT NULL, detail TEXT,
    owner TEXT DEFAULT 'gb', due_date TEXT, status TEXT DEFAULT 'todo', visibility TEXT DEFAULT 'team',
    sort INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT, done_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project ON project_tasks (project_id)`,
  `CREATE TABLE IF NOT EXISTS project_units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, floor TEXT, unit TEXT, area REAL, use TEXT, tenant TEXT, status TEXT,
    deposit INTEGER, rent INTEGER, mgmt INTEGER, lease_end TEXT, note TEXT, sort INTEGER DEFAULT 0, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_units_project ON project_units (project_id)`,
  `CREATE TABLE IF NOT EXISTS project_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, task_id INTEGER, name TEXT NOT NULL, mime TEXT, size INTEGER, chunks INTEGER DEFAULT 0,
    category TEXT, audience TEXT DEFAULT 'team', status TEXT DEFAULT 'published',
    uploader_type TEXT, uploader_user_id INTEGER, member_id INTEGER, note TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pfiles_project ON project_files (project_id)`,
  `CREATE TABLE IF NOT EXISTS pfile_chunks (
    file_id INTEGER NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (file_id, idx)
  )`,
  `CREATE TABLE IF NOT EXISTS project_money (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, direction TEXT NOT NULL, member_id INTEGER, label TEXT,
    base_amount INTEGER, rate REAL, amount INTEGER, status TEXT DEFAULT 'plan',
    due_date TEXT, done_date TEXT, memo TEXT, created_at TEXT NOT NULL, updated_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_money_project ON project_money (project_id)`,
  `CREATE TABLE IF NOT EXISTS project_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL, created_at TEXT NOT NULL, actor TEXT, kind TEXT, body TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_plog_project ON project_log (project_id)`,
  `CREATE TABLE IF NOT EXISTS project_seen (
    user_id INTEGER NOT NULL, project_id INTEGER NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY (user_id, project_id)
  )`,
];

export async function cdb(env) {
  const DB = await db(env);
  if (!centerReady) {
    await DB.batch(CENTER_SCHEMA.map(s => DB.prepare(s)));
    centerReady = true;
  }
  return DB;
}

/* ---------------- 작은 도우미 ---------------- */
export const toInt = v => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };
export const toNum = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : null; };
export const toDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
export const pick = (v, list, def) => (list.includes(v) ? v : def);
export const splitPerms = s => String(s || '').split(',').map(x => x.trim()).filter(x => PERMS.includes(x));
export const cleanKinds = arr => [...new Set((Array.isArray(arr) ? arr : String(arr || '').split(',')).map(String).filter(k => KINDS[k]))].join(',');
export const todayKst = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10);
export const aliasOf = m => (m && m.alias) || `${ROLES[m && m.role] || '협력'} 파트너`;

export async function logp(DB, projectId, actor, kind, body) {
  await DB.prepare(`INSERT INTO project_log (project_id, created_at, actor, kind, body) VALUES (?1,?2,?3,?4,?5)`)
    .bind(projectId, nowIso(), actor || null, kind, clip(body, 1000)).run();
}
export async function touch(DB, projectId) {
  await DB.prepare(`UPDATE projects SET updated_at = ?1 WHERE id = ?2`).bind(nowIso(), projectId).run();
}

/* ---------------- 접근 권한 ---------------- */
// 로그인한 회원이 임대인센터에서 어떤 자격을 갖는지 확인합니다.
// 파트너·임대인 명단의 이메일과 같은 이메일로 가입하고 '이메일 인증'을 마치면 자동으로 연결됩니다.
export async function centerAccess(env, user) {
  const DB = await cdb(env);
  const admin = isAdmin(env, user);
  const email = normEmail(user.email);
  if (user.email_verified) {
    // 연결 안 된 명단(또는 탈퇴한 회원에 연결돼 있던 명단)만 새로 연결합니다
    const free = `(user_id IS NULL OR user_id NOT IN (SELECT id FROM users))`;
    const r = await DB.prepare(`SELECT (SELECT COUNT(*) FROM partners WHERE ${free} AND email = ?1) + (SELECT COUNT(*) FROM landlords WHERE ${free} AND email = ?1) AS n`).bind(email).first();
    if (r && r.n) {
      const now = nowIso();
      await DB.batch([
        DB.prepare(`UPDATE partners SET user_id = ?1, updated_at = ?3 WHERE ${free} AND email = ?2`).bind(user.id, email, now),
        DB.prepare(`UPDATE landlords SET user_id = ?1, updated_at = ?3 WHERE ${free} AND email = ?2`).bind(user.id, email, now),
      ]);
    }
  }
  const partner = await DB.prepare(`SELECT * FROM partners WHERE user_id = ?1 AND status = 'active' LIMIT 1`).bind(user.id).first();
  const { results: landlords = [] } = await DB.prepare(`SELECT * FROM landlords WHERE user_id = ?1 AND portal = 1`).bind(user.id).all();
  const role = admin ? 'admin' : partner ? 'partner' : landlords.length ? 'landlord' : null;
  return { DB, user, admin, partner: partner || null, landlords, role };
}

export async function requireCenter(env, request) {
  const user = await requireUser(env, request);
  const acc = await centerAccess(env, user);
  if (!acc.role) throw new HttpError('forbidden', 403);
  return acc;
}

// 프로젝트 한 건에 대한 접근 문맥. 권한이 없으면 프로젝트가 있다는 사실도 알리지 않습니다(404).
// 관리자는 as=landlord / as=m:{참여자ID} 로 다른 역할의 화면을 미리 볼 수 있습니다(읽기 전용).
export async function projectCtx(env, request, projectId, { as = null } = {}) {
  const user = await requireUser(env, request);
  const acc = await centerAccess(env, user);
  const DB = acc.DB;
  const project = await DB.prepare(`SELECT * FROM projects WHERE id = ?1`).bind(toInt(projectId) || 0).first();
  if (!project) throw new HttpError('not_found', 404);
  const { results: members = [] } = await DB.prepare(
    `SELECT m.*, p.name, p.company, p.title, p.phone, p.email, p.field, p.user_id, p.status AS pstatus
       FROM project_members m JOIN partners p ON p.id = m.partner_id WHERE m.project_id = ?1 ORDER BY m.id`).bind(project.id).all();
  const landlord = project.landlord_id ? await DB.prepare(`SELECT * FROM landlords WHERE id = ?1`).bind(project.landlord_id).first() : null;
  let role = null, member = null, preview = false;
  if (acc.admin) {
    role = 'admin';
    if (as === 'landlord') { role = 'landlord'; preview = true; }
    else if (as && /^m:\d+$/.test(as)) {
      member = members.find(m => m.id === +as.slice(2)) || null;
      if (!member) throw new HttpError('not_found', 404);
      role = 'partner'; preview = true;
    }
  } else {
    if (acc.partner) member = members.find(m => m.partner_id === acc.partner.id && m.status === 'active') || null;
    if (member) role = 'partner';
    else if (project.landlord_access && acc.landlords.some(l => l.id === project.landlord_id)) role = 'landlord';
  }
  if (!role) throw new HttpError('not_found', 404);
  const perms = role === 'admin' ? new Set(['building', ...PERMS])
    : role === 'partner' ? new Set(['building', ...splitPerms(member.perms)])
    : new Set(['building', 'leases', 'finance', 'files', 'upload']);
  return { DB, env, user, acc, project, members, landlord, role, member, perms, preview, isAdmin: acc.admin && !preview };
}
export function requireWrite(ctx) { if (ctx.preview) throw new HttpError('preview_readonly', 403); }
export function requireProjectAdmin(ctx) { requireWrite(ctx); if (ctx.role !== 'admin') throw new HttpError('forbidden', 403); }
export const can = (ctx, perm) => ctx.perms.has(perm);

/* ---------------- 익명 처리 (마스킹) ---------------- */
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?82[\s.-]?)?\(?0\d{1,2}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}|\b1[5-9]\d{2}[\s.-]?\d{4}\b/g;
const KAKAO_RE = /(?:https?:\/\/)?(?:open\.kakao\.com|qr\.kakao\.com|pf\.kakao\.com)\/[^\s)]+/gi;
const HIDDEN = '[연락처 비공개]';
const GB_PHONES = ['01023849580'];
const GB_EMAILS = ['spaceblank0100@gmail.com'];
export const normPhone = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('82')) d = '0' + d.slice(2); return d; };

// 보는 사람(역할·권한)에 맞춰 이름·회사명을 별칭으로, 연락처를 [연락처 비공개]로 바꾸는 함수를 만듭니다.
export function makeMasker(ctx) {
  const { role, member, perms, members, landlord, env } = ctx;
  const pairs = []; const hidden = new Set(); let strictAll = false;
  const allow = new Set([...GB_PHONES, ...GB_EMAILS, ...adminEmails(env)]);
  const from = (String(mailFrom(env)).match(/[^\s<>]+@[^\s<>]+/) || [])[0];
  if (from) allow.add(normEmail(from));
  const hidePerson = (p, alias) => {
    for (const s of [p.name, p.company]) if (s && String(s).trim().length >= 2) pairs.push([String(s).trim(), alias]);
    if (p.phone) hidden.add(normPhone(p.phone));
    if (p.email) hidden.add(normEmail(p.email));
  };
  const hiddenMembers = new Set();
  if (role === 'landlord') {
    strictAll = true;
    for (const m of members) { hidePerson(m, aliasOf(m)); hiddenMembers.add(m.id); }
    if (landlord) { if (landlord.phone) allow.add(normPhone(landlord.phone)); if (landlord.email) allow.add(normEmail(landlord.email)); }
  } else if (role === 'partner') {
    if (member.phone) allow.add(normPhone(member.phone));
    if (member.email) allow.add(normEmail(member.email));
    if (!perms.has('team')) for (const m of members) if (m.id !== member.id) { hidePerson(m, aliasOf(m)); hiddenMembers.add(m.id); }
    if (!perms.has('owner') && landlord) hidePerson(landlord, '임대인');
  }
  pairs.sort((a, b) => b[0].length - a[0].length);
  const hiddenLandlord = role === 'partner' && !perms.has('owner');
  function mask(text, opt = {}) {
    let t = String(text ?? '');
    if (!t || opt.own || role === 'admin') return t;
    const strict = strictAll || opt.strict;
    t = t.replace(EMAIL_RE, m => (allow.has(normEmail(m)) ? m : (strict || hidden.has(normEmail(m))) ? HIDDEN : m));
    t = t.replace(PHONE_RE, m => { const d = normPhone(m); return allow.has(d) ? m : (strict || hidden.has(d)) ? HIDDEN : m; });
    if (strict) t = t.replace(KAKAO_RE, '[링크 비공개]');
    for (const [a, b] of pairs) if (t.includes(a)) t = t.split(a).join(b);
    return t;
  }
  // 글쓴이가 가려야 하는 사람이면 그 사람이 쓴 연락처는 모두 가립니다.
  mask.authorHidden = (type, memberId) => (type === 'partner' && hiddenMembers.has(memberId)) || (type === 'landlord' && hiddenLandlord);
  return mask;
}

/* 보는 사람 기준 참여자 표시 이름 */
export function memberLabel(ctx, m) {
  if (!m) return '파트너';
  if (ctx.role === 'admin') return `${m.name}${m.company ? ' · ' + m.company : ''}`;
  if (ctx.role === 'partner') {
    if (m.id === ctx.member.id) return '나';
    if (ctx.perms.has('team')) return `${m.name}${m.company ? ' · ' + m.company : ''}`;
  }
  return aliasOf(m);
}
export function landlordLabel(ctx) {
  const l = ctx.landlord;
  if (ctx.role === 'landlord') return '나';
  if (!l) return '임대인';
  if (ctx.role === 'admin' || ctx.perms.has('owner')) return `임대인 ${l.name}`;
  return '임대인';
}
export function ownerLabel(ctx, owner) {
  if (!owner || owner === 'gb') return '공백';
  if (owner === 'l') return ctx.role === 'landlord' ? '임대인(나)' : landlordLabel(ctx);
  const m = ctx.members.find(x => 'm:' + x.id === owner);
  return memberLabel(ctx, m);
}
function authorLabel(ctx, p) {
  if (p.author_type === 'admin') return ctx.role === 'landlord' ? '공백' : '공백';
  if (p.author_type === 'landlord') return landlordLabel(ctx);
  return memberLabel(ctx, ctx.members.find(m => m.id === p.member_id));
}

/* ---------------- 보이는 범위 ---------------- */
export function canSeePost(ctx, p) {
  if (ctx.role === 'admin') return true;
  if (ctx.role === 'partner') {
    const me = ctx.member.id;
    if (p.author_type === 'partner' && p.member_id === me) return true;
    if (p.audience === 'team' || p.audience === 'all') return true;
    return p.audience === 'direct' && p.direct_to === 'm:' + me;
  }
  if (p.author_type === 'landlord') return true;
  if (p.audience === 'all') return p.status === 'published';
  return p.audience === 'direct' && p.direct_to === 'l';
}
export function canSeeFile(ctx, f) {
  if (ctx.role === 'admin') return true;
  if (ctx.role === 'partner') {
    if (f.uploader_type === 'partner' && f.member_id === ctx.member.id) return true;
    if (!ctx.perms.has('files')) return false;
    return f.audience === 'team' || f.audience === 'all';
  }
  if (f.uploader_type === 'landlord') return true;
  return f.audience === 'all' && f.status === 'published';
}
export function canSeeTask(ctx, t) {
  if (ctx.role === 'admin') return true;
  if (ctx.role === 'partner') return t.visibility !== 'internal' || t.owner === 'm:' + ctx.member.id;
  return t.visibility === 'all' || t.owner === 'l';
}

/* ---------------- 프로젝트 화면 데이터 (역할별로 거른 결과) ---------------- */
const PROJECT_PUBLIC = ['id', 'code', 'title', 'stage', 'kinds', 'priority', 'address', 'building_name', 'building_use', 'scale', 'land_area', 'gross_area',
  'built_year', 'vacancy', 'request', 'goal', 'next_action', 'start_date', 'due_date', 'created_at', 'updated_at'];

export async function projectPayload(ctx) {
  const { DB, project, role, perms, members } = ctx;
  const mask = makeMasker(ctx);
  const pid = project.id;
  const [postsR, tasksR, filesR, unitsR, moneyR, logR] = await DB.batch([
    DB.prepare(`SELECT * FROM project_posts WHERE project_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 400`).bind(pid),
    DB.prepare(`SELECT * FROM project_tasks WHERE project_id = ?1 ORDER BY sort, id`).bind(pid),
    DB.prepare(`SELECT id, task_id, name, mime, size, category, audience, status, uploader_type, uploader_user_id, member_id, note, created_at FROM project_files WHERE project_id = ?1 ORDER BY id DESC`).bind(pid),
    DB.prepare(`SELECT * FROM project_units WHERE project_id = ?1 ORDER BY sort, id`).bind(pid),
    DB.prepare(`SELECT * FROM project_money WHERE project_id = ?1 ORDER BY direction, id`).bind(pid),
    DB.prepare(`SELECT * FROM project_log WHERE project_id = ?1 ORDER BY id DESC LIMIT 200`).bind(pid),
  ]);

  // 프로젝트 기본 정보
  const pj = {};
  for (const k of PROJECT_PUBLIC) pj[k] = project[k];
  pj.title = mask(pj.title); pj.request = mask(pj.request); pj.goal = mask(pj.goal); pj.vacancy = mask(pj.vacancy); pj.next_action = mask(pj.next_action);
  if (perms.has('finance')) pj.finance = mask(project.finance);
  if (role === 'admin') { pj.internal_memo = project.internal_memo; pj.landlord_access = !!project.landlord_access; pj.inquiry_id = project.inquiry_id; pj.landlord_id = project.landlord_id; pj.created_by = project.created_by; }

  // 임대인
  let landlord = null;
  if (ctx.landlord) {
    const l = ctx.landlord;
    if (role === 'admin') landlord = { id: l.id, name: l.name, kind: l.kind, company: l.company, phone: l.phone, email: l.email, linked: !!l.user_id, portal: !!l.portal, invited_at: l.invited_at };
    else if (role === 'partner' && perms.has('owner')) landlord = { name: l.name, company: l.company, phone: l.phone, email: l.email };
    else if (role === 'landlord') landlord = { name: l.name };
  }

  // 참여자
  const active = members.filter(m => m.status === 'active');
  let outMembers;
  if (role === 'admin') {
    outMembers = members.map(m => ({ id: m.id, partner_id: m.partner_id, name: m.name, company: m.company, title: m.title, phone: m.phone, email: m.email,
      role: m.role, alias: aliasOf(m), perms: splitPerms(m.perms), status: m.status, linked: !!m.user_id, partner_status: m.pstatus,
      fee_rate: m.fee_rate, fee_base: m.fee_base, success_fee: m.success_fee, consulting_fee: m.consulting_fee, fee_note: m.fee_note }));
  } else {
    outMembers = active.map(m => {
      const me = role === 'partner' && m.id === ctx.member.id;
      const o = { id: m.id, role: m.role, alias: aliasOf(m), label: memberLabel(ctx, m), me };
      if (role === 'partner' && (me || perms.has('team'))) { o.name = m.name; o.company = m.company; o.title = m.title; }
      if (role === 'landlord') delete o.id; // 임대인 화면에는 내부 번호도 내보내지 않음
      return o;
    });
  }

  // 소통
  const all = postsR.results || [];
  const visible = all.filter(p => canSeePost(ctx, p));
  const visIds = new Set(visible.map(p => p.id));
  const seeName = id => { const m = members.find(x => 'm:' + x.id === id); return m ? memberLabel(ctx, m) : ''; };
  const posts = visible.filter(p => !p.parent_id || visIds.has(p.parent_id)).map(p => {
    const own = (p.author_type === 'admin' && role === 'admin') || (p.author_type === 'partner' && role === 'partner' && p.member_id === ctx.member.id) || (p.author_type === 'landlord' && role === 'landlord');
    const strict = mask.authorHidden(p.author_type, p.member_id);
    const o = { id: p.id, parent_id: p.parent_id, kind: p.kind, audience: p.audience, status: p.status, body: mask(p.body, { own, strict }),
      author: authorLabel(ctx, p), author_type: p.author_type, own, task_id: p.task_id, created_at: p.created_at };
    if (p.audience === 'direct') o.direct_label = p.direct_to === 'l' ? (role === 'landlord' ? '공백과 1:1' : '공백 ↔ ' + landlordLabel(ctx)) : (role === 'partner' ? '공백과 1:1' : '공백 ↔ ' + seeName(p.direct_to));
    if (role === 'admin') { o.member_id = p.member_id; o.direct_to = p.direct_to; o.approved_at = p.approved_at; }
    // 임대인은 승인 상태·내부 구분을 알 필요가 없습니다
    if (role === 'landlord') { delete o.status; delete o.author_type; }
    return o;
  });

  // 추진사항
  const tasks = (tasksR.results || []).filter(t => canSeeTask(ctx, t)).map(t => {
    const o = { id: t.id, kind: t.kind, phase: t.phase, title: mask(t.title), detail: mask(t.detail), owner: t.owner, owner_label: ownerLabel(ctx, t.owner),
      due_date: t.due_date, status: t.status, visibility: t.visibility, done_at: t.done_at, mine: (role === 'partner' && t.owner === 'm:' + ctx.member.id) || (role === 'landlord' && t.owner === 'l') };
    if (role === 'landlord') { delete o.visibility; if (o.owner !== 'l' && o.owner !== 'gb') o.owner = 'p'; }
    return o;
  });

  // 자료
  const files = (filesR.results || []).filter(f => canSeeFile(ctx, f)).map(f => {
    const own = (f.uploader_type === 'admin' && role === 'admin') || (f.uploader_type === 'partner' && role === 'partner' && f.member_id === ctx.member.id) || (f.uploader_type === 'landlord' && role === 'landlord');
    const by = f.uploader_type === 'admin' ? '공백' : f.uploader_type === 'landlord' ? landlordLabel(ctx) : memberLabel(ctx, members.find(m => m.id === f.member_id));
    const o = { id: f.id, task_id: f.task_id, name: mask(f.name, { strict: mask.authorHidden(f.uploader_type, f.member_id) }), mime: f.mime, size: f.size, category: f.category,
      audience: f.audience, status: f.status, by, own, note: mask(f.note, { own }), created_at: f.created_at };
    if (role === 'landlord') { delete o.status; delete o.audience; }
    return o;
  });

  // 임대 현황
  const units = perms.has('leases') ? (unitsR.results || []).map(u => ({ id: u.id, floor: u.floor, unit: u.unit, area: u.area, use: u.use, tenant: role === 'admin' || role === 'landlord' || perms.has('owner') ? u.tenant : mask(u.tenant),
    status: u.status, deposit: u.deposit, rent: u.rent, mgmt: u.mgmt, lease_end: u.lease_end, note: role === 'landlord' ? '' : mask(u.note), sort: u.sort })) : null;

  // 정산
  let money = null, terms = null;
  if (role === 'admin') money = moneyR.results || [];
  if (role === 'partner') {
    const m = ctx.member;
    terms = { role: m.role, alias: aliasOf(m), fee_rate: m.fee_rate, fee_base: m.fee_base, success_fee: m.success_fee, consulting_fee: m.consulting_fee, fee_note: m.fee_note, perms: splitPerms(m.perms) };
    money = (moneyR.results || []).filter(x => x.direction === 'out' && x.member_id === m.id && x.status !== 'cancel')
      .map(x => ({ id: x.id, label: x.label, amount: x.amount, status: x.status, due_date: x.due_date, done_date: x.done_date }));
  }

  const today = todayKst();
  const visTasks = tasks;
  const stats = {
    tasks_total: visTasks.length, tasks_done: visTasks.filter(t => t.status === 'done').length,
    overdue: visTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < today).length,
  };
  if (role === 'admin') {
    stats.pending_posts = all.filter(p => p.status === 'pending').length;
    stats.pending_files = (filesR.results || []).filter(f => f.status === 'pending').length;
  }

  const viewer = { role, preview: ctx.preview, perms: [...perms], name: ctx.user.name };
  if (role === 'partner') { viewer.member_id = ctx.member.id; viewer.alias = aliasOf(ctx.member); }

  return {
    viewer, project: pj, landlord, members: outMembers, posts, tasks, files, units, money, terms, stats,
    log: role === 'admin' ? (logR.results || []) : null,
  };
}

export async function markSeen(ctx) {
  if (ctx.preview) return;
  await ctx.DB.prepare(`INSERT INTO project_seen (user_id, project_id, seen_at) VALUES (?1,?2,?3)
    ON CONFLICT (user_id, project_id) DO UPDATE SET seen_at = excluded.seen_at`).bind(ctx.user.id, ctx.project.id, nowIso()).run();
}

/* ---------------- 알림 메일 ---------------- */
export function adminInbox(env) {
  return String(env.CONTACT_TO || DEFAULTS.to).split(',').map(s => s.trim()).filter(Boolean)[0];
}
const btn = (href, label) => `<p style="margin:22px 0"><a href="${href}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`;
const excerpt = (t, n = 220) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };

// 받는 사람 한 명에 대한 '보는 사람 문맥'(마스킹용)
export function recipientCtx(ctx, who) {
  if (who === 'admin') return { ...ctx, role: 'admin', member: null, perms: new Set(['building', ...PERMS]) };
  if (who === 'landlord') return { ...ctx, role: 'landlord', member: null, perms: new Set(['building', 'leases', 'finance', 'files', 'upload']) };
  return { ...ctx, role: 'partner', member: who, perms: new Set(['building', ...splitPerms(who.perms)]) };
}

// 프로젝트 소식 메일. targets: ['admin' | 'landlord' | 참여자 객체]
export async function notify(ctx, request, targets, { subject, lead, body, authorType, memberId, button = '임대인센터에서 보기' }) {
  const env = ctx.env;
  if (!mailConfigured(env) || !targets.length) return 0;
  const origin = siteOrigin(env, request);
  const mails = []; const seen = new Set();
  for (const t of targets) {
    let to, name, link, rctx;
    if (t === 'admin') { to = adminInbox(env); name = '관리자'; link = `${origin}/admin#/project/${ctx.project.id}`; rctx = recipientCtx(ctx, 'admin'); }
    else if (t === 'landlord') {
      if (!ctx.landlord || !ctx.landlord.email || !ctx.project.landlord_access) continue;
      to = ctx.landlord.email; name = ctx.landlord.name; link = ctx.landlord.user_id ? `${origin}/center#/p/${ctx.project.id}` : `${origin}/signup?email=${encodeURIComponent(ctx.landlord.email)}&next=${encodeURIComponent('/center')}`;
      rctx = recipientCtx(ctx, 'landlord');
    } else {
      if (!t.email || t.status !== 'active' || t.pstatus === 'paused') continue;
      to = t.email; name = t.name; link = t.user_id ? `${origin}/center#/p/${ctx.project.id}` : `${origin}/signup?email=${encodeURIComponent(t.email)}&next=${encodeURIComponent('/center')}`;
      rctx = recipientCtx(ctx, t);
    }
    if (!to || seen.has(normEmail(to))) continue; seen.add(normEmail(to));
    const mask = makeMasker(rctx);
    const strict = authorType ? mask.authorHidden(authorType, memberId) : false;
    const title = mask(ctx.project.title);
    const text = body ? mask(excerpt(body), { strict }) : '';
    const leadText = mask(typeof lead === 'function' ? lead(rctx) : (lead || ''));
    const html = mailLayout(subject, `<p>${esc(name)}님, 공백입니다.</p><p><b>${esc(title)}</b></p>${leadText ? `<p>${esc(leadText)}</p>` : ''}${text ? `<div style="background:#f4f5f3;border-radius:6px;padding:14px 16px;white-space:pre-wrap">${esc(text)}</div>` : ''}
      ${btn(link, button)}<p style="color:#7a8087;font-size:13px">임대인센터의 정보는 프로젝트 진행 목적으로만 사용해 주세요.${(t !== 'admin' && !(t === 'landlord' ? ctx.landlord.user_id : t.user_id)) ? ' 처음 이용하시면 이 이메일 주소로 회원가입하고 이메일 인증을 마치면 바로 연결됩니다.' : ''}</p>`);
    mails.push({ to, subject: `[공백] ${subject} — ${title}`, html, text: `${name}님, 공백입니다.\n${title}\n${leadText}\n\n${text}\n\n${link}` });
  }
  if (!mails.length) return 0;
  const res = await sendMailBatch(env, mails);
  return res.filter(Boolean).length;
}

// 유형에 맞는 기본 추진사항·요청 자료 목록 (같은 이름은 한 번만)
export function templateRows(kinds, hasLandlord) {
  const rows = []; const seen = new Set();
  const ks = String(kinds || '').split(',').filter(k => TEMPLATES[k]);
  for (const k of ks) for (const [phase, title] of TEMPLATES[k].tasks) if (!seen.has(title)) { seen.add(title); rows.push({ kind: 'task', phase, title, owner: 'gb', visibility: 'all' }); }
  if (hasLandlord) for (const k of ks) for (const d of TEMPLATES[k].docs) if (!seen.has(d)) { seen.add(d); rows.push({ kind: 'doc', phase: '진단', title: d, owner: 'l', visibility: 'all' }); }
  return rows;
}
export async function insertTasks(DB, projectId, rows, startSort = 0) {
  if (!rows.length) return;
  const now = nowIso();
  await DB.batch(rows.map((r, i) => DB.prepare(`INSERT INTO project_tasks (project_id, kind, phase, title, detail, owner, due_date, status, visibility, sort, created_at, updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,'todo',?8,?9,?10,?10)`).bind(projectId, r.kind || 'task', r.phase || null, clip(r.title, 200), r.detail || null, r.owner || 'gb', r.due_date || null, r.visibility || 'team', startSort + i, now)));
}

export async function nextCode(DB) {
  const ym = new Date(Date.now() + 9 * 36e5).toISOString().slice(2, 7).replace('-', '');
  const r = await DB.prepare(`SELECT COUNT(*) n FROM projects WHERE code LIKE ?1`).bind(`GB-${ym}-%`).first();
  return `GB-${ym}-${String((r ? r.n : 0) + 1).padStart(2, '0')}`;
}

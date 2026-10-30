/**
 * 공백 홈페이지 서버 공통 모듈 (Cloudflare Pages Functions에서 import)
 * - D1 테이블 자동 생성
 * - 비밀번호 해시(PBKDF2-SHA256), 세션 쿠키
 * - 이메일 발송(Resend)
 */

export const SESSION_COOKIE = 'gb_session';
export const LOGIN_HINT_COOKIE = 'gb_li'; // 화면 표시용(로그인 여부 힌트). 인증에는 쓰지 않음
const SESSION_DAYS = 30;
const PBKDF2_ITER = 100000;

/* ---------------- 응답 도우미 ---------------- */
export function json(data, status = 200, headers = {}) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) v.forEach(x => h.append(k, x)); else h.set(k, v);
  }
  return new Response(JSON.stringify(data), { status, headers: h });
}
export const fail = (error, status = 400, extra = {}) => json({ ok: false, error, ...extra }, status);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const clip = (s, n = 300) => String(s ?? '').trim().slice(0, n);
export const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
export const normEmail = s => String(s || '').trim().toLowerCase();
export const nowIso = () => new Date().toISOString();

/* 같은 사이트에서 온 JSON 요청만 허용 (CSRF 방지) */
export async function readJson(request) {
  const origin = request.headers.get('Origin');
  if (origin) {
    const host = new URL(request.url).host;
    if (new URL(origin).host !== host) throw new HttpError('bad_origin', 403);
  }
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new HttpError('bad_content_type', 415);
  try { return await request.json(); } catch { throw new HttpError('bad_request', 400); }
}

/* multipart 등 JSON이 아닌 요청의 출처 확인 */
export function checkOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError('bad_origin', 403);
}

export class HttpError extends Error {
  constructor(code, status = 400, extra = {}) { super(code); this.code = code; this.status = status; this.extra = extra; }
}
export function handle(fn) {
  return async (ctx) => {
    try { return await fn(ctx); }
    catch (e) {
      if (e instanceof HttpError) return fail(e.code, e.status, e.extra);
      console.error(e);
      return fail('server_error', 500);
    }
  };
}

/* ---------------- 데이터베이스 ---------------- */
let schemaReady = false;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT,
    company TEXT,
    marketing INTEGER DEFAULT 0,
    email_verified INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    failed_logins INTEGER DEFAULT 0,
    locked_until TEXT,
    terms_agreed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS user_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    user_id INTEGER,
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    type TEXT NOT NULL,
    address TEXT NOT NULL,
    floor_area TEXT,
    status TEXT,
    conditions TEXT,
    message TEXT NOT NULL,
    marketing INTEGER DEFAULT 0,
    source TEXT,
    page TEXT,
    ip TEXT,
    user_agent TEXT,
    handled INTEGER DEFAULT 0,
    admin_memo TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries (created_at)`,
  `CREATE TABLE IF NOT EXISTS inquiry_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inquiry_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT,
    kind TEXT NOT NULL,
    body TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notes_inquiry ON inquiry_notes (inquiry_id)`,
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    created_by TEXT,
    kind TEXT NOT NULL DEFAULT 'report',
    title TEXT NOT NULL,
    body TEXT,
    link_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size INTEGER,
    chunks INTEGER DEFAULT 0,
    is_ad INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS file_chunks (
    document_id INTEGER NOT NULL,
    idx INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (document_id, idx)
  )`,
  `CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    user_id INTEGER,
    inquiry_id INTEGER,
    email TEXT NOT NULL,
    name TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    sent_at TEXT NOT NULL,
    mail_ok INTEGER DEFAULT 0,
    opened_at TEXT,
    open_count INTEGER DEFAULT 0,
    downloaded_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_deliv_doc ON deliveries (document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deliv_user ON deliveries (user_id)`,
  `CREATE TABLE IF NOT EXISTS unsubscribes (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
];
// 이전 버전 inquiries 테이블에 없던 컬럼 추가 (이미 있으면 무시)
const MIGRATIONS = [
  `ALTER TABLE inquiries ADD COLUMN user_id INTEGER`,
  `ALTER TABLE inquiries ADD COLUMN admin_memo TEXT`,
  `ALTER TABLE inquiries ADD COLUMN stage TEXT DEFAULT 'new'`,
  `ALTER TABLE inquiries ADD COLUMN updated_at TEXT`,
];

export function hasDb(env) { return !!(env && env.DB && typeof env.DB.prepare === 'function'); }

export async function db(env) {
  if (!hasDb(env)) throw new HttpError('db_not_configured', 503);
  if (!schemaReady) {
    for (const sql of SCHEMA) await env.DB.prepare(sql).run();
    for (const sql of MIGRATIONS) { try { await env.DB.prepare(sql).run(); } catch (_) { /* 이미 존재 */ } }
    try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_inquiries_user ON inquiries (user_id)`).run(); } catch (_) {}
    try { await env.DB.prepare(`UPDATE inquiries SET stage = CASE WHEN handled = 1 THEN 'replied' ELSE 'new' END WHERE stage IS NULL`).run(); } catch (_) {}
    schemaReady = true;
  }
  return env.DB;
}

/* ---------------- 암호화 도우미 ---------------- */
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a); return b64u(a);
}
export async function sha256(s) {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
async function pbkdf2(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}
export async function hashPassword(password) {
  const salt = new Uint8Array(16); crypto.getRandomValues(salt);
  const bits = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2$${PBKDF2_ITER}$${b64u(salt)}$${b64u(bits)}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [alg, iter, salt, hash] = String(stored).split('$');
    if (alg !== 'pbkdf2') return false;
    const bits = b64u(await pbkdf2(password, fromB64u(salt), parseInt(iter, 10)));
    if (bits.length !== hash.length) return false;
    let diff = 0; for (let i = 0; i < bits.length; i++) diff |= bits.charCodeAt(i) ^ hash.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}
export function passwordProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다.';
  if (pw.length > 128) return '비밀번호가 너무 깁니다.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '영문과 숫자를 함께 사용해 주세요.';
  return null;
}

/* ---------------- 쿠키·세션 ---------------- */
export function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
function cookie(name, value, { maxAge, httpOnly = true, secure = true } = {}) {
  let s = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
  if (secure) s += '; Secure';
  if (httpOnly) s += '; HttpOnly';
  if (maxAge !== undefined) s += `; Max-Age=${maxAge}`;
  return s;
}
const isLocal = request => { const h = new URL(request.url).hostname; return h === 'localhost' || h === '127.0.0.1'; };

export async function createSession(env, request, userId) {
  const DB = await db(env);
  const token = randomToken(32);
  const now = new Date();
  const exp = new Date(now.getTime() + SESSION_DAYS * 864e5);
  await DB.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?1,?2,?3,?4,?5,?6)`)
    .bind(await sha256(token), userId, now.toISOString(), exp.toISOString(),
      request.headers.get('CF-Connecting-IP') || '', clip(request.headers.get('User-Agent'), 200)).run();
  // 오래된 세션 정리
  await DB.prepare(`DELETE FROM sessions WHERE expires_at < ?1`).bind(now.toISOString()).run();
  const secure = !isLocal(request);
  const maxAge = SESSION_DAYS * 86400;
  return [cookie(SESSION_COOKIE, token, { maxAge, secure }), cookie(LOGIN_HINT_COOKIE, '1', { maxAge, httpOnly: false, secure })];
}
export function clearSessionCookies(request) {
  const secure = !isLocal(request);
  return [cookie(SESSION_COOKIE, '', { maxAge: 0, secure }), cookie(LOGIN_HINT_COOKIE, '', { maxAge: 0, httpOnly: false, secure })];
}
export async function destroySession(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token && hasDb(env)) {
    const DB = await db(env);
    await DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256(token)).run();
  }
}

export async function currentUser(env, request) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || !hasDb(env)) return null;
  const DB = await db(env);
  const row = await DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  ).bind(await sha256(token), nowIso()).first();
  return row || null;
}
export async function requireUser(env, request) {
  const u = await currentUser(env, request);
  if (!u) throw new HttpError('unauthorized', 401);
  return u;
}
export function isAdmin(env, user) {
  if (!user) return false;
  if (user.is_admin) return true;
  // 관리자 이메일이라도 '이메일 인증'을 마친 계정만 관리자 권한을 가집니다 (다른 사람이 먼저 가입해 권한을 가져가는 것 방지)
  const list = String(env.ADMIN_EMAILS || '').split(',').map(normEmail).filter(Boolean);
  return !!user.email_verified && list.includes(normEmail(user.email));
}
export async function requireAdmin(env, request) {
  const u = await requireUser(env, request);
  if (!isAdmin(env, u)) throw new HttpError('forbidden', 403);
  return u;
}
export function publicUser(env, u) {
  return {
    id: u.id, email: u.email, name: u.name, phone: u.phone || '', role: u.role || '', company: u.company || '',
    marketing: !!u.marketing, email_verified: !!u.email_verified, created_at: u.created_at,
    is_admin: isAdmin(env, u),
  };
}

/* ---------------- 일회용 토큰 (이메일 인증·비밀번호 재설정) ---------------- */
export async function issueUserToken(env, userId, purpose, hours) {
  const DB = await db(env);
  const token = randomToken(32);
  const now = new Date();
  await DB.prepare(`DELETE FROM user_tokens WHERE user_id = ?1 AND purpose = ?2 AND used_at IS NULL`).bind(userId, purpose).run();
  await DB.prepare(`INSERT INTO user_tokens (token_hash, user_id, purpose, created_at, expires_at) VALUES (?1,?2,?3,?4,?5)`)
    .bind(await sha256(token), userId, purpose, now.toISOString(), new Date(now.getTime() + hours * 36e5).toISOString()).run();
  return token;
}
export async function consumeUserToken(env, token, purpose) {
  const DB = await db(env);
  const h = await sha256(String(token || ''));
  const row = await DB.prepare(`SELECT * FROM user_tokens WHERE token_hash = ?1 AND purpose = ?2`).bind(h, purpose).first();
  if (!row || row.used_at || row.expires_at < nowIso()) return null;
  await DB.prepare(`UPDATE user_tokens SET used_at = ?1 WHERE token_hash = ?2`).bind(nowIso(), h).run();
  return row.user_id;
}

/* ---------------- 이메일 (Resend) ----------------
 * RESEND_API_BASE 는 로컬 테스트용(메일 내용 확인)입니다. 운영에서는 설정하지 않습니다. */
export function mailConfigured(env) { return !!env.RESEND_API_KEY; }
export async function sendMail(env, { to, subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.CONTACT_FROM || '공백 <onboarding@resend.dev>';
  try {
    const r = await fetch(`${env.RESEND_API_BASE || 'https://api.resend.com'}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.error('resend', r.status, await r.text());
    return r.ok;
  } catch (e) { console.error(e); return false; }
}
export function mailLayout(title, bodyHtml) {
  return `<div style="font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;font-size:15px;line-height:1.7;color:#141619;max-width:560px">
  <div style="border-top:4px solid #e5501c;padding-top:18px;font-weight:800;letter-spacing:.02em">GONG BAEK <span style="color:#7a8087;font-weight:600">공백</span></div>
  <h2 style="margin:18px 0 10px;font-size:20px">${esc(title)}</h2>${bodyHtml}
  <p style="margin-top:28px;color:#7a8087;font-size:12px">주식회사 블랭크 · 공실개발 솔루션 공백 · vacancy.co.kr</p></div>`;
}
export function siteOrigin(env, request) {
  return (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

export const LABEL = {
  role: { owner: '임대인·건물주', seller: '매각 예정 소유주·투자자', broker: '중개법인·공인중개사', developer: '시행사·디벨로퍼', operator: '운영사·브랜드', other: '기타' },
  type: { develop: '공실개발 검토', valueup: '매각 전 밸류업', partner: '파트너 제안', tenant: '입점·운영 파트너 등록', other: '기타' },
};


/* ---------------- 문의 진행 단계 ---------------- */
export const STAGES = [
  { id: 'new', label: '신규', user: '접수' },
  { id: 'review', label: '검토 중', user: '검토 중' },
  { id: 'replied', label: '1차 회신', user: '회신 완료' },
  { id: 'site', label: '현장진단', user: '현장진단 진행' },
  { id: 'proposal', label: '제안', user: '제안 진행' },
  { id: 'contract', label: '계약', user: '계약' },
  { id: 'hold', label: '보류', user: '보류' },
  { id: 'closed', label: '종료', user: '종료' },
];
export const STAGE_IDS = STAGES.map(s => s.id);
export const stageLabel = id => (STAGES.find(s => s.id === id) || STAGES[0]).label;
export const isOpenStage = id => id === 'new' || id === 'review' || !id;

export async function addNote(env, inquiryId, kind, body, author) {
  const DB = await db(env);
  await DB.prepare(`INSERT INTO inquiry_notes (inquiry_id, created_at, author, kind, body) VALUES (?1,?2,?3,?4,?5)`)
    .bind(inquiryId, nowIso(), author || null, kind, clip(body, 8000)).run();
}

/* 본문 텍스트 → 메일 HTML (줄바꿈 유지, 링크 자동) */
export function textToHtml(t) {
  return esc(t).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0b2138">$1</a>')}</p>`).join('');
}

/* 여러 통 발송 (Resend batch: 1회 100통). 결과: 각 메일 성공 여부 배열 */
export async function sendMailBatch(env, mails) {
  if (!env.RESEND_API_KEY || !mails.length) return mails.map(() => false);
  const from = env.CONTACT_FROM || '공백 <onboarding@resend.dev>';
  const out = [];
  for (let i = 0; i < mails.length; i += 100) {
    const part = mails.slice(i, i + 100).map(m => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) }));
    let ok = false;
    try {
      const r = await fetch(`${env.RESEND_API_BASE || 'https://api.resend.com'}/emails/batch`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(part),
      });
      ok = r.ok; if (!ok) console.error('resend batch', r.status, await r.text());
    } catch (e) { console.error(e); }
    part.forEach(() => out.push(ok));
  }
  return out;
}

/* 파일을 D1에 나눠 저장 (R2 없이). base64 텍스트, 조각당 약 700KB */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CHUNK = 700 * 1024;
function bytesToB64(u8) {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}
const CHUNK_STORES = { doc: ['file_chunks', 'document_id'], pfile: ['pfile_chunks', 'file_id'] };
export async function saveFile(env, documentId, buffer, store = 'doc') {
  const DB = await db(env);
  const [table, col] = CHUNK_STORES[store];
  const u8 = new Uint8Array(buffer); let n = 0;
  for (let off = 0; off < u8.length; off += CHUNK, n++) {
    await DB.prepare(`INSERT INTO ${table} (${col}, idx, data) VALUES (?1,?2,?3)`).bind(documentId, n, bytesToB64(u8.subarray(off, off + CHUNK))).run();
  }
  return n;
}
export async function deleteFileChunks(env, id, store = 'doc') {
  const DB = await db(env);
  const [table, col] = CHUNK_STORES[store];
  await DB.prepare(`DELETE FROM ${table} WHERE ${col} = ?1`).bind(id).run();
}
export async function fileResponse(env, doc, inline = false, store = 'doc') {
  const DB = await db(env);
  const [table, col] = CHUNK_STORES[store];
  const { results = [] } = await DB.prepare(`SELECT data FROM ${table} WHERE ${col} = ?1 ORDER BY idx`).bind(doc.id).all();
  const parts = results.map(r => b64ToBytes(r.data));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  const name = doc.file_name || 'file';
  return new Response(out, { headers: {
    'Content-Type': doc.file_type || 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
export const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';

/* ISO(UTC) → 한국시간 'YYYY-MM-DD HH:MM' (엑셀 내려받기용) */
export const kstStr = iso => { if (!iso) return ''; const d = new Date(new Date(iso).getTime() + 9 * 36e5); return isNaN(d) ? String(iso) : d.toISOString().slice(0, 16).replace('T', ' '); };

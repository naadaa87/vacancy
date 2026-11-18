/**
 * 공백 홈페이지 방문 통계 (자체 집계)
 * - 이름·연락처·IP 주소를 저장하지 않습니다. 브라우저에 저장한 임의 번호(vid·sid)로 방문만 구분합니다.
 * - 관리자 계정의 방문, 검색엔진 수집 프로그램, 미리보기 주소(*.pages.dev)는 집계하지 않습니다.
 * - 보관 기간: 13개월 (KPI 화면을 열 때 지난 기록을 정리)
 */
import { db, hasDb, getCookie, currentUser, isAdmin, SESSION_COOKIE } from './server.js';

export const KEEP_DAYS = 395;

const AN_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS an_pv (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    vid TEXT NOT NULL,
    sid TEXT NOT NULL,
    path TEXT NOT NULL,
    title TEXT,
    ref TEXT,
    kw TEXT,
    ch TEXT,
    utm_source TEXT, utm_medium TEXT, utm_campaign TEXT,
    device TEXT, os TEXT, browser TEXT, country TEXT,
    is_new INTEGER DEFAULT 0,
    entry INTEGER DEFAULT 0,
    member INTEGER DEFAULT 0,
    dwell INTEGER DEFAULT 0,
    scroll INTEGER DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_an_pv_day ON an_pv (day)`,
  `CREATE INDEX IF NOT EXISTS idx_an_pv_ts ON an_pv (ts)`,
  `CREATE INDEX IF NOT EXISTS idx_an_pv_sid ON an_pv (sid)`,
  `CREATE TABLE IF NOT EXISTS an_ev (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    vid TEXT, sid TEXT, path TEXT,
    type TEXT NOT NULL,
    kind TEXT, label TEXT, target TEXT, area TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_an_ev_day ON an_ev (day, type)`,
];
let ready = false;
export async function adb(env) {
  const DB = await db(env);
  if (!ready) { await DB.batch(AN_SCHEMA.map(s => DB.prepare(s))); ready = true; }
  return DB;
}

/* 한국시간 날짜 */
export const kstDay = ms => new Date(ms + 9 * 36e5).toISOString().slice(0, 10);
/* 한국시간 날짜 'YYYY-MM-DD'의 0시 → UTC ISO (가입일·문의일 비교용) */
export const kstStartIso = d => new Date(Date.parse(d + 'T00:00:00+09:00')).toISOString();
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/* 수집 프로그램(검색엔진·미리보기 등) — 카카오톡·네이버 앱 안의 브라우저는 실제 방문자이므로 제외하지 않음 */
export const BOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|yeti\/|daumoa|kakaotalk-scrap|facebookexternalhit|preview|python|curl|wget|httpclient|java\//i;

/* 집계 대상 주소: 운영 도메인, SITE_URL, 로컬 테스트 */
export function trackableHost(request, env) {
  const h = new URL(request.url).hostname;
  if (h === 'vacancy.co.kr' || h.endsWith('.vacancy.co.kr') || h === 'localhost' || h === '127.0.0.1') return true;
  try { return !!env.SITE_URL && new URL(env.SITE_URL).hostname === h; } catch { return false; }
}

/* 로그인 상태: -1 관리자(집계 제외), 1 회원, 0 비회원 */
export async function viewerKind(env, request) {
  if (!getCookie(request, SESSION_COOKIE) || !hasDb(env)) return 0;
  try { const u = await currentUser(env, request); return !u ? 0 : isAdmin(env, u) ? -1 : 1; } catch { return 0; }
}

const cut = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
export const okId = s => /^[A-Za-z0-9_-]{8,40}$/.test(String(s || ''));

/* 주소 정리: 쿼리·해시 제거, .html·끝의 / 제거 */
export function normPath(p) {
  let s = String(p || '').split(/[?#]/)[0];
  if (s.charAt(0) !== '/') return null;
  s = s.replace(/\/{2,}/g, '/').replace(/\.html$/i, '').replace(/\/index$/i, '/');
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s.slice(0, 200) || '/';
}

/* 유입 경로 분류 */
const SEARCH = /(^|\.)(google\.[a-z.]+|search\.naver\.com|naver\.com|search\.daum\.net|daum\.net|bing\.com|zum\.com|nate\.com|yahoo\.[a-z.]+|duckduckgo\.com|ecosia\.org|baidu\.com|yandex\.[a-z.]+)$/;
const MAP = /(^|\.)(map\.naver\.com|place\.naver\.com|map\.kakao\.com|maps\.google\.[a-z.]+)$/;
const BLOG = /(^|\.)(blog\.naver\.com|cafe\.naver\.com|post\.naver\.com|in\.naver\.com|tistory\.com|brunch\.co\.kr|velog\.io|medium\.com|cafe\.daum\.net)$/;
const SOCIAL = /(^|\.)(facebook\.com|instagram\.com|t\.co|twitter\.com|x\.com|threads\.net|linkedin\.com|lnkd\.in|youtube\.com|youtu\.be|kakao\.com|band\.us|pinterest\.[a-z.]+|tiktok\.com)$/;
export function channelOf(host, utmSource) {
  if (utmSource) return 'campaign';
  if (!host || host === '(내부)') return 'direct';
  if (MAP.test(host)) return 'map';
  if (BLOG.test(host)) return 'blog';
  if (SEARCH.test(host)) return 'search';
  if (SOCIAL.test(host)) return 'social';
  return 'referral';
}
export function refInfo(ref, selfHost) {
  if (!ref) return { host: '', kw: '' };
  try {
    const u = new URL(ref);
    if (!/^https?:$/.test(u.protocol)) return { host: '', kw: '' };
    const h = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
    if (h === String(selfHost || '').toLowerCase().replace(/^(www|m)\./, '')) return { host: '(내부)', kw: '' };
    // 검색어: 네이버(query), 다음·구글·빙(q) — 검색엔진이 주소에 남긴 경우에만
    const kw = SEARCH.test(h) ? cut(u.searchParams.get('query') || u.searchParams.get('q') || u.searchParams.get('n_query') || '', 60) : '';
    const path = h === 'google.com' && u.pathname.startsWith('/maps') ? 'maps.google.com' : h;
    return { host: path.slice(0, 80), kw };
  } catch { return { host: '', kw: '' }; }
}

const DEVICES = ['mobile', 'tablet', 'desktop'];
const OSES = ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'etc'];
const BROWSERS = ['KakaoTalk', 'NAVER', 'Instagram', 'Facebook', 'LINE', 'Daum', 'Whale', 'Samsung', 'Edge', 'Firefox', 'Chrome', 'Safari', 'etc'];
const CLICK_KINDS = ['tel', 'mail', 'kakao', 'out', 'file', 'cta', 'nav', 'button'];
const GOALS = ['contact_submit', 'assessment_start', 'assessment_done', 'signup'];
const pickOf = (v, list) => (list.includes(v) ? v : list[list.length - 1]);

/* 수집 요청 1건 처리. 반환값 없음 (항상 204 응답) */
export async function record(env, request, b) {
  const now = Date.now(), day = kstDay(now);
  const selfHost = new URL(request.url).hostname;
  const t = b && b.t;
  if (t === 'lv') {
    if (!okId(b.id)) return;
    const w = Math.max(0, Math.min(30 * 60 * 1000, Math.round(+b.w || 0)));
    const s = Math.max(0, Math.min(100, Math.round(+b.s || 0)));
    const DB = await adb(env);
    await DB.prepare(`UPDATE an_pv SET dwell = MAX(dwell, ?1), scroll = MAX(scroll, ?2) WHERE id = ?3 AND ts > ?4`).bind(w, s, b.id, now - 864e5).run();
    return;
  }
  if (t !== 'pv' && t !== 'ev') return;
  if (!okId(b.vid) || !okId(b.sid)) return;
  const path = normPath(b.p); if (!path) return;
  const who = await viewerKind(env, request);
  if (who < 0) return; // 관리자 방문은 집계하지 않음
  const DB = await adb(env);
  if (t === 'pv') {
    if (!okId(b.id)) return;
    const u = b.u || {};
    const utm = { s: cut(u.s, 60), m: cut(u.m, 60), c: cut(u.c, 80) };
    const r = refInfo(cut(b.r, 400), selfHost);
    const entry = b.e ? 1 : 0;
    const ch = entry ? channelOf(r.host, utm.s) : (r.host === '(내부)' ? 'internal' : channelOf(r.host, utm.s));
    const country = cut((request.cf && request.cf.country) || '', 4);
    await DB.prepare(`INSERT OR IGNORE INTO an_pv (id, ts, day, vid, sid, path, title, ref, kw, ch, utm_source, utm_medium, utm_campaign, device, os, browser, country, is_new, entry, member)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`)
      .bind(b.id, now, day, b.vid, b.sid, path, cut(b.ti, 120), r.host, r.kw, ch, utm.s, utm.m, utm.c,
        pickOf(b.d, DEVICES), pickOf(b.o, OSES), pickOf(b.b, BROWSERS), country, b.n ? 1 : 0, entry, who > 0 ? 1 : 0).run();
    return;
  }
  // 클릭·목표 이벤트
  const type = b.y === 'goal' ? 'goal' : 'click';
  const kind = type === 'goal' ? (GOALS.includes(b.k) ? b.k : null) : (CLICK_KINDS.includes(b.k) ? b.k : null);
  if (!kind) return;
  await DB.prepare(`INSERT INTO an_ev (ts, day, vid, sid, path, type, kind, label, target, area) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
    .bind(now, day, b.vid, b.sid, path, type, kind, cut(b.l, 80), cut(b.g, 200), cut(b.a, 20)).run();
}

// POST /api/track — 홈페이지 방문 통계 수집 (track.js가 보냄). 항상 204로 응답합니다.
import { hasDb } from '../../lib/server.js';
import { record, trackableHost, BOT } from '../../lib/analytics.js';

const NO_CONTENT = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  try {
    if (!hasDb(env) || !trackableHost(request, env)) return NO_CONTENT();
    // 같은 사이트에서 보낸 요청만
    const origin = request.headers.get('Origin');
    if (origin && new URL(origin).host !== new URL(request.url).host) return NO_CONTENT();
    const site = request.headers.get('Sec-Fetch-Site');
    if (site && site !== 'same-origin') return NO_CONTENT();
    const text = await request.text();
    if (!text || text.length > 4000) return NO_CONTENT();
    let body; try { body = JSON.parse(text); } catch { return NO_CONTENT(); }
    // 수집 프로그램 거르기. 페이지를 떠날 때 보내는 체류시간(lv)은 이미 기록된 페이지뷰만 고치므로 검사하지 않음
    // (일부 브라우저는 페이지를 닫는 순간의 요청에 다른 User-Agent를 붙입니다)
    if (!body || (body.t !== 'lv' && BOT.test(request.headers.get('User-Agent') || ''))) return NO_CONTENT();
    await record(env, request, body);
  } catch (e) { console.error('track', e); }
  return NO_CONTENT();
}
export const onRequestGet = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });

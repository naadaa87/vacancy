// GET|POST /api/unsubscribe?t=… — 광고성 메일 수신거부
import { db, sha256, nowIso, hasDb } from '../../lib/server.js';
async function run(request, env) {
  const t = new URL(request.url).searchParams.get('t');
  let ok = false;
  if (t && hasDb(env)) {
    const DB = await db(env);
    const del = await DB.prepare(`SELECT email, user_id FROM deliveries WHERE token_hash = ?1`).bind(await sha256(t)).first();
    if (del) {
      await DB.prepare(`INSERT OR IGNORE INTO unsubscribes (email, created_at) VALUES (?1, ?2)`).bind(del.email, nowIso()).run();
      await DB.prepare(`UPDATE users SET marketing = 0, updated_at = ?1 WHERE id = ?2 OR email = ?3`).bind(nowIso(), del.user_id || -1, del.email).run();
      await DB.prepare(`UPDATE inquiries SET marketing = 0 WHERE email = ?1`).bind(del.email).run();
      ok = true;
    }
  }
  return ok;
}
const page = (ok) => new Response(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>수신거부 — 공백</title><body style="font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:520px;margin:12vh auto;padding:0 20px;color:#141619;line-height:1.7">
<div style="border-top:4px solid #e5501c;padding-top:16px;font-weight:800">GONG BAEK <span style="color:#7a8087;font-weight:600">공백</span></div>
<h1 style="font-size:24px;margin:20px 0 10px">${ok ? '수신거부가 처리되었습니다.' : '링크를 확인할 수 없습니다.'}</h1>
<p style="color:#4a4f55">${ok ? '앞으로 공백의 광고성 안내 메일을 보내지 않습니다. 문의에 대한 회신과 요청하신 자료는 계속 받으실 수 있습니다. 다시 받으시려면 마이페이지에서 수신 동의를 켜 주세요.' : '링크가 잘못되었거나 만료되었습니다. 수신거부를 원하시면 spaceblank0100@gmail.com 으로 알려주세요.'}</p>
<p><a href="/" style="color:#0b2138">공백 홈페이지로 가기</a></p></body></html>`, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
export async function onRequestGet({ request, env }) { return page(await run(request, env)); }
export async function onRequestPost({ request, env }) { return page(await run(request, env)); }

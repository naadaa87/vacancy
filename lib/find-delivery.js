// 받은 사람 링크(t) 또는 회원 로그인(d=발송번호)으로 자료 찾기
import { HttpError, db, sha256, currentUser } from './server.js';
export async function findDelivery(env, request) {
  const url = new URL(request.url);
  const t = url.searchParams.get('t'), d = parseInt(url.searchParams.get('d'), 10);
  const DB = await db(env);
  let del = null;
  if (t) del = await DB.prepare(`SELECT * FROM deliveries WHERE token_hash = ?1`).bind(await sha256(t)).first();
  else if (d) {
    const u = await currentUser(env, request);
    if (!u) throw new HttpError('unauthorized', 401);
    del = await DB.prepare(`SELECT * FROM deliveries WHERE id = ?1 AND (user_id = ?2 OR email = ?3)`).bind(d, u.id, u.email).first();
  }
  if (!del) throw new HttpError('not_found', 404);
  const doc = await DB.prepare(`SELECT * FROM documents WHERE id = ?1`).bind(del.document_id).first();
  if (!doc) throw new HttpError('not_found', 404);
  return { DB, del, doc };
}

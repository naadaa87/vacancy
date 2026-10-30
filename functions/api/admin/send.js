/**
 * POST /api/admin/send (multipart/form-data) — 자료·안내 발송
 *  title, body, kind(report|notice|newsletter), link_url, is_ad('1'), file(선택, 10MB 이하)
 *  document_id(기존 자료 재발송 시)
 *  recipients: JSON
 *    {"mode":"users","ids":[1,2]} | {"mode":"inquiry","id":12} | {"mode":"segment","segment":"all|verified|marketing|owner|broker|..."}
 *    {"mode":"emails","list":["a@b.com"]}
 *  dry_run('1'): 받는 사람 수만 계산
 */
import { handle, json, HttpError, db, requireAdmin, clip, nowIso, isEmail, normEmail, randomToken, sha256, saveFile, MAX_FILE_BYTES,
  sendMailBatch, mailConfigured, mailLayout, textToHtml, siteOrigin, esc, addNote, fmtSize, LABEL } from '../../../lib/server.js';

const MAX_RECIPIENTS = 500;

async function resolveRecipients(DB, r, isAd) {
  let rows = [];
  if (r.mode === 'users') {
    const ids = (r.ids || []).map(n => parseInt(n, 10)).filter(Boolean).slice(0, MAX_RECIPIENTS);
    if (ids.length) {
      const { results = [] } = await DB.prepare(`SELECT id user_id, email, name, marketing FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      rows = results;
    }
  } else if (r.mode === 'inquiry') {
    const inq = await DB.prepare(`SELECT id inquiry_id, user_id, email, name, marketing FROM inquiries WHERE id = ?1`).bind(parseInt(r.id, 10)).first();
    if (inq) rows = [inq];
  } else if (r.mode === 'segment') {
    const seg = String(r.segment || 'all');
    let where = '1=1'; const args = [];
    if (seg === 'verified') where = 'email_verified = 1';
    else if (seg === 'marketing') where = 'marketing = 1';
    else if (LABEL.role[seg]) { where = 'role = ?1'; args.push(seg); }
    const { results = [] } = await DB.prepare(`SELECT id user_id, email, name, marketing FROM users WHERE ${where} ORDER BY id LIMIT ${MAX_RECIPIENTS + 1}`).bind(...args).all();
    rows = results;
  } else if (r.mode === 'emails') {
    if (isAd) throw new HttpError('ad_requires_consent', 422, { message: '광고성 안내는 수신 동의한 회원에게만 보낼 수 있습니다.' });
    const list = [...new Set((r.list || []).map(normEmail).filter(isEmail))].slice(0, 50);
    for (const email of list) {
      const u = await DB.prepare(`SELECT id user_id, email, name, marketing FROM users WHERE email = ?1`).bind(email).first();
      rows.push(u || { email, name: '' });
    }
  }
  // 중복 제거
  const seen = new Set(); rows = rows.filter(x => x && x.email && !seen.has(x.email) && seen.add(x.email));
  let excluded = 0;
  if (isAd) {
    const before = rows.length;
    rows = rows.filter(x => x.marketing === 1);
    if (rows.length) {
      const { results: uns = [] } = await DB.prepare(`SELECT email FROM unsubscribes WHERE email IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(x => x.email)).all();
      const block = new Set(uns.map(u => u.email)); rows = rows.filter(x => !block.has(x.email));
    }
    excluded = before - rows.length;
  }
  return { rows, excluded };
}

export const onRequestPost = handle(async ({ request, env }) => {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new HttpError('bad_origin', 403);
  const admin = await requireAdmin(env, request);
  let fd; try { fd = await request.formData(); } catch { throw new HttpError('bad_request', 400); }
  const DB = await db(env);

  const isAd = fd.get('is_ad') === '1';
  let recipients; try { recipients = JSON.parse(fd.get('recipients') || '{}'); } catch { throw new HttpError('validation', 422); }
  const { rows, excluded } = await resolveRecipients(DB, recipients, isAd);
  if (rows.length > MAX_RECIPIENTS) throw new HttpError('too_many', 422, { message: `한 번에 ${MAX_RECIPIENTS}명까지 보낼 수 있습니다.` });
  if (fd.get('dry_run') === '1') return json({ ok: true, count: rows.length, excluded, sample: rows.slice(0, 5).map(r => r.name || r.email) });
  if (!rows.length) throw new HttpError('no_recipients', 422, { message: excluded ? '수신 동의한 받는 사람이 없습니다.' : '받는 사람이 없습니다.' });

  // 자료 준비 (새로 만들거나 기존 자료 재사용)
  let doc;
  const existingId = parseInt(fd.get('document_id'), 10);
  if (existingId) {
    doc = await DB.prepare(`SELECT * FROM documents WHERE id = ?1`).bind(existingId).first();
    if (!doc) throw new HttpError('not_found', 404);
  } else {
    const title = clip(fd.get('title'), 150), body = clip(fd.get('body'), 20000);
    const kind = ['report', 'notice', 'newsletter'].includes(fd.get('kind')) ? fd.get('kind') : 'report';
    let link = clip(fd.get('link_url'), 500);
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    if (!title || !body) throw new HttpError('validation', 422, { fields: ['title', 'body'].filter(k => !fd.get(k)) });
    const file = fd.get('file');
    const hasFile = file && typeof file === 'object' && file.size > 0;
    if (hasFile && file.size > MAX_FILE_BYTES) throw new HttpError('file_too_large', 413, { message: '파일은 10MB 이하만 올릴 수 있습니다.' });
    const r = await DB.prepare(`INSERT INTO documents (created_at, created_by, kind, title, body, link_url, file_name, file_type, file_size, is_ad) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`)
      .bind(nowIso(), admin.name, kind, title, body, link || null, hasFile ? clip(file.name, 200) : null, hasFile ? (file.type || 'application/octet-stream') : null, hasFile ? file.size : null, isAd ? 1 : 0).run();
    const id = r.meta.last_row_id;
    if (hasFile) {
      const n = await saveFile(env, id, await file.arrayBuffer());
      await DB.prepare(`UPDATE documents SET chunks = ?1 WHERE id = ?2`).bind(n, id).run();
    }
    doc = await DB.prepare(`SELECT * FROM documents WHERE id = ?1`).bind(id).first();
  }

  // 받는 사람별 링크 생성 + 기록
  const site = siteOrigin(env, request);
  const now = nowIso();
  const prepared = [];
  for (const r of rows) {
    const token = randomToken(24);
    prepared.push({ ...r, token, hash: await sha256(token) });
  }
  const replyTo = (env.CONTACT_TO || 'spaceblank0100@gmail.com').split(',')[0].trim();
  const company = env.COMPANY_INFO || '주식회사 블랭크 · 서울특별시 강남구 영동대로 602, 6층 · 사업자등록번호 161-86-03494';
  const mails = prepared.map(r => {
    const view = `${site}/documents/view?t=${encodeURIComponent(r.token)}`;
    const unsub = `${site}/api/unsubscribe?t=${encodeURIComponent(r.token)}`;
    const attach = doc.file_name ? `<p style="margin:0 0 6px;font-size:14px;color:#4a4f55">첨부: ${esc(doc.file_name)} (${fmtSize(doc.file_size || 0)})</p>` : '';
    const adFoot = isAd ? `<p style="margin-top:24px;color:#7a8087;font-size:12px">본 메일은 수신에 동의하신 분께 발송되는 광고성 정보입니다. 더 이상 받지 않으려면 <a href="${unsub}" style="color:#7a8087">수신거부</a>를 눌러 주세요.<br>${esc(company)}</p>` : '';
    return {
      to: r.email, replyTo,
      subject: (isAd ? '(광고) ' : '') + '[공백] ' + doc.title,
      html: mailLayout(doc.title, `${r.name ? `<p style="margin:0 0 14px">${esc(r.name)}님, 안녕하세요. 공백입니다.</p>` : ''}${textToHtml(doc.body || '')}${attach}
        <p style="margin:18px 0"><a href="${view}" style="display:inline-block;background:#e5501c;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${doc.file_name ? '자료 확인·내려받기' : '자세히 보기'}</a></p>${adFoot}`),
      text: `${r.name ? r.name + '님, ' : ''}공백입니다.\n\n${doc.body || ''}\n\n자료 보기: ${view}${isAd ? `\n\n수신거부: ${unsub}` : ''}`,
      headers: isAd ? { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
    };
  });
  const results = mailConfigured(env) ? await sendMailBatch(env, mails) : mails.map(() => false);
  const stmts = prepared.map((r, i) => DB.prepare(`INSERT INTO deliveries (document_id, user_id, inquiry_id, email, name, token_hash, sent_at, mail_ok) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`)
    .bind(doc.id, r.user_id || null, r.inquiry_id || null, r.email, r.name || null, r.hash, now, results[i] ? 1 : 0));
  for (let i = 0; i < stmts.length; i += 50) await DB.batch(stmts.slice(i, i + 50));
  // 문의에서 보낸 경우 처리 이력에 남김
  for (const r of prepared.filter(x => x.inquiry_id)) await addNote(env, r.inquiry_id, 'doc', `[자료 발송] ${doc.title}${doc.file_name ? ' · ' + doc.file_name : ''}`, admin.name);

  const sent = results.filter(Boolean).length;
  return json({ ok: true, document_id: doc.id, count: prepared.length, mailed: sent, excluded, mail_configured: mailConfigured(env) });
});

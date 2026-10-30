// GET /api/admin/users?q=&filter=&format=csv — 회원 목록 (관리자)
import { handle, json, db, requireAdmin, clip, isAdmin, LABEL , kstStr } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await db(env);
  const url = new URL(request.url);
  const q = clip(url.searchParams.get('q'), 60), filter = url.searchParams.get('filter') || 'all';
  const where = [], args = [];
  if (q) { args.push(`%${q}%`); where.push(`(u.name LIKE ?1 OR u.email LIKE ?1 OR u.phone LIKE ?1 OR u.company LIKE ?1)`); }
  if (filter === 'marketing') where.push('u.marketing = 1');
  if (filter === 'unverified') where.push('u.email_verified = 0');
  if (LABEL.role[filter]) { args.push(filter); where.push(`u.role = ?${args.length}`); }
  const sql = `SELECT u.id, u.email, u.name, u.phone, u.role, u.company, u.marketing, u.email_verified, u.is_admin, u.created_at, u.last_login_at,
      (SELECT COUNT(*) FROM inquiries i WHERE i.user_id = u.id) AS inquiries,
      (SELECT COUNT(*) FROM deliveries d WHERE d.user_id = u.id) AS received
    FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY u.id DESC LIMIT 1000`;
  const { results = [] } = await DB.prepare(sql).bind(...args).all();
  const total = await DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
  const items = results.map(r => ({ ...r, admin: isAdmin(env, r) }));
  if (url.searchParams.get('format') === 'csv') {
    const cols = [['id', '회원번호'], ['created_at', '가입일시'], ['name', '이름'], ['email', '이메일'], ['phone', '연락처'], ['role', '구분'], ['company', '소속'],
      ['email_verified', '이메일인증'], ['marketing', '마케팅동의'], ['inquiries', '문의수'], ['received', '받은자료'], ['last_login_at', '최근로그인']];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + cols.map(c => cell(c[1])).join(',') + '\r\n' + items.map(r => cols.map(([k]) => cell(k === 'role' ? (LABEL.role[r.role] || r.role) : (k === 'created_at' || k === 'last_login_at') ? kstStr(r[k]) : r[k])).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="gongbaek-members-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  return json({ ok: true, items, total: total?.n || 0 });
});

// GET /api/admin/inquiries?stage=&q=&format=csv — 문의 목록 (관리자)
import { handle, json, db, requireAdmin, clip, LABEL, STAGE_IDS, stageLabel , kstStr } from '../../../lib/server.js';
export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await db(env);
  const url = new URL(request.url);
  const q = clip(url.searchParams.get('q'), 60);
  const stage = url.searchParams.get('stage') || 'all';
  const where = [], args = [];
  if (q) { args.push(`%${q}%`); where.push(`(name LIKE ?1 OR email LIKE ?1 OR phone LIKE ?1 OR address LIKE ?1 OR message LIKE ?1 OR admin_memo LIKE ?1)`); }
  if (stage === 'open') where.push(`stage IN ('new','review')`);
  else if (STAGE_IDS.includes(stage)) { args.push(stage); where.push(`stage = ?${args.length}`); }
  const sql = `SELECT id, created_at, updated_at, user_id, name, role, phone, email, type, address, floor_area, status, conditions, message, marketing, stage, admin_memo, source
    FROM inquiries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 1000`;
  const { results = [] } = await DB.prepare(sql).bind(...args).all();
  const { results: counts = [] } = await DB.prepare(`SELECT COALESCE(stage,'new') k, COUNT(*) n FROM inquiries GROUP BY k`).all();

  if (url.searchParams.get('format') === 'csv') {
    const cols = [['id', '번호'], ['created_at', '접수일시'], ['stage', '진행단계'], ['name', '이름/소속'], ['role', '구분'], ['phone', '연락처'], ['email', '이메일'],
      ['type', '문의유형'], ['address', '주소'], ['floor_area', '층수·면적'], ['status', '현재 상태'], ['conditions', '임대조건·예산'], ['message', '문의내용'],
      ['marketing', '마케팅동의'], ['admin_memo', '메모'], ['user_id', '회원번호']];
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const val = (r, k) => k === 'role' ? (LABEL.role[r.role] || r.role) : k === 'type' ? (LABEL.type[r.type] || r.type) : k === 'stage' ? stageLabel(r.stage) : k === 'created_at' ? kstStr(r[k]) : r[k];
    const csv = '﻿' + cols.map(c => cell(c[1])).join(',') + '\r\n' + results.map(r => cols.map(([k]) => cell(val(r, k))).join(',')).join('\r\n');
    return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="gongbaek-inquiries-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
  }
  return json({ ok: true, items: results, counts: Object.fromEntries(counts.map(c => [c.k, c.n])) });
});

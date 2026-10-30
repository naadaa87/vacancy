/**
 * GET /api/admin/center — 임대인센터 현황 (관리자)
 *   확인할 일(승인 대기 글·자료, 지연된 추진사항, 임대인 자료, 오래 멈춘 프로젝트), 단계별 수, 정산 합계
 * GET /api/admin/center?view=finance&format=csv — 전체 정산 내역 (CSV 가능)
 */
import { handle, json, requireAdmin, kstStr } from '../../../lib/server.js';
import { cdb, ACTIVE_STAGES, todayKst, pstageLabel } from '../../../lib/center.js';

const act = ACTIVE_STAGES.map(s => `'${s}'`).join(',');
const ST = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' };

export const onRequestGet = handle(async ({ request, env }) => {
  await requireAdmin(env, request);
  const DB = await cdb(env);
  const u = new URL(request.url);
  const today = todayKst();

  if (u.searchParams.get('view') === 'finance') {
    const { results = [] } = await DB.prepare(`SELECT x.*, pj.code, pj.title, pj.stage, pt.name partner_name, pt.company partner_company
        FROM project_money x JOIN projects pj ON pj.id = x.project_id
        LEFT JOIN project_members m ON m.id = x.member_id LEFT JOIN partners pt ON pt.id = m.partner_id
        ORDER BY COALESCE(x.done_date, x.due_date, substr(x.created_at, 1, 10)) DESC, x.id DESC`).all();
    if (u.searchParams.get('format') === 'csv') {
      const head = ['구분', '프로젝트 코드', '프로젝트', '항목', '파트너', '기준 금액', '비율(%)', '금액(원)', '상태', '예정일', '완료일', '메모', '등록'];
      // 엑셀 수식으로 해석되지 않도록 =,+,-,@ 로 시작하는 글자는 앞에 ' 를 붙입니다(숫자는 그대로)
      const q = v => { let s = String(v ?? ''); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const rows = results.map(x => [x.direction === 'in' ? '수입' : '지급', x.code, x.title, x.label, x.partner_name ? x.partner_name + (x.partner_company ? '(' + x.partner_company + ')' : '') : '',
        x.base_amount ?? '', x.rate ?? '', x.amount ?? '', ST[x.status] || x.status, x.due_date || '', x.done_date || '', x.memo || '', kstStr(x.created_at)].map(q).join(','));
      return new Response('﻿' + [head.join(','), ...rows].join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="gongbaek-settlement-${today}.csv"`, 'Cache-Control': 'no-store' } });
    }
    return json({ ok: true, items: results });
  }

  const soon = new Date(Date.now() + 9 * 36e5 + 7 * 864e5).toISOString().slice(0, 10);
  const stale = new Date(Date.now() - 14 * 864e5).toISOString();
  const [stages, pPosts, pFiles, overdue, dueSoon, staleR, money, partners] = await DB.batch([
    DB.prepare(`SELECT stage k, COUNT(*) n FROM projects GROUP BY stage`),
    DB.prepare(`SELECT x.id, x.project_id, x.body, x.created_at, x.member_id, pj.code, pj.title, pt.name, pt.company FROM project_posts x JOIN projects pj ON pj.id = x.project_id
      LEFT JOIN project_members m ON m.id = x.member_id LEFT JOIN partners pt ON pt.id = m.partner_id WHERE x.status = 'pending' ORDER BY x.id LIMIT 30`),
    DB.prepare(`SELECT f.id, f.project_id, f.name, f.uploader_type, f.audience, f.created_at, pj.code, pj.title FROM project_files f JOIN projects pj ON pj.id = f.project_id WHERE f.status = 'pending' ORDER BY f.id LIMIT 30`),
    DB.prepare(`SELECT t.id, t.project_id, t.title, t.owner, t.due_date, pj.code, pj.title ptitle FROM project_tasks t JOIN projects pj ON pj.id = t.project_id
      WHERE t.status != 'done' AND t.due_date IS NOT NULL AND t.due_date < ?1 AND pj.stage IN (${act}) ORDER BY t.due_date LIMIT 30`).bind(today),
    DB.prepare(`SELECT COUNT(*) n FROM project_tasks t JOIN projects pj ON pj.id = t.project_id WHERE t.status != 'done' AND t.due_date BETWEEN ?1 AND ?2 AND pj.stage IN (${act})`).bind(today, soon),
    DB.prepare(`SELECT id, code, title, stage, updated_at FROM projects WHERE stage IN (${act}) AND (updated_at IS NULL OR updated_at < ?1) ORDER BY updated_at LIMIT 20`).bind(stale),
    DB.prepare(`SELECT direction, status, COALESCE(SUM(amount), 0) total, COUNT(*) n FROM project_money WHERE status != 'cancel' GROUP BY direction, status`),
    DB.prepare(`SELECT pt.id, pt.name, pt.company, COUNT(*) n FROM project_members m JOIN partners pt ON pt.id = m.partner_id JOIN projects pj ON pj.id = m.project_id
      WHERE m.status = 'active' AND pj.stage IN (${act}) GROUP BY pt.id ORDER BY n DESC LIMIT 8`),
  ]);
  const byStage = stages.results || [];
  const m = {}; (money.results || []).forEach(r => { m[r.direction + '_' + r.status] = r.total; });
  return json({ ok: true,
    counts: {
      active: byStage.filter(r => ACTIVE_STAGES.includes(r.k)).reduce((a, r) => a + r.n, 0),
      total: byStage.reduce((a, r) => a + r.n, 0),
      pending: (pPosts.results || []).length + (pFiles.results || []).length,
      overdue: (overdue.results || []).length, due_soon: (dueSoon.results || [])[0]?.n || 0, stale: (staleR.results || []).length,
    },
    by_stage: byStage.map(r => ({ k: r.k, label: pstageLabel(r.k), n: r.n })),
    pending_posts: (pPosts.results || []).map(x => ({ ...x, body: String(x.body || '').slice(0, 160) })),
    pending_files: pFiles.results || [], overdue: overdue.results || [], stale: staleR.results || [],
    money: { in_plan: (m.in_plan || 0) + (m.in_due || 0), in_due: m.in_due || 0, in_done: m.in_done || 0, out_plan: (m.out_plan || 0) + (m.out_due || 0), out_due: m.out_due || 0, out_done: m.out_done || 0 },
    partners: partners.results || [],
  });
});

/* 임대인센터 프로젝트 화면 — 관리자(/admin)·파트너·임대인(/center) 공용
 * 서버가 보는 사람의 권한에 맞춰 거른 데이터만 내려주고, 이 화면은 그 데이터로 탭을 그립니다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 기준 값 (서버 lib/center.js 와 같음) ---------- */
  var PSTAGES = [['intake', '접수', '접수'], ['diagnosis', '진단·검토', '검토 중'], ['proposal', '제안', '제안'], ['contract', '수임·계약', '계약'], ['execution', '실행', '진행 중'],
    ['closing', '마무리·정산', '마무리'], ['done', '완료', '완료'], ['hold', '보류', '보류'], ['dropped', '중단', '종료']];
  var STAGE = {}, STAGE_EXT = {}; PSTAGES.forEach(function (s) { STAGE[s[0]] = s[1]; STAGE_EXT[s[0]] = s[2]; });
  var STAGE_NOTE = { intake: '의뢰 내용을 받아 검토를 준비하고 있습니다.', diagnosis: '현장과 자료를 바탕으로 건물 상황을 진단하고 있습니다.', proposal: '진단 결과를 바탕으로 방안을 정리해 제안드리는 단계입니다.',
    contract: '진행 범위와 조건을 확정하는 단계입니다.', execution: '합의한 방안을 실행하고 있습니다. 진행 상황은 아래에서 계속 업데이트됩니다.', closing: '결과를 정리하고 마무리하는 단계입니다.',
    done: '프로젝트가 완료되었습니다.', hold: '잠시 보류 중입니다. 재개 일정은 소통 탭으로 안내드립니다.', dropped: '진행을 종료했습니다.' };
  var KINDS = { vacancy: '공실해결', leasing: '임차유치', md: '상가MD', buy: '건물매입', sell: '건물매각', evict: '명도전략', exit: '매각전략', invest: '투자전략', valueup: '밸류업·리모델링', develop: '공간개발·운영', etc: '기타' };
  var ROLES = { broker: '중개', leasing: '임차유치', retail: '리테일·MD', asset: '자산운용', evict: '명도', invest: '투자유치·금융', legal: '법무·세무', design: '설계·시공', appraisal: '감정평가', operator: '운영', etc: '협력' };
  var PERMS = [['owner', '임대인 정보', '임대인 이름·연락처'], ['leases', '임대 현황', '층별 임차·보증금·임대료'], ['finance', '가격·재무', '매각 희망가·대출 등'], ['files', '자료실', '공유 자료 열람'],
    ['upload', '자료 올리기', '자료실에 파일 올리기'], ['tasks', '추진사항 관리', '추진사항 등록·수정'], ['team', '참여자 공개', '다른 파트너 실명·소속'], ['publish', '임대인 직접 공유', '승인 없이 임대인에게 공유']];
  var PERM_LABEL = {}; PERMS.forEach(function (p) { PERM_LABEL[p[0]] = p[1]; });
  var PRESETS = [['view', '열람 위주', ['files']], ['work', '실무 담당', ['leases', 'files', 'upload']], ['core', '핵심 파트너', ['owner', 'leases', 'finance', 'files', 'upload', 'tasks', 'team']]];
  var TASK_ST = { todo: '예정', doing: '진행 중', done: '완료', blocked: '이슈' };
  var POST_KIND = { opinion: '의견·검토', report: '진행 보고', request: '요청·질문', decision: '결정 사항', reply: '답글' };
  var AUD = { internal: '공백 내부', team: '참여자 공유', all: '임대인 공유', direct: '1:1' };
  var FILE_CAT = { legal: '건축물대장·등기', drawing: '도면', photo: '사진', lease: '임대차·계약', finance: '재무·세무', report: '보고서·제안서', etc: '기타' };
  var UNIT_ST = { leased: '임대 중', vacant: '공실', nego: '협의 중', owner: '자가 사용' };
  var MONEY_ST = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' };
  var PHASES = ['진단', '제안', '실행', '마무리'];
  var FEE_BASES = ['중개보수', '거래금액', '공백 수입', '월 임대료', '고정 금액'];
  var ERR = { forbidden: '권한이 없습니다.', not_found: '찾을 수 없거나 볼 수 있는 권한이 없습니다.', preview_readonly: '미리보기에서는 바꿀 수 없습니다.', validation: '입력값을 확인해 주세요.',
    file_too_large: '파일은 10MB 이하만 올릴 수 있습니다.', unauthorized: '로그인이 필요합니다.', mail_failed: '메일을 보내지 못했습니다.', mail_not_configured: '이메일 발송이 설정되지 않았습니다.', server_error: '일시적인 오류가 생겼습니다.' };

  /* ---------- 공통 도우미 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kst(iso) { var d = new Date(iso); return new Date(d.getTime() + 9 * 3600e3).toISOString(); }
  function dt(iso) { return iso ? kst(iso).replace('T', ' ').slice(0, 16) : ''; }
  function day(iso) { return iso ? kst(iso).slice(0, 10) : ''; }
  function today() { return kst(new Date().toISOString()).slice(0, 10); }
  function ago(iso) { var h = (Date.now() - new Date(iso).getTime()) / 36e5; if (h < 1) return '방금'; if (h < 24) return Math.floor(h) + '시간 전'; if (h < 24 * 30) return Math.floor(h / 24) + '일 전'; return day(iso); }
  function won(n) { return n == null || n === '' ? '-' : Math.round(n).toLocaleString('ko-KR') + '원'; }
  function man(n) { return n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR') + '만'; }
  function size(n) { return !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }
  function opts(map, cur, blank) { return (blank != null ? '<option value="">' + esc(blank) + '</option>' : '') + Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>'; }).join(''); }
  function req(method, path, body, isForm) {
    var o = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { if (isForm) o.body = body; else { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); } }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { ok: false, error: r.status === 404 ? 'not_found' : 'server_error' }; }).then(function (j) { j._status = r.status; return j; }); })
      .catch(function () { return { ok: false, error: 'server_error' }; });
  }
  function errText(j) { return (j && (j.message || ERR[j.error])) || ERR.server_error; }
  function chip(text, cls) { return '<span class="pj-chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>'; }

  /* ---------- 화면 ---------- */
  function mount(root, id, opt) {
    opt = opt || {};
    var D = null, tab = opt.tab || 'overview', feedFilter = 'all', taskFilter = 'open';
    var toast = opt.toast || function (m) { alert(m); };
    var base = opt.base || '#/p/';

    function api(path, body) { return req('POST', path, body).then(function (j) { if (!j.ok) toast(errText(j), true); return j; }); }
    function load(keepScroll) {
      var y = window.scrollY;
      return req('GET', '/api/center/project?id=' + id + (opt.as ? '&as=' + encodeURIComponent(opt.as) : '')).then(function (j) {
        if (!j.ok) { root.innerHTML = (opt.back ? '<a class="back" href="' + opt.back[0] + '">← ' + esc(opt.back[1]) + '</a>' : '') + '<div class="pj-empty">' + esc(errText(j)) + '</div>'; return; }
        D = j; render(); if (keepScroll) window.scrollTo(0, y);
        if (opt.onLoad) opt.onLoad(D);
      });
    }
    var V = function () { return D.viewer; };
    var isAdmin = function () { return V().role === 'admin'; };
    var isPartner = function () { return V().role === 'partner'; };
    var isLandlord = function () { return V().role === 'landlord'; };
    var ro = function () { return !!V().preview; };
    var has = function (p) { return V().perms.indexOf(p) > -1; };
    var canTasks = function () { return !ro() && (isAdmin() || (isPartner() && has('tasks'))); };

    function tabs() {
      var t = D.tasks.filter(function (x) { return x.status !== 'done'; }).length;
      var pend = isAdmin() ? (D.stats.pending_posts || 0) : 0, pendF = isAdmin() ? (D.stats.pending_files || 0) : 0;
      if (isLandlord()) return [['overview', '진행 현황'], ['feed', '소통'], ['files', '자료'], ['building', '건물 현황']];
      var list = [['overview', '개요'], ['building', '건물·임대'], ['tasks', '추진사항', t], ['feed', '소통', pend, pend ? 'hot' : ''], ['files', '자료실', pendF, pendF ? 'hot' : '']];
      if (isAdmin()) list.push(['people', '참여자·권한'], ['money', '정산'], ['log', '기록']);
      if (isPartner()) list.push(['terms', '내 조건']);
      return list;
    }

    function render() {
      var P = D.project, names = tabs().map(function (t) { return t[0]; });
      if (names.indexOf(tab) < 0) tab = 'overview';
      var stIdx = PSTAGES.findIndex(function (s) { return s[0] === P.stage; }), off = P.stage === 'hold' || P.stage === 'dropped';
      var kinds = String(P.kinds || '').split(',').filter(Boolean).map(function (k) { return KINDS[k] || k; });
      var html = '';
      if (opt.back) html += '<a class="back" href="' + opt.back[0] + '">← ' + esc(opt.back[1]) + '</a>';
      if (ro()) html += '<div class="pj-preview"><b>미리보기</b> ' + (isLandlord() ? '임대인' : esc(V().alias || '파트너') + '(' + esc((D.members.filter(function (m) { return m.me; })[0] || {}).name || '') + ')') + '에게 보이는 화면입니다. 이름·연락처 가림이 그대로 적용되어 있고, 여기서는 아무것도 바꿀 수 없습니다. <a href="' + base + id + '">관리자 화면으로 돌아가기</a></div>';
      html += '<header class="pj-head"><div class="pj-head-l"><div class="pj-meta">' + (P.code ? '<span class="pj-code">' + esc(P.code) + '</span>' : '') + kinds.map(function (k) { return chip(k, 'kind'); }).join('') +
        (isAdmin() && P.priority === 'high' ? chip('중요', 'hot') : '') + '</div><h1>' + esc(P.title) + '</h1><p class="pj-sub">' + esc(P.address || '') +
        (P.due_date ? ' · 목표 ' + esc(P.due_date) : '') + (isPartner() ? ' · 내 역할: ' + esc(V().alias || '') : '') + '</p></div>';
      if (isAdmin() && !ro()) {
        html += '<div class="pj-head-r"><label class="pj-mini">미리보기</label><select id="pj-as"><option value="">화면 선택</option><option value="landlord">임대인 화면</option>' +
          D.members.filter(function (m) { return m.status === 'active'; }).map(function (m) { return '<option value="m:' + m.id + '">' + esc(m.alias) + ' (' + esc(m.name) + ') 화면</option>'; }).join('') + '</select></div>';
      }
      html += '</header>';
      // 단계
      html += '<div class="pj-steps-wrap"><ol class="pj-steps' + (off ? ' off' : '') + '">' + PSTAGES.slice(0, 7).map(function (s, i) {
        var cls = i < stIdx && !off ? 'done' : i === stIdx ? 'on' : '';
        var label = isLandlord() ? s[2] : s[1];
        return '<li class="' + cls + '">' + (isAdmin() && !ro() ? '<button type="button" data-stage="' + s[0] + '">' + esc(label) + '</button>' : '<span>' + esc(label) + '</span>') + '</li>';
      }).join('') + '</ol>';
      if (off) html += chip(isLandlord() ? STAGE_EXT[P.stage] : STAGE[P.stage], 'warn');
      if (isAdmin() && !ro()) html += '<div class="pj-stage-side"><button type="button" class="pj-link" data-stage="hold">보류</button><button type="button" class="pj-link" data-stage="dropped">중단</button><label class="pj-mini"><input type="checkbox" id="pj-stage-mail"> 단계 바꿀 때 임대인·참여자에게 메일</label></div>';
      html += '</div>';
      html += '<nav class="pj-tabs" role="tablist">' + tabs().map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === tab) + '">' + esc(t[1]) + (t[2] ? '<span class="n' + (t[3] ? ' ' + t[3] : '') + '">' + t[2] + '</span>' : '') + '</button>'; }).join('') + '</nav>';
      html += '<div class="pj-body" id="pj-body"></div>';
      root.innerHTML = html;
      $$('.pj-tabs button', root).forEach(function (b) { b.onclick = function () { tab = b.dataset.tab; setHash(); render(); }; });
      $$('[data-stage]', root).forEach(function (b) {
        b.onclick = function () {
          var s = b.dataset.stage; if (s === P.stage) return;
          if (!confirm("진행 단계를 '" + STAGE[s] + "'(으)로 바꿀까요?")) return;
          api('/api/center/project', { id: P.id, action: 'stage', stage: s, notify: !!($('#pj-stage-mail') || {}).checked }).then(function (j) { if (j.ok) { toast('단계를 바꿨습니다.' + (j.mailed ? ' 메일 ' + j.mailed + '통 발송' : '')); load(true); } });
        };
      });
      var stp = $('.pj-steps', root), cur = $('.pj-steps li.on', root); if (stp && cur && stp.scrollWidth > stp.clientWidth) { var prev = cur.previousElementSibling || cur; stp.scrollLeft = Math.max(0, prev.offsetLeft - stp.offsetLeft); }
      var as = $('#pj-as'); if (as) as.onchange = function () { if (as.value) location.hash = base + id + '?as=' + encodeURIComponent(as.value); };
      var body = $('#pj-body');
      ({ overview: overview, building: building, tasks: tasksTab, feed: feed, files: files, people: people, money: money, log: logTab, terms: terms }[tab])(body);
    }
    function setHash() { var h = base + id + (tab !== 'overview' ? '?tab=' + tab : ''); if (opt.as) h = base + id + '?as=' + encodeURIComponent(opt.as) + (tab !== 'overview' ? '&tab=' + tab : ''); history.replaceState(null, '', h); }
    function go(t) { tab = t; setHash(); render(); window.scrollTo(0, 0); }

    /* ---------- 개요 ---------- */
    function postLine(p) {
      return '<li><div class="pl-top"><b>' + esc(p.author) + '</b>' + chip(POST_KIND[p.kind] || '', 'kind') + (!isLandlord() ? chip(AUD[p.audience], 'aud-' + p.audience) : '') + (p.status === 'pending' ? chip('승인 대기', 'hot') : '') + '<span class="pl-t">' + ago(p.created_at) + '</span></div><p>' + esc(String(p.body).slice(0, 140)) + (String(p.body).length > 140 ? '…' : '') + '</p></li>';
    }
    function taskLine(t) {
      var late = t.status !== 'done' && t.due_date && t.due_date < today();
      return '<li class="' + (t.status === 'done' ? 'is-done' : '') + '"><span class="tk-st st-' + t.status + '">' + TASK_ST[t.status] + '</span><span class="tk-t">' + (t.kind === 'doc' ? chip('자료 요청', 'doc') : '') + esc(t.title) + '</span><span class="tk-o">' + esc(t.owner_label) + '</span><span class="tk-d' + (late ? ' late' : '') + '">' + esc(t.due_date || '') + '</span></li>';
    }
    function overview(el) {
      var P = D.project, S = D.stats, pct = S.tasks_total ? Math.round(S.tasks_done / S.tasks_total * 100) : 0;
      var open = D.tasks.filter(function (t) { return t.status !== 'done'; }).sort(function (a, b) { return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1; });
      var tops = D.posts.filter(function (p) { return !p.parent_id; }).slice(0, 4);
      var activeMembers = D.members.filter(function (m) { return m.status === undefined || m.status === 'active'; });
      if (isLandlord()) {
        var mine = D.tasks.filter(function (t) { return t.owner === 'l' && t.status !== 'done'; });
        var work = D.tasks.filter(function (t) { return t.owner !== 'l'; });
        el.innerHTML = '<div class="grid2"><div>' +
          '<div class="card pj-stage-card"><h2>지금 단계 <small>' + esc(STAGE_EXT[P.stage]) + '</small></h2><p>' + esc(STAGE_NOTE[P.stage] || '') + '</p>' +
            '<div class="pj-progress"><i style="width:' + pct + '%"></i></div><p class="muted-s">진행 항목 ' + S.tasks_done + ' / ' + S.tasks_total + ' 완료</p></div>' +
          (mine.length ? '<div class="card pj-ask"><h2>요청드린 자료 <small>' + mine.length + '건</small></h2><ul class="pj-asklist">' + mine.map(function (t) {
            return '<li><div><b>' + esc(t.title) + '</b>' + (t.detail ? '<p>' + esc(t.detail) + '</p>' : '') + (t.due_date ? '<p class="muted-s">기한 ' + esc(t.due_date) + '</p>' : '') + '</div>' +
              (ro() ? '' : '<label class="btn btn-primary btn-sm pj-upbtn">파일 올리기<input type="file" data-task="' + t.id + '" hidden></label>') + '</li>';
          }).join('') + '</ul><p class="muted-s">파일은 공백이 먼저 확인하고, 필요한 담당자와만 공유합니다. 10MB 이하로 올려 주세요.</p></div>' : '') +
          '<div class="card"><h2>진행 중인 일</h2>' + (work.length ? '<ul class="pj-tasklist">' + work.map(taskLine).join('') + '</ul>' : '<p class="muted-s">진행 항목이 정리되면 여기에 표시됩니다.</p>') + '</div>' +
        '</div><div>' +
          '<div class="card"><h2>최근 소식 <small><a href="#" data-go="feed">전체 보기</a></small></h2>' + (tops.length ? '<ul class="pj-postlist">' + tops.map(postLine).join('') + '</ul>' : '<p class="muted-s">아직 소식이 없습니다. 궁금하신 점은 소통 탭에 남겨 주세요.</p>') + '</div>' +
          '<div class="card"><h2>의뢰 내용</h2><dl class="dl"><dt>건물</dt><dd>' + esc(P.address || '-') + '</dd>' + (P.request ? '<dt>요청 사항</dt><dd>' + nl(P.request) + '</dd>' : '') + (P.goal ? '<dt>목표</dt><dd>' + nl(P.goal) + '</dd>' : '') + '</dl></div>' +
          '<div class="card"><h2>함께하는 팀</h2><p class="muted-s" style="margin-bottom:10px">공백이 프로젝트 전체를 맡아 관리하고, 분야별 파트너가 함께 진행합니다. 모든 소통은 공백을 통해 이루어집니다.</p><ul class="pj-team"><li><b>공백</b><span>총괄·관리</span></li>' +
            activeMembers.map(function (m) { return '<li><b>' + esc(m.alias) + '</b><span>' + esc(ROLES[m.role] || '') + '</span></li>'; }).join('') + '</ul></div>' +
        '</div></div>';
      } else {
        el.innerHTML = '<div class="grid2"><div>' +
          (isAdmin() && (S.pending_posts || S.pending_files || S.overdue) ? '<div class="card pj-alert"><h2>확인할 일</h2><ul class="todo">' +
            (S.pending_posts ? '<li><span class="dot red"></span><div><a href="#" data-go="feed" data-filter="pending">임대인 공개 승인 대기 글 ' + S.pending_posts + '건</a><p>파트너가 임대인에게 공유를 요청한 글입니다. 회사명·연락처가 들어 있지 않은지 확인하고 승인해 주세요.</p></div></li>' : '') +
            (S.pending_files ? '<li><span class="dot red"></span><div><a href="#" data-go="files">확인이 필요한 자료 ' + S.pending_files + '건</a><p>임대인이 올린 자료이거나 임대인 공개를 요청한 자료입니다. 공유 범위를 정해 주세요.</p></div></li>' : '') +
            (S.overdue ? '<li><span class="dot amber"></span><div><a href="#" data-go="tasks" data-tfilter="late">기한이 지난 추진사항 ' + S.overdue + '건</a><p>담당자에게 확인하거나 기한을 조정해 주세요.</p></div></li>' : '') + '</ul></div>' : '') +
          '<div class="card"><h2>진행률 <small>' + S.tasks_done + ' / ' + S.tasks_total + ' 완료' + (S.overdue ? ' · 지연 ' + S.overdue : '') + '</small></h2><div class="pj-progress"><i style="width:' + pct + '%"></i></div>' +
            '<h3 class="pj-h3">다음 할 일</h3>' + (open.length ? '<ul class="pj-tasklist">' + open.slice(0, 6).map(taskLine).join('') + '</ul>' : '<p class="muted-s">남은 추진사항이 없습니다.</p>') + '<p style="margin-top:10px"><a class="pj-more" href="#" data-go="tasks">추진사항 전체 보기</a></p></div>' +
          '<div class="card"><h2>최근 소통 <small><a href="#" data-go="feed">전체 보기</a></small></h2>' + (tops.length ? '<ul class="pj-postlist">' + tops.map(postLine).join('') + '</ul>' : '<p class="muted-s">아직 글이 없습니다.</p>') + '</div>' +
        '</div><div>' +
          '<div class="card"><h2>의뢰 요약</h2><dl class="dl"><dt>요청 사항</dt><dd>' + (P.request ? nl(P.request) : '-') + '</dd><dt>목표</dt><dd>' + (P.goal ? nl(P.goal) : '-') + '</dd><dt>시작·목표일</dt><dd>' + esc(P.start_date || '-') + ' ~ ' + esc(P.due_date || '-') + '</dd></dl>' +
            (isAdmin() && !ro() ? '<form class="inline-form" id="pj-next"><input type="text" name="v" maxlength="300" placeholder="다음 액션 한 줄 (목록에서도 보입니다)" value="' + esc(P.next_action || '') + '"><button class="btn btn-outline btn-sm">저장</button></form>' : (P.next_action ? '<p class="pj-next"><b>다음 액션</b> ' + esc(P.next_action) + '</p>' : '')) + '</div>' +
          (D.landlord ? '<div class="card"><h2>임대인' + (isAdmin() ? ' <small>' + (D.landlord.linked ? '임대인센터 연결됨' : '임대인센터 미연결') + '</small>' : '') + '</h2><dl class="dl"><dt>이름</dt><dd>' + esc(D.landlord.name) + (D.landlord.company ? ' · ' + esc(D.landlord.company) : '') + '</dd>' +
            (D.landlord.phone ? '<dt>연락처</dt><dd><a href="tel:' + esc(String(D.landlord.phone).replace(/[^0-9+]/g, '')) + '">' + esc(D.landlord.phone) + '</a></dd>' : '') + (D.landlord.email ? '<dt>이메일</dt><dd>' + esc(D.landlord.email) + '</dd>' : '') + '</dl>' +
            (isAdmin() && P.internal_memo ? '<div class="msg-box" style="margin-top:12px">' + esc(P.internal_memo) + '</div>' : '') + '</div>' : (isAdmin() ? '<div class="card"><h2>임대인</h2><p class="muted-s">연결된 임대인이 없습니다. 참여자·권한 탭에서 연결할 수 있습니다.</p></div>' : '')) +
          '<div class="card"><h2>참여자</h2><ul class="pj-team"><li><b>공백</b><span>총괄·관리</span></li>' + activeMembers.map(function (m) {
            return '<li><b>' + esc(isAdmin() ? m.name + (m.company ? ' · ' + m.company : '') : m.label) + '</b><span>' + esc(ROLES[m.role] || '') + (isAdmin() ? ' · 임대인에게는 “' + esc(m.alias) + '”' : '') + '</span>' +
              (isAdmin() ? '<em>' + (m.perms.length ? m.perms.map(function (p) { return PERM_LABEL[p]; }).join(' · ') : '기본 정보만') + '</em>' : '') + '</li>';
          }).join('') + '</ul>' + (isAdmin() && !ro() ? '<p style="margin-top:10px"><a class="pj-more" href="#" data-go="people">참여자·권한 관리</a></p>' : '') + '</div>' +
        '</div></div>';
        var nx = $('#pj-next', el); if (nx) nx.onsubmit = function (e) { e.preventDefault(); api('/api/center/project', { id: P.id, action: 'update', next_action: nx.v.value }).then(function (j) { if (j.ok) toast('저장했습니다.'); }); };
      }
      $$('[data-go]', el).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); if (a.dataset.filter) feedFilter = a.dataset.filter; if (a.dataset.tfilter) taskFilter = a.dataset.tfilter; go(a.dataset.go); }; });
      $$('input[type=file][data-task]', el).forEach(function (inp) { inp.onchange = function () { if (inp.files[0]) uploadFile(inp.files[0], { task_id: inp.dataset.task, category: 'etc' }); }; });
    }

    /* ---------- 건물·임대 ---------- */
    function building(el) {
      var P = D.project, U = D.units;
      var F = [['address', '주소'], ['building_name', '건물명'], ['building_use', '주용도'], ['scale', '규모'], ['land_area', '대지면적'], ['gross_area', '연면적'], ['built_year', '준공'], ['vacancy', '공실 현황']];
      var html = '<div class="pj-bgrid"><div><div class="card"><h2>건물 정보' + (isAdmin() && !ro() ? ' <small><button type="button" class="pj-link" id="b-edit">수정</button></small>' : '') + '</h2><div id="b-view"><dl class="dl">' +
        F.map(function (f) { return '<dt>' + f[1] + '</dt><dd>' + (P[f[0]] ? nl(P[f[0]]) : '-') + '</dd>'; }).join('') + '</dl></div>' +
        (isAdmin() && !ro() ? '<form class="form-v" id="b-form" hidden><div class="pj-fgrid">' +
          '<div class="field full"><label>프로젝트 이름</label><input type="text" name="title" value="' + esc(P.title) + '" required></div>' +
          F.map(function (f) { return '<div class="field' + (f[0] === 'vacancy' || f[0] === 'address' ? ' full' : '') + '"><label>' + f[1] + '</label>' + (f[0] === 'vacancy' ? '<textarea name="vacancy" rows="3">' + esc(P.vacancy || '') + '</textarea>' : '<input type="text" name="' + f[0] + '" value="' + esc(P[f[0]] || '') + '">') + '</div>'; }).join('') +
          '<div class="field full"><label>의뢰 유형</label><div class="pj-checks">' + Object.keys(KINDS).map(function (k) { return '<label><input type="checkbox" name="kinds" value="' + k + '"' + (String(P.kinds || '').split(',').indexOf(k) > -1 ? ' checked' : '') + '> ' + KINDS[k] + '</label>'; }).join('') + '</div></div>' +
          '<div class="field full"><label>요청 사항</label><textarea name="request" rows="3">' + esc(P.request || '') + '</textarea></div>' +
          '<div class="field full"><label>목표·성공 기준</label><textarea name="goal" rows="2">' + esc(P.goal || '') + '</textarea></div>' +
          '<div class="field full"><label>가격·재무 <span class="muted-s">(가격·재무 권한이 있는 파트너와 임대인에게 보입니다)</span></label><textarea name="finance" rows="3">' + esc(P.finance || '') + '</textarea></div>' +
          '<div class="field full"><label>내부 메모 <span class="muted-s">(관리자만)</span></label><textarea name="internal_memo" rows="3">' + esc(P.internal_memo || '') + '</textarea></div>' +
          '<div class="field"><label>시작일</label><input type="date" name="start_date" value="' + esc(P.start_date || '') + '"></div><div class="field"><label>목표일</label><input type="date" name="due_date" value="' + esc(P.due_date || '') + '"></div>' +
          '<div class="field"><label>중요도</label><select name="priority">' + opts({ high: '중요', normal: '보통', low: '낮음' }, P.priority || 'normal') + '</select></div>' +
          '</div><button class="btn btn-ink btn-sm">저장</button> <button type="button" class="btn btn-outline btn-sm" id="b-cancel">취소</button></form>' : '') +
        '</div></div><div>' + (P.finance !== undefined ? '<div class="card"><h2>가격·재무</h2><div class="msg-box">' + esc(P.finance || '아직 입력된 내용이 없습니다.') + '</div></div>' : '') +
        '<div class="card"><h2>의뢰 내용</h2><dl class="dl"><dt>요청 사항</dt><dd>' + (P.request ? nl(P.request) : '-') + '</dd><dt>목표</dt><dd>' + (P.goal ? nl(P.goal) : '-') + '</dd></dl></div></div></div>';
      if (U) {
        var leased = U.filter(function (u) { return u.status === 'leased' || u.status === 'owner'; }), vac = U.filter(function (u) { return u.status === 'vacant'; });
        var area = U.reduce(function (a, u) { return a + (+u.area || 0); }, 0), vArea = vac.reduce(function (a, u) { return a + (+u.area || 0); }, 0);
        var dep = U.reduce(function (a, u) { return a + (u.status === 'leased' ? (+u.deposit || 0) : 0); }, 0), rent = U.reduce(function (a, u) { return a + (u.status === 'leased' ? (+u.rent || 0) : 0); }, 0);
        html += '<div class="card"><h2>층별 임대 현황 <small>금액 단위 만원</small></h2>' +
          (U.length ? '<div class="pj-sum"><div><span>호실</span><b>' + U.length + '</b></div><div><span>공실</span><b>' + vac.length + '</b></div><div><span>공실률(면적)</span><b>' + (area ? Math.round(vArea / area * 1000) / 10 + '%' : '-') + '</b></div><div><span>보증금 합계</span><b>' + man(dep) + '</b></div><div><span>월 임대료 합계</span><b>' + man(rent) + '</b></div></div>' : '') +
          '<div class="tbl-wrap"><table class="tbl pj-units"><thead><tr><th>층</th><th>호실</th><th class="num">면적㎡</th><th>업종·용도</th><th>임차인</th><th>상태</th><th class="num">보증금</th><th class="num">월세</th><th class="num">관리비</th><th>만기</th>' + (isAdmin() && !ro() ? '<th></th>' : '') + '</tr></thead><tbody>' +
          (U.length ? U.map(function (u) {
            return '<tr data-id="' + u.id + '"><td>' + esc(u.floor || '') + '</td><td>' + esc(u.unit || '') + '</td><td class="num">' + (u.area != null ? u.area : '') + '</td><td>' + esc(u.use || '') + '</td><td>' + esc(u.tenant || '') + '</td><td>' + chip(UNIT_ST[u.status] || '', 'u-' + u.status) + '</td>' +
              '<td class="num">' + (u.deposit != null ? Number(u.deposit).toLocaleString() : '') + '</td><td class="num">' + (u.rent != null ? Number(u.rent).toLocaleString() : '') + '</td><td class="num">' + (u.mgmt != null ? Number(u.mgmt).toLocaleString() : '') + '</td><td class="nw">' + esc(u.lease_end || '') + '</td>' +
              (isAdmin() && !ro() ? '<td class="nw"><button type="button" class="pj-link" data-uedit="' + u.id + '">수정</button> <button type="button" class="pj-link danger" data-udel="' + u.id + '">삭제</button></td>' : '') + '</tr>' + (u.note ? '<tr class="pj-note-row"><td></td><td colspan="10">' + esc(u.note) + '</td></tr>' : '');
          }).join('') : '<tr class="empty-row"><td colspan="11">아직 정리된 임대 현황이 없습니다.</td></tr>') + '</tbody></table></div>' +
          (isAdmin() && !ro() ? '<form class="pj-unit-form" id="u-form"><input type="hidden" name="id"><div class="pj-ugrid">' +
            '<input name="floor" placeholder="층 (예: 1F)"><input name="unit" placeholder="호실"><input name="area" inputmode="decimal" placeholder="면적㎡"><input name="use" placeholder="업종·용도"><input name="tenant" placeholder="임차인(상호)">' +
            '<select name="status">' + opts(UNIT_ST, 'vacant') + '</select><input name="deposit" inputmode="numeric" placeholder="보증금(만원)"><input name="rent" inputmode="numeric" placeholder="월세(만원)"><input name="mgmt" inputmode="numeric" placeholder="관리비(만원)"><input name="lease_end" type="date" title="계약 만기"><input name="note" placeholder="메모" class="wide">' +
            '</div><button class="btn btn-ink btn-sm" id="u-save">호실 추가</button> <button type="button" class="btn btn-outline btn-sm" id="u-reset" hidden>취소</button></form>' : '') + '</div>';
      } else if (isPartner()) html += '<div class="card"><h2>층별 임대 현황</h2><p class="muted-s">임대 현황 열람 권한이 없습니다. 필요하면 공백에 요청해 주세요.</p></div>';
      el.innerHTML = html;
      if (isAdmin() && !ro()) {
        var bf = $('#b-form', el);
        $('#b-edit', el).onclick = function () { bf.hidden = false; $('#b-view', el).hidden = true; };
        $('#b-cancel', el).onclick = function () { bf.hidden = true; $('#b-view', el).hidden = false; };
        bf.onsubmit = function (e) {
          e.preventDefault(); var b = { id: P.id, action: 'update' };
          ['title', 'address', 'building_name', 'building_use', 'scale', 'land_area', 'gross_area', 'built_year', 'vacancy', 'request', 'goal', 'finance', 'internal_memo', 'start_date', 'due_date', 'priority'].forEach(function (k) { b[k] = bf.elements[k].value; });
          b.kinds = $$('input[name=kinds]:checked', bf).map(function (c) { return c.value; });
          api('/api/center/project', b).then(function (j) { if (j.ok) { toast('저장했습니다.'); load(true); } });
        };
        var uf = $('#u-form', el);
        if (uf) {
          var E = uf.elements;
          uf.onsubmit = function (e) {
            e.preventDefault(); var b = { project_id: P.id, action: 'save' };
            ['id', 'floor', 'unit', 'area', 'use', 'tenant', 'status', 'deposit', 'rent', 'mgmt', 'lease_end', 'note'].forEach(function (k) { b[k] = E[k].value; });
            api('/api/center/units', b).then(function (j) { if (j.ok) { toast('저장했습니다.'); load(true); } });
          };
          $('#u-reset', el).onclick = function () { uf.reset(); E.id.value = ''; $('#u-save', el).textContent = '호실 추가'; $('#u-reset', el).hidden = true; };
          $$('[data-uedit]', el).forEach(function (b) { b.onclick = function () {
            var u = D.units.filter(function (x) { return x.id === +b.dataset.uedit; })[0];
            ['id', 'floor', 'unit', 'area', 'use', 'tenant', 'status', 'deposit', 'rent', 'mgmt', 'lease_end', 'note'].forEach(function (k) { E[k].value = u[k] == null ? '' : u[k]; });
            $('#u-save', el).textContent = '수정 저장'; $('#u-reset', el).hidden = false; uf.scrollIntoView({ block: 'center' });
          }; });
          $$('[data-udel]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 호실을 삭제할까요?')) api('/api/center/units', { project_id: P.id, action: 'delete', id: +b.dataset.udel }).then(function (j) { if (j.ok) load(true); }); }; });
        }
      }
    }

    /* ---------- 추진사항 ---------- */
    function ownerOptions(cur) {
      var o = [['gb', '공백']];
      D.members.filter(function (m) { return m.status === undefined || m.status === 'active'; }).forEach(function (m) { o.push(['m:' + m.id, isAdmin() ? m.alias + ' · ' + m.name : m.label]); });
      if (D.landlord || isAdmin() && D.project.landlord_id) o.push(['l', isAdmin() ? '임대인' + (D.landlord ? ' ' + D.landlord.name : '') : '임대인']);
      return o.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === cur ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
    }
    function visOptions(cur) {
      var o = isAdmin() ? { team: '참여자 공유', all: '임대인에게도 보임', internal: '공백 내부' } : has('publish') ? { team: '참여자 공유', all: '임대인에게도 보임' } : { team: '참여자 공유' };
      return opts(o, cur);
    }
    function tasksTab(el) {
      var T = D.tasks, td = today(), meId = isPartner() ? 'm:' + V().member_id : null;
      var counts = { all: T.length, open: T.filter(function (t) { return t.status !== 'done'; }).length, mine: T.filter(function (t) { return t.mine; }).length, late: T.filter(function (t) { return t.status !== 'done' && t.due_date && t.due_date < td; }).length, done: T.filter(function (t) { return t.status === 'done'; }).length };
      var F = { all: '전체', open: '남은 일', mine: '내 담당', late: '지연', done: '완료' };
      if (isAdmin()) delete F.mine;
      var list = T.filter(function (t) { return taskFilter === 'all' ? true : taskFilter === 'open' ? t.status !== 'done' : taskFilter === 'mine' ? t.mine : taskFilter === 'late' ? (t.status !== 'done' && t.due_date && t.due_date < td) : t.status === 'done'; });
      var html = '';
      if (canTasks()) {
        html += '<form class="card pj-task-form" id="t-form"><h2>추진사항 추가' + (isAdmin() ? ' <small><button type="button" class="pj-link" id="t-tpl">유형별 기본 항목 넣기</button></small>' : '') + '</h2><div class="pj-tgrid">' +
          '<input name="title" placeholder="할 일 (예: 매수 후보 3곳 투어)" required maxlength="200" class="wide">' +
          '<select name="phase" title="단계"><option value="">단계</option>' + PHASES.map(function (p) { return '<option>' + p + '</option>'; }).join('') + '</select>' +
          '<select name="owner" title="담당">' + ownerOptions('gb') + '</select><input type="date" name="due_date" title="기한">' +
          '<select name="kind"><option value="task">일반</option><option value="doc">자료 요청</option></select><select name="visibility">' + visOptions('team') + '</select>' +
          '<input name="detail" placeholder="설명 (선택)" class="wide"></div>' +
          '<div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify" checked> 담당자(파트너·임대인)에게 메일로 알리기</label><button class="btn btn-ink btn-sm">추가</button></div>' +
          '<p class="muted-s">담당을 임대인으로 정하면 임대인 화면에 “요청드린 자료”로 보이고, 임대인이 파일을 올리면 자동으로 완료됩니다.</p></form>';
      }
      html += '<div class="pills" id="t-pills">' + Object.keys(F).map(function (k) { return '<button type="button" data-f="' + k + '" aria-pressed="' + (k === taskFilter) + '">' + F[k] + '<span class="c">' + counts[k] + '</span></button>'; }).join('') + '</div>';
      var groups = PHASES.concat(['']);
      html += groups.map(function (g) {
        var rows = list.filter(function (t) { return (t.phase || '') === g; }); if (!rows.length) return '';
        return '<div class="pj-phase"><h3>' + (g || '기타') + '<span>' + rows.filter(function (t) { return t.status === 'done'; }).length + '/' + rows.length + '</span></h3><ul class="pj-tasks">' + rows.map(function (t) {
          var late = t.status !== 'done' && t.due_date && t.due_date < td;
          var editable = !ro() && (canTasks() || t.mine);
          var att = D.files.filter(function (f) { return f.task_id === t.id; });
          return '<li class="' + (t.status === 'done' ? 'is-done' : '') + (late ? ' is-late' : '') + '" data-id="' + t.id + '">' +
            '<div class="tk-main">' + (editable ? '<select class="tk-sel st-' + t.status + '" data-tst="' + t.id + '">' + opts(TASK_ST, t.status) + '</select>' : '<span class="tk-st st-' + t.status + '">' + TASK_ST[t.status] + '</span>') +
            '<div class="tk-body"><b>' + (t.kind === 'doc' ? chip('자료 요청', 'doc') : '') + esc(t.title) + '</b>' + (t.detail ? '<p>' + esc(t.detail) + '</p>' : '') +
            (att.length ? '<p class="tk-files">' + att.map(function (f) { return '<a href="/api/center/files?id=' + f.id + '">' + esc(f.name) + '</a>'; }).join(' · ') + '</p>' : '') + '</div>' +
            '<div class="tk-side"><span class="tk-o">' + esc(t.owner_label) + '</span><span class="tk-d' + (late ? ' late' : '') + '">' + esc(t.due_date || '기한 없음') + '</span>' +
            (!isLandlord() && t.visibility ? chip({ internal: '공백 내부', team: '참여자', all: '임대인 공개' }[t.visibility], 'aud-' + t.visibility) : '') + '</div></div>' +
            (canTasks() || (t.mine && t.kind === 'doc' && !ro()) ? '<div class="tk-acts">' + (t.mine && t.kind === 'doc' && t.status !== 'done' && !ro() ? '<label class="pj-link">파일 올리기<input type="file" data-task="' + t.id + '" hidden></label>' : '') +
              (canTasks() ? '<button type="button" class="pj-link" data-tedit="' + t.id + '">수정</button><button type="button" class="pj-link danger" data-tdel="' + t.id + '">삭제</button>' : '') + '</div>' : '') +
            '</li>';
        }).join('') + '</ul></div>';
      }).join('') || '<div class="pj-empty">해당하는 추진사항이 없습니다.</div>';
      el.innerHTML = html;

      $$('#t-pills button', el).forEach(function (b) { b.onclick = function () { taskFilter = b.dataset.f; tasksTab(el); }; });
      $$('[data-tst]', el).forEach(function (s) { s.onchange = function () { api('/api/center/tasks', { project_id: id, action: 'update', id: +s.dataset.tst, status: s.value }).then(function (j) { if (j.ok) load(true); }); }; });
      $$('input[type=file][data-task]', el).forEach(function (inp) { inp.onchange = function () { if (inp.files[0]) uploadFile(inp.files[0], { task_id: inp.dataset.task }); }; });
      $$('[data-tdel]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 추진사항을 삭제할까요?')) api('/api/center/tasks', { project_id: id, action: 'delete', id: +b.dataset.tdel }).then(function (j) { if (j.ok) load(true); }); }; });
      $$('[data-tedit]', el).forEach(function (b) { b.onclick = function () {
        var t = D.tasks.filter(function (x) { return x.id === +b.dataset.tedit; })[0], li = b.closest('li');
        if ($('.tk-edit', li)) return;
        var f = document.createElement('form'); f.className = 'tk-edit pj-tgrid';
        f.innerHTML = '<input name="title" value="' + esc(t.title) + '" class="wide" required><select name="phase"><option value="">단계</option>' + PHASES.map(function (p) { return '<option' + (p === t.phase ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
          '<select name="owner">' + ownerOptions(t.owner) + '</select><input type="date" name="due_date" value="' + esc(t.due_date || '') + '"><select name="kind"><option value="task">일반</option><option value="doc"' + (t.kind === 'doc' ? ' selected' : '') + '>자료 요청</option></select>' +
          '<select name="visibility">' + visOptions(t.visibility || 'team') + '</select><input name="detail" value="' + esc(t.detail || '') + '" placeholder="설명" class="wide"><div class="wide"><button class="btn btn-ink btn-sm">저장</button> <button type="button" class="btn btn-outline btn-sm" data-x>취소</button></div>';
        li.appendChild(f);
        $('[data-x]', f).onclick = function () { f.remove(); };
        f.onsubmit = function (e) { e.preventDefault(); var E = f.elements; api('/api/center/tasks', { project_id: id, action: 'update', id: t.id, title: E.title.value, phase: E.phase.value, owner: E.owner.value, due_date: E.due_date.value, kind: E.kind.value, visibility: E.visibility.value, detail: E.detail.value }).then(function (j) { if (j.ok) { toast('저장했습니다.'); load(true); } }); };
      }; });
      var tf = $('#t-form', el);
      if (tf) {
        tf.elements.owner.onchange = function () { if (tf.elements.owner.value === 'l') { tf.elements.kind.value = 'doc'; tf.elements.visibility.value = 'all'; } };
        tf.onsubmit = function (e) {
          e.preventDefault(); var E = tf.elements;
          api('/api/center/tasks', { project_id: id, action: 'create', title: E.title.value, phase: E.phase.value, owner: E.owner.value, due_date: E.due_date.value, kind: E.kind.value, visibility: E.visibility.value, detail: E.detail.value, notify: E.notify.checked })
            .then(function (j) { if (j.ok) { toast('추가했습니다.' + (j.mailed ? ' 알림 메일을 보냈습니다.' : '')); load(true); } });
        };
        var tpl = $('#t-tpl', el); if (tpl) tpl.onclick = function () {
          var ks = String(D.project.kinds || '').split(',').filter(Boolean);
          if (!ks.length) { toast('건물·임대 탭에서 의뢰 유형을 먼저 정해 주세요.', true); return; }
          api('/api/center/tasks', { project_id: id, action: 'template', kinds: ks }).then(function (j) { if (j.ok) { toast(j.added ? '기본 항목 ' + j.added + '건을 넣었습니다.' : '더 넣을 기본 항목이 없습니다.'); load(true); } });
        };
      }
    }

    /* ---------- 소통 ---------- */
    function audChoices() {
      if (isAdmin()) return [['team', '참여자 공유', '공백과 참여 파트너'], ['all', '임대인까지 공유', '임대인에게는 별칭·가림 적용'], ['direct', '1:1', '한 사람에게만'], ['internal', '공백 내부', '관리자만 보는 메모']];
      if (isPartner()) return [['team', '참여자 공유', '공백과 참여 파트너'], ['all', has('publish') ? '임대인에게도 공유' : '임대인 공유 요청', has('publish') ? '임대인에게 바로 공유' : '공백 확인 후 임대인에게 공개'], ['direct', '공백에게만', '공백과 1:1']];
      return [['all', '프로젝트 팀에 남기기', '공백과 담당 파트너가 함께 봅니다'], ['direct', '공백에게만', '공백만 봅니다']];
    }
    function feed(el) {
      var tops = D.posts.filter(function (p) { return !p.parent_id; });
      var replies = function (pid) { return D.posts.filter(function (p) { return p.parent_id === pid; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }); };
      var F = isAdmin() ? { all: '전체', pending: '승인 대기', landlord: '임대인 공유', direct: '1:1', internal: '내부 메모' } : null;
      var pendIds = {}; D.posts.forEach(function (p) { if (p.status === 'pending') pendIds[p.parent_id || p.id] = 1; });
      var shown = tops.filter(function (p) {
        if (!F || feedFilter === 'all') return true;
        if (feedFilter === 'pending') return pendIds[p.id];
        if (feedFilter === 'landlord') return p.audience === 'all';
        return p.audience === feedFilter;
      });
      var A = audChoices(), html = '';
      if (!ro()) {
        html += '<form class="card pj-compose" id="c-form"><h2>' + (isLandlord() ? '공백에 문의·요청하기' : '글 남기기') + '</h2><div class="pj-aud">' + A.map(function (a, i) { return '<label><input type="radio" name="audience" value="' + a[0] + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + a[1] + '</b><em>' + a[2] + '</em></span></label>'; }).join('') + '</div>' +
          (isAdmin() ? '<div class="pj-row" id="c-direct" hidden><select name="direct_to"><option value="">받는 사람</option>' + D.members.filter(function (m) { return m.status === 'active'; }).map(function (m) { return '<option value="m:' + m.id + '">' + esc(m.alias + ' · ' + m.name) + '</option>'; }).join('') + (D.landlord ? '<option value="l">임대인 ' + esc(D.landlord.name) + '</option>' : '') + '</select></div>' : '') +
          '<div class="pj-row"><select name="kind">' + (isLandlord() ? opts({ request: '문의·요청', opinion: '의견' }, 'request') : opts({ opinion: '의견·검토', report: '진행 보고', request: '요청·질문', decision: '결정 사항' }, 'opinion')) + '</select></div>' +
          '<textarea name="body" rows="4" required placeholder="' + (isLandlord() ? '궁금하신 점이나 요청하실 내용을 남겨 주세요. 공백이 확인하고 답변드립니다.' : '검토 의견, 진행 상황, 요청 사항을 남겨 주세요.') + '"></textarea>' +
          '<p class="muted-s pj-hint" id="c-hint"></p>' +
          '<div class="pj-form-foot">' + (isAdmin() ? '<label class="pj-mini"><input type="checkbox" name="notify"> 받는 사람에게 메일로 알리기</label>' : '<span class="muted-s">' + (isLandlord() ? '남기신 글은 공백에 바로 전달됩니다.' : '글은 공백에 바로 알려집니다.') + '</span>') + '<button class="btn btn-ink btn-sm">올리기</button></div></form>';
      }
      if (F) html += '<div class="pills" id="f-pills">' + Object.keys(F).map(function (k) { var n = k === 'pending' ? Object.keys(pendIds).length : 0; return '<button type="button" data-f="' + k + '" aria-pressed="' + (k === feedFilter) + '">' + F[k] + (n ? '<span class="c">' + n + '</span>' : '') + '</button>'; }).join('') + '</div>';
      html += shown.length ? '<ul class="pj-feed">' + shown.map(function (p) { return '<li>' + postCard(p) + '<ul class="pj-replies">' + replies(p.id).map(function (r) { return '<li>' + postCard(r) + '</li>'; }).join('') + '</ul>' +
        (!ro() && (p.audience !== 'internal' || isAdmin()) ? '<details class="pj-reply"><summary>답글</summary><form data-reply="' + p.id + '"><textarea name="body" rows="2" required></textarea><div class="pj-form-foot"><span class="muted-s">' + (isPartner() && p.audience === 'all' && !has('publish') ? '임대인 공유 글의 답글은 공백 확인 후 공개됩니다.' : '') + '</span>' + (isAdmin() && p.audience !== 'internal' ? '<label class="pj-mini"><input type="checkbox" name="notify"> 메일 알림</label>' : '') + '<button class="btn btn-outline btn-sm">답글 올리기</button></div></form></details>' : '') + '</li>'; }).join('') + '</ul>'
        : '<div class="pj-empty">' + (feedFilter === 'pending' ? '승인 대기 글이 없습니다.' : '아직 글이 없습니다.') + '</div>';
      el.innerHTML = html;

      var cf = $('#c-form', el);
      if (cf) {
        var hint = function () {
          var a = (cf.querySelector('input[name=audience]:checked') || {}).value, h = '';
          if (isAdmin() && a === 'all') h = '임대인에게는 파트너 이름·회사명이 별칭으로 바뀌고, 공백 외 연락처는 [연락처 비공개]로 가려집니다.';
          if (isPartner() && a === 'all') h = has('publish') ? '임대인에게 바로 보입니다. 회사명·연락처는 자동으로 가려집니다.' : '공백이 확인한 뒤 임대인에게 공개됩니다. 회사명·연락처는 쓰지 않아도 됩니다.';
          if (isPartner() && a === 'team') h = '공백과 이 프로젝트의 참여 파트너가 봅니다.' + (has('team') ? '' : ' 다른 파트너에게는 별칭으로 표시됩니다.');
          if (isLandlord() && a === 'all') h = '연락처는 공백 외에는 공유되지 않습니다.';
          $('#c-hint', el).textContent = h;
          var dr = $('#c-direct', el); if (dr) dr.hidden = a !== 'direct';
          if (isAdmin() && cf.notify) cf.notify.checked = a === 'all' || a === 'direct';
        };
        $$('input[name=audience]', cf).forEach(function (r) { r.onchange = hint; }); hint();
        cf.onsubmit = function (e) {
          e.preventDefault(); var a = cf.querySelector('input[name=audience]:checked').value;
          if (isAdmin() && a === 'direct' && !cf.direct_to.value) { toast('받는 사람을 선택해 주세요.', true); return; }
          var btn = $('button.btn', cf); btn.disabled = true;
          api('/api/center/posts', { project_id: id, action: 'create', audience: a, direct_to: cf.direct_to ? cf.direct_to.value : '', kind: cf.kind.value, body: cf.body.value, notify: cf.notify ? cf.notify.checked : false }).then(function (j) {
            btn.disabled = false;
            if (j.ok) { toast(j.status === 'pending' ? '올렸습니다. 공백 확인 후 임대인에게 공개됩니다.' : '올렸습니다.' + (j.mailed ? ' 메일 ' + j.mailed + '통 발송' : '')); load(true); }
          });
        };
      }
      $$('#f-pills button', el).forEach(function (b) { b.onclick = function () { feedFilter = b.dataset.f; feed(el); }; });
      $$('form[data-reply]', el).forEach(function (f) { f.onsubmit = function (e) { e.preventDefault(); api('/api/center/posts', { project_id: id, action: 'create', parent_id: +f.dataset.reply, body: f.body.value, notify: f.notify ? f.notify.checked : false }).then(function (j) { if (j.ok) { toast(j.status === 'pending' ? '답글을 올렸습니다. 공백 확인 후 임대인에게 공개됩니다.' : '답글을 올렸습니다.'); load(true); } }); }; });
      $$('[data-pdel]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 글을 삭제할까요? 답글도 함께 지워집니다.')) api('/api/center/posts', { project_id: id, action: 'delete', id: +b.dataset.pdel }).then(function (j) { if (j.ok) load(true); }); }; });
      $$('[data-prej]', el).forEach(function (b) { b.onclick = function () { if (confirm('임대인에게 공개하지 않고, 참여자 공유 글로 남길까요?')) api('/api/center/posts', { project_id: id, action: 'reject', id: +b.dataset.prej }).then(function (j) { if (j.ok) { toast('참여자 공유로 남겼습니다.'); load(true); } }); }; });
      $$('[data-papp]', el).forEach(function (b) { b.onclick = function () {
        var p = D.posts.filter(function (x) { return x.id === +b.dataset.papp; })[0], box = b.closest('.pj-post');
        if ($('.pj-approve', box)) return;
        var f = document.createElement('form'); f.className = 'pj-approve';
        f.innerHTML = '<p class="muted-s">임대인에게 보이기 전에 내용을 다듬을 수 있습니다. 파트너 이름·회사명은 별칭으로, 연락처는 자동으로 가려집니다.</p><textarea name="body" rows="4">' + esc(p.body) + '</textarea>' +
          '<div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify" checked> 임대인에게 메일 알림</label><button class="btn btn-primary btn-sm">임대인에게 공개</button></div>';
        box.appendChild(f);
        f.onsubmit = function (e) { e.preventDefault(); api('/api/center/posts', { project_id: id, action: 'approve', id: p.id, body: f.body.value, notify: f.notify.checked }).then(function (j) { if (j.ok) { toast('임대인에게 공개했습니다.'); load(true); } }); };
      }; });
    }
    function postCard(p) {
      var canDel = !ro() && (isAdmin() || p.own);
      var acts = '';
      if (isAdmin() && !ro() && p.status === 'pending') acts += '<button type="button" class="btn btn-primary btn-sm" data-papp="' + p.id + '">검토 후 공개</button><button type="button" class="pj-link" data-prej="' + p.id + '">임대인 비공개</button>';
      else if (isAdmin() && !ro() && p.author_type !== 'admin' && p.author_type !== 'landlord' && p.audience === 'team' && !p.parent_id) acts += '<button type="button" class="pj-link" data-papp="' + p.id + '">임대인에게도 공유</button>';
      if (canDel) acts += '<button type="button" class="pj-link danger" data-pdel="' + p.id + '">삭제</button>';
      var cls = 'pj-post' + (p.own ? ' own' : '') + (p.status === 'pending' ? ' pending' : '') + (p.author_type === 'admin' || (isLandlord() && p.author === '공백') ? ' gb' : '');
      return '<article class="' + cls + '"><header><b>' + esc(p.author) + '</b>' + (p.kind && p.kind !== 'reply' ? chip(POST_KIND[p.kind], 'kind') : '') +
        (!isLandlord() ? chip(p.audience === 'direct' ? (p.direct_label || '1:1') : AUD[p.audience], 'aud-' + p.audience) : (p.audience === 'direct' ? chip('공백과 1:1', 'aud-direct') : '')) +
        (p.status === 'pending' ? chip(isAdmin() ? '임대인 공개 승인 대기' : '공백 확인 중', 'hot') : '') + '<time title="' + dt(p.created_at) + '">' + ago(p.created_at) + '</time></header><div class="pj-post-body">' + nl(p.body) + '</div>' +
        (acts ? '<footer>' + acts + '</footer>' : '') + '</article>';
    }

    /* ---------- 자료실 ---------- */
    function uploadFile(file, extra) {
      if (file.size > 10 * 1048576) { toast('파일은 10MB 이하만 올릴 수 있습니다.', true); return; }
      var fd = new FormData(); fd.append('project_id', id); fd.append('file', file);
      Object.keys(extra || {}).forEach(function (k) { if (extra[k] != null) fd.append(k, extra[k]); });
      toast('올리는 중…');
      return req('POST', '/api/center/files', fd, true).then(function (j) {
        if (!j.ok) { toast(errText(j), true); return; }
        toast(isLandlord() ? '올렸습니다. 공백이 확인한 뒤 필요한 담당자와 공유합니다.' : j.status === 'pending' ? '올렸습니다. 공백 확인 후 임대인에게 공개됩니다.' : '올렸습니다.');
        load(true);
      });
    }
    function files(el) {
      var FL = D.files, canUp = !ro() && (isAdmin() || isLandlord() || (isPartner() && has('upload')));
      var html = '';
      if (canUp) {
        html += '<form class="card pj-up" id="f-form"><h2>' + (isLandlord() ? '자료 보내기' : '자료 올리기') + '</h2><div class="pj-tgrid"><input type="file" name="file" required class="wide"><select name="category">' + opts(FILE_CAT, 'etc') + '</select>' +
          (!isLandlord() ? '<select name="audience">' + (isAdmin() ? opts({ team: '참여자 공유', all: '임대인까지 공유', internal: '공백 내부' }, 'team') : opts({ team: '참여자 공유', all: has('publish') ? '임대인까지 공유' : '임대인 공유 요청', internal: '공백에게만' }, 'team')) + '</select>' : '') +
          '<input name="note" placeholder="설명 (선택)" maxlength="300" class="wide"></div><div class="pj-form-foot"><span class="muted-s">' +
          (isLandlord() ? '올리신 자료는 공백이 먼저 확인하고, 필요한 담당자와만 공유합니다.' : isPartner() ? '임대인 공유 자료는 파일 안의 회사명·연락처까지 공백이 확인한 뒤 공개합니다.' : '임대인 공유 자료는 파일 안의 파트너 회사명·연락처를 확인하고 올려 주세요. (10MB 이하)') +
          '</span><button class="btn btn-ink btn-sm">올리기</button></div></form>';
      } else if (isPartner() && !has('files')) html += '<div class="pj-empty">자료실 열람 권한이 없습니다. 본인이 올린 자료만 보입니다.</div>';
      var pend = isAdmin() ? FL.filter(function (f) { return f.status === 'pending'; }) : [];
      if (pend.length) {
        html += '<div class="card pj-alert"><h2>확인이 필요한 자료 <small>' + pend.length + '건</small></h2><ul class="pj-pend">' + pend.map(function (f) {
          return '<li><div><a href="/api/center/files?id=' + f.id + '"><b>' + esc(f.name) + '</b></a><p class="muted-s">' + esc(f.by) + ' · ' + dt(f.created_at) + ' · ' + size(f.size) + (f.note ? ' · ' + esc(f.note) : '') + '</p><p class="muted-s">' + (f.audience === 'all' ? '임대인 공개를 요청했습니다. 파일 안에 회사명·연락처가 없는지 확인해 주세요.' : '임대인이 보낸 자료입니다. 누구와 공유할지 정해 주세요.') + '</p></div>' +
            '<div class="pj-pend-acts"><select data-faud="' + f.id + '">' + opts({ internal: '공백만', team: '참여자 공유', all: '임대인 포함' }, f.audience === 'internal' ? 'team' : f.audience) + '</select><button type="button" class="btn btn-primary btn-sm" data-fset="' + f.id + '">확인·공유</button></div></li>';
        }).join('') + '</ul></div>';
      }
      var rest = isAdmin() ? FL.filter(function (f) { return f.status !== 'pending'; }) : FL;
      html += '<div class="tbl-wrap"><table class="tbl pj-files"><thead><tr><th>자료</th><th>분류</th>' + (!isLandlord() ? '<th>공개 범위</th>' : '') + '<th>올린 사람</th><th class="num">크기</th><th>날짜</th><th></th></tr></thead><tbody>' +
        (rest.length ? rest.map(function (f) {
          var aud = f.audience ? (f.status === 'pending' ? chip('공백 확인 중', 'hot') : chip({ internal: '공백만', team: '참여자', all: '임대인 포함' }[f.audience], 'aud-' + f.audience)) : '';
          return '<tr><td><a class="pj-fname" href="/api/center/files?id=' + f.id + '">' + esc(f.name) + '</a>' + (f.note ? '<div class="age">' + esc(f.note) + '</div>' : '') + '</td><td class="nw">' + esc(FILE_CAT[f.category] || '') + '</td>' +
            (!isLandlord() ? '<td class="nw">' + (isAdmin() && !ro() ? '<select data-faud2="' + f.id + '">' + opts({ internal: '공백만', team: '참여자', all: '임대인 포함' }, f.audience) + '</select>' : aud) + '</td>' : '') +
            '<td class="nw">' + esc(f.by) + '</td><td class="num">' + size(f.size) + '</td><td class="nw">' + day(f.created_at) + '</td><td class="nw">' + (!ro() && (isAdmin() || f.own) ? '<button type="button" class="pj-link danger" data-fdel="' + f.id + '">삭제</button>' : '') + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="7">' + (isLandlord() ? '공유된 자료가 없습니다.' : '아직 자료가 없습니다.') + '</td></tr>') + '</tbody></table></div>';
      el.innerHTML = html;
      var ff = $('#f-form', el);
      if (ff) ff.onsubmit = function (e) { e.preventDefault(); var x = { category: ff.category.value, note: ff.note.value }; if (ff.audience) x.audience = ff.audience.value; uploadFile(ff.file.files[0], x); };
      $$('[data-fset]', el).forEach(function (b) { b.onclick = function () { var s = $('[data-faud="' + b.dataset.fset + '"]', el); api('/api/center/files', { project_id: id, action: 'update', id: +b.dataset.fset, audience: s.value }).then(function (j) { if (j.ok) { toast('공유 범위를 정했습니다.'); load(true); } }); }; });
      $$('[data-faud2]', el).forEach(function (s) { s.onchange = function () { api('/api/center/files', { project_id: id, action: 'update', id: +s.dataset.faud2, audience: s.value }).then(function (j) { if (j.ok) { toast('공개 범위를 바꿨습니다.'); load(true); } }); }; });
      $$('[data-fdel]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 자료를 삭제할까요?')) api('/api/center/files', { project_id: id, action: 'delete', id: +b.dataset.fdel }).then(function (j) { if (j.ok) load(true); }); }; });
    }

    /* ---------- 참여자·권한 (관리자) ---------- */
    function permBoxes(sel, name) {
      return '<div class="pj-perms">' + PERMS.map(function (p) { return '<label title="' + esc(p[2]) + '"><input type="checkbox" name="' + name + '" value="' + p[0] + '"' + (sel.indexOf(p[0]) > -1 ? ' checked' : '') + '><span><b>' + p[1] + '</b><em>' + p[2] + '</em></span></label>'; }).join('') + '</div>' +
        '<div class="pj-presets"><span class="muted-s">빠른 설정</span>' + PRESETS.map(function (p) { return '<button type="button" data-preset="' + p[0] + '">' + p[1] + '</button>'; }).join('') + '</div>';
    }
    function feeFields(m) {
      return '<div class="pj-fees"><label>수수료율 <span><input name="fee_rate" inputmode="decimal" value="' + (m.fee_rate == null ? '' : m.fee_rate) + '">%</span></label>' +
        '<label>기준 <input name="fee_base" list="fee-bases" value="' + esc(m.fee_base || '') + '" placeholder="예: 중개보수"></label>' +
        '<label>성과보수 <input name="success_fee" value="' + esc(m.success_fee || '') + '" placeholder="예: 계약 성사 시 월세 1개월"></label>' +
        '<label>컨설팅비 <span><input name="consulting_fee" inputmode="numeric" value="' + (m.consulting_fee == null ? '' : m.consulting_fee) + '">원</span></label>' +
        '<label class="wide">조건 메모 <input name="fee_note" value="' + esc(m.fee_note || '') + '" placeholder="지급 시점, 부가세 별도 여부 등"></label></div>';
    }
    function wirePresets(scope) { $$('[data-preset]', scope).forEach(function (b) { b.onclick = function () { var p = PRESETS.filter(function (x) { return x[0] === b.dataset.preset; })[0][2]; $$('.pj-perms input', b.closest('form')).forEach(function (c) { c.checked = p.indexOf(c.value) > -1; }); }; }); }
    function people(el) {
      var P = D.project, L = D.landlord;
      var act = D.members.filter(function (m) { return m.status === 'active'; }), gone = D.members.filter(function (m) { return m.status !== 'active'; });
      var html = '<datalist id="fee-bases">' + FEE_BASES.map(function (b) { return '<option value="' + b + '">'; }).join('') + '</datalist><div class="grid2"><div>';
      // 참여 파트너
      html += '<div class="card"><h2>참여 파트너 <small>' + act.length + '명</small></h2>' + (act.length ? '' : '<p class="muted-s">아직 참여 파트너가 없습니다. 아래에서 추가하세요.</p>') + act.map(function (m) {
        return '<form class="pj-member" data-mid="' + m.id + '"><div class="pj-member-head"><div><b>' + esc(m.name) + '</b>' + (m.company ? ' · ' + esc(m.company) : '') + (m.title ? ' <span class="muted-s">' + esc(m.title) + '</span>' : '') +
          '<p class="muted-s">' + esc(m.email || '') + (m.phone ? ' · ' + esc(m.phone) : '') + ' · ' + (m.linked ? '임대인센터 연결됨' : '<span class="late">아직 가입·인증 전</span>') + (m.partner_status === 'paused' ? ' · <span class="late">파트너 이용 중지</span>' : '') + '</p></div>' +
          '<div class="pj-member-acts"><a class="pj-link" href="' + base + id + '?as=m:' + m.id + '">이 파트너 화면 보기</a><button type="button" class="pj-link" data-minv="' + m.id + '">안내 메일</button><button type="button" class="pj-link danger" data-mrm="' + m.id + '">참여 종료</button></div></div>' +
          '<div class="pj-member-row"><label>역할 <select name="role">' + opts(ROLES, m.role) + '</select></label><label>임대인에게 보이는 이름 <input name="alias" value="' + esc(m.alias) + '" maxlength="30"></label></div>' +
          '<h4>열람·작업 권한 <span class="muted-s">건물 기본 정보와 소통은 기본으로 열립니다</span></h4>' + permBoxes(m.perms, 'perms') +
          '<h4>정산 조건 <span class="muted-s">이 파트너에게만 보입니다</span></h4>' + feeFields(m) +
          '<div class="pj-form-foot"><span class="muted-s"></span><button class="btn btn-ink btn-sm">저장</button></div></form>';
      }).join('') + '</div>';
      // 파트너 추가
      html += '<form class="card pj-add" id="m-add"><h2>파트너 추가</h2><div class="pj-member-row"><label class="wide">파트너 <select name="partner_id" required><option value="">불러오는 중…</option></select></label><label>역할 <select name="role">' + opts(ROLES, 'broker') + '</select></label><label>임대인에게 보이는 이름 <input name="alias" placeholder="비우면 자동 (예: 중개 파트너)" maxlength="30"></label></div>' +
        '<h4>열람·작업 권한</h4>' + permBoxes(['leases', 'files', 'upload'], 'perms') + '<p class="muted-s" id="m-fee-hint" style="margin-top:8px">정산 조건은 파트너 기본 조건으로 들어가고, 추가한 뒤 바꿀 수 있습니다.</p>' +
        '<div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify" checked> 참여 요청 메일 보내기</label><button class="btn btn-primary btn-sm">추가</button></div><p class="muted-s">명단에 없는 파트너는 <a href="#/partners">파트너 관리</a>에서 먼저 등록하세요.</p></form>';
      if (gone.length) html += '<details class="card pj-gone"><summary>참여 종료 ' + gone.length + '명</summary><ul class="mini-list">' + gone.map(function (m) { return '<li><span>' + esc(m.name) + (m.company ? ' · ' + esc(m.company) : '') + ' (' + esc(m.alias) + ')</span><button type="button" class="pj-link" data-mback="' + m.partner_id + '" data-role="' + m.role + '">다시 참여</button></li>'; }).join('') + '</ul></details>';
      html += '</div><div>';
      // 임대인
      html += '<div class="card"><h2>임대인 화면</h2>' + (L ? '<dl class="dl"><dt>임대인</dt><dd><a href="#/landlord/' + L.id + '">' + esc(L.name) + '</a>' + (L.company ? ' · ' + esc(L.company) : '') + '</dd><dt>이메일</dt><dd>' + esc(L.email || '미등록') + '</dd><dt>센터 연결</dt><dd>' + (L.linked ? '연결됨' : '가입·인증 전') + (L.invited_at ? ' · 안내 ' + day(L.invited_at) : '') + '</dd></dl>' : '<p class="muted-s">연결된 임대인이 없습니다.</p>') +
        '<label class="pj-switch"><input type="checkbox" id="l-access"' + (P.landlord_access ? ' checked' : '') + '><span>임대인이 이 프로젝트를 볼 수 있음</span></label>' +
        '<div class="pj-btns">' + (L && L.email ? '<button type="button" class="btn btn-outline btn-sm" id="l-invite">임대인센터 안내 메일</button>' : '') + '<a class="btn btn-outline btn-sm" href="' + base + id + '?as=landlord">임대인 화면 미리보기</a></div>' +
        '<form class="inline-form" id="l-change"><select name="landlord_id" style="flex:1"><option value="">불러오는 중…</option></select><button class="btn btn-outline btn-sm">임대인 변경</button></form></div>';
      html += '<div class="card pj-guide"><h2>권한 안내</h2><ul>' +
        '<li><b>임대인 화면</b> 파트너는 “' + '중개 파트너' + '”처럼 별칭으로만 보이고, 회사명·이름·연락처는 글과 파일 이름에서도 자동으로 가려집니다.</li>' +
        '<li><b>파트너 화면</b> 임대인 정보 권한이 없으면 임대인은 “임대인”으로, 참여자 공개 권한이 없으면 다른 파트너는 별칭으로 보입니다.</li>' +
        '<li><b>임대인 공유</b> 파트너가 임대인에게 공유하려는 글·자료는 공백이 확인한 뒤 공개됩니다. 믿을 수 있는 파트너에게만 ‘임대인 직접 공유’를 켜세요.</li>' +
        '<li><b>임대인 정보</b> 임대인 연락처를 파트너에게 열기 전에 임대인의 동의를 받아 주세요.</li></ul></div>';
      html += '</div></div>';
      el.innerHTML = html;
      wirePresets(el);
      $$('form.pj-member', el).forEach(function (f) {
        f.onsubmit = function (e) {
          e.preventDefault(); var E = f.elements;
          api('/api/center/members', { project_id: id, action: 'update', member_id: +f.dataset.mid, role: E.role.value, alias: E.alias.value, perms: $$('input[name=perms]:checked', f).map(function (c) { return c.value; }),
            fee_rate: E.fee_rate.value, fee_base: E.fee_base.value, success_fee: E.success_fee.value, consulting_fee: E.consulting_fee.value, fee_note: E.fee_note.value }).then(function (j) { if (j.ok) { toast('저장했습니다.'); load(true); } });
        };
      });
      $$('[data-mrm]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 파트너의 참여를 종료할까요? 바로 이 프로젝트를 볼 수 없게 됩니다. 남긴 글과 기록은 유지됩니다.')) api('/api/center/members', { project_id: id, action: 'remove', member_id: +b.dataset.mrm }).then(function (j) { if (j.ok) { toast('참여를 종료했습니다.'); load(true); } }); }; });
      $$('[data-minv]', el).forEach(function (b) { b.onclick = function () { api('/api/center/members', { project_id: id, action: 'invite', member_id: +b.dataset.minv }).then(function (j) { if (j.ok) toast('안내 메일을 보냈습니다.'); }); }; });
      $$('[data-mback]', el).forEach(function (b) { b.onclick = function () { api('/api/center/members', { project_id: id, action: 'add', partner_id: +b.dataset.mback, role: b.dataset.role, perms: [] }).then(function (j) { if (j.ok) { toast('다시 참여시켰습니다. 권한을 확인해 주세요.'); load(true); } }); }; });
      var add = $('#m-add', el), partners = [];
      req('GET', '/api/admin/partners').then(function (j) {
        if (!j.ok) return; partners = j.items;
        var inProj = D.members.filter(function (m) { return m.status === 'active'; }).map(function (m) { return m.partner_id; });
        var avail = partners.filter(function (p) { return p.status === 'active' && inProj.indexOf(p.id) < 0; });
        add.partner_id.innerHTML = '<option value="">' + (avail.length ? '파트너 선택' : '추가할 수 있는 파트너가 없습니다') + '</option>' + avail.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name + (p.company ? ' · ' + p.company : '') + ' (' + (ROLES[p.field] || '협력') + ')') + '</option>'; }).join('');
      });
      add.partner_id.onchange = function () {
        var p = partners.filter(function (x) { return x.id === +add.partner_id.value; })[0]; if (!p) return;
        if (ROLES[p.field]) add.role.value = p.field;
        var t = []; if (p.fee_rate != null) t.push('수수료율 ' + p.fee_rate + '%' + (p.fee_base ? '(' + p.fee_base + ')' : '')); if (p.success_fee) t.push('성과보수 ' + p.success_fee); if (p.consulting_fee) t.push('컨설팅비 ' + won(p.consulting_fee));
        $('#m-fee-hint', el).textContent = t.length ? '기본 정산 조건: ' + t.join(' · ') + ' — 추가한 뒤 이 프로젝트에 맞게 바꿀 수 있습니다.' : '이 파트너에게 등록된 기본 정산 조건이 없습니다. 추가한 뒤 입력하세요.';
      };
      add.onsubmit = function (e) {
        e.preventDefault(); if (!add.partner_id.value) { toast('파트너를 선택해 주세요.', true); return; }
        api('/api/center/members', { project_id: id, action: 'add', partner_id: +add.partner_id.value, role: add.role.value, alias: add.alias.value, perms: $$('input[name=perms]:checked', add).map(function (c) { return c.value; }), notify: add.notify.checked })
          .then(function (j) { if (j.ok) { toast("추가했습니다. 임대인에게는 '" + j.alias + "'(으)로 보입니다." + (j.mailed ? ' 참여 요청 메일을 보냈습니다.' : '')); load(true); } });
      };
      $('#l-access', el).onchange = function (e) { api('/api/center/project', { id: id, action: 'access', landlord_access: e.target.checked }).then(function (j) { if (j.ok) toast(e.target.checked ? '임대인이 볼 수 있게 했습니다.' : '임대인 열람을 막았습니다.'); }); };
      var inv = $('#l-invite', el); if (inv) inv.onclick = function () { if (confirm(L.email + ' 로 임대인센터 안내 메일을 보낼까요?')) api('/api/center/project', { id: id, action: 'invite_landlord' }).then(function (j) { if (j.ok) { toast('안내 메일을 보냈습니다.'); load(true); } }); };
      var lc = $('#l-change', el);
      req('GET', '/api/admin/landlords').then(function (j) { if (j.ok) lc.landlord_id.innerHTML = '<option value="">연결 안 함</option>' + j.items.map(function (l) { return '<option value="' + l.id + '"' + (L && L.id === l.id ? ' selected' : '') + '>' + esc(l.name + (l.company ? ' · ' + l.company : '') + (l.email ? ' (' + l.email + ')' : '')) + '</option>'; }).join(''); });
      lc.onsubmit = function (e) { e.preventDefault(); if (confirm('이 프로젝트의 임대인 연결을 바꿀까요?')) api('/api/center/project', { id: id, action: 'landlord', landlord_id: lc.landlord_id.value }).then(function (j) { if (j.ok) { toast('바꿨습니다.'); load(true); } }); };
    }

    /* ---------- 정산 (관리자) ---------- */
    function money(el) {
      var M = D.money || [], mem = D.members;
      var sum = function (dir, sts) { return M.filter(function (x) { return x.direction === dir && sts.indexOf(x.status) > -1; }).reduce(function (a, x) { return a + (x.amount || 0); }, 0); };
      var inAll = sum('in', ['plan', 'due', 'done']), outAll = sum('out', ['plan', 'due', 'done']);
      var mname = function (mid) { var m = mem.filter(function (x) { return x.id === mid; })[0]; return m ? m.name + (m.company ? ' · ' + m.company : '') : '-'; };
      function rows(dir) {
        var L = M.filter(function (x) { return x.direction === dir; });
        return L.length ? L.map(function (x) {
          return '<tr class="' + (x.status === 'cancel' ? 'is-cancel' : '') + '"><td>' + esc(x.label) + (x.memo ? '<div class="age">' + esc(x.memo) + '</div>' : '') + '</td>' + (dir === 'out' ? '<td class="nw">' + esc(mname(x.member_id)) + '</td>' : '') +
            '<td class="num nw">' + (x.base_amount != null && x.rate != null ? '<span class="age">' + won(x.base_amount) + ' × ' + x.rate + '%</span><br>' : '') + '<b>' + won(x.amount) + '</b></td>' +
            '<td><select data-mst="' + x.id + '">' + opts(MONEY_ST, x.status) + '</select></td><td class="nw">' + esc(x.due_date || '-') + '</td><td class="nw">' + esc(x.done_date || '-') + '</td><td class="nw"><button type="button" class="pj-link danger" data-mdel="' + x.id + '">삭제</button></td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="7">등록된 항목이 없습니다.</td></tr>';
      }
      var act = mem.filter(function (m) { return m.status === 'active'; });
      el.innerHTML = '<div class="kpis"><div class="kpi"><div class="l">받을 돈 (예정·청구)</div><div class="v sm">' + won(sum('in', ['plan', 'due'])) + '</div></div><div class="kpi"><div class="l">받은 돈</div><div class="v sm">' + won(sum('in', ['done'])) + '</div></div>' +
        '<div class="kpi"><div class="l">줄 돈 (예정·확정)</div><div class="v sm">' + won(sum('out', ['plan', 'due'])) + '</div></div><div class="kpi' + (inAll - outAll < 0 ? ' hot' : '') + '"><div class="l">예상 차액 (받을 돈 − 줄 돈)</div><div class="v sm">' + won(inAll - outAll) + '</div><div class="s">취소 제외, 세금·비용 별도</div></div></div>' +
        '<div class="grid2"><div>' +
          '<div class="card"><h2>받을 돈 <small>공백이 받는 컨설팅비·성과보수 등</small></h2><div class="tbl-wrap flat"><table class="tbl"><thead><tr><th>항목</th><th class="num">금액</th><th>상태</th><th>예정일</th><th>완료일</th><th></th></tr></thead><tbody>' + rows('in') + '</tbody></table></div></div>' +
          '<div class="card"><h2>줄 돈 <small>파트너 수수료·보수</small></h2><div class="tbl-wrap flat"><table class="tbl"><thead><tr><th>항목</th><th>파트너</th><th class="num">금액</th><th>상태</th><th>예정일</th><th>완료일</th><th></th></tr></thead><tbody>' + rows('out') + '</tbody></table></div></div>' +
        '</div><div>' +
          '<form class="card form-v" id="mo-form"><h2>정산 항목 추가</h2><div class="pj-radio2"><label><input type="radio" name="direction" value="in" checked> 받을 돈</label><label><input type="radio" name="direction" value="out"> 줄 돈</label></div>' +
            '<div class="field" id="mo-member" hidden><label>파트너</label><select name="member_id"><option value="">선택</option>' + act.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name + (m.company ? ' · ' + m.company : '') + ' (' + m.alias + ')') + '</option>'; }).join('') + '</select><p class="muted-s" id="mo-terms"></p></div>' +
            '<div class="field"><label>항목</label><input type="text" name="label" list="mo-labels" placeholder="예: 성과보수"><datalist id="mo-labels"><option value="컨설팅비"><option value="성과보수"><option value="중개보수"><option value="수수료"><option value="착수금"><option value="잔금"></datalist></div>' +
            '<div class="pj-fgrid"><div class="field"><label>기준 금액(원)</label><input type="text" name="base_amount" inputmode="numeric" placeholder="선택"></div><div class="field"><label>비율(%)</label><input type="text" name="rate" inputmode="decimal" placeholder="선택"></div></div>' +
            '<div class="field"><label>금액(원) <span class="muted-s">비우면 기준 금액 × 비율로 계산</span></label><input type="text" name="amount" inputmode="numeric"></div>' +
            '<div class="pj-fgrid"><div class="field"><label>상태</label><select name="status">' + opts(MONEY_ST, 'plan') + '</select></div><div class="field"><label>예정일</label><input type="date" name="due_date"></div></div>' +
            '<div class="field"><label>메모</label><input type="text" name="memo" placeholder="세금계산서, 지급 조건 등"></div><button class="btn btn-ink btn-sm">추가</button></form>' +
          '<div class="card"><h2>파트너별 정산 조건</h2>' + (act.length ? '<ul class="mini-list">' + act.map(function (m) { var t = []; if (m.fee_rate != null) t.push(m.fee_rate + '%' + (m.fee_base ? ' (' + m.fee_base + ')' : '')); if (m.success_fee) t.push('성과 ' + m.success_fee); if (m.consulting_fee) t.push('컨설팅 ' + won(m.consulting_fee)); return '<li><span><b>' + esc(m.name) + '</b> ' + esc(m.alias) + '</span><span class="age">' + esc(t.join(' · ') || '미설정') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">참여 파트너가 없습니다.</p>') + '<p style="margin-top:10px"><a class="pj-more" href="#" data-go="people">조건 바꾸기</a></p></div>' +
        '</div></div>';
      var f = $('#mo-form', el), E = f.elements;
      function calc() { var b = parseFloat(String(E.base_amount.value).replace(/[^\d.]/g, '')), r = parseFloat(E.rate.value); E.amount.placeholder = (b && r) ? won(Math.round(b * r / 100)) + ' (자동)' : ''; }
      $$('input[name=direction]', f).forEach(function (r) { r.onchange = function () { $('#mo-member', el).hidden = E.direction.value !== 'out'; }; });
      E.member_id.onchange = function () { var m = act.filter(function (x) { return x.id === +E.member_id.value; })[0]; if (!m) return; if (m.fee_rate != null) E.rate.value = m.fee_rate; $('#mo-terms', el).textContent = [m.fee_base ? '기준: ' + m.fee_base : '', m.success_fee ? '성과보수: ' + m.success_fee : '', m.consulting_fee ? '컨설팅비: ' + won(m.consulting_fee) : ''].filter(Boolean).join(' · '); calc(); };
      E.base_amount.oninput = calc; E.rate.oninput = calc;
      f.onsubmit = function (e) { e.preventDefault(); api('/api/center/money', { project_id: id, action: 'save', direction: E.direction.value, member_id: E.member_id.value, label: E.label.value, base_amount: E.base_amount.value, rate: E.rate.value, amount: E.amount.value, status: E.status.value, due_date: E.due_date.value, memo: E.memo.value }).then(function (j) { if (j.ok) { toast('추가했습니다.'); load(true); } }); };
      $$('[data-mst]', el).forEach(function (s) { s.onchange = function () { var x = M.filter(function (y) { return y.id === +s.dataset.mst; })[0]; api('/api/center/money', { project_id: id, action: 'save', id: x.id, direction: x.direction, member_id: x.member_id, label: x.label, base_amount: x.base_amount, rate: x.rate, amount: x.amount, status: s.value, due_date: x.due_date, done_date: s.value === 'done' ? (x.done_date || today()) : '', memo: x.memo }).then(function (j) { if (j.ok) { toast('상태를 바꿨습니다.'); load(true); } }); }; });
      $$('[data-mdel]', el).forEach(function (b) { b.onclick = function () { if (confirm('이 정산 항목을 삭제할까요?')) api('/api/center/money', { project_id: id, action: 'delete', id: +b.dataset.mdel }).then(function (j) { if (j.ok) load(true); }); }; });
      $$('[data-go]', el).forEach(function (a) { a.onclick = function (e) { e.preventDefault(); go(a.dataset.go); }; });
    }

    /* ---------- 내 조건 (파트너) ---------- */
    function terms(el) {
      var T = D.terms || {}, M = D.money || [];
      el.innerHTML = '<div class="grid2"><div><div class="card"><h2>이 프로젝트의 정산 조건</h2><dl class="dl"><dt>역할</dt><dd>' + esc(ROLES[T.role] || '') + '</dd><dt>수수료율</dt><dd>' + (T.fee_rate != null ? T.fee_rate + '%' + (T.fee_base ? ' (기준: ' + esc(T.fee_base) + ')' : '') : '-') + '</dd>' +
        '<dt>성과보수</dt><dd>' + esc(T.success_fee || '-') + '</dd><dt>컨설팅비</dt><dd>' + (T.consulting_fee ? won(T.consulting_fee) : '-') + '</dd>' + (T.fee_note ? '<dt>메모</dt><dd>' + esc(T.fee_note) + '</dd>' : '') + '</dl><p class="muted-s" style="margin-top:12px">조건은 공백과 맺은 계약을 따릅니다. 바뀐 내용이 있으면 소통 탭의 ‘공백에게만’으로 알려 주세요.</p></div>' +
        '<div class="card"><h2>지급 내역</h2>' + (M.length ? '<ul class="mini-list">' + M.map(function (x) { return '<li><span>' + esc(x.label) + ' · <b>' + won(x.amount) + '</b></span><span class="age">' + MONEY_ST[x.status] + (x.done_date ? ' ' + esc(x.done_date) : x.due_date ? ' · 예정 ' + esc(x.due_date) : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">등록된 지급 내역이 없습니다.</p>') + '</div></div>' +
        '<div><div class="card"><h2>이 프로젝트에서 볼 수 있는 정보</h2><ul class="pj-permview">' + PERMS.map(function (p) { var on = (T.perms || []).indexOf(p[0]) > -1; return '<li class="' + (on ? 'on' : '') + '"><b>' + (on ? '✓' : '–') + '</b><span>' + p[1] + '<em>' + p[2] + '</em></span></li>'; }).join('') + '</ul>' +
        '<p class="muted-s" style="margin-top:12px">임대인에게는 “' + esc(T.alias || '') + '”(으)로 표시되고, 이름·회사명·연락처는 공유되지 않습니다. 임대인과의 소통은 공백을 통해 진행해 주세요.</p></div></div></div>';
    }

    /* ---------- 기록 (관리자) ---------- */
    function logTab(el) {
      var K = { create: '생성', stage: '단계', update: '정보', member: '참여자', task: '추진사항', file: '자료', approve: '승인', reject: '비공개', money: '정산', access: '임대인 열람', invite: '안내 메일', landlord: '임대인', delete: '삭제' };
      el.innerHTML = '<div class="card"><h2>프로젝트 기록 <small>관리자만 볼 수 있습니다</small></h2><ul class="timeline-a">' + ((D.log || []).map(function (x) { return '<li class="k-' + (x.kind === 'stage' ? 'stage' : x.kind === 'file' ? 'doc' : x.kind === 'approve' ? 'email' : '') + '"><div class="meta">' + dt(x.created_at) + ' · ' + (K[x.kind] || x.kind) + (x.actor ? ' · ' + esc(x.actor) : '') + '</div><div class="body">' + esc(x.body) + '</div></li>'; }).join('') || '<li>기록이 없습니다.</li>') + '</ul></div>';
    }

    load();
    return { reload: load };
  }

  window.GBProject = { mount: mount, KINDS: KINDS, ROLES: ROLES, PSTAGES: PSTAGES, STAGE: STAGE, STAGE_EXT: STAGE_EXT, PERMS: PERMS, PRESETS: PRESETS, esc: esc, won: won, day: day, ago: ago, today: today };
})();

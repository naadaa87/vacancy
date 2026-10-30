/* 공백 관리자 앱 (/admin) — 해시 주소로 화면 전환 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var view = $('#view');
  var ME = null, MAIL = false;

  var STAGES = [['new', '신규'], ['review', '검토 중'], ['replied', '1차 회신'], ['site', '현장진단'], ['proposal', '제안'], ['contract', '계약'], ['hold', '보류'], ['closed', '종료']];
  var STAGE = {}; STAGES.forEach(function (s) { STAGE[s[0]] = s[1]; });
  var TYPE = { develop: '공실개발 검토', valueup: '매각 전 밸류업', partner: '파트너 제안', tenant: '입점·운영 등록', other: '기타' };
  var ROLE = { owner: '임대인·건물주', seller: '매각 예정·투자자', broker: '중개', developer: '시행·디벨로퍼', operator: '운영사·브랜드', other: '기타' };
  var KIND = { report: '리포트·분석자료', notice: '안내·공지', newsletter: '뉴스레터' };
  var ERR = { mail_not_configured: '이메일 발송(RESEND_API_KEY)이 설정되지 않았습니다. 설정 점검 메뉴를 확인해 주세요.', mail_failed: '메일 발송에 실패했습니다. Resend 설정과 보내는 주소를 확인해 주세요.',
    file_too_large: '파일은 10MB 이하만 올릴 수 있습니다.', no_recipients: '받는 사람이 없습니다.', validation: '입력값을 확인해 주세요.', forbidden: '관리자 권한이 없습니다.', unauthorized: '로그인이 필요합니다.', server_error: '일시적인 오류가 생겼습니다.' };

  /* ---------- 공통 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kst(iso) { if (!iso) return ''; var d = new Date(iso); d = new Date(d.getTime() + 9 * 3600e3); return d.toISOString(); }
  function dt(iso) { return iso ? kst(iso).replace('T', ' ').slice(0, 16) : ''; }
  function day(iso) { return iso ? kst(iso).slice(0, 10) : ''; }
  function ago(iso) { var h = (Date.now() - new Date(iso).getTime()) / 36e5; if (h < 1) return '방금'; if (h < 24) return Math.floor(h) + '시간 전'; return Math.floor(h / 24) + '일 전'; }
  function size(n) { return !n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function stage(s) { s = s || 'new'; return '<span class="st st-' + s + '">' + esc(STAGE[s] || s) + '</span>'; }
  function toast(msg, isErr) { var t = $('#toast'); t.textContent = msg; t.className = 'adm-toast' + (isErr ? ' err' : ''); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600); }
  function req(method, path, body, isForm) {
    var opt = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { if (isForm) opt.body = body; else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); } }
    return fetch(path, opt).then(function (r) { return r.json().catch(function () { return { ok: false, error: r.status === 404 ? 'not_found' : 'server_error' }; }).then(function (j) { j._status = r.status; return j; }); })
      .catch(function () { return { ok: false, error: 'server_error' }; });
  }
  var get = function (p) { return req('GET', p); }, post = function (p, b) { return req('POST', p, b); };
  function errText(j) { return (j && (j.message || ERR[j.error])) || ERR.server_error; }
  function setTitle(t) { document.title = t + ' — 공백 관리자'; }
  function qs() { var h = location.hash.split('?')[1] || ''; var o = {}; h.split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } }); return o; }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function loading() { view.innerHTML = '<p class="muted-s">불러오는 중…</p>'; }

  /* ---------- 시작: 로그인·권한 확인 ---------- */
  function boot() {
    get('/api/auth/me').then(function (j) {
      $('#boot').hidden = true;
      if (j.configured === false || j._status === 404) return gate('데이터베이스가 아직 연결되지 않았습니다. Cloudflare Pages에 D1 데이터베이스를 변수명 <b>DB</b>로 연결한 뒤 다시 배포해 주세요. <a href="/setup-check">설정 점검</a>');
      if (!j.user) return gate();
      if (!j.user.is_admin) {
        return gate(j.user.email_verified
          ? esc(j.user.email) + ' 계정에는 관리자 권한이 없습니다. Cloudflare 환경변수 <b>ADMIN_EMAILS</b>에 이 이메일을 넣고 다시 배포해 주세요.'
          : '관리자 권한은 이메일 인증을 마친 계정에만 열립니다. <a href="/account">마이페이지</a>에서 인증 메일을 받아 인증해 주세요.', true);
      }
      ME = j.user; MAIL = !!j.mail;
      $('#me-name').textContent = ME.name; $('#me-email').textContent = ME.email;
      $('#gate').hidden = true; $('#app').hidden = false;
      route(); refreshBadge();
    });
  }
  function gate(msg, loggedIn) {
    $('#gate').hidden = false; $('#app').hidden = true;
    var m = $('#gate-msg'); if (msg) { m.innerHTML = msg; m.hidden = false; } else m.hidden = true;
    $('#gate-login').hidden = !!loggedIn;
    if (loggedIn) m.innerHTML += '<p style="margin-top:10px"><button type="button" class="btn btn-outline btn-sm" id="gate-out">다른 계정으로 로그인</button></p>';
    var out = $('#gate-out'); if (out) out.onclick = function () { post('/api/auth/logout', {}).then(function () { location.reload(); }); };
  }
  $('#gate-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, st = $('.form-status', f), btn = $('button', f);
    btn.disabled = true; st.className = 'form-status';
    post('/api/auth/login', { email: f.email.value.trim(), password: f.password.value }).then(function (j) {
      btn.disabled = false;
      if (j.ok) { $('#gate-msg').hidden = true; boot(); }
      else { st.className = 'form-status err'; st.textContent = j.error === 'locked' ? '로그인을 여러 번 실패해 15분 동안 잠겼습니다.' : '이메일 또는 비밀번호가 맞지 않습니다.'; }
    });
  });
  $('#logout').addEventListener('click', function () { post('/api/auth/logout', {}).then(function () { location.href = '/admin'; }); });
  function refreshBadge() {
    get('/api/admin/inquiries?stage=open').then(function (j) {
      if (!j.ok) return; var n = (j.counts.new || 0) + (j.counts.review || 0); var b = $('#nav-open'); b.textContent = n; b.hidden = !n;
    });
    get('/api/admin/center').then(function (j) {
      if (!j.ok) return; var n = (j.counts.pending || 0) + (j.counts.overdue || 0); var b = $('#nav-proj'); b.textContent = n; b.hidden = !n;
    });
  }

  /* ---------- 라우터 ---------- */
  var ROUTES = [
    [/^#?\/?$/, 'dashboard', dashboard],
    [/^#\/inquiries/, 'inquiries', inquiries],
    [/^#\/inquiry\/(\d+)/, 'inquiries', inquiry],
    [/^#\/members/, 'members', members],
    [/^#\/member\/(\d+)/, 'members', member],
    [/^#\/send/, 'send', send],
    [/^#\/documents/, 'documents', documents],
    [/^#\/document\/(\d+)/, 'documents', documentDetail],
    [/^#\/settings/, 'settings', settings],
    [/^#\/projects/, 'projects', projects],
    [/^#\/project\/new/, 'projects', projectNew],
    [/^#\/project\/(\d+)/, 'projects', projectDetail],
    [/^#\/landlords/, 'landlords', landlords],
    [/^#\/landlord\/(\d+)/, 'landlords', landlordDetail],
    [/^#\/partners/, 'partners', partners],
    [/^#\/partner\/(\d+)/, 'partners', partnerDetail],
    [/^#\/finance/, 'finance', finance],
  ];
  function route() {
    if (!ME) return;
    var h = location.hash.split('?')[0] || '#/';
    for (var i = 0; i < ROUTES.length; i++) {
      var m = h.match(ROUTES[i][0]);
      if (m) {
        $$('.adm-nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.nav === ROUTES[i][1]); });
        loading(); window.scrollTo(0, 0);
        ROUTES[i][2](m[1]); return;
      }
    }
    location.hash = '#/';
  }
  window.addEventListener('hashchange', route);

  /* ---------- 대시보드 ---------- */
  function dashboard() {
    setTitle('대시보드');
    Promise.all([get('/api/admin/stats'), get('/api/admin/center')]).then(function (rs) {
      var j = rs[0], C = rs[1].ok ? rs[1] : null;
      if (!j.ok) { view.innerHTML = '<p class="muted-s">' + errText(j) + '</p>'; return; }
      var I = j.inquiries, M = j.members, D = j.deliveries;
      var openRate = D.sent ? Math.round((D.opened || 0) / D.sent * 100) : 0;
      var todo = [];
      if (I.overdue) todo.push(['red', '<a href="#/inquiries?stage=new">신규 문의 ' + I.overdue + '건이 2일 넘게 대기 중</a>', '접수 후 영업일 2~3일 안에 1차 회신을 약속하고 있습니다.']);
      if (I.fresh) todo.push(['amber', '<a href="#/inquiries?stage=new">확인하지 않은 신규 문의 ' + I.fresh + '건</a>', '열어 보고 검토 중 또는 회신 단계로 바꿔 주세요.']);
      if ((I.open || 0) - (I.fresh || 0) > 0) todo.push(['amber', '<a href="#/inquiries?stage=review">검토 중인 문의 ' + (I.open - I.fresh) + '건</a>', '1차 회신이 나가면 자동으로 다음 단계로 바뀝니다.']);
      if (D.failed) todo.push(['red', '<a href="#/documents">메일 발송 실패 ' + D.failed + '건</a>', '받는 사람은 마이페이지(회원)에서 자료를 볼 수 있지만, 메일 설정을 확인해 주세요.']);
      if (!j.setup.mail) todo.push(['red', '<a href="#/settings">이메일 발송이 설정되지 않음</a>', '문의 알림, 고객 회신, 자료 발송 메일이 나가지 않습니다.']);
      else if (!j.setup.from) todo.push(['amber', '<a href="#/settings">보내는 주소(CONTACT_FROM) 미설정</a>', '도메인 인증 전 기본 주소로는 본인 메일로만 발송됩니다.']);
      if (C && C.counts.pending) todo.push(['red', '<a href="#/projects">임대인센터 확인 대기 ' + C.counts.pending + '건</a>', '임대인 공개를 요청한 파트너 글·자료, 임대인이 보낸 자료입니다.']);
      if (C && C.counts.overdue) todo.push(['amber', '<a href="#/projects">기한이 지난 추진사항 ' + C.counts.overdue + '건</a>', '담당 파트너에게 확인하거나 기한을 조정해 주세요.']);
      if (C && C.counts.stale) todo.push(['', '<a href="#/projects">2주 넘게 움직임이 없는 프로젝트 ' + C.counts.stale + '건</a>', '진행 상황을 한 줄이라도 남겨 두면 임대인이 안심합니다.']);
      if (M.unverified) todo.push(['', '<a href="#/members?filter=unverified">이메일 미인증 회원 ' + M.unverified + '명</a>', '필요하면 회원 상세에서 인증 처리할 수 있습니다.']);
      if (!todo.length) todo.push(['green', '<b>지금 처리할 일이 없습니다.</b>', '새 문의가 들어오면 이곳과 메일로 알려드립니다.']);

      // 30일 추이
      var map = {}; (j.series || []).forEach(function (r) { map[r.d] = r.n; });
      var days = [], max = 1; for (var i = 29; i >= 0; i--) { var d = day(new Date(Date.now() - i * 864e5).toISOString()); days.push([d, map[d] || 0]); max = Math.max(max, map[d] || 0); }
      var bars = days.map(function (x, k) { return '<div class="' + (x[1] ? '' : 'z') + (k === 29 ? ' today' : '') + '" style="height:' + Math.max(2, x[1] / max * 100) + '%" title="' + x[0] + ' · ' + x[1] + '건"></div>'; }).join('');
      function hb(rows, label, hi) {
        var tot = rows.reduce(function (a, r) { return a + r.n; }, 0) || 1;
        return rows.length ? '<ul class="hbars">' + rows.map(function (r, k) { return '<li class="' + (hi && k === 0 ? 'pt' : '') + '"><span>' + esc(label(r.k)) + '</span><i style="--w:' + Math.round(r.n / tot * 100) + '%"></i><span class="n">' + r.n + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">아직 데이터가 없습니다.</p>';
      }
      var stageRows = STAGES.map(function (s) { var f = (j.by_stage || []).filter(function (r) { return r.k === s[0]; })[0]; return { k: s[0], n: f ? f.n : 0 }; }).filter(function (r) { return r.n; });

      view.innerHTML =
        '<div class="v-head"><div><h1>대시보드</h1><p>' + esc(ME.name) + '님, ' + day(new Date().toISOString()) + ' 기준입니다.</p></div><div class="acts"><a class="btn btn-primary btn-sm" href="#/send">자료·안내 발송</a></div></div>' +
        '<div class="kpis">' +
          '<a class="kpi' + (I.open ? ' hot' : '') + '" href="#/inquiries?stage=open"><div class="l">처리 대기 문의</div><div class="v">' + (I.open || 0) + '</div><div class="s">신규 ' + (I.fresh || 0) + ' · 검토 중 ' + ((I.open || 0) - (I.fresh || 0)) + '</div></a>' +
          '<a class="kpi" href="#/inquiries"><div class="l">최근 7일 문의</div><div class="v">' + (I.week || 0) + '</div><div class="s">누적 ' + (I.total || 0) + '건</div></a>' +
          '<a class="kpi" href="#/members"><div class="l">회원</div><div class="v">' + (M.total || 0) + '</div><div class="s">최근 7일 +' + (M.week || 0) + ' · 수신 동의 ' + (M.marketing || 0) + '</div></a>' +
          '<a class="kpi" href="#/documents"><div class="l">자료 열람률</div><div class="v">' + openRate + '<small style="font-size:.5em">%</small></div><div class="s">발송 ' + (D.sent || 0) + ' · 열람 ' + (D.opened || 0) + '</div></a>' +
        '</div>' +
        '<div class="grid2"><div>' +
          '<div class="card"><h2>오늘 확인할 일</h2><ul class="todo">' + todo.map(function (t) { return '<li><span class="dot ' + t[0] + '"></span><div>' + t[1] + '<p>' + t[2] + '</p></div></li>'; }).join('') + '</ul></div>' +
          '<div class="card"><h2>최근 30일 문의 <small>오늘 ' + days[29][1] + '건</small></h2><div class="bars-v">' + bars + '</div><div class="bars-v-axis"><span>' + days[0][0].slice(5) + '</span><span>오늘</span></div></div>' +
          '<div class="card"><h2>최근 문의 <small><a href="#/inquiries">전체 보기</a></small></h2><ul class="mini-list">' +
            ((j.recent || []).map(function (r) { return '<li><span><a href="#/inquiry/' + r.id + '">#' + r.id + ' ' + esc(r.name) + '</a> · ' + esc(TYPE[r.type] || r.type) + ' · ' + esc(r.address) + '</span><span>' + stage(r.stage) + '</span></li>'; }).join('') || '<li class="muted-s">아직 문의가 없습니다.</li>') +
          '</ul></div>' +
        '</div><div>' +
          (C ? '<div class="card"><h2>임대인센터 <small><a href="#/projects">프로젝트 ' + C.counts.active + '건 진행 중</a></small></h2>' + hb((C.by_stage || []).filter(function (r) { return r.n; }), function (k) { return (window.GBProject && GBProject.STAGE[k]) || k; }, true) + '</div>' : '') +
          '<div class="card"><h2>문의 진행 단계</h2>' + hb(stageRows, function (k) { return STAGE[k]; }) + '</div>' +
          '<div class="card"><h2>문의 유형</h2>' + hb(j.by_type || [], function (k) { return TYPE[k] || k || '미지정'; }, true) + '</div>' +
          '<div class="card"><h2>고객 구분</h2>' + hb(j.by_role || [], function (k) { return ROLE[k] || k || '미지정'; }) + '</div>' +
        '</div></div>';
    });
  }

  /* ---------- 문의 목록 ---------- */
  function inquiries() {
    setTitle('문의 관리');
    var p = qs(), cur = p.stage || 'all', q = p.q || '';
    view.innerHTML = '<div class="v-head"><div><h1>문의 관리</h1><p>단계를 바꾸고, 고객에게 회신하고, 자료를 보낼 수 있습니다.</p></div><div class="acts"><a class="btn btn-outline btn-sm" id="inq-csv" href="#">엑셀(CSV) 내려받기</a></div></div>' +
      '<div class="pills" id="inq-pills"></div><div class="fbar"><input type="search" id="inq-q" placeholder="이름·연락처·이메일·주소·내용·메모 검색" value="' + esc(q) + '"></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>번호</th><th>접수</th><th>고객</th><th>유형</th><th>공간</th><th>단계</th><th>경과</th></tr></thead><tbody id="inq-body"><tr class="empty-row"><td colspan="7">불러오는 중…</td></tr></tbody></table></div>';
    function load() {
      var url = '/api/admin/inquiries?stage=' + cur + (q ? '&q=' + encodeURIComponent(q) : '');
      $('#inq-csv').href = url + '&format=csv';
      get(url).then(function (j) {
        if (!j.ok) { $('#inq-body').innerHTML = '<tr class="empty-row"><td colspan="7">' + errText(j) + '</td></tr>'; return; }
        var c = j.counts || {}, all = Object.keys(c).reduce(function (a, k) { return a + c[k]; }, 0);
        var tabs = [['all', '전체', all], ['open', '처리 대기', (c.new || 0) + (c.review || 0)]].concat(STAGES.map(function (s) { return [s[0], s[1], c[s[0]] || 0]; }));
        $('#inq-pills').innerHTML = tabs.map(function (t) { return '<button type="button" data-s="' + t[0] + '" aria-pressed="' + (t[0] === cur) + '">' + t[1] + '<span class="c">' + t[2] + '</span></button>'; }).join('');
        $('#inq-body').innerHTML = j.items.length ? j.items.map(function (r) {
          var open = r.stage === 'new' || r.stage === 'review' || !r.stage, hrs = (Date.now() - new Date(r.created_at)) / 36e5;
          return '<tr data-id="' + r.id + '"><td class="nw">#' + r.id + '</td><td class="nw">' + dt(r.created_at) + '</td><td><b>' + esc(r.name) + '</b><div class="age">' + esc(ROLE[r.role] || '') + (r.user_id ? ' · 회원' : '') + '</div></td>' +
            '<td class="nw">' + esc(TYPE[r.type] || r.type) + '</td><td class="ellipsis">' + esc(r.address) + (r.floor_area ? ' · ' + esc(r.floor_area) : '') + '</td><td>' + stage(r.stage) + '</td>' +
            '<td class="nw">' + (open ? '<span class="age' + (hrs > 48 ? ' late' : '') + '">' + ago(r.created_at) + '</span>' : '<span class="age">' + day(r.updated_at || r.created_at) + '</span>') + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="7">' + (cur === 'open' ? '처리 대기 중인 문의가 없습니다.' : '해당하는 문의가 없습니다.') + '</td></tr>';
      });
    }
    $('#inq-pills').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { cur = b.dataset.s; history.replaceState(null, '', '#/inquiries?stage=' + cur); load(); } });
    $('#inq-body').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/inquiry/' + tr.dataset.id; });
    $('#inq-q').addEventListener('input', debounce(function (e) { q = e.target.value.trim(); load(); }, 300));
    load();
  }

  /* ---------- 문의 상세 ---------- */
  var REPLY_TPL = '보내주신 공간 정보를 검토했습니다.\n\n[1차 검토 의견]\n- \n\n[다음 단계 제안]\n- 현장진단을 통해 동선·설비·소음·주변 수요를 확인하고, 가능한 모델별 수지 비교를 드리겠습니다.\n\n편하신 일정을 알려주시면 방문 일정을 잡겠습니다.\n\n공백 드림';
  function inquiry(id) {
    setTitle('문의 #' + id);
    get('/api/admin/inquiry?id=' + id).then(function (j) {
      if (!j.ok) { view.innerHTML = '<a class="back" href="#/inquiries">← 문의 목록</a><p class="muted-s">' + (j.error === 'not_found' ? '문의를 찾을 수 없습니다.' : errText(j)) + '</p>'; return; }
      var r = j.item, m = j.member;
      var tl = j.notes.map(function (n) { return { t: n.created_at, k: n.kind, b: n.body, a: n.author }; })
        .concat([{ t: r.created_at, k: 'in', b: '홈페이지 문의 접수', a: r.name }])
        .sort(function (a, b) { return a.t < b.t ? 1 : -1; });
      var KN = { note: '메모', email: '메일 회신', doc: '자료 발송', stage: '단계 변경', in: '접수' };
      view.innerHTML = '<a class="back" href="#/inquiries">← 문의 목록</a>' +
        '<div class="v-head"><div><h1>' + esc(r.name) + ' <span class="muted-s">#' + r.id + '</span></h1><p>' + dt(r.created_at) + ' 접수 · ' + esc(TYPE[r.type] || r.type) + ' · ' + stage(r.stage) + '</p></div>' +
        '<div class="acts"><a class="btn btn-outline btn-sm" href="tel:' + esc((r.phone || '').replace(/[^0-9+]/g, '')) + '">전화 걸기</a><a class="btn btn-outline btn-sm" href="#/project/new?inquiry=' + r.id + '">임대인센터 프로젝트로 만들기</a><a class="btn btn-primary btn-sm" href="#/send?inquiry=' + r.id + '">자료 보내기</a></div></div>' +
        '<div class="grid2"><div>' +
          '<div class="card"><h2>고객</h2><dl class="dl">' +
            '<dt>이름·소속</dt><dd>' + esc(r.name) + '</dd><dt>구분</dt><dd>' + esc(ROLE[r.role] || r.role || '-') + '</dd>' +
            '<dt>연락처</dt><dd><a href="tel:' + esc((r.phone || '').replace(/[^0-9+]/g, '')) + '">' + esc(r.phone) + '</a></dd>' +
            '<dt>이메일</dt><dd><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></dd>' +
            '<dt>회원</dt><dd>' + (m ? '<a href="#/member/' + m.id + '">' + esc(m.name) + ' (회원 #' + m.id + ')</a>' : '비회원') + '</dd>' +
            '<dt>마케팅 동의</dt><dd>' + (r.marketing ? '동의' : '미동의') + '</dd>' +
            (r.source ? '<dt>유입</dt><dd>' + esc(r.source) + '</dd>' : '') +
          '</dl></div>' +
          '<div class="card"><h2>공간</h2><dl class="dl"><dt>주소</dt><dd>' + esc(r.address) + '</dd><dt>층수·면적</dt><dd>' + esc(r.floor_area || '-') + '</dd><dt>현재 상태</dt><dd>' + esc(r.status || '-') + '</dd><dt>조건·예산</dt><dd>' + esc(r.conditions || '-') + '</dd></dl></div>' +
          '<div class="card"><h2>문의 내용</h2><div class="msg-box">' + esc(r.message) + '</div></div>' +
          (j.others.length ? '<div class="card"><h2>같은 고객의 다른 문의</h2><ul class="mini-list">' + j.others.map(function (o) { return '<li><a href="#/inquiry/' + o.id + '">#' + o.id + ' ' + esc(TYPE[o.type] || o.type) + ' · ' + esc(o.address) + '</a><span>' + stage(o.stage) + '</span></li>'; }).join('') + '</ul></div>' : '') +
          (j.deliveries.length ? '<div class="card"><h2>보낸 자료</h2><ul class="mini-list">' + j.deliveries.map(function (d) { return '<li><a href="#/document/' + d.document_id + '">' + esc(d.title) + '</a><span class="age">' + day(d.sent_at) + (d.opened_at ? ' · 열람' : ' · 미열람') + '</span></li>'; }).join('') + '</ul></div>' : '') +
        '</div><div>' +
          '<div class="card"><h2>진행 단계</h2><div class="stage-pick" id="stage-pick">' + STAGES.map(function (s) { return '<button type="button" data-s="' + s[0] + '" aria-pressed="' + ((r.stage || 'new') === s[0]) + '">' + s[1] + '</button>'; }).join('') + '</div>' +
            '<form class="inline-form" id="memo-form"><input type="text" name="memo" maxlength="1000" placeholder="한 줄 메모 (목록 검색에도 쓰입니다)" value="' + esc(r.admin_memo || '') + '"><button class="btn btn-outline btn-sm">저장</button></form></div>' +
          '<div class="card"><h2>고객에게 메일 회신</h2>' + (MAIL ? '' : '<p class="result-box warn" style="margin:0 0 12px">이메일 발송이 설정되지 않아 회신 메일을 보낼 수 없습니다. <a href="#/settings">설정 점검</a></p>') +
            '<form class="form-v" id="reply-form"><div class="field"><label>제목</label><input type="text" name="subject" value="[공백] 문의하신 공간 1차 검토 회신드립니다" required></div>' +
            '<div class="field"><label>내용 <span class="muted-s">(인사말 “' + esc(r.name) + '님, 안녕하세요. 공백입니다.”는 자동으로 붙습니다)</span></label><textarea name="body" required>' + esc(REPLY_TPL) + '</textarea></div>' +
            '<div class="field"><label>보낸 뒤 단계</label><select name="next_stage"><option value="">자동 (신규·검토 중이면 1차 회신으로)</option>' + STAGES.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select></div>' +
            '<button class="btn btn-ink"' + (MAIL ? '' : ' disabled') + '>회신 메일 보내기</button></form></div>' +
          '<div class="card"><h2>처리 이력</h2><form class="inline-form" id="note-form" style="margin:0 0 10px"><input type="text" name="body" placeholder="통화 내용, 방문 일정 등 기록" required><button class="btn btn-outline btn-sm">기록</button></form>' +
            '<ul class="timeline-a">' + tl.map(function (n) { return '<li class="k-' + n.k + '"><div class="meta">' + dt(n.t) + ' · ' + (KN[n.k] || n.k) + (n.a ? ' · ' + esc(n.a) : '') + '</div><div class="body">' + esc(n.b) + '</div></li>'; }).join('') + '</ul></div>' +
        '</div></div>';

      $('#stage-pick').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        post('/api/admin/inquiry', { id: r.id, stage: b.dataset.s }).then(function (k) { if (k.ok) { toast('단계를 ' + STAGE[b.dataset.s] + '(으)로 바꿨습니다.'); refreshBadge(); inquiry(id); } else toast(errText(k), true); });
      });
      $('#memo-form').addEventListener('submit', function (e) { e.preventDefault(); post('/api/admin/inquiry', { id: r.id, admin_memo: e.target.memo.value }).then(function (k) { toast(k.ok ? '메모를 저장했습니다.' : errText(k), !k.ok); }); });
      $('#note-form').addEventListener('submit', function (e) { e.preventDefault(); var v = e.target.body.value.trim(); if (!v) return; post('/api/admin/notes', { inquiry_id: r.id, body: v }).then(function (k) { if (k.ok) inquiry(id); else toast(errText(k), true); }); });
      $('#reply-form').addEventListener('submit', function (e) {
        e.preventDefault(); var f = e.target;
        if (!confirm(r.email + ' 로 회신 메일을 보낼까요?')) return;
        $('button', f).disabled = true;
        post('/api/admin/reply', { inquiry_id: r.id, subject: f.subject.value, body: f.body.value, next_stage: f.next_stage.value }).then(function (k) {
          $('button', f).disabled = false;
          if (k.ok) { toast('회신 메일을 보냈습니다.'); refreshBadge(); inquiry(id); } else toast(errText(k), true);
        });
      });
    });
  }

  /* ---------- 회원 ---------- */
  var SELECTED = [];
  function members() {
    setTitle('회원 관리');
    var p = qs(), filter = p.filter || 'all', q = '';
    var opts = [['all', '전체 회원'], ['marketing', '마케팅 수신 동의'], ['unverified', '이메일 미인증']].concat(Object.keys(ROLE).map(function (k) { return [k, '구분: ' + ROLE[k]]; }));
    view.innerHTML = '<div class="v-head"><div><h1>회원 관리</h1><p id="mem-sum">회원을 선택해 자료나 안내를 보낼 수 있습니다.</p></div><div class="acts"><a class="btn btn-outline btn-sm" id="mem-csv" href="#">엑셀(CSV) 내려받기</a></div></div>' +
      '<div class="fbar"><select id="mem-f">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === filter ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select><input type="search" id="mem-q" placeholder="이름·이메일·연락처·소속 검색"></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" id="mem-all" aria-label="전체 선택"></th><th>가입일</th><th>이름</th><th>이메일</th><th>연락처</th><th>구분</th><th>소속</th><th>인증</th><th>수신동의</th><th class="num">문의</th><th class="num">받은 자료</th></tr></thead><tbody id="mem-body"></tbody></table></div>' +
      '<div class="selbar" id="selbar" hidden><span id="sel-n"></span><a class="btn btn-primary btn-sm" href="#/send?users=1">선택한 회원에게 보내기</a></div>';
    SELECTED = [];
    function sync() { $('#selbar').hidden = !SELECTED.length; $('#sel-n').textContent = SELECTED.length + '명 선택'; }
    function load() {
      var url = '/api/admin/users?filter=' + filter + (q ? '&q=' + encodeURIComponent(q) : '');
      $('#mem-csv').href = url + '&format=csv';
      get(url).then(function (j) {
        if (!j.ok) { $('#mem-body').innerHTML = '<tr class="empty-row"><td colspan="11">' + errText(j) + '</td></tr>'; return; }
        $('#mem-sum').textContent = '전체 ' + j.total + '명 · 이 목록 ' + j.items.length + '명. 회원을 선택해 자료나 안내를 보낼 수 있습니다.';
        $('#mem-body').innerHTML = j.items.length ? j.items.map(function (u) {
          return '<tr data-id="' + u.id + '"><td class="chk"><input type="checkbox" value="' + u.id + '"' + (SELECTED.indexOf(u.id) > -1 ? ' checked' : '') + ' aria-label="선택"></td><td class="nw">' + day(u.created_at) + '</td><td class="nw"><b>' + esc(u.name) + '</b>' + (u.admin ? ' <span class="st st-new">관리자</span>' : '') + '</td><td>' + esc(u.email) + '</td><td class="nw">' + esc(u.phone) + '</td><td class="nw">' + esc(ROLE[u.role] || '') + '</td><td>' + esc(u.company) + '</td><td>' + (u.email_verified ? '✓' : '<span class="age late">미인증</span>') + '</td><td>' + (u.marketing ? '✓' : '') + '</td><td class="num">' + u.inquiries + '</td><td class="num">' + u.received + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="11">해당하는 회원이 없습니다.</td></tr>';
      });
    }
    $('#mem-f').onchange = function (e) { filter = e.target.value; load(); };
    $('#mem-q').oninput = debounce(function (e) { q = e.target.value.trim(); load(); }, 300);
    $('#mem-all').onchange = function (e) { $$('#mem-body input[type=checkbox]').forEach(function (c) { c.checked = e.target.checked; var id = +c.value; var i = SELECTED.indexOf(id); if (c.checked && i < 0) SELECTED.push(id); if (!c.checked && i > -1) SELECTED.splice(i, 1); }); sync(); };
    $('#mem-body').addEventListener('click', function (e) {
      if (e.target.matches('input[type=checkbox]')) { var id = +e.target.value, i = SELECTED.indexOf(id); if (e.target.checked && i < 0) SELECTED.push(id); if (!e.target.checked && i > -1) SELECTED.splice(i, 1); sync(); return; }
      if (e.target.closest('.chk')) return;
      var tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/member/' + tr.dataset.id;
    });
    load();
  }

  function member(id) {
    setTitle('회원 #' + id);
    get('/api/admin/user?id=' + id).then(function (j) {
      if (!j.ok) { view.innerHTML = '<a class="back" href="#/members">← 회원 목록</a><p class="muted-s">' + errText(j) + '</p>'; return; }
      var u = j.user;
      view.innerHTML = '<a class="back" href="#/members">← 회원 목록</a>' +
        '<div class="v-head"><div><h1>' + esc(u.name) + ' <span class="muted-s">회원 #' + u.id + '</span></h1><p>' + esc(u.email) + ' · 가입 ' + day(u.created_at) + (u.last_login_at ? ' · 최근 로그인 ' + dt(u.last_login_at) : '') + '</p></div>' +
        '<div class="acts">' + (u.email_verified ? '' : '<button class="btn btn-outline btn-sm" id="u-verify">이메일 인증 처리</button>') + '<a class="btn btn-primary btn-sm" href="#/send?user=' + u.id + '">자료 보내기</a></div></div>' +
        '<div class="grid2"><div>' +
          '<div class="card"><h2>회원 정보</h2><dl class="dl"><dt>이름</dt><dd>' + esc(u.name) + '</dd><dt>이메일</dt><dd><a href="mailto:' + esc(u.email) + '">' + esc(u.email) + '</a> ' + (u.email_verified ? '<span class="st st-contract">인증</span>' : '<span class="st">미인증</span>') + '</dd>' +
            '<dt>연락처</dt><dd>' + (u.phone ? '<a href="tel:' + esc(u.phone.replace(/[^0-9+]/g, '')) + '">' + esc(u.phone) + '</a>' : '-') + '</dd><dt>구분</dt><dd>' + esc(ROLE[u.role] || '-') + '</dd><dt>소속</dt><dd>' + esc(u.company || '-') + '</dd>' +
            '<dt>마케팅 수신</dt><dd>' + (u.marketing ? '동의' : '미동의') + '</dd><dt>권한</dt><dd>' + (u.admin ? '관리자' : '일반 회원') + '</dd></dl></div>' +
          '<div class="card"><h2>문의 내역</h2><ul class="mini-list">' + (j.inquiries.map(function (o) { return '<li><a href="#/inquiry/' + o.id + '">#' + o.id + ' ' + esc(TYPE[o.type] || o.type) + ' · ' + esc(o.address) + '</a><span>' + stage(o.stage) + '</span></li>'; }).join('') || '<li class="muted-s">문의 내역이 없습니다.</li>') + '</ul></div>' +
        '</div><div>' +
          '<div class="card"><h2>받은 자료</h2><ul class="mini-list">' + (j.deliveries.map(function (d) { return '<li><a href="#/document/' + d.document_id + '">' + esc(d.title) + '</a><span class="age">' + day(d.sent_at) + (d.opened_at ? ' · 열람' : ' · 미열람') + (d.downloaded_at ? ' · 다운로드' : '') + '</span></li>'; }).join('') || '<li class="muted-s">보낸 자료가 없습니다.</li>') + '</ul></div>' +
          (u.id !== ME.id ? '<div class="card"><h2>회원 삭제</h2><p class="muted-s" style="margin-bottom:10px">회원 정보와 로그인 기록을 지웁니다. 접수된 문의와 발송 기록은 회원 연결 없이 남습니다.</p><button class="btn btn-outline btn-sm" id="u-del">회원 삭제</button></div>' : '') +
        '</div></div>';
      var v = $('#u-verify'); if (v) v.onclick = function () { post('/api/admin/user', { id: u.id, action: 'verify' }).then(function (k) { toast(k.ok ? '인증 처리했습니다.' : errText(k), !k.ok); member(id); }); };
      var d = $('#u-del'); if (d) d.onclick = function () { if (!confirm(u.name + ' 회원을 삭제할까요? 되돌릴 수 없습니다.')) return; post('/api/admin/user', { id: u.id, action: 'delete' }).then(function (k) { if (k.ok) { toast('삭제했습니다.'); location.hash = '#/members'; } else toast(errText(k), true); }); };
    });
  }

  /* ---------- 자료·안내 발송 ---------- */
  var TPL = {
    report: ['[공간 진단 리포트] ○○동 ○층 공간 검토 결과', '요청하신 공간의 검토 결과를 정리해 보내드립니다.\n\n[요약]\n- 가능한 모델: \n- 확인이 필요한 조건: \n- 다음 단계: \n\n자세한 내용은 첨부 파일을 확인해 주세요. 궁금하신 점은 이 메일에 답장으로 남겨주시면 됩니다.'],
    visit: ['현장진단 일정 안내', '현장진단 일정을 안내드립니다.\n\n- 일시: \n- 장소: \n- 소요 시간: 약 1시간\n- 준비해 주실 것: 건축물대장, 도면(있으면), 출입 방법\n\n일정 변경이 필요하시면 이 메일에 답장으로 알려주세요.'],
    proposal: ['[제안서] 공간개발 제안 자료', '검토 결과를 바탕으로 공간개발 제안 자료를 보내드립니다.\n\n첨부한 제안서에는 모델별 수지 비교, 공간 구성안, 일정과 담당 범위가 들어 있습니다. 수치는 가정에 따른 추정이며, 확정 조건은 계약 전 다시 정리해 드립니다.'],
    newsletter: ['공백 인사이트 — 이번 달 공실개발 실무 노트', '이번 달 공백이 정리한 공실개발 실무 기준을 전해드립니다.\n\n1. \n2. \n3. \n\n홈페이지 인사이트에서 전체 글을 보실 수 있습니다.\nhttps://vacancy.co.kr/insights/'],
  };
  function send() {
    setTitle('자료·안내 발송');
    var p = qs(), preset = null;
    var mode = p.inquiry ? 'inquiry' : (p.user || (p.users && SELECTED.length)) ? 'users' : 'segment';
    var userIds = p.user ? [+p.user] : (p.users ? SELECTED.slice() : []);
    view.innerHTML = '<div class="v-head"><div><h1>자료·안내 발송</h1><p>리포트·분석 자료나 안내를 메일로 보내고, 받는 사람이 열람했는지 확인합니다. 회원은 마이페이지 ‘받은 자료’에서도 볼 수 있습니다.</p></div></div>' +
      (MAIL ? '' : '<div class="result-box warn" style="margin:0 0 14px">이메일 발송이 설정되지 않았습니다. 지금 보내면 메일은 나가지 않고, 회원의 마이페이지에만 표시됩니다. <a href="#/settings">설정 점검</a></div>') +
      '<form class="form-v" id="send-form"><div class="grid2"><div>' +
        '<div class="card"><h2>받는 사람</h2><div class="radio-cards">' +
          '<label id="rc-users"' + (userIds.length ? '' : ' hidden') + '><input type="radio" name="mode" value="users"' + (mode === 'users' ? ' checked' : '') + '><div><b>선택한 회원 ' + userIds.length + '명</b><span id="rc-users-names"></span></div></label>' +
          '<label id="rc-inq"' + (p.inquiry ? '' : ' hidden') + '><input type="radio" name="mode" value="inquiry"' + (mode === 'inquiry' ? ' checked' : '') + '><div><b>문의 고객</b><span id="rc-inq-name">문의 #' + esc(p.inquiry || '') + '</span></div></label>' +
          '<label><input type="radio" name="mode" value="segment"' + (mode === 'segment' ? ' checked' : '') + '><div><b>회원 그룹</b><span>그룹 전체에게 보냅니다 (최대 500명)</span>' +
            '<select name="segment"><option value="all">전체 회원</option><option value="verified">이메일 인증 회원</option><option value="marketing">마케팅 수신 동의 회원</option>' + Object.keys(ROLE).map(function (k) { return '<option value="' + k + '">구분: ' + ROLE[k] + '</option>'; }).join('') + '</select></div></label>' +
          '<label><input type="radio" name="mode" value="emails"><div><b>이메일 직접 입력</b><span>회원이 아닌 분께 보낼 때 (최대 50개, 쉼표·줄바꿈 구분)</span><textarea name="emails" placeholder="name@example.com"></textarea></div></label>' +
        '</div><p class="muted-s" style="margin-top:10px" id="count-line"></p></div>' +
        '<div class="card"><h2>내용</h2>' +
          '<div class="field"><label>종류</label><select name="kind"><option value="report">리포트·분석자료</option><option value="notice">안내·공지</option><option value="newsletter">뉴스레터</option></select></div>' +
          '<div class="tpl-row"><span class="muted-s">문안 불러오기:</span><button type="button" data-t="report">진단 리포트</button><button type="button" data-t="visit">현장진단 일정</button><button type="button" data-t="proposal">제안서</button><button type="button" data-t="newsletter">뉴스레터</button></div>' +
          '<div class="field"><label>제목</label><input type="text" name="title" maxlength="150" required></div>' +
          '<div class="field"><label>본문 <span class="muted-s">(받는 사람 이름 인사말은 자동으로 붙습니다)</span></label><textarea name="body" required></textarea></div>' +
          '<div class="field"><label>첨부 파일 <span class="muted-s">(PDF·엑셀·이미지 등, 10MB 이하)</span></label><input type="file" name="file"></div>' +
          '<div class="field"><label>링크 <span class="muted-s">(선택: 구글 드라이브·노션 등 외부 자료 주소)</span></label><input type="url" name="link_url" placeholder="https://"></div>' +
          '<div class="adbox"><label><input type="checkbox" name="is_ad" value="1"> 광고성 정보입니다 (뉴스레터·프로모션)</label><p>체크하면 제목 앞에 (광고)가 붙고, 마케팅 수신에 동의한 분에게만 발송되며, 메일 하단에 수신거부 링크와 회사 정보가 들어갑니다. 정보통신망법 제50조 기준입니다. 고객이 요청한 리포트·회신은 광고가 아니므로 체크하지 않습니다.</p></div>' +
        '</div>' +
      '</div><div>' +
        '<div class="card"><h2>미리보기</h2><div class="preview-mail"><div class="pm-sub" id="pv-sub">제목</div><div class="pm-body" id="pv-body"></div><div id="pv-file" class="muted-s" style="margin-top:10px"></div><span class="pm-btn" id="pv-btn">자세히 보기</span><p class="muted-s" id="pv-ad" style="margin-top:12px" hidden>광고성 정보 · 수신거부 링크 · 회사 정보가 하단에 표시됩니다.</p></div></div>' +
        '<div class="card"><button type="button" class="btn btn-outline btn-block" id="btn-count" style="margin:0 0 10px">받는 사람 수 확인</button><button type="submit" class="btn btn-primary btn-lg btn-block" style="margin:0">발송하기</button><div id="send-result"></div></div>' +
      '</div></div></form>';

    var f = $('#send-form'), E = f.elements;
    if (userIds.length) get('/api/admin/users').then(function (j) { if (j.ok) { var names = j.items.filter(function (u) { return userIds.indexOf(u.id) > -1; }).map(function (u) { return u.name; }); $('#rc-users-names').textContent = names.slice(0, 6).join(', ') + (names.length > 6 ? ' 외 ' + (names.length - 6) + '명' : ''); } });
    if (p.inquiry) get('/api/admin/inquiry?id=' + p.inquiry).then(function (j) { if (j.ok) $('#rc-inq-name').textContent = j.item.name + ' · ' + j.item.email + ' (문의 #' + j.item.id + ')'; });
    if (p.doc) get('/api/admin/documents?id=' + p.doc).then(function (j) {
      if (!j.ok) return; preset = j.item;
      E.title.value = preset.title; E.body.value = preset.body || ''; E.kind.value = preset.kind; E.link_url.value = preset.link_url || ''; E.is_ad.checked = !!preset.is_ad;
      ['title', 'body', 'kind', 'link_url', 'file'].forEach(function (n) { E[n].disabled = true; });
      $('.tpl-row').hidden = true;
      $('#pv-file').textContent = preset.file_name ? '첨부: ' + preset.file_name + ' (' + size(preset.file_size) + ') — 기존 자료를 다시 보냅니다' : '기존 자료를 다시 보냅니다';
      preview();
    });

    function recipients() {
      var m = E.mode.value;
      if (m === 'users') return { mode: 'users', ids: userIds };
      if (m === 'inquiry') return { mode: 'inquiry', id: +p.inquiry };
      if (m === 'emails') return { mode: 'emails', list: E.emails.value.split(/[\s,;]+/).filter(Boolean) };
      return { mode: 'segment', segment: E.segment.value };
    }
    function formData(dry) {
      var fd = new FormData();
      fd.append('recipients', JSON.stringify(recipients()));
      if (E.is_ad.checked) fd.append('is_ad', '1');
      if (dry) { fd.append('dry_run', '1'); return fd; }
      if (preset) { fd.append('document_id', preset.id); return fd; }
      ['title', 'body', 'kind', 'link_url'].forEach(function (n) { fd.append(n, E[n].value); });
      if (E.file.files[0]) fd.append('file', E.file.files[0]);
      return fd;
    }
    function count() {
      return req('POST', '/api/admin/send', formData(true), true).then(function (j) {
        var el = $('#count-line');
        el.innerHTML = j.ok ? '받는 사람 <b>' + j.count + '명</b>' + (j.excluded ? ' · 수신 미동의·거부 ' + j.excluded + '명 제외' : '') + (j.sample && j.sample.length ? ' (' + esc(j.sample.join(', ')) + (j.count > j.sample.length ? ' …' : '') + ')' : '') : errText(j);
        return j;
      });
    }
    function preview() {
      var ad = E.is_ad.checked;
      $('#pv-sub').textContent = (ad ? '(광고) ' : '') + '[공백] ' + (E.title.value || '제목');
      $('#pv-body').textContent = '○○○님, 안녕하세요. 공백입니다.\n\n' + (E.body.value || '');
      if (!preset) { var fl = E.file.files[0]; $('#pv-file').textContent = fl ? '첨부: ' + fl.name + ' (' + size(fl.size) + ')' + (fl.size > 10 * 1048576 ? ' — 10MB를 넘습니다' : '') : (E.link_url.value ? '링크: ' + E.link_url.value : ''); }
      $('#pv-btn').textContent = (preset ? preset.file_name : E.file.files[0]) ? '자료 확인·내려받기' : '자세히 보기';
      $('#pv-ad').hidden = !ad;
    }
    f.addEventListener('input', preview); f.addEventListener('change', function (e) { preview(); if (e.target.name === 'mode' || e.target.name === 'segment' || e.target.name === 'is_ad') count(); });
    E.kind.addEventListener('change', function () { if (E.kind.value === 'newsletter') { E.is_ad.checked = true; preview(); count(); } });
    $('.tpl-row').addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (!b) return; var t = TPL[b.dataset.t]; if ((E.title.value || E.body.value) && !confirm('작성 중인 내용을 문안으로 바꿀까요?')) return; E.title.value = t[0]; E.body.value = t[1]; if (b.dataset.t === 'newsletter') { E.kind.value = 'newsletter'; E.is_ad.checked = true; } else if (b.dataset.t === 'report' || b.dataset.t === 'proposal') E.kind.value = 'report'; else E.kind.value = 'notice'; preview(); count(); });
    $('#btn-count').onclick = count;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!preset && (!E.title.value.trim() || !E.body.value.trim())) { toast('제목과 본문을 입력해 주세요.', true); return; }
      if (!preset && E.file.files[0] && E.file.files[0].size > 10 * 1048576) { toast('파일은 10MB 이하만 올릴 수 있습니다.', true); return; }
      count().then(function (c) {
        if (!c.ok || !c.count) { toast(c.ok ? '받는 사람이 없습니다.' : errText(c), true); return; }
        if (!confirm(c.count + '명에게 ' + (MAIL ? '메일을 보냅니다.' : '자료를 등록합니다 (메일 발송은 설정 후 가능).') + ' 진행할까요?')) return;
        var btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = '보내는 중…';
        req('POST', '/api/admin/send', formData(false), true).then(function (j) {
          btn.disabled = false; btn.textContent = '발송하기';
          var box = $('#send-result');
          if (!j.ok) { box.innerHTML = '<div class="result-box err">' + errText(j) + '</div>'; return; }
          box.innerHTML = '<div class="result-box' + (j.mailed < j.count ? ' warn' : '') + '">' + j.count + '명에게 등록했습니다. 메일 발송 ' + j.mailed + '건' + (j.mailed < j.count ? ' (실패·미설정 ' + (j.count - j.mailed) + '건 — 회원은 마이페이지에서 볼 수 있습니다)' : '') + '. <a href="#/document/' + j.document_id + '">열람 현황 보기</a></div>';
          SELECTED = [];
        });
      });
    });
    preview(); count();
  }

  /* ---------- 발송 이력 ---------- */
  function documents() {
    setTitle('발송 이력');
    get('/api/admin/documents').then(function (j) {
      view.innerHTML = '<div class="v-head"><div><h1>발송 이력</h1><p>보낸 자료별로 메일 발송, 열람, 다운로드 여부를 확인합니다.</p></div><div class="acts"><a class="btn btn-primary btn-sm" href="#/send">새로 보내기</a></div></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>보낸 날</th><th>제목</th><th>종류</th><th>첨부</th><th class="num">받는 사람</th><th class="num">메일</th><th class="num">열람</th><th class="num">다운로드</th></tr></thead><tbody id="doc-body">' +
        (!j.ok ? '<tr class="empty-row"><td colspan="8">' + errText(j) + '</td></tr>' : j.items.length ? j.items.map(function (d) {
          var rate = d.sent ? Math.round(d.opened / d.sent * 100) : 0;
          return '<tr data-id="' + d.id + '"><td class="nw">' + dt(d.created_at) + '</td><td><b>' + esc(d.title) + '</b>' + (d.is_ad ? ' <span class="st">광고</span>' : '') + '</td><td class="nw">' + esc(KIND[d.kind] || d.kind) + '</td><td class="ellipsis">' + (d.file_name ? esc(d.file_name) + ' · ' + size(d.file_size) : d.link_url ? '링크' : '-') + '</td>' +
            '<td class="num">' + d.sent + '</td><td class="num">' + (d.mailed || 0) + '</td><td class="num">' + (d.opened || 0) + ' <span class="age">(' + rate + '%)</span></td><td class="num">' + (d.file_name ? (d.downloaded || 0) : '-') + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="8">아직 보낸 자료가 없습니다.</td></tr>') + '</tbody></table></div>';
      $('#doc-body').addEventListener('click', function (e) { var tr = e.target.closest('tr[data-id]'); if (tr) location.hash = '#/document/' + tr.dataset.id; });
    });
  }
  function documentDetail(id) {
    setTitle('발송 자료 #' + id);
    get('/api/admin/documents?id=' + id).then(function (j) {
      if (!j.ok) { view.innerHTML = '<a class="back" href="#/documents">← 발송 이력</a><p class="muted-s">' + errText(j) + '</p>'; return; }
      var d = j.item, L = j.deliveries, opened = L.filter(function (x) { return x.opened_at; }).length;
      view.innerHTML = '<a class="back" href="#/documents">← 발송 이력</a>' +
        '<div class="v-head"><div><h1>' + esc(d.title) + '</h1><p>' + dt(d.created_at) + ' · ' + esc(KIND[d.kind] || d.kind) + (d.is_ad ? ' · 광고성' : '') + ' · ' + esc(d.created_by || '') + '</p></div>' +
        '<div class="acts"><a class="btn btn-primary btn-sm" href="#/send?doc=' + d.id + '">다른 분께도 보내기</a><button class="btn btn-outline btn-sm" id="doc-del">삭제</button></div></div>' +
        '<div class="kpis"><div class="kpi"><div class="l">받는 사람</div><div class="v">' + L.length + '</div></div><div class="kpi"><div class="l">메일 발송</div><div class="v">' + L.filter(function (x) { return x.mail_ok; }).length + '</div></div>' +
        '<div class="kpi"><div class="l">열람</div><div class="v">' + opened + '</div><div class="s">' + (L.length ? Math.round(opened / L.length * 100) : 0) + '%</div></div><div class="kpi"><div class="l">다운로드</div><div class="v">' + (d.file_name ? L.filter(function (x) { return x.downloaded_at; }).length : '-') + '</div></div></div>' +
        '<div class="grid2"><div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>받는 사람</th><th>이메일</th><th>메일</th><th>열람</th><th>다운로드</th></tr></thead><tbody>' +
          L.map(function (x) { return '<tr data-u="' + (x.user_id || '') + '" data-i="' + (x.inquiry_id || '') + '"><td>' + esc(x.name || '-') + (x.user_id ? ' <span class="age">회원</span>' : '') + '</td><td>' + esc(x.email) + '</td><td>' + (x.mail_ok ? '✓' : '<span class="age late">미발송</span>') + '</td><td class="nw">' + (x.opened_at ? dt(x.opened_at) + (x.open_count > 1 ? ' <span class="age">×' + x.open_count + '</span>' : '') : '<span class="age">-</span>') + '</td><td class="nw">' + (x.downloaded_at ? dt(x.downloaded_at) : '<span class="age">-</span>') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div><div>' +
          '<div class="card"><h2>내용</h2><div class="msg-box">' + esc(d.body) + '</div>' + (d.file_name ? '<p style="margin-top:12px"><a class="btn btn-outline btn-sm" href="/api/admin/file?id=' + d.id + '">' + esc(d.file_name) + ' (' + size(d.file_size) + ') 내려받기</a></p>' : '') + (d.link_url ? '<p class="muted-s" style="margin-top:10px">링크: <a href="' + esc(d.link_url) + '" target="_blank" rel="noopener">' + esc(d.link_url) + '</a></p>' : '') + '</div>' +
        '</div></div>';
      $('#doc-del').onclick = function () { if (!confirm('이 자료와 발송 기록을 삭제할까요? 받은 사람의 링크도 더 이상 열리지 않습니다.')) return; post('/api/admin/documents', { id: d.id, action: 'delete' }).then(function (k) { if (k.ok) { toast('삭제했습니다.'); location.hash = '#/documents'; } else toast(errText(k), true); }); };
      $$('tbody tr', view).forEach(function (tr) { tr.onclick = function () { if (tr.dataset.u) location.hash = '#/member/' + tr.dataset.u; else if (tr.dataset.i) location.hash = '#/inquiry/' + tr.dataset.i; }; });
    });
  }

  /* ---------- 설정 점검 ---------- */
  function settings() {
    setTitle('설정 점검');
    get('/api/health').then(function (h) {
      function row(ok, t, d) { return '<li class="' + (ok ? 'ok' : 'no') + '"><span class="mk">' + (ok ? '완료' : '필요') + '</span><div><b>' + t + '</b><p>' + d + '</p></div></li>'; }
      view.innerHTML = '<div class="v-head"><div><h1>설정 점검</h1><p>Cloudflare Pages → Settings에서 바꾼 값은 다시 배포해야 반영됩니다.</p></div></div>' +
        '<div class="grid2"><div><ul class="check-list">' +
          row(h.db_bound && h.db_ready, '데이터베이스 (DB)', h.db_ready ? '연결되어 있고 테이블이 준비되었습니다.' : 'Settings → Bindings → D1 database, 변수명 <code>DB</code>') +
          row(h.mail, '이메일 발송 (RESEND_API_KEY)', h.mail ? '문의 알림·회신·자료 발송 메일을 보낼 수 있습니다.' : 'Settings → Variables and Secrets에 Secret으로 추가') +
          row(h.mail_from_set, '보내는 주소 (CONTACT_FROM)', h.mail_from_set ? '설정됨' : 'Resend에서 vacancy.co.kr 도메인 인증 후 <code>공백 &lt;noreply@vacancy.co.kr&gt;</code>') +
          row(h.contact_to_set, '문의 알림 받는 주소 (CONTACT_TO)', h.contact_to_set ? '설정됨' : '비워 두면 spaceblank0100@gmail.com') +
          row(h.admin_set, '관리자 이메일 (ADMIN_EMAILS)', h.admin_set ? '설정됨' : '관리자로 쓸 이메일, 여러 개면 쉼표로 구분') +
        '</ul></div><div><div class="card"><h2>운영 메모</h2><ul class="todo">' +
          '<li><span class="dot"></span><div><b>메일 발송 한도</b><p>Resend 무료 요금제는 하루 100통, 월 3,000통입니다. 뉴스레터를 자주 보내면 유료 요금제를 검토하세요.</p></div></li>' +
          '<li><span class="dot"></span><div><b>첨부 파일</b><p>파일은 데이터베이스에 나눠 저장합니다(10MB 이하). D1 무료 용량은 5GB입니다.</p></div></li>' +
          '<li><span class="dot"></span><div><b>광고성 메일</b><p>(광고) 표기·수신거부·회사 정보는 자동으로 들어갑니다. 야간(21시~08시) 발송은 별도 동의가 필요하니 낮 시간에 보내세요.</p></div></li>' +
          '<li><span class="dot"></span><div><b>데이터 백업</b><p>문의·회원 목록은 각 화면의 엑셀(CSV) 내려받기로 주기적으로 보관하세요.</p></div></li>' +
        '</ul></div></div></div>';
    });
  }

  /* ==========================================================================
     임대인센터 (프로젝트·임대인·파트너·정산)
     ========================================================================== */
  var G = window.GBProject;
  var PROLE = G.ROLES, PKIND = G.KINDS;
  var ACTIVE = ['intake', 'diagnosis', 'proposal', 'contract', 'execution', 'closing'];
  function pstage(s) { return '<span class="st ps-' + s + '">' + esc(G.STAGE[s] || s) + '</span>'; }
  function kindChips(k) { return String(k || '').split(',').filter(Boolean).map(function (x) { return '<span class="pj-chip kind">' + esc(PKIND[x] || x) + '</span>'; }).join(' '); }
  function bar(done, total) { var p = total ? Math.round(done / total * 100) : 0; return '<div class="pbar"><i style="width:' + p + '%"></i></div><span class="age">' + done + '/' + total + '</span>'; }
  var VIEW_MODE = 'list';

  function projects() {
    setTitle('프로젝트');
    var p = qs(), grp = p.g || 'active', kind = '', partner = '', q = '';
    Promise.all([get('/api/center/projects'), get('/api/admin/center'), get('/api/admin/partners')]).then(function (rs) {
      var L = rs[0], C = rs[1], PT = rs[2];
      if (!L.ok) { view.innerHTML = '<p class="muted-s">' + errText(L) + '</p>'; return; }
      var items = L.items, cnt = C.ok ? C.counts : {};
      var todo = [];
      if (C.ok) {
        C.pending_posts.forEach(function (x) { todo.push(['red', '<a href="#/project/' + x.project_id + '?tab=feed">' + esc(x.code || '') + ' 임대인 공개 요청 글</a>', esc((x.name || '파트너') + (x.company ? ' · ' + x.company : '')) + ' — ' + esc(x.body)]); });
        C.pending_files.forEach(function (x) { todo.push(['red', '<a href="#/project/' + x.project_id + '?tab=files">' + esc(x.code || '') + (x.uploader_type === 'landlord' ? ' 임대인이 보낸 자료' : ' 임대인 공개 요청 자료') + '</a>', esc(x.name) + ' · ' + esc(x.title)]); });
        C.overdue.slice(0, 8).forEach(function (x) { todo.push(['amber', '<a href="#/project/' + x.project_id + '?tab=tasks">' + esc(x.code || '') + ' 기한 지남: ' + esc(x.title) + '</a>', esc(x.ptitle) + ' · 기한 ' + esc(x.due_date)]); });
        C.stale.slice(0, 5).forEach(function (x) { todo.push(['', '<a href="#/project/' + x.id + '">' + esc(x.code || '') + ' 2주 넘게 업데이트 없음</a>', esc(x.title) + ' · 마지막 ' + day(x.updated_at)]); });
      }
      view.innerHTML = '<div class="v-head"><div><h1>임대인센터 프로젝트</h1><p>건물·임대인별 프로젝트를 만들고, 파트너 권한과 진행 상황을 관리합니다. 파트너와 임대인은 <a href="/center" target="_blank" rel="noopener">vacancy.co.kr/center</a>에서 봅니다.</p></div>' +
        '<div class="acts"><a class="btn btn-outline btn-sm" href="#/finance">정산 현황</a><a class="btn btn-primary btn-sm" href="#/project/new">새 프로젝트</a></div></div>' +
        '<div class="kpis"><a class="kpi" href="#/projects?g=active"><div class="l">진행 중 프로젝트</div><div class="v">' + (cnt.active || 0) + '</div><div class="s">전체 ' + (cnt.total || 0) + '건</div></a>' +
          '<div class="kpi' + (cnt.pending ? ' hot' : '') + '"><div class="l">확인 대기</div><div class="v">' + (cnt.pending || 0) + '</div><div class="s">임대인 공개 요청·임대인 자료</div></div>' +
          '<div class="kpi' + (cnt.overdue ? ' hot' : '') + '"><div class="l">기한 지난 추진사항</div><div class="v">' + (cnt.overdue || 0) + '</div><div class="s">7일 안에 기한 ' + (cnt.due_soon || 0) + '건</div></div>' +
          '<a class="kpi" href="#/finance"><div class="l">받을 돈 (예정·청구)</div><div class="v sm">' + (C.ok ? G.won(C.money.in_plan) : '-') + '</div><div class="s">줄 돈 ' + (C.ok ? G.won(C.money.out_plan) : '-') + '</div></a></div>' +
        (todo.length ? '<div class="card" style="margin-bottom:14px"><h2>확인할 일 <small>' + todo.length + '건</small></h2><ul class="todo">' + todo.map(function (t) { return '<li><span class="dot ' + t[0] + '"></span><div>' + t[1] + '<p>' + t[2] + '</p></div></li>'; }).join('') + '</ul></div>' : '') +
        '<div class="pills" id="pj-g"></div><div class="fbar"><select id="pj-k"><option value="">의뢰 유형 전체</option>' + Object.keys(PKIND).map(function (k) { return '<option value="' + k + '">' + PKIND[k] + '</option>'; }).join('') + '</select>' +
          '<select id="pj-p"><option value="">파트너 전체</option>' + (PT.ok ? PT.items.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name + (x.company ? ' · ' + x.company : '')) + '</option>'; }).join('') : '') + '</select>' +
          '<input type="search" id="pj-q" placeholder="코드·프로젝트·주소·임대인·파트너 검색"><div class="seg" id="pj-v"><button type="button" data-v="list">목록</button><button type="button" data-v="board">단계별 보드</button></div></div>' +
        '<div id="pj-list"></div>';
      var G_ = { active: ['진행 중', function (x) { return ACTIVE.indexOf(x.stage) > -1; }], all: ['전체', function () { return true; }], done: ['완료', function (x) { return x.stage === 'done'; }], off: ['보류·중단', function (x) { return x.stage === 'hold' || x.stage === 'dropped'; }] };
      function filtered() {
        return items.filter(function (x) {
          if (!G_[grp][1](x)) return false;
          if (kind && String(x.kinds || '').split(',').indexOf(kind) < 0) return false;
          if (partner && String(x.partner_ids || '').split(',').indexOf(partner) < 0) return false;
          if (q) { var hay = [x.code, x.title, x.address, x.landlord_name, x.landlord_company, x.member_names, x.next_action].join(' ').toLowerCase(); if (hay.indexOf(q.toLowerCase()) < 0) return false; }
          return true;
        });
      }
      function flags(x) {
        return (x.pending_posts + x.pending_files ? '<span class="st st-new">확인 ' + (x.pending_posts + x.pending_files) + '</span> ' : '') + (x.overdue ? '<span class="st st-review">지연 ' + x.overdue + '</span> ' : '') + (x.unread ? '<span class="st">새 글 ' + x.unread + '</span>' : '');
      }
      function draw() {
        $('#pj-g').innerHTML = Object.keys(G_).map(function (k) { return '<button type="button" data-g="' + k + '" aria-pressed="' + (k === grp) + '">' + G_[k][0] + '<span class="c">' + items.filter(G_[k][1]).length + '</span></button>'; }).join('');
        $$('#pj-v button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === VIEW_MODE)); });
        var rows = filtered(), box = $('#pj-list');
        if (!items.length) { box.innerHTML = '<div class="pj-empty">아직 프로젝트가 없습니다. 문의 상세에서 “임대인센터 프로젝트로 만들기”를 누르거나 <a href="#/project/new">새 프로젝트</a>를 만들어 시작하세요.</div>'; return; }
        if (VIEW_MODE === 'board') {
          var cols = ACTIVE.concat(grp === 'active' ? [] : ['done', 'hold', 'dropped']);
          box.innerHTML = '<div class="board">' + cols.map(function (s) {
            var cs = rows.filter(function (x) { return x.stage === s; });
            return '<div class="board-col"><h3>' + esc(G.STAGE[s]) + '<span>' + cs.length + '</span></h3>' + cs.map(function (x) {
              return '<a class="board-card" href="#/project/' + x.id + '"><span class="pj-code">' + esc(x.code || '') + '</span><b>' + esc(x.title) + '</b><span class="age">' + esc(x.landlord_name || '임대인 미연결') + ' · 파트너 ' + x.members + '</span>' + bar(x.tasks_done, x.tasks_total) + '<div>' + flags(x) + '</div></a>';
            }).join('') + '</div>';
          }).join('') + '</div>';
          return;
        }
        box.innerHTML = '<div class="tbl-wrap"><table class="tbl pj-ptbl"><thead><tr><th>코드</th><th>프로젝트</th><th>임대인</th><th>단계</th><th>참여 파트너</th><th>진행</th><th>확인</th><th>최근 활동</th></tr></thead><tbody>' +
          (rows.length ? rows.map(function (x) {
            return '<tr data-id="' + x.id + '"><td class="nw"><span class="pj-code">' + esc(x.code || '') + '</span>' + (x.priority === 'high' ? '<br><span class="st st-new">중요</span>' : '') + '</td><td class="pj-ptitle"><b>' + esc(x.title) + '</b><div class="age">' + esc(x.address || '') + '</div><div class="pj-pk">' + kindChips(x.kinds) + '</div>' + (x.next_action ? '<div class="age">다음: ' + esc(x.next_action) + '</div>' : '') + '</td>' +
              '<td class="nw">' + esc(x.landlord_name || '-') + (x.landlord_name ? '<div class="age">' + (x.landlord_access ? (x.landlord_user ? '센터 연결' : '가입 전') : '열람 꺼짐') + '</div>' : '') + '</td><td class="nw">' + pstage(x.stage) + '</td>' +
              '<td class="ellipsis" title="' + esc(x.member_names || '') + '">' + esc(x.member_names || '-') + '</td><td class="nw pcell">' + bar(x.tasks_done, x.tasks_total) + '</td><td class="nw">' + flags(x) + '</td><td class="nw"><span class="age">' + ago(x.updated_at || x.created_at) + '</span></td></tr>';
          }).join('') : '<tr class="empty-row"><td colspan="8">조건에 맞는 프로젝트가 없습니다.</td></tr>') + '</tbody></table></div>';
        $$('#pj-list tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/project/' + tr.dataset.id; }; });
      }
      $('#pj-g').onclick = function (e) { var b = e.target.closest('button'); if (b) { grp = b.dataset.g; history.replaceState(null, '', '#/projects?g=' + grp); draw(); } };
      $('#pj-v').onclick = function (e) { var b = e.target.closest('button'); if (b) { VIEW_MODE = b.dataset.v; draw(); } };
      $('#pj-k').onchange = function (e) { kind = e.target.value; draw(); };
      $('#pj-p').onchange = function (e) { partner = e.target.value; draw(); };
      $('#pj-q').oninput = debounce(function (e) { q = e.target.value.trim(); draw(); }, 200);
      draw();
    });
  }

  function projectNew() {
    setTitle('새 프로젝트');
    var p = qs();
    get('/api/admin/landlords').then(function (LL) {
      var lls = LL.ok ? LL.items : [];
      view.innerHTML = '<a class="back" href="#/projects">← 프로젝트 목록</a><div class="v-head"><div><h1>새 프로젝트</h1><p>건물 하나, 또는 임대인의 의뢰 하나를 프로젝트로 만듭니다. 만든 뒤 파트너를 참여시키고 권한을 정합니다.</p></div></div>' +
        '<form class="form-v" id="np"><div class="grid2"><div>' +
          '<div class="card"><h2>건물·의뢰</h2><div class="field"><label>프로젝트 이름 <span class="muted-s">(예: 부평동 182-76 1층 공실 해결)</span></label><input type="text" name="title" maxlength="120" required></div>' +
            '<div class="field"><label>건물 주소</label><input type="text" name="address" maxlength="200"></div>' +
            '<div class="pj-fgrid"><div class="field"><label>건물명</label><input type="text" name="building_name"></div><div class="field"><label>규모 <span class="muted-s">(예: 지하1층·지상5층)</span></label><input type="text" name="scale"></div></div>' +
            '<div class="field"><label>의뢰 유형 <span class="muted-s">(여러 개 고를 수 있습니다)</span></label><div class="pj-checks" id="np-kinds">' + Object.keys(PKIND).map(function (k) { return '<label><input type="checkbox" name="kinds" value="' + k + '"> ' + PKIND[k] + '</label>'; }).join('') + '</div></div>' +
            '<div class="field"><label>공실·현재 상황</label><textarea name="vacancy" rows="3" style="min-height:80px"></textarea></div>' +
            '<div class="field"><label>요청 사항</label><textarea name="request" rows="4" style="min-height:100px"></textarea></div>' +
            '<div class="field"><label>목표·성공 기준</label><input type="text" name="goal" placeholder="예: 6개월 안에 1·2층 임차 완료, 매각가 45억 이상"></div>' +
            '<div class="field"><label>가격·재무 <span class="muted-s">(가격·재무 권한이 있는 파트너와 임대인만 봅니다)</span></label><textarea name="finance" rows="2" style="min-height:60px" placeholder="매각 희망가, 대출, 현재 임대 수입 등"></textarea></div>' +
          '</div>' +
        '</div><div>' +
          '<div class="card"><h2>임대인</h2><div class="radio-cards">' +
            '<label><input type="radio" name="lmode" value="new" checked><div><b>새 임대인 등록</b><span>이메일을 넣으면 임대인센터 안내를 보낼 수 있습니다</span>' +
              '<div class="pj-fgrid" style="margin-top:8px"><input type="text" name="l_name" placeholder="이름 또는 법인명"><select name="l_kind"><option value="person">개인</option><option value="corp">법인</option></select><input type="text" name="l_phone" placeholder="연락처"><input type="email" name="l_email" placeholder="이메일"></div></div></label>' +
            '<label><input type="radio" name="lmode" value="pick"' + (lls.length ? '' : ' disabled') + '><div><b>등록된 임대인 선택</b><span>' + (lls.length ? lls.length + '명 등록됨' : '등록된 임대인이 없습니다') + '</span><select name="landlord_id"><option value="">선택</option>' + lls.map(function (l) { return '<option value="' + l.id + '">' + esc(l.name + (l.company ? ' · ' + l.company : '') + (l.email ? ' (' + l.email + ')' : '')) + '</option>'; }).join('') + '</select></div></label>' +
            '<label><input type="radio" name="lmode" value="none"><div><b>나중에 연결</b><span>매입 의뢰처럼 아직 건물주가 정해지지 않은 경우</span></div></label>' +
          '</div></div>' +
          '<div class="card"><h2>시작 설정</h2><div class="pj-fgrid"><div class="field"><label>시작 단계</label><select name="stage">' + G.PSTAGES.slice(0, 6).map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select></div>' +
            '<div class="field"><label>중요도</label><select name="priority"><option value="normal">보통</option><option value="high">중요</option><option value="low">낮음</option></select></div>' +
            '<div class="field"><label>시작일</label><input type="date" name="start_date" value="' + G.today() + '"></div><div class="field"><label>목표일</label><input type="date" name="due_date"></div></div>' +
            '<label class="pj-switch"><input type="checkbox" name="template" checked><span>유형별 기본 추진사항과 임대인 요청 자료 넣기</span></label>' +
            '<label class="pj-switch" style="margin-top:0"><input type="checkbox" name="landlord_access" checked><span>임대인이 임대인센터에서 볼 수 있게 하기</span></label>' +
            '<div class="field"><label>내부 메모 <span class="muted-s">(관리자만)</span></label><textarea name="internal_memo" rows="2" style="min-height:60px"></textarea></div>' +
            '<button class="btn btn-primary btn-lg btn-block">프로젝트 만들기</button><p class="muted-s" id="np-from" style="margin-top:10px"></p></div>' +
        '</div></div></form>';
      var f = $('#np'), E = f.elements;
      if (p.inquiry) get('/api/admin/inquiry?id=' + p.inquiry).then(function (j) {
        if (!j.ok) return; var r = j.item;
        E.l_name.value = r.name || ''; E.l_phone.value = r.phone || ''; E.l_email.value = r.email || '';
        var ex = lls.filter(function (l) { return l.email && r.email && l.email.toLowerCase() === r.email.toLowerCase(); })[0];
        if (ex) { E.lmode.value = 'pick'; E.landlord_id.value = ex.id; }
        E.address.value = r.address || ''; E.vacancy.value = [r.floor_area, r.status].filter(Boolean).join(' · '); E.request.value = r.message || ''; E.finance.value = r.conditions || '';
        var map = { develop: ['vacancy', 'develop'], valueup: ['exit', 'valueup'], tenant: ['leasing'], partner: ['etc'] };
        (map[r.type] || []).forEach(function (k) { var c = $('#np-kinds input[value="' + k + '"]'); if (c) c.checked = true; });
        E.title.value = (r.address || '').split(' ').slice(0, 4).join(' ') + ' ' + (TYPE[r.type] || '');
        $('#np-from').innerHTML = '문의 <a href="#/inquiry/' + r.id + '">#' + r.id + '</a>의 내용으로 채웠습니다. 만들면 문의 처리 이력에 기록됩니다.';
      });
      f.onsubmit = function (e) {
        e.preventDefault();
        var b = { title: E.title.value, address: E.address.value, building_name: E.building_name.value, scale: E.scale.value, vacancy: E.vacancy.value, request: E.request.value, goal: E.goal.value, finance: E.finance.value,
          kinds: $$('#np-kinds input:checked').map(function (c) { return c.value; }), stage: E.stage.value, priority: E.priority.value, start_date: E.start_date.value, due_date: E.due_date.value,
          template: E.template.checked, landlord_access: E.landlord_access.checked, internal_memo: E.internal_memo.value, inquiry_id: p.inquiry || null };
        if (E.lmode.value === 'new' && E.l_name.value.trim()) b.landlord = { name: E.l_name.value, kind: E.l_kind.value, phone: E.l_phone.value, email: E.l_email.value };
        if (E.lmode.value === 'pick') { if (!E.landlord_id.value) { toast('임대인을 선택해 주세요.', true); return; } b.landlord_id = +E.landlord_id.value; }
        var btn = $('button.btn-primary', f); btn.disabled = true;
        post('/api/center/projects', b).then(function (j) {
          btn.disabled = false;
          if (j.ok) { toast(j.code + ' 프로젝트를 만들었습니다. 이제 파트너를 참여시켜 주세요.'); location.hash = '#/project/' + j.id + '?tab=people'; } else toast(errText(j), true);
        });
      };
    });
  }

  function projectDetail(id) {
    setTitle('프로젝트');
    var p = qs();
    view.innerHTML = '<div id="pj-root"></div>';
    G.mount($('#pj-root'), +id, { base: '#/project/', back: ['#/projects', '프로젝트 목록'], as: p.as || null, tab: p.tab, toast: toast,
      onLoad: function (D) { setTitle((D.project.code ? D.project.code + ' ' : '') + D.project.title); refreshBadge(); } });
  }

  /* ---------- 임대인 ---------- */
  function landlordForm(l) {
    l = l || {};
    return '<div class="pj-fgrid"><div class="field"><label>이름·법인명</label><input type="text" name="name" value="' + esc(l.name || '') + '" required></div><div class="field"><label>구분</label><select name="kind"><option value="person">개인</option><option value="corp"' + (l.kind === 'corp' ? ' selected' : '') + '>법인</option></select></div>' +
      '<div class="field"><label>담당자·법인 정보</label><input type="text" name="company" value="' + esc(l.company || '') + '" placeholder="법인명, 담당자 직함 등"></div><div class="field"><label>연락처</label><input type="text" name="phone" value="' + esc(l.phone || '') + '"></div>' +
      '<div class="field full"><label>이메일 <span class="muted-s">(이 주소로 가입·인증하면 임대인센터에 자동 연결)</span></label><input type="email" name="email" value="' + esc(l.email || '') + '"></div>' +
      '<div class="field full"><label>메모 <span class="muted-s">(관리자만)</span></label><textarea name="memo" rows="2" style="min-height:60px">' + esc(l.memo || '') + '</textarea></div></div>' +
      '<label class="pj-switch"><input type="checkbox" name="portal"' + (l.portal === 0 ? '' : ' checked') + '><span>임대인센터 접속 허용</span></label>';
  }
  function landlordBody(E) { return { name: E.name.value, kind: E.kind.value, company: E.company.value, phone: E.phone.value, email: E.email.value, memo: E.memo.value, portal: E.portal.checked }; }
  function landlords() {
    setTitle('임대인');
    get('/api/admin/landlords').then(function (j) {
      view.innerHTML = '<div class="v-head"><div><h1>임대인</h1><p>프로젝트를 의뢰한 임대인·건물주입니다. 이메일이 같은 회원이 인증을 마치면 임대인센터에 자동으로 연결됩니다.</p></div><div class="acts"><button type="button" class="btn btn-primary btn-sm" id="ll-new">새 임대인</button></div></div>' +
        '<form class="card form-v" id="ll-form" hidden style="margin-bottom:14px"><h2>새 임대인</h2>' + landlordForm() + '<button class="btn btn-ink btn-sm">등록</button></form>' +
        '<div class="fbar"><input type="search" id="ll-q" placeholder="이름·연락처·이메일·프로젝트 검색"></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>이름</th><th>구분</th><th>연락처</th><th>이메일</th><th>임대인센터</th><th class="num">프로젝트</th><th>등록일</th></tr></thead><tbody id="ll-body"></tbody></table></div>';
      var items = j.ok ? j.items : [];
      function draw(q) {
        var rows = items.filter(function (l) { return !q || [l.name, l.company, l.phone, l.email, l.project_titles].join(' ').toLowerCase().indexOf(q) > -1; });
        $('#ll-body').innerHTML = rows.length ? rows.map(function (l) {
          return '<tr data-id="' + l.id + '"><td><b>' + esc(l.name) + '</b>' + (l.company ? '<div class="age">' + esc(l.company) + '</div>' : '') + '</td><td class="nw">' + (l.kind === 'corp' ? '법인' : '개인') + '</td><td class="nw">' + esc(l.phone || '') + '</td><td>' + esc(l.email || '-') + '</td>' +
            '<td class="nw">' + (!l.portal ? '<span class="st">접속 막음</span>' : l.user_id ? '<span class="st st-contract">연결됨</span>' : '<span class="age">가입 전</span>') + '</td><td class="num">' + l.projects + (l.active_projects ? ' <span class="age">(진행 ' + l.active_projects + ')</span>' : '') + '</td><td class="nw">' + day(l.created_at) + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="7">' + (items.length ? '검색 결과가 없습니다.' : '등록된 임대인이 없습니다. 프로젝트를 만들 때 함께 등록할 수도 있습니다.') + '</td></tr>';
        $$('#ll-body tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/landlord/' + tr.dataset.id; }; });
      }
      draw('');
      $('#ll-q').oninput = debounce(function (e) { draw(e.target.value.trim().toLowerCase()); }, 200);
      $('#ll-new').onclick = function () { var f = $('#ll-form'); f.hidden = !f.hidden; };
      $('#ll-form').onsubmit = function (e) { e.preventDefault(); var b = landlordBody(e.target.elements); b.action = 'create'; post('/api/admin/landlords', b).then(function (k) { if (k.ok) { toast('등록했습니다.' + (k.linked ? ' 같은 이메일의 회원과 연결했습니다.' : '')); location.hash = '#/landlord/' + k.id; } else toast(errText(k), true); }); };
    });
  }
  function landlordDetail(id) {
    setTitle('임대인');
    get('/api/admin/landlords?id=' + id).then(function (j) {
      if (!j.ok) { view.innerHTML = '<a class="back" href="#/landlords">← 임대인</a><p class="muted-s">' + errText(j) + '</p>'; return; }
      var l = j.item;
      view.innerHTML = '<a class="back" href="#/landlords">← 임대인</a><div class="v-head"><div><h1>' + esc(l.name) + '</h1><p>' + (l.user_id ? '임대인센터 연결됨 (회원 ' + esc(l.user_name || '') + ')' : '아직 임대인센터에 연결되지 않았습니다') + (l.invited_at ? ' · 안내 메일 ' + day(l.invited_at) : '') + '</p></div>' +
        '<div class="acts">' + (l.email ? '<button type="button" class="btn btn-outline btn-sm" id="l-inv">임대인센터 안내 메일</button>' : '') + '<a class="btn btn-primary btn-sm" href="#/project/new">새 프로젝트</a></div></div>' +
        '<div class="grid2"><div><form class="card form-v" id="l-form"><h2>임대인 정보</h2>' + landlordForm(l) + '<button class="btn btn-ink btn-sm">저장</button></form>' +
          '<div class="card"><h2>회원 계정 연결</h2><p class="muted-s" style="margin-bottom:10px">보통은 같은 이메일로 가입·인증하면 자동으로 연결됩니다. 다른 이메일로 가입한 경우에만 직접 연결하세요.</p><form class="inline-form" id="l-link"><input type="email" name="email" placeholder="회원 이메일"><button class="btn btn-outline btn-sm">연결</button>' + (l.user_id ? '<button type="button" class="btn btn-outline btn-sm" id="l-unlink">연결 해제</button>' : '') + '</form></div></div>' +
        '<div><div class="card"><h2>프로젝트</h2><ul class="mini-list">' + (j.projects.map(function (x) { return '<li><a href="#/project/' + x.id + '">' + esc(x.code || '') + ' ' + esc(x.title) + '</a><span>' + pstage(x.stage) + (x.landlord_access ? '' : ' <span class="age">열람 꺼짐</span>') + '</span></li>'; }).join('') || '<li class="muted-s">프로젝트가 없습니다.</li>') + '</ul></div>' +
          '<div class="card"><h2>홈페이지 문의</h2><ul class="mini-list">' + (j.inquiries.map(function (o) { return '<li><a href="#/inquiry/' + o.id + '">#' + o.id + ' ' + esc(TYPE[o.type] || o.type) + ' · ' + esc(o.address) + '</a><span>' + stage(o.stage) + '</span></li>'; }).join('') || '<li class="muted-s">같은 이메일·연락처의 문의가 없습니다.</li>') + '</ul></div>' +
          '<div class="card"><h2>삭제</h2><p class="muted-s" style="margin-bottom:10px">연결된 프로젝트가 없을 때만 삭제할 수 있습니다.</p><button type="button" class="btn btn-outline btn-sm" id="l-del">임대인 삭제</button></div></div></div>';
      $('#l-form').onsubmit = function (e) { e.preventDefault(); var b = landlordBody(e.target.elements); b.action = 'update'; b.id = l.id; post('/api/admin/landlords', b).then(function (k) { if (k.ok) { toast('저장했습니다.'); landlordDetail(id); } else toast(errText(k), true); }); };
      var inv = $('#l-inv'); if (inv) inv.onclick = function () { if (confirm(l.email + ' 로 임대인센터 안내 메일을 보낼까요?')) post('/api/admin/landlords', { action: 'invite', id: l.id }).then(function (k) { toast(k.ok ? '보냈습니다.' : errText(k), !k.ok); if (k.ok) landlordDetail(id); }); };
      $('#l-link').onsubmit = function (e) { e.preventDefault(); linkUser(e.target.email.value, '/api/admin/landlords', l.id, function () { landlordDetail(id); }); };
      var ul = $('#l-unlink'); if (ul) ul.onclick = function () { if (confirm('회원 연결을 해제할까요? 이 임대인은 임대인센터에 들어올 수 없게 됩니다. (같은 이메일로 인증한 회원은 다시 자동 연결됩니다)')) post('/api/admin/landlords', { action: 'link', id: l.id, user_id: null }).then(function () { landlordDetail(id); }); };
      $('#l-del').onclick = function () { if (confirm(l.name + ' 임대인을 삭제할까요?')) post('/api/admin/landlords', { action: 'delete', id: l.id }).then(function (k) { if (k.ok) { toast('삭제했습니다.'); location.hash = '#/landlords'; } else toast(errText(k), true); }); };
    });
  }
  function linkUser(email, api, id, done) {
    email = String(email || '').trim().toLowerCase(); if (!email) return;
    get('/api/admin/users?q=' + encodeURIComponent(email)).then(function (j) {
      var u = j.ok ? j.items.filter(function (x) { return x.email.toLowerCase() === email; })[0] : null;
      if (!u) { toast('그 이메일로 가입한 회원이 없습니다.', true); return; }
      if (!confirm(u.name + ' (' + u.email + ') 회원과 연결할까요?')) return;
      post(api, { action: 'link', id: id, user_id: u.id }).then(function (k) { toast(k.ok ? '연결했습니다.' : errText(k), !k.ok); if (k.ok) done(); });
    });
  }

  /* ---------- 파트너 ---------- */
  function partnerForm(x) {
    x = x || {};
    return '<div class="pj-fgrid"><div class="field"><label>담당자 이름</label><input type="text" name="name" value="' + esc(x.name || '') + '" required></div><div class="field"><label>소속 회사</label><input type="text" name="company" value="' + esc(x.company || '') + '" placeholder="중개법인, 자산운용사 등"></div>' +
      '<div class="field"><label>직함</label><input type="text" name="title" value="' + esc(x.title || '') + '"></div><div class="field"><label>분야</label><select name="field">' + Object.keys(PROLE).map(function (k) { return '<option value="' + k + '"' + (x.field === k ? ' selected' : '') + '>' + PROLE[k] + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>연락처</label><input type="text" name="phone" value="' + esc(x.phone || '') + '"></div><div class="field"><label>이메일 <span class="muted-s">(로그인·알림용)</span></label><input type="email" name="email" value="' + esc(x.email || '') + '" required></div>' +
      '<div class="field"><label>제휴 계약</label><select name="agreement"><option value="none">없음</option><option value="nda"' + (x.agreement === 'nda' ? ' selected' : '') + '>비밀유지 약정</option><option value="signed"' + (x.agreement === 'signed' ? ' selected' : '') + '>제휴 계약 체결</option></select></div>' +
      '<div class="field"><label>상태</label><select name="status"><option value="active">이용 중</option><option value="paused"' + (x.status === 'paused' ? ' selected' : '') + '>이용 중지 (모든 프로젝트 접근 차단)</option></select></div></div>' +
      '<h4 style="margin:6px 0 8px;font-size:var(--fs-sm)">기본 정산 조건 <span class="muted-s" style="font-weight:400">프로젝트에 참여시킬 때 기본값으로 들어갑니다</span></h4>' +
      '<datalist id="fee-bases2"><option value="중개보수"><option value="거래금액"><option value="공백 수입"><option value="월 임대료"><option value="고정 금액"></datalist>' +
      '<div class="pj-fgrid"><div class="field"><label>수수료율(%)</label><input type="text" name="fee_rate" inputmode="decimal" value="' + (x.fee_rate == null ? '' : x.fee_rate) + '"></div><div class="field"><label>수수료 기준</label><input type="text" name="fee_base" list="fee-bases2" value="' + esc(x.fee_base || '') + '"></div>' +
      '<div class="field"><label>성과보수</label><input type="text" name="success_fee" value="' + esc(x.success_fee || '') + '" placeholder="예: 계약 성사 시 월세 1개월"></div><div class="field"><label>컨설팅비(원)</label><input type="text" name="consulting_fee" inputmode="numeric" value="' + (x.consulting_fee == null ? '' : x.consulting_fee) + '"></div>' +
      '<div class="field full"><label>조건 메모</label><input type="text" name="fee_note" value="' + esc(x.fee_note || '') + '" placeholder="지급 시점, 부가세 별도 등"></div>' +
      '<div class="field full"><label>메모 <span class="muted-s">(관리자만)</span></label><textarea name="memo" rows="2" style="min-height:60px">' + esc(x.memo || '') + '</textarea></div></div>';
  }
  function partnerBody(E) { var b = {}; ['name', 'company', 'title', 'field', 'phone', 'email', 'agreement', 'status', 'fee_rate', 'fee_base', 'success_fee', 'consulting_fee', 'fee_note', 'memo'].forEach(function (k) { b[k] = E[k].value; }); return b; }
  function feeText(x) { var t = []; if (x.fee_rate != null) t.push(x.fee_rate + '%' + (x.fee_base ? '(' + x.fee_base + ')' : '')); if (x.success_fee) t.push('성과 ' + x.success_fee); if (x.consulting_fee) t.push('컨설팅 ' + G.won(x.consulting_fee)); return t.join(' · '); }
  var AGREE = { none: '-', nda: '비밀유지', signed: '제휴 계약' };
  function partners() {
    setTitle('파트너');
    get('/api/admin/partners').then(function (j) {
      var items = j.ok ? j.items : [], fld = '', st = 'active', q = '';
      view.innerHTML = '<div class="v-head"><div><h1>파트너</h1><p>중개사·중개법인, 자산운용사, 명도·투자유치·리테일 담당 등 함께 일하는 협력 담당자입니다. 등록한 이메일로 가입·인증하면 임대인센터에 연결됩니다.</p></div><div class="acts"><button type="button" class="btn btn-primary btn-sm" id="pt-new">새 파트너</button></div></div>' +
        '<form class="card form-v" id="pt-form" hidden style="margin-bottom:14px"><h2>새 파트너</h2>' + partnerForm() + '<label class="pj-switch"><input type="checkbox" name="invite" checked><span>등록 후 임대인센터 안내 메일 보내기</span></label><button class="btn btn-ink btn-sm">등록</button></form>' +
        '<div class="pills" id="pt-st"></div><div class="fbar"><select id="pt-f"><option value="">분야 전체</option>' + Object.keys(PROLE).map(function (k) { return '<option value="' + k + '">' + PROLE[k] + '</option>'; }).join('') + '</select><input type="search" id="pt-q" placeholder="이름·회사·연락처·이메일 검색"></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>담당자</th><th>분야</th><th>연락처</th><th>임대인센터</th><th>제휴</th><th>기본 조건</th><th class="num">진행 중</th><th class="num">지급 예정</th><th class="num">지급 완료</th></tr></thead><tbody id="pt-body"></tbody></table></div>';
      function draw() {
        $('#pt-st').innerHTML = [['active', '이용 중'], ['paused', '이용 중지'], ['all', '전체']].map(function (s) { return '<button type="button" data-s="' + s[0] + '" aria-pressed="' + (s[0] === st) + '">' + s[1] + '<span class="c">' + items.filter(function (x) { return s[0] === 'all' || x.status === s[0]; }).length + '</span></button>'; }).join('');
        var rows = items.filter(function (x) { return (st === 'all' || x.status === st) && (!fld || x.field === fld) && (!q || [x.name, x.company, x.phone, x.email].join(' ').toLowerCase().indexOf(q) > -1); });
        $('#pt-body').innerHTML = rows.length ? rows.map(function (x) {
          return '<tr data-id="' + x.id + '"><td><b>' + esc(x.name) + '</b>' + (x.title ? ' <span class="age">' + esc(x.title) + '</span>' : '') + '<div class="age">' + esc(x.company || '') + '</div></td><td class="nw">' + esc(PROLE[x.field] || '') + '</td><td class="nw">' + esc(x.phone || '') + '<div class="age">' + esc(x.email) + '</div></td>' +
            '<td class="nw">' + (x.status === 'paused' ? '<span class="st">이용 중지</span>' : x.user_id ? '<span class="st st-contract">연결됨</span>' : '<span class="age">가입 전</span>') + '</td><td class="nw">' + AGREE[x.agreement || 'none'] + '</td><td class="ellipsis">' + esc(feeText(x) || '-') + '</td>' +
            '<td class="num">' + x.active_projects + '</td><td class="num">' + (x.unpaid ? G.won(x.unpaid) : '-') + '</td><td class="num">' + (x.paid ? G.won(x.paid) : '-') + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="9">' + (items.length ? '조건에 맞는 파트너가 없습니다.' : '등록된 파트너가 없습니다. 함께 일하는 담당자를 먼저 등록하세요.') + '</td></tr>';
        $$('#pt-body tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/partner/' + tr.dataset.id; }; });
      }
      draw();
      $('#pt-st').onclick = function (e) { var b = e.target.closest('button'); if (b) { st = b.dataset.s; draw(); } };
      $('#pt-f').onchange = function (e) { fld = e.target.value; draw(); };
      $('#pt-q').oninput = debounce(function (e) { q = e.target.value.trim().toLowerCase(); draw(); }, 200);
      $('#pt-new').onclick = function () { var f = $('#pt-form'); f.hidden = !f.hidden; };
      $('#pt-form').onsubmit = function (e) {
        e.preventDefault(); var E = e.target.elements, b = partnerBody(E); b.action = 'create';
        post('/api/admin/partners', b).then(function (k) {
          if (!k.ok) { toast(errText(k), true); return; }
          var done = function (msg) { toast(msg); location.hash = '#/partner/' + k.id; };
          if (E.invite.checked && MAIL) post('/api/admin/partners', { action: 'invite', id: k.id }).then(function (m) { done('등록했습니다.' + (m.ok ? ' 안내 메일을 보냈습니다.' : ' 안내 메일은 보내지 못했습니다.')); });
          else done('등록했습니다.' + (k.linked ? ' 같은 이메일의 회원과 연결했습니다.' : ''));
        });
      };
    });
  }
  function partnerDetail(id) {
    setTitle('파트너');
    get('/api/admin/partners?id=' + id).then(function (j) {
      if (!j.ok) { view.innerHTML = '<a class="back" href="#/partners">← 파트너</a><p class="muted-s">' + errText(j) + '</p>'; return; }
      var x = j.item, MS = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' };
      view.innerHTML = '<a class="back" href="#/partners">← 파트너</a><div class="v-head"><div><h1>' + esc(x.name) + (x.company ? ' <span class="muted-s">' + esc(x.company) + '</span>' : '') + '</h1><p>' + esc(PROLE[x.field] || '') + ' · ' +
        (x.status === 'paused' ? '이용 중지' : x.user_id ? '임대인센터 연결됨' : '아직 가입·인증 전') + (x.invited_at ? ' · 안내 메일 ' + day(x.invited_at) : '') + '</p></div><div class="acts"><button type="button" class="btn btn-outline btn-sm" id="p-inv">임대인센터 안내 메일</button></div></div>' +
        '<div class="grid2"><div><form class="card form-v" id="p-form"><h2>파트너 정보</h2>' + partnerForm(x) + '<button class="btn btn-ink btn-sm">저장</button></form>' +
          '<div class="card"><h2>회원 계정 연결</h2><p class="muted-s" style="margin-bottom:10px">같은 이메일로 가입·인증하면 자동으로 연결됩니다. 다른 이메일로 가입한 경우에만 직접 연결하세요.</p><form class="inline-form" id="p-link"><input type="email" name="email" placeholder="회원 이메일"><button class="btn btn-outline btn-sm">연결</button>' + (x.user_id ? '<button type="button" class="btn btn-outline btn-sm" id="p-unlink">연결 해제</button>' : '') + '</form></div></div>' +
        '<div><div class="card"><h2>참여 프로젝트 <small>' + j.projects.length + '건</small></h2>' + (j.projects.length ? '<ul class="mini-list">' + j.projects.map(function (m) {
            return '<li><span><a href="#/project/' + m.id + '?tab=people">' + esc(m.code || '') + ' ' + esc(m.title) + '</a><br><span class="age">' + esc(PROLE[m.role] || '') + ' · 임대인에게 “' + esc(m.alias || '') + '” · ' + esc(feeText(m) || '조건 미설정') + (m.status !== 'active' ? ' · 참여 종료' : '') + '</span></span><span>' + pstage(m.stage) + '</span></li>';
          }).join('') + '</ul>' : '<p class="muted-s">참여한 프로젝트가 없습니다. 프로젝트의 참여자·권한 탭에서 추가하세요.</p>') + '</div>' +
          '<div class="card"><h2>지급 내역</h2>' + (j.money.length ? '<ul class="mini-list">' + j.money.map(function (m) { return '<li><span>' + esc(m.code || '') + ' ' + esc(m.label) + ' · <b>' + G.won(m.amount) + '</b></span><span class="age">' + MS[m.status] + (m.done_date ? ' ' + esc(m.done_date) : m.due_date ? ' · 예정 ' + esc(m.due_date) : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">등록된 지급 내역이 없습니다.</p>') + '</div>' +
          '<div class="card"><h2>삭제</h2><p class="muted-s" style="margin-bottom:10px">참여 기록이 없을 때만 삭제할 수 있습니다. 관계를 정리할 때는 상태를 ‘이용 중지’로 바꾸면 모든 프로젝트 접근이 바로 막힙니다.</p><button type="button" class="btn btn-outline btn-sm" id="p-del">파트너 삭제</button></div></div></div>';
      $('#p-form').onsubmit = function (e) { e.preventDefault(); var b = partnerBody(e.target.elements); b.action = 'update'; b.id = x.id; post('/api/admin/partners', b).then(function (k) { if (k.ok) { toast('저장했습니다.'); partnerDetail(id); } else toast(errText(k), true); }); };
      $('#p-inv').onclick = function () { if (confirm(x.email + ' 로 임대인센터 안내 메일을 보낼까요?')) post('/api/admin/partners', { action: 'invite', id: x.id }).then(function (k) { toast(k.ok ? '보냈습니다.' : errText(k), !k.ok); if (k.ok) partnerDetail(id); }); };
      $('#p-link').onsubmit = function (e) { e.preventDefault(); linkUser(e.target.email.value, '/api/admin/partners', x.id, function () { partnerDetail(id); }); };
      var ul = $('#p-unlink'); if (ul) ul.onclick = function () { if (confirm('회원 연결을 해제할까요?')) post('/api/admin/partners', { action: 'link', id: x.id, user_id: null }).then(function () { partnerDetail(id); }); };
      $('#p-del').onclick = function () { if (confirm(x.name + ' 파트너를 삭제할까요?')) post('/api/admin/partners', { action: 'delete', id: x.id }).then(function (k) { if (k.ok) { toast('삭제했습니다.'); location.hash = '#/partners'; } else toast(errText(k), true); }); };
    });
  }

  /* ---------- 정산 현황 ---------- */
  function finance() {
    setTitle('정산 현황');
    Promise.all([get('/api/admin/center?view=finance'), get('/api/admin/center')]).then(function (rs) {
      var j = rs[0], C = rs[1];
      if (!j.ok) { view.innerHTML = '<p class="muted-s">' + errText(j) + '</p>'; return; }
      var items = j.items, dir = '', st = 'open', MS = { plan: '예정', due: '청구·확정', done: '완료', cancel: '취소' }, m = C.ok ? C.money : {};
      var byP = {}; items.filter(function (x) { return x.direction === 'out' && x.status !== 'cancel'; }).forEach(function (x) { var k = x.partner_name || '-'; byP[k] = byP[k] || { name: k, company: x.partner_company, open: 0, done: 0 }; if (x.status === 'done') byP[k].done += x.amount || 0; else byP[k].open += x.amount || 0; });
      view.innerHTML = '<div class="v-head"><div><h1>정산 현황</h1><p>프로젝트별로 등록한 받을 돈과 파트너 지급을 모아 봅니다. 금액은 입력한 값 그대로이며 세금·비용은 따로 계산해야 합니다.</p></div><div class="acts"><a class="btn btn-outline btn-sm" href="/api/admin/center?view=finance&format=csv">엑셀(CSV) 내려받기</a></div></div>' +
        '<div class="kpis"><div class="kpi"><div class="l">받을 돈 (예정·청구)</div><div class="v sm">' + G.won(m.in_plan) + '</div><div class="s">청구 ' + G.won(m.in_due) + '</div></div><div class="kpi"><div class="l">받은 돈</div><div class="v sm">' + G.won(m.in_done) + '</div></div>' +
          '<div class="kpi"><div class="l">줄 돈 (예정·확정)</div><div class="v sm">' + G.won(m.out_plan) + '</div><div class="s">확정 ' + G.won(m.out_due) + '</div></div><div class="kpi"><div class="l">준 돈</div><div class="v sm">' + G.won(m.out_done) + '</div></div></div>' +
        '<div class="grid2"><div><div class="pills" id="fi-d"></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>구분</th><th>프로젝트</th><th>항목</th><th>파트너</th><th class="num">금액</th><th>상태</th><th>예정일</th><th>완료일</th></tr></thead><tbody id="fi-body"></tbody></table></div></div>' +
        '<div><div class="card"><h2>파트너별 지급</h2>' + (Object.keys(byP).length ? '<ul class="mini-list">' + Object.keys(byP).map(function (k) { var x = byP[k]; return '<li><span><b>' + esc(x.name) + '</b> <span class="age">' + esc(x.company || '') + '</span></span><span class="age">남은 지급 ' + G.won(x.open) + ' · 지급 완료 ' + G.won(x.done) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">지급 내역이 없습니다.</p>') + '</div>' +
          '<div class="card"><h2>입력 방법</h2><p class="muted-s">각 프로젝트의 ‘정산’ 탭에서 받을 돈(컨설팅비·성과보수·중개보수)과 줄 돈(파트너 수수료)을 등록합니다. 줄 돈은 파트너의 수수료율을 불러와 기준 금액 × 비율로 계산할 수 있습니다.</p></div></div></div>';
      function draw() {
        $('#fi-d').innerHTML = [['', '전체'], ['in', '받을 돈'], ['out', '줄 돈']].map(function (d) { return '<button type="button" data-d="' + d[0] + '" aria-pressed="' + (d[0] === dir) + '">' + d[1] + '</button>'; }).join('') +
          [['open', '미완료'], ['done', '완료'], ['all', '상태 전체']].map(function (s) { return '<button type="button" data-s="' + s[0] + '" aria-pressed="' + (s[0] === st) + '">' + s[1] + '</button>'; }).join('');
        var rows = items.filter(function (x) { return (!dir || x.direction === dir) && (st === 'all' || (st === 'done' ? x.status === 'done' : (x.status === 'plan' || x.status === 'due'))); });
        $('#fi-body').innerHTML = rows.length ? rows.map(function (x) {
          return '<tr data-id="' + x.project_id + '"><td class="nw">' + (x.direction === 'in' ? '<span class="st st-contract">받을 돈</span>' : '<span class="st st-replied">줄 돈</span>') + '</td><td><span class="pj-code">' + esc(x.code || '') + '</span> ' + esc(x.title) + '</td><td>' + esc(x.label || '') + '</td><td class="nw">' + esc(x.partner_name || '') + '</td>' +
            '<td class="num nw"><b>' + G.won(x.amount) + '</b></td><td class="nw">' + MS[x.status] + '</td><td class="nw">' + esc(x.due_date || '') + '</td><td class="nw">' + esc(x.done_date || '') + '</td></tr>';
        }).join('') : '<tr class="empty-row"><td colspan="8">해당하는 정산 항목이 없습니다.</td></tr>';
        $$('#fi-body tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.hash = '#/project/' + tr.dataset.id + '?tab=money'; }; });
      }
      $('#fi-d').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.d !== undefined) dir = b.dataset.d; if (b.dataset.s) st = b.dataset.s; draw(); };
      draw();
    });
  }


  boot();
})();

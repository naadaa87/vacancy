/* 임대인센터 (/center) — 파트너·임대인용 화면
 * 홈(지금 확인할 일·프로젝트·다가오는 일정), 프로젝트, 달력, 알림함으로 구성됩니다.
 * 권한이 없는 계정에는 프로젝트 목록도, 프로젝트가 있다는 사실도 보이지 않습니다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var app = $('#ct-app'), sub = $('#ct-sub');
  var G = window.GBProject, W = window.GBWork, esc = G.esc;
  var ME = null, ROLE = null, UNREAD = 0;
  var ACTIVE = ['intake', 'diagnosis', 'proposal', 'contract', 'execution', 'closing'];

  function req(method, path, body) {
    var o = { method: method, credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(path, o).then(function (r) { return r.json().catch(function () { return { ok: false, error: r.status === 404 ? 'not_configured' : 'server_error' }; }).then(function (j) { j._status = r.status; return j; }); })
      .catch(function () { return { ok: false, error: 'server_error' }; });
  }
  function toast(msg, isErr) { var t = $('#toast'); t.textContent = msg; t.className = 'adm-toast' + (isErr ? ' err' : ''); t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2800); }
  function qs() { var h = location.hash.split('?')[1] || '', o = {}; h.split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); o[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } }); return o; }
  function gate(title, body, acts) {
    app.innerHTML = '<div class="card ct-gate"><h2>' + title + '</h2>' + body + (acts ? '<div class="acts">' + acts + '</div>' : '') + '</div>';
  }
  var next = encodeURIComponent('/center' + location.hash);

  // 로그인 전: 임대인센터 소개와 로그인 안내 (프로젝트 정보는 보내지 않음)
  function landing() {
    app.innerHTML = '<div class="ct-landing">' +
      '<div class="card ct-login"><span class="ct-lock" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></span>' +
        '<h2>로그인하면 내 프로젝트가 보입니다</h2><p>임대인센터에는 로그인한 분과 관련된 프로젝트만 표시됩니다. 다른 분의 프로젝트나 건물 정보는 보이지 않습니다.</p>' +
        '<div class="acts"><a class="btn btn-primary" href="/login?next=' + next + '">로그인</a><a class="btn btn-outline" href="/signup?next=' + next + '">회원가입</a></div>' +
        '<p class="ct-hint">공백에서 안내 메일을 받으셨다면, 메일을 받은 이메일 주소로 가입하고 이메일 인증을 마치면 프로젝트가 자동으로 연결됩니다.</p></div>' +
      '<div class="ct-who"><div class="card"><h3>임대인</h3><p>공백에 건물을 맡기신 분</p><ul class="ct-checks"><li>진행 단계와 공백의 보고를 한곳에서 확인</li><li>승인이 필요한 사항에 바로 응답하고 기록으로 보관</li><li>미팅·현장 일정과 청구·납부 내역 확인</li><li>요청받은 자료 올리기, 궁금한 점 문의</li></ul></div>' +
        '<div class="card"><h3>협력 파트너</h3><p>공백과 함께 프로젝트를 진행하는 중개·자산운용·명도·투자유치·리테일 담당</p><ul class="ct-checks"><li>참여 중인 프로젝트의 건물 정보와 추진사항</li><li>검토 의견·진행 보고 공유, 내 담당 업무와 기한 알림</li><li>일정 확인과 참석 응답</li><li>정산 조건 확인과 지급 요청</li></ul></div></div>' +
      '<div class="ct-feats"><div><b>알림</b><span>새 소식·확인 요청·일정은 알림함에 모이고, 기한 전날 아침에 한 번 더 알려 드립니다.</span></div><div><b>기록</b><span>단계 변경, 결정 사항, 응답 내역이 날짜순으로 남고 PDF로 보관할 수 있습니다.</span></div><div><b>정보 보호</b><span>권한이 있는 정보만 보이고, 연락처는 공백을 통해서만 오갑니다.</span></div></div>' +
      '<p class="ct-note">아직 의뢰 전이시라면 <a class="link-more" href="/contact">공간 검토 요청</a>을 남겨 주세요. 검토 후 프로젝트가 시작되면 임대인센터에서 진행 상황을 보실 수 있습니다.</p></div>';
  }

  function boot() {
    req('GET', '/api/auth/me').then(function (j) {
      if (j.configured === false || j._status === 404) return gate('준비 중입니다', '<p>임대인센터가 아직 준비되지 않았습니다. 공백으로 연락 주시면 진행 상황을 바로 안내드리겠습니다.</p>', '<a class="btn btn-primary" href="/contact">문의하기</a>');
      if (!j.user) return landing();
      ME = j.user;
      if (!ME.email_verified) {
        gate('이메일 인증을 마쳐 주세요', '<p>' + esc(ME.email) + ' 주소로 보낸 인증 메일의 링크를 누르면 임대인센터가 열립니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.</p>', '<button type="button" class="btn btn-primary" id="ct-resend">인증 메일 다시 받기</button><a class="btn btn-outline" href="/account">마이페이지</a>');
        $('#ct-resend').onclick = function (e) { e.target.disabled = true; req('POST', '/api/auth/resend-verification', {}).then(function (k) { e.target.textContent = k.ok ? '보냈습니다. 메일함을 확인해 주세요' : '보내지 못했습니다. 잠시 후 다시 시도해 주세요'; }); };
        return;
      }
      if (!j.center) return gate('연결된 프로젝트가 없습니다', '<p>' + esc(ME.email) + ' 계정에 연결된 프로젝트가 아직 없습니다. 임대인센터에는 로그인한 분과 관련된 프로젝트만 표시됩니다.</p>' +
        '<ul class="ct-checks"><li>공백에서 안내 메일을 받으셨다면, 그 메일을 받은 주소로 로그인했는지 확인해 주세요.</li><li>공백이 프로젝트를 연결하면 이 화면에 바로 나타납니다.</li><li>건물의 공실·임차·매각 등을 맡기시려면 공간 검토 요청을 남겨 주세요.</li></ul>',
        '<a class="btn btn-primary" href="/contact">공간 검토 요청</a><button type="button" class="btn btn-outline" id="ct-out">다른 계정으로 로그인</button><a class="btn btn-outline" href="/account">마이페이지</a>');
      ROLE = j.center;
      route(); window.addEventListener('hashchange', route);
    });
    app.addEventListener('click', function (e) { if (e.target.id === 'ct-out') req('POST', '/api/auth/logout', {}).then(function () { location.href = '/login?next=' + encodeURIComponent('/center'); }); });
  }

  /* ---------- 위쪽 메뉴: 홈 · 일정 · 알림 ---------- */
  function nav(cur) {
    return '<nav class="ct-nav" aria-label="임대인센터 메뉴"><a href="#/"' + (cur === 'home' ? ' aria-current="page"' : '') + '>홈</a><a href="#/calendar"' + (cur === 'calendar' ? ' aria-current="page"' : '') + '>일정</a>' +
      '<a href="#/notifs"' + (cur === 'notifs' ? ' aria-current="page"' : '') + '>알림<span class="n" id="ct-bell"' + (UNREAD ? '' : ' hidden') + '>' + UNREAD + '</span></a><span class="ct-nav-r">' +
      (ROLE === 'admin' ? '<a href="/admin#/projects">관리자 화면</a>' : '<a href="/account">마이페이지</a>') + '</span></nav>';
  }
  function setBell(n) { UNREAD = n; var b = $('#ct-bell'); if (b) { b.textContent = n; b.hidden = !n; } }
  function refreshBell() { req('GET', '/api/center/notifs?count=1').then(function (j) { if (j.ok) setBell(j.unread); }); }

  var SEQ = 0;
  function route() {
    var h = location.hash, m = h.match(/^#\/p\/(\d+)/), seq = ++SEQ;
    window.scrollTo(0, 0);
    if (m) {
      if (ROLE === 'admin') { location.href = '/admin#/project/' + m[1]; return; }
      sub.hidden = true;
      app.innerHTML = nav('') + '<div class="ct-proj" id="ct-proj"></div>';
      G.mount($('#ct-proj'), +m[1], { base: '#/p/', back: ['#/', '임대인센터 홈'], tab: qs().tab, toast: toast, onLoad: refreshBell });
      return;
    }
    sub.hidden = false;
    if (/^#\/calendar/.test(h)) return calendarPage(seq);
    if (/^#\/notifs/.test(h)) return notifsPage();
    home(seq);
  }

  // 일정 한 줄을 눌렀을 때 갈 곳
  function hrefOf(it) {
    var base = ROLE === 'admin' ? '/admin#/project/' : '#/p/';
    var as = it.as;
    var tab = it.type === 'event' ? 'schedule' : it.type === 'task' ? (as === 'landlord' ? 'overview' : 'tasks') : it.type === 'approval' ? (ROLE === 'admin' ? 'approvals' : 'overview') : it.type === 'money' ? (ROLE === 'admin' ? 'money' : as === 'landlord' ? 'bills' : 'terms') : 'building';
    return base + it.project_id + '?tab=' + tab;
  }

  function home(seq) {
    app.innerHTML = nav('home') + '<p class="muted">불러오는 중…</p>';
    var today = G.today();
    Promise.all([req('GET', '/api/center/projects'), req('GET', '/api/center/agenda?from=' + today + '&to=' + W.addDays(today, 30)), req('GET', '/api/center/notifs?limit=5')]).then(function (rs) {
      if (seq !== SEQ) return;
      var j = rs[0], A = rs[1].ok ? rs[1] : { items: [], approvals: [] }, N = rs[2].ok ? rs[2] : { items: [], unread: 0 };
      if (!j.ok) { gate('불러오지 못했습니다', '<p>잠시 후 다시 시도해 주세요.</p>'); return; }
      UNREAD = N.unread;
      var items = j.items, V = j.viewer, admin = ROLE === 'admin';
      var asOf = {}; items.forEach(function (p) { asOf[p.id] = p.as; });
      A.items.forEach(function (it) { it.as = asOf[it.project_id]; it.href = hrefOf(it); });
      A.approvals.forEach(function (it) { it.as = asOf[it.project_id]; it.href = hrefOf(it); });
      var landlordOnly = V.landlord && !V.partner;
      var who = admin ? '관리자 계정입니다. 프로젝트 관리는 관리자 화면에서 합니다.' : V.partner && V.landlord ? '참여 중이거나 의뢰하신 프로젝트입니다.' : V.partner ? '공백과 함께 진행 중인 프로젝트입니다.' : '의뢰하신 건물의 진행 상황입니다.';
      function card(p) {
        var pct = p.tasks_total ? Math.round(p.tasks_done / p.tasks_total * 100) : 0;
        var kinds = String(p.kinds || '').split(',').filter(Boolean).map(function (k) { return '<span class="pj-chip kind">' + esc(G.KINDS[k] || k) + '</span>'; }).join('');
        var stage = (p.as === 'landlord' ? G.STAGE_EXT : G.STAGE)[p.stage] || '';
        return '<a class="ct-card" href="' + (admin ? '/admin#/project/' + p.id : '#/p/' + p.id) + '">' +
          '<div class="pj-meta"><span class="pj-code">' + esc(p.code || '') + '</span>' + kinds + (p.approvals ? '<span class="new">확인 요청 ' + p.approvals + '</span>' : '') + (p.unread ? '<span class="new">새 소식 ' + p.unread + '</span>' : '') + '</div><h3>' + esc(p.title) + '</h3><p class="addr">' + esc(p.address || '') + '</p>' +
          '<div class="row"><span>단계 <span class="ct-stage">' + esc(stage) + '</span>' + (p.as === 'partner' ? ' · ' + esc(p.alias || '') : '') + '</span><span>' + (p.my_open ? '<b class="late">' + (p.as === 'landlord' ? '요청 자료 ' : '내 할 일 ') + p.my_open + '</b> · ' : '') + '진행 ' + pct + '%</span></div>' +
          '<div class="pj-progress"><i style="width:' + pct + '%"></i></div></a>';
      }
      var live = items.filter(function (p) { return ACTIVE.indexOf(p.stage) > -1 || p.stage === 'hold'; }), old = items.filter(function (p) { return live.indexOf(p) < 0; });
      var tasks = (j.my_tasks || []);
      var late = tasks.filter(function (t) { return t.due_date && t.due_date < today; }).length;
      var myAp = admin ? [] : A.approvals.filter(function (a) { return a.mine; });
      var unreadPosts = items.reduce(function (a, p) { return a + (p.unread || 0); }, 0);
      var week = W.addDays(today, 7);
      var evSoon = A.items.filter(function (it) { return it.type === 'event' && it.status === 'plan' && it.date >= today && it.date <= week; });
      var upcoming = A.items.filter(function (it) { return it.status !== 'cancel' && it.status !== 'done' && (it.date >= today || it.late) && (it.type !== 'task' || it.mine || admin); }).slice(0, 8);
      // 지금 확인할 일
      var todo = '';
      if (!admin) {
        var firstUnread = items.filter(function (p) { return p.unread; })[0];
        todo = '<div class="ct-todo">' +
          '<a class="ct-tile' + (myAp.length ? ' hot' : '') + '" href="' + (myAp.length ? myAp[0].href : '#/') + '"><span class="l">확인 요청</span><b>' + myAp.length + '</b><span class="s">' + (myAp.length ? esc(myAp[0].title) : '응답할 요청이 없습니다') + '</span></a>' +
          '<a class="ct-tile' + (late ? ' hot' : '') + '" href="' + (tasks.length ? '#/p/' + tasks[0].project_id + '?tab=' + (landlordOnly ? 'overview' : 'tasks') : '#/') + '"><span class="l">' + (landlordOnly ? '요청받은 자료' : '내 할 일') + '</span><b>' + tasks.length + '</b><span class="s">' + (late ? '기한 지남 ' + late + '건' : tasks.length ? esc(tasks[0].title) : '지금 처리할 일이 없습니다') + '</span></a>' +
          '<a class="ct-tile" href="' + (firstUnread ? '#/p/' + firstUnread.id + '?tab=feed' : '#/notifs') + '"><span class="l">새 소식</span><b>' + unreadPosts + '</b><span class="s">' + (firstUnread ? esc(firstUnread.title) : '읽지 않은 글이 없습니다') + '</span></a>' +
          '<a class="ct-tile" href="#/calendar"><span class="l">7일 안의 일정</span><b>' + evSoon.length + '</b><span class="s">' + (evSoon.length ? W.fmtDay(evSoon[0].date, true) + ' ' + esc(evSoon[0].title) : '예정된 일정이 없습니다') + '</span></a></div>';
      }
      app.innerHTML = nav('home') + '<div class="ct-hello"><div><h2 style="font-size:1.4rem">' + esc(ME.name) + '님, 안녕하세요.</h2><p>' + who + '</p></div>' + (admin ? '<a class="btn btn-primary btn-sm" href="/admin#/projects">관리자 화면으로</a>' : '') + '</div>' + todo +
        '<div class="ct-home"><div>' + (live.length ? '<div class="ct-cards">' + live.map(card).join('') + '</div>' : '<div class="pj-empty">' + (old.length ? '진행 중인 프로젝트가 없습니다. 지난 프로젝트는 아래에서 다시 볼 수 있습니다.' : '아직 연결된 프로젝트가 없습니다. 공백이 프로젝트를 연결하면 여기에 바로 표시됩니다.') + '</div>') +
          (!admin ? '<div class="card ct-mytasks"><h2>' + (landlordOnly ? '요청드린 자료' : '내 할 일') + ' <small>' + tasks.length + '건</small></h2>' + (tasks.length ? '<ul class="mini-list">' + tasks.map(function (t) {
            var lt = t.due_date && t.due_date < today;
            return '<li><span><a href="#/p/' + t.project_id + '?tab=' + (landlordOnly ? 'overview' : 'tasks') + '">' + esc(t.title) + '</a><br><span class="age">' + esc(t.project_title) + '</span></span><span class="age' + (lt ? ' late' : '') + '">' + esc(t.due_date ? W.fmtDay(t.due_date, true) + (lt ? ' 지남' : '') : '기한 없음') + '</span></li>';
          }).join('') + '</ul>' : '<p class="muted-s">지금 처리할 일이 없습니다.</p>') + '</div>' : '') +
          (old.length ? '<details class="ct-archive"' + (live.length ? '' : ' open') + '><summary>지난 프로젝트 ' + old.length + '건 <span class="muted-s">완료했거나 종료한 프로젝트의 기록과 자료</span></summary><div class="ct-cards">' + old.map(card).join('') + '</div></details>' : '') + '</div>' +
        '<div class="ct-side">' +
          '<div class="card"><h2>다가오는 일정 <small><a href="#/calendar">달력 보기</a></small></h2>' + (upcoming.length ? '<ul class="ag-list">' + upcoming.map(function (it) { return W.agendaRow(it, today); }).join('') + '</ul>' : '<p class="muted-s">30일 안에 예정된 일정이나 기한이 없습니다.</p>') + '</div>' +
          '<div class="card"><h2>최근 알림 <small><a href="#/notifs">전체 보기</a></small></h2>' + (N.items.length ? '<ul class="nt-list compact">' + N.items.map(W.notifItem).join('') + '</ul>' : '<p class="muted-s">아직 알림이 없습니다.</p>') + '</div>' +
          '<div class="card"><h2>이용 안내</h2><ul class="pj-guide-list todo">' +
            (landlordOnly ? '<li><span class="dot"></span><div><b>진행 상황</b><p>단계와 진행 항목이 바뀔 때마다 이곳에 반영되고 알림함에 표시됩니다.</p></div></li><li><span class="dot"></span><div><b>확인 요청</b><p>승인·확인이 필요한 사항은 프로젝트 화면 맨 위에 나타납니다. 응답은 기록으로 남습니다.</p></div></li><li><span class="dot"></span><div><b>자료·문의</b><p>요청받은 자료는 프로젝트 화면에서 바로 올리고, 궁금한 점은 소통 탭에 남겨 주세요.</p></div></li>'
              : '<li><span class="dot"></span><div><b>소통</b><p>검토 의견과 진행 보고는 프로젝트의 소통 탭에 남겨 주세요. 임대인에게 공유할 내용은 공백이 확인한 뒤 공개합니다.</p></div></li><li><span class="dot"></span><div><b>담당 업무</b><p>맡은 일의 상태와 진행 메모를 바꾸면 공백에 바로 알려집니다. 기한 전날 아침에 알림을 드립니다.</p></div></li><li><span class="dot"></span><div><b>익명 처리</b><p>임대인 화면에는 회사명과 이름 대신 별칭이 표시되고, 연락처는 가려집니다.</p></div></li>') +
          '</ul></div></div></div>' +
        '<p class="ct-note">임대인센터의 정보는 프로젝트 진행 목적으로만 사용할 수 있습니다. 문의는 공백(' + esc((window.GB_SITE || {}).email || 'spaceblank0100@gmail.com') + ')으로 연락 주세요.</p>';
    });
  }

  function calendarPage(seq) {
    var today = G.today(), data = [], asOf = {};
    app.innerHTML = nav('calendar') + '<div class="card ct-cal"><div class="pj-bar"><h2 style="margin:0">내 일정</h2><a class="pj-link" href="/api/center/agenda?ics=1">내 캘린더로 내보내기 (.ics)</a></div><div id="ct-cal"><p class="muted-s">불러오는 중…</p></div>' +
      '<p class="muted-s" style="margin-top:14px">프로젝트 일정, 내 담당 업무 기한, 확인 요청 기한' + (ROLE === 'landlord' ? ', 납부 예정일, 임대차 만기' : '') + '가 함께 표시됩니다. 내보낸 파일을 휴대폰이나 PC의 캘린더 앱에서 열면 일정이 추가됩니다.</p></div>';
    function fetchMonth(ym, done) {
      var first = ym + '-01', from = W.addDays(first, -7), to = W.addDays(first, 38);
      req('GET', '/api/center/agenda?from=' + from + '&to=' + to).then(function (j) {
        if (seq !== SEQ) return;
        data = j.ok ? j.items.filter(function (it) { return it.type !== 'task' || it.mine || ROLE === 'admin' || it.date >= from; }) : [];
        data.forEach(function (it) { it.as = asOf[it.project_id]; it.href = hrefOf(it); });
        done();
      });
    }
    req('GET', '/api/center/projects').then(function (p) {
      if (p.ok) p.items.forEach(function (x) { asOf[x.id] = x.as; });
      fetchMonth(today.slice(0, 7), function () { W.calendar($('#ct-cal'), { items: function () { return data; }, today: today, load: fetchMonth }); });
    });
    refreshBell();
  }

  function notifsPage() {
    app.innerHTML = nav('notifs') + '<div id="ct-notifs"></div>';
    W.notifPanel($('#ct-notifs'), { req: req, toast: toast, onCount: setBell });
  }

  boot();
})();

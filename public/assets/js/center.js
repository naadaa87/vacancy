/* 임대인센터 (/center) — 파트너·임대인용 화면
 * 권한이 없는 계정에는 프로젝트 목록도, 프로젝트가 있다는 사실도 보이지 않습니다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $('#ct-app'), sub = $('#ct-sub');
  var G = window.GBProject, esc = G.esc;
  var ME = null, ROLE = null;

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
      '<div class="ct-who"><div class="card"><h3>임대인</h3><p>공백에 건물을 맡기신 분</p><ul class="ct-checks"><li>진행 단계와 공백의 보고를 한곳에서 확인</li><li>요청드린 자료를 바로 올리기</li><li>궁금한 점을 남기면 공백이 답변</li></ul></div>' +
        '<div class="card"><h3>협력 파트너</h3><p>공백과 함께 프로젝트를 진행하는 중개·자산운용·명도·투자유치·리테일 담당</p><ul class="ct-checks"><li>참여 중인 프로젝트의 건물 정보와 추진사항</li><li>검토 의견과 진행 보고 공유</li><li>내 담당 업무와 정산 조건 확인</li></ul></div></div>' +
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

  function route() {
    var m = location.hash.match(/^#\/p\/(\d+)/);
    window.scrollTo(0, 0);
    if (m) {
      if (ROLE === 'admin') { location.href = '/admin#/project/' + m[1]; return; }
      sub.hidden = true;
      app.innerHTML = '<div class="ct-proj" id="ct-proj"></div>';
      G.mount($('#ct-proj'), +m[1], { base: '#/p/', back: ['#/', '프로젝트 목록'], tab: qs().tab, toast: toast });
      return;
    }
    sub.hidden = false;
    home();
  }

  function home() {
    app.innerHTML = '<p class="muted">불러오는 중…</p>';
    req('GET', '/api/center/projects').then(function (j) {
      if (!j.ok) { gate('불러오지 못했습니다', '<p>잠시 후 다시 시도해 주세요.</p>'); return; }
      var items = j.items, V = j.viewer, admin = ROLE === 'admin';
      var who = admin ? '관리자 계정입니다. 프로젝트 관리는 관리자 화면에서 합니다.' : V.partner && V.landlord ? '참여 중이거나 의뢰하신 프로젝트입니다.' : V.partner ? '공백과 함께 진행 중인 프로젝트입니다.' : '의뢰하신 건물의 진행 상황입니다.';
      var cards = items.map(function (p) {
        var pct = p.tasks_total ? Math.round(p.tasks_done / p.tasks_total * 100) : 0;
        var kinds = String(p.kinds || '').split(',').filter(Boolean).map(function (k) { return '<span class="pj-chip kind">' + esc(G.KINDS[k] || k) + '</span>'; }).join('');
        var stage = (p.as === 'landlord' ? G.STAGE_EXT : G.STAGE)[p.stage] || '';
        return '<a class="ct-card" href="' + (admin ? '/admin#/project/' + p.id : '#/p/' + p.id) + '">' +
          '<div class="pj-meta"><span class="pj-code">' + esc(p.code || '') + '</span>' + kinds + (p.unread ? '<span class="new">새 소식 ' + p.unread + '</span>' : '') + '</div><h3>' + esc(p.title) + '</h3><p class="addr">' + esc(p.address || '') + '</p>' +
          '<div class="row"><span>단계 <span class="ct-stage">' + esc(stage) + '</span>' + (p.as === 'partner' ? ' · ' + esc(p.alias || '') : '') + '</span><span>' + (p.my_open ? '<b class="late">내 할 일 ' + p.my_open + '</b> · ' : '') + '진행 ' + pct + '%</span></div>' +
          '<div class="pj-progress"><i style="width:' + pct + '%"></i></div></a>';
      }).join('');
      var tasks = (j.my_tasks || []);
      app.innerHTML = '<div class="ct-hello"><div><h2 style="font-size:1.4rem">' + esc(ME.name) + '님, 안녕하세요.</h2><p>' + who + '</p></div>' + (admin ? '<a class="btn btn-primary btn-sm" href="/admin#/projects">관리자 화면으로</a>' : '<a class="btn btn-outline btn-sm" href="/account">마이페이지</a>') + '</div>' +
        '<div class="ct-home"><div>' + (items.length ? '<div class="ct-cards">' + cards + '</div>' : '<div class="pj-empty">아직 연결된 프로젝트가 없습니다. 공백이 프로젝트를 연결하면 여기에 바로 표시됩니다.</div>') + '</div>' +
        '<div class="ct-side">' + (!admin ? '<div class="card"><h2>' + (V.landlord && !V.partner ? '요청드린 자료' : '내 할 일') + ' <small>' + tasks.length + '건</small></h2>' + (tasks.length ? '<ul class="mini-list">' + tasks.map(function (t) {
          var late = t.due_date && t.due_date < G.today();
          return '<li><span><a href="#/p/' + t.project_id + '?tab=' + (V.landlord && !V.partner ? 'overview' : 'tasks') + '">' + esc(t.title) + '</a><br><span class="age">' + esc(t.project_title) + '</span></span><span class="age' + (late ? ' late' : '') + '">' + esc(t.due_date || '') + '</span></li>';
        }).join('') + '</ul>' : '<p class="muted-s">지금 처리할 일이 없습니다.</p>') + '</div>' : '') +
          '<div class="card"><h2>이용 안내</h2><ul class="pj-guide-list todo">' +
            (V.landlord && !V.partner ? '<li><span class="dot"></span><div><b>진행 상황</b><p>단계와 진행 항목이 바뀔 때마다 이곳에 반영됩니다.</p></div></li><li><span class="dot"></span><div><b>자료 보내기</b><p>요청드린 자료는 프로젝트 화면에서 바로 올리실 수 있습니다.</p></div></li><li><span class="dot"></span><div><b>문의</b><p>소통 탭에 남겨 주시면 공백이 확인하고 답변드립니다.</p></div></li>'
              : '<li><span class="dot"></span><div><b>소통</b><p>검토 의견과 진행 보고는 프로젝트의 소통 탭에 남겨 주세요. 임대인에게 공유할 내용은 공백이 확인한 뒤 공개합니다.</p></div></li><li><span class="dot"></span><div><b>익명 처리</b><p>임대인 화면에는 회사명과 이름 대신 별칭이 표시되고, 연락처는 가려집니다.</p></div></li><li><span class="dot"></span><div><b>정보 이용</b><p>프로젝트 정보는 해당 프로젝트 진행 목적으로만 사용해 주세요.</p></div></li>') +
          '</ul></div></div></div>' +
        '<p class="ct-note">임대인센터의 정보는 프로젝트 진행 목적으로만 사용할 수 있습니다. 문의는 공백(spaceblank0100@gmail.com)으로 연락 주세요.</p>';
    });
  }

  boot();
})();

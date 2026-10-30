/* 회원 기능 화면 (회원가입·로그인·비밀번호 재설정·마이페이지) */
(function () {
  var ERR = {
    email_taken: '이미 가입된 이메일입니다. 로그인하시거나 비밀번호 찾기를 이용해 주세요.',
    invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
    locked: '로그인을 여러 번 실패해 15분 동안 잠겼습니다. 잠시 후 다시 시도하거나 비밀번호를 재설정해 주세요.',
    wrong_password: '비밀번호가 맞지 않습니다.',
    invalid_token: '링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 요청해 주세요.',
    mail_not_configured: '이메일 발송이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
    mail_failed: '메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.',
    db_not_configured: '회원 기능이 아직 준비되지 않았습니다. 지금은 문의하기를 이용해 주세요.',
    unauthorized: '로그인이 필요합니다.',
    validation: '입력한 내용을 다시 확인해 주세요.',
    server_error: '일시적인 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'
  };

  function api(path, body) {
    var opt = body === undefined ? { cache: 'no-store', credentials: 'same-origin' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: r.status === 404 ? 'db_not_configured' : 'server_error' }; })
        .then(function (j) { j._status = r.status; return j; });
    }).catch(function () { return { ok: false, error: 'server_error' }; });
  }
  function status(form, kind, msg) { var s = form.querySelector('.form-status'); if (!s) return; s.className = 'form-status ' + (kind || ''); s.innerHTML = msg || ''; }
  function setInvalid(el, bad) { var f = el && el.closest('.field'); if (f) f.classList.toggle('is-invalid', !!bad); }
  function data(form) {
    var d = {};
    form.querySelectorAll('input,select,textarea').forEach(function (el) {
      if (!el.name || el.disabled) return;
      d[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    return d;
  }
  var pwOk = function (v) { return v.length >= 8 && /[A-Za-z]/.test(v) && /[0-9]/.test(v); };
  function validate(form) {
    var ok = true, first = null;
    form.querySelectorAll('.field.is-invalid').forEach(function (f) { f.classList.remove('is-invalid'); });
    form.querySelectorAll('input,select').forEach(function (el) {
      if (el.disabled || el.type === 'hidden' || !el.name || el.closest('.hp')) return;
      var v = el.type === 'checkbox' ? el.checked : el.value.trim(), bad = false;
      if (el.required) bad = el.type === 'checkbox' ? !v : !v;
      if (!bad && el.type === 'email' && v) bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      if (!bad && el.type === 'tel' && v) bad = v.replace(/\D/g, '').length < 9;
      if (!bad && el.name === 'password' && el.autocomplete === 'new-password') bad = !pwOk(v);
      if (!bad && el.dataset.match) bad = v !== document.getElementById(el.dataset.match).value;
      if (bad) { setInvalid(el, true); ok = false; if (!first) first = el; }
    });
    if (first) first.focus();
    return ok;
  }
  function markFields(form, fields) {
    (fields || []).forEach(function (n) { var el = form.querySelector('[name="' + n + '"]') || (n === 'agree' && form.querySelector('[data-agree]')); setInvalid(el, true); });
  }
  function wire(form, handler) {
    if (!form) return;
    form.querySelectorAll('input,select').forEach(function (el) { el.addEventListener('input', function () { setInvalid(el, false); }); el.addEventListener('change', function () { setInvalid(el, false); }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status(form, '', '');
      if (!validate(form)) { status(form, 'err', '표시된 항목을 확인해 주세요.'); return; }
      var btn = form.querySelector('button[type=submit]'); var label = btn.textContent;
      btn.disabled = true; btn.textContent = '처리 중…';
      Promise.resolve(handler(data(form))).finally(function () { btn.disabled = false; btn.textContent = label; });
    });
  }
  function fail(form, j) { markFields(form, j.fields); status(form, 'err', j.message || ERR[j.error] || ERR.server_error); }
  var next = (function () { try { var n = new URLSearchParams(location.search).get('next'); return n && n.charAt(0) === '/' && n.charAt(1) !== '/' ? n : null; } catch (e) { return null; } })();

  // 초대 메일의 링크(?email=)로 들어오면 이메일을 미리 채웁니다
  (function () { try { var em = new URLSearchParams(location.search).get('email'); if (!em) return; ['s-email', 'l-email', 'email'].forEach(function (id) { var el = document.getElementById(id); if (el && !el.value) el.value = em; }); document.querySelectorAll('#signup-form input[type=email], #login-form input[type=email]').forEach(function (el) { if (!el.value) el.value = em; }); } catch (e) {} })();

  /* 서버 기능이 준비되지 않았으면 폼 대신 안내 표시 */
  var authForms = document.querySelectorAll('[data-auth-form]');
  if (authForms.length) {
    api('/api/auth/me').then(function (j) {
      if (j.configured === false || j._status === 404) {
        document.querySelectorAll('[data-auth-off]').forEach(function (x) { x.hidden = false; });
        authForms.forEach(function (f) { if (f.id === 'signup-form' || f.id === 'login-form') f.hidden = true; });
      } else if (j.user && (document.getElementById('signup-form') || document.getElementById('login-form'))) {
        location.replace(next || '/account');
      }
    });
  }

  /* 회원가입 */
  var all = document.getElementById('s-all');
  if (all) {
    var boxes = document.querySelectorAll('[data-agree]');
    all.addEventListener('change', function () { boxes.forEach(function (b) { b.checked = all.checked; setInvalid(b, false); }); });
    boxes.forEach(function (b) { b.addEventListener('change', function () { all.checked = Array.prototype.every.call(boxes, function (x) { return x.checked; }); }); });
  }
  var signup = document.getElementById('signup-form');
  wire(signup, function (d) {
    return api('/api/auth/signup', { email: d.email, password: d.password, name: d.name, phone: d.phone, role: d.role, company: d.company,
      agree_terms: d.agree_terms, agree_privacy: d.agree_privacy, marketing: d.marketing, website: d.website })
      .then(function (j) { if (j.ok) location.href = (next || '/account') + (j.verification_sent ? (next ? '' : '?welcome=mail') : (next ? '' : '?welcome=1')); else fail(signup, j); });
  });

  /* 로그인 */
  var login = document.getElementById('login-form');
  wire(login, function (d) {
    return api('/api/auth/login', { email: d.email, password: d.password })
      .then(function (j) { if (j.ok) location.href = next || '/account'; else fail(login, j); });
  });

  /* 비밀번호 찾기 */
  var forgot = document.getElementById('forgot-form');
  wire(forgot, function (d) {
    return api('/api/auth/forgot', { email: d.email }).then(function (j) {
      if (j.ok) { status(forgot, 'ok', '입력하신 이메일이 가입되어 있다면 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.'); forgot.querySelector('button').disabled = true; }
      else fail(forgot, j);
    });
  });

  /* 새 비밀번호 */
  var reset = document.getElementById('reset-form');
  if (reset) {
    var token = new URLSearchParams(location.search).get('token');
    if (!token) status(reset, 'err', '재설정 링크가 올바르지 않습니다. <a href="/forgot-password">비밀번호 찾기</a>를 다시 요청해 주세요.');
    wire(reset, function (d) {
      return api('/api/auth/reset', { token: token, password: d.password }).then(function (j) {
        if (j.ok) { reset.innerHTML = '<div class="form-done"><h2>비밀번호를 바꿨습니다.</h2><p>새 비밀번호로 로그인해 주세요.</p><div class="acts"><a class="btn btn-primary" href="/login">로그인</a></div></div>'; }
        else fail(reset, j);
      });
    });
  }

  /* 마이페이지 */
  var acc = document.getElementById('acc-body');
  if (acc) {
    var flash = document.getElementById('acc-flash');
    var q = new URLSearchParams(location.search);
    var msg = { 'welcome=mail': '가입을 환영합니다. 이메일로 보낸 인증 링크를 눌러 주세요.', 'welcome=1': '가입을 환영합니다.', 'verify=ok': '이메일 인증이 완료되었습니다.', 'verify=fail': '인증 링크가 만료되었거나 이미 사용되었습니다. 아래에서 다시 받아 주세요.' };
    Object.keys(msg).forEach(function (k) { var p = k.split('='); if (q.get(p[0]) === p[1]) { flash.textContent = msg[k]; flash.hidden = false; } });

    api('/api/auth/me').then(function (j) {
      document.getElementById('acc-loading').hidden = true;
      if (j.configured === false || j._status === 404) { flash.innerHTML = ERR.db_not_configured; flash.hidden = false; return; }
      if (!j.user) { location.replace('/login?next=' + encodeURIComponent('/account' + location.search)); return; }
      var u = j.user;
      document.getElementById('acc-title').textContent = u.name + '님의 마이페이지';
      document.getElementById('acc-sub').textContent = u.email + ' · 가입일 ' + (u.created_at || '').slice(0, 10);
      document.getElementById('acc-acts').hidden = false;
      if (u.is_admin) document.getElementById('acc-admin').hidden = false;
      if (j.center === 'partner' || j.center === 'landlord') { document.getElementById('acc-center').hidden = false; document.getElementById('acc-center-t').textContent = j.center === 'landlord' ? '의뢰하신 건물의 진행 상황, 요청 자료, 공백의 보고를 확인하세요.' : '함께 진행 중인 프로젝트의 정보, 추진사항, 소통 내용을 확인하세요.'; }
      if (!u.email_verified) document.getElementById('acc-verify').hidden = false;
      acc.hidden = false;
      document.getElementById('p-email').value = u.email;
      document.getElementById('p-name').value = u.name;
      document.getElementById('p-phone').value = u.phone;
      document.getElementById('p-role').value = u.role || 'other';
      document.getElementById('p-company').value = u.company;
      document.getElementById('p-mkt').checked = u.marketing;
      loadInquiries(); loadDocs();
    });

    var STAGE_USER = { new: ['접수', 'tag-warn'], review: ['검토 중', 'tag-warn'], replied: ['회신 완료', 'tag-ok'], site: ['현장진단 진행', 'tag-ok'], proposal: ['제안 진행', 'tag-ok'],
      contract: ['계약', 'tag-ok'], hold: ['보류', 'tag-neutral'], closed: ['종료', 'tag-neutral'] };
    function loadDocs() {
      api('/api/account/documents').then(function (j) {
        var box = document.getElementById('acc-docs');
        if (!j.ok) { box.innerHTML = '<p class="muted">받은 자료를 불러오지 못했습니다.</p>'; return; }
        if (!j.items.length) { box.innerHTML = '<p class="muted">공백에서 보내드린 리포트·자료가 여기에 모입니다.</p>'; return; }
        box.innerHTML = '<ul class="inq-list">' + j.items.map(function (d) {
          return '<li><div class="inq-top"><span class="tag ' + (d.opened_at ? 'tag-neutral' : 'tag-no') + '">' + (d.opened_at ? '열람' : '새 자료') + '</span><span class="tiny">' + esc((d.sent_at || '').slice(0, 10)) + '</span></div>' +
            '<b><a href="/documents/view?d=' + d.id + '">' + esc(d.title) + '</a></b>' + (d.file_name ? '<p class="tiny">첨부: ' + esc(d.file_name) + '</p>' : '') + '</li>';
        }).join('') + '</ul>';
      });
    }
    var TYPE = { develop: '공실개발 검토', valueup: '매각 전 밸류업', partner: '파트너 제안', tenant: '입점·운영 파트너 등록', other: '기타' };
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function loadInquiries() {
      api('/api/account/inquiries').then(function (j) {
        var box = document.getElementById('acc-inq');
        if (!j.ok) { box.innerHTML = '<p class="muted">문의 내역을 불러오지 못했습니다.</p>'; return; }
        if (!j.items.length) { box.innerHTML = '<div class="empty"><p>아직 접수한 문의가 없습니다.</p><a class="btn btn-primary btn-sm" href="/contact">공간 검토 요청하기</a></div>'; return; }
        box.innerHTML = '<ul class="inq-list">' + j.items.map(function (i) {
          var st = STAGE_USER[i.stage || (i.handled ? 'replied' : 'new')] || ['접수', 'tag-warn'];
          return '<li><div class="inq-top"><span class="tag ' + st[1] + '">' + st[0] + '</span>' +
            '<span class="tiny">' + esc((i.created_at || '').slice(0, 10)) + ' · 접수번호 #' + i.id + '</span></div>' +
            '<b>' + esc(TYPE[i.type] || i.type) + ' · ' + esc(i.address) + '</b>' +
            (i.floor_area ? '<p class="tiny">' + esc(i.floor_area) + '</p>' : '') +
            '<p class="inq-msg">' + esc(i.message).slice(0, 160) + (i.message && i.message.length > 160 ? '…' : '') + '</p></li>';
        }).join('') + '</ul>';
      });
    }

    var resend = document.getElementById('acc-resend');
    resend.addEventListener('click', function () {
      resend.disabled = true;
      api('/api/auth/resend-verification', {}).then(function (j) {
        resend.textContent = j.ok ? '보냈습니다. 메일함을 확인해 주세요' : (ERR[j.error] || ERR.server_error);
      });
    });

    var pf = document.getElementById('profile-form');
    wire(pf, function (d) {
      return api('/api/account/profile', { name: d.name, phone: d.phone, role: d.role, company: d.company, marketing: d.marketing })
        .then(function (j) { if (j.ok) { status(pf, 'ok', '저장했습니다.'); document.getElementById('acc-title').textContent = j.user.name + '님의 마이페이지'; } else fail(pf, j); });
    });
    var pw = document.getElementById('password-form');
    wire(pw, function (d) {
      return api('/api/account/password', { current: d.current, password: d.password })
        .then(function (j) { if (j.ok) { status(pw, 'ok', '비밀번호를 바꿨습니다. 다른 기기의 로그인은 해제되었습니다.'); pw.reset(); } else fail(pw, j); });
    });
    var del = document.getElementById('delete-form');
    wire(del, function (d) {
      if (!confirm('정말 탈퇴하시겠습니까? 되돌릴 수 없습니다.')) return;
      return api('/api/account/delete', { password: d.password })
        .then(function (j) { if (j.ok) { alert('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.'); location.href = '/'; } else fail(del, j); });
    });
    document.getElementById('acc-logout').addEventListener('click', function () {
      api('/api/auth/logout', {}).then(function () { location.href = '/'; });
    });
  }
})();

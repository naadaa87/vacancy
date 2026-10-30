/* 문의 폼 — 사이트 안에서 전송합니다 (mailto 사용 안 함). */
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var done = document.getElementById('form-done');
  var submit = document.getElementById('f-submit');

  // URL 파라미터로 유형 미리 선택 (/contact?type=partner, ?from=assessment)
  try {
    var q = new URLSearchParams(location.search);
    var t = q.get('type');
    if (t) { var sel = document.getElementById('f-type'); if (sel && sel.querySelector('option[value="' + t + '"]')) sel.value = t; }
    var src = document.getElementById('f-source');
    if (src) src.value = (q.get('from') || document.referrer || '').slice(0, 200);
    if (q.get('from') === 'assessment') {
      var s = sessionStorage.getItem('gb_assess_summary');
      var msg = document.getElementById('f-msg');
      if (s && msg && !msg.value) msg.value = s + '\n\n';
    }
  } catch (e) {}

  // 회원이면 이름·연락처·이메일·구분 자동 입력
  if (/(?:^|;\s*)gb_li=1/.test(document.cookie)) {
    fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.user) return;
      var u = j.user, map = { 'f-name': u.company ? u.name + ' · ' + u.company : u.name, 'f-phone': u.phone, 'f-email': u.email, 'f-role': u.role };
      Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el && !el.value && map[id]) el.value = map[id]; });
      var note = document.getElementById('member-note');
      if (note) { note.hidden = false; note.innerHTML = '<b>' + u.name + '</b>님 회원 정보로 채웠습니다. 접수한 문의는 <a href="/account">마이페이지</a>에서 확인할 수 있습니다.'; }
    }).catch(function () {});
  }

  function setInvalid(el, bad) {
    var f = el.closest('.field');
    if (f) f.classList.toggle('is-invalid', bad);
  }

  function validate() {
    var ok = true, first = null;
    form.querySelectorAll('[required]').forEach(function (el) {
      var bad = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      if (el.type === 'email' && !bad) bad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      if (el.type === 'tel' && !bad) bad = el.value.replace(/[^0-9]/g, '').length < 9;
      setInvalid(el, bad);
      if (bad) { ok = false; if (!first) first = el; }
    });
    if (first) first.focus();
    return ok;
  }

  form.querySelectorAll('[required]').forEach(function (el) {
    el.addEventListener('input', function () { setInvalid(el, false); });
    el.addEventListener('change', function () { setInvalid(el, false); });
  });

  function show(kind, text) { status.className = 'form-status ' + kind; status.innerHTML = text; }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.className = 'form-status';
    if (!validate()) { show('err', '필수 항목을 확인해 주세요.'); return; }
    if (form.querySelector('[name=agree]') && !form.querySelector('[name=agree]').checked) { show('err', '개인정보 수집·이용에 동의해 주세요.'); return; }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data.page = location.href;

    submit.disabled = true; submit.textContent = '전송 중…';
    fetch(form.getAttribute('action'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: r.ok }; }).then(function (j) { j._status = r.status; return j; });
    }).then(function (j) {
      if (j.ok || j.success) {
        form.hidden = true; done.hidden = false;
        done.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      fallback(j, data);
    }).catch(function () { fallback({}, data); })
      .finally(function () { submit.disabled = false; submit.textContent = '공간 검토 요청하기'; });
  });

  function fallback(j, data) {
    var email = (document.querySelector('.contact-aside .ct a[href^="mailto:"]') || {}).textContent || '';
    var body = ['[공간 검토 요청]', '이름/소속: ' + data.name, '구분: ' + data.role, '연락처: ' + data.phone, '이메일: ' + data.email,
      '문의 유형: ' + data.type, '공간 주소: ' + data.address, '층수·면적: ' + (data.floor_area || ''), '현재 용도·상태: ' + (data.status || ''),
      '임대조건·공실기간·예산: ' + (data.conditions || ''), '', data.message].join('\n');
    var href = 'mailto:' + email + '?subject=' + encodeURIComponent('[공간 검토 요청] ' + data.name) + '&body=' + encodeURIComponent(body);
    var why = j && j.error === 'not_configured' ? '접수 시스템이 아직 연결되지 않았습니다.' : '전송 중 문제가 생겼습니다.';
    show('err', why + ' 아래 버튼을 누르면 작성하신 내용이 담긴 이메일을 바로 보낼 수 있습니다. <a class="btn btn-ink btn-sm" style="margin-left:8px" href="' + href + '">이메일로 보내기</a>');
  }
})();

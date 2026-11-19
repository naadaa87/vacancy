/* 임대인센터 업무 화면 — 일정·달력, 확인 요청, 비용·정산(임대인), 기록·인쇄, 알림함
 * project.js(프로젝트 화면)와 center.js·admin.js(센터 홈·전체 일정·알림)에서 함께 씁니다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function nl(s) { return esc(s).replace(/\n/g, '<br>'); }

  var EV_KIND = { meeting: '미팅·회의', site: '현장 방문·실사', contract: '계약·서명', work: '공사·작업', open: '오픈·입점', pay: '납부·정산', etc: '기타' };
  var EV_SHORT = { meeting: '미팅', site: '현장', contract: '계약', work: '공사', open: '오픈', pay: '납부', etc: '일정' };
  var RSVP = { yes: '참석', no: '불참', maybe: '미정' };
  var AP_ST = { pending: '응답 대기', approved: '승인', changes: '수정 요청', declined: '보류', cancel: '요청 취소' };
  var AP_KIND = { approve: '승인 요청', confirm: '확인 요청' };
  var AUD = { internal: '공백 내부', team: '참여자 공유', all: '임대인 공유', direct: '1:1' };
  var TYPE = { event: '일정', task: '할 일', money: '정산', lease: '임대차', approval: '확인 요청' };
  var MONEY_ST = { plan: '예정', due: '청구', done: '납부 완료', cancel: '취소' };
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var NOTE_APPROVAL = '응답은 진행 의사를 확인하는 기록으로 남습니다. 계약의 체결·변경은 별도 계약서에 따릅니다.';

  /* ---------- 날짜 ---------- */
  function kstToday() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
  function parts(d) { var x = new Date(d + 'T00:00:00Z'); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), w: x.getUTCDay() }; }
  function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function fmtDay(d, short) { if (!d) return ''; var p = parts(d); return (short ? p.m + '/' + p.d : p.m + '월 ' + p.d + '일') + ' (' + DOW[p.w] + ')'; }
  function dday(d, today) { var n = Math.round((Date.parse(d) - Date.parse(today || kstToday())) / 864e5); return n === 0 ? '오늘' : n === 1 ? '내일' : n > 0 ? 'D-' + n : Math.abs(n) + '일 지남'; }
  function kstDt(iso) { return iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) : ''; }
  function timeRange(e) { return e.time ? e.time + (e.end_time ? '~' + e.end_time : '') : '종일'; }
  function won(n) { return n == null || n === '' ? '-' : Math.round(n).toLocaleString('ko-KR') + '원'; }

  /* ---------- 일정 한 줄 (홈·달력 아래 목록) ---------- */
  function agendaRow(it, today) {
    var tag = it.type === 'event' ? (EV_SHORT[it.kind] || '일정') : it.type === 'task' && it.kind === 'doc' ? '자료 요청' : TYPE[it.type];
    var st = it.status === 'cancel' ? '<span class="pj-chip">취소</span>' : it.status === 'done' && it.type === 'event' ? '<span class="pj-chip">완료</span>' : it.late ? '<span class="pj-chip hot">지연</span>' : '';
    return '<li class="ag t-' + it.type + (it.status === 'cancel' ? ' x' : '') + '"><span class="ag-d"><b>' + fmtDay(it.date, true) + '</b><em>' + esc(it.time || (today && it.date >= today ? dday(it.date, today) : '')) + '</em></span>' +
      '<span class="ag-b"><span class="ag-t"><span class="pj-chip t-' + it.type + '">' + esc(tag) + '</span>' + (it.href ? '<a href="' + it.href + '">' + esc(it.title) + '</a>' : '<b>' + esc(it.title) + '</b>') + (it.mine ? '<span class="pj-chip doc">' + (it.type === 'approval' ? '응답 필요' : it.kind === 'doc' ? '보내 주실 자료' : '내 담당') + '</span>' : '') + st + '</span>' +
      (it.ptitle || it.sub || it.amount != null ? '<small>' + esc([it.ptitle, it.sub, it.amount != null ? won(it.amount) : ''].filter(Boolean).join(' · ')) + '</small>' : '') + '</span></li>';
  }

  /* ---------- 월간 달력 ----------
   * opt: { items: 배열 또는 함수, today, month('YYYY-MM'), load(ym, done): 달을 옮길 때 데이터를 다시 받아야 하면, row(it): 목록 한 줄 } */
  function calendar(el, opt) {
    var today = opt.today || kstToday(), ym = (opt.month || today).slice(0, 7), picked = null;
    function shift(n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; var d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); }
    function draw() {
      var items = (typeof opt.items === 'function' ? opt.items() : opt.items) || [];
      var first = ym + '-01', start = addDays(first, -parts(first).w), map = {};
      items.forEach(function (it) {
        if (!it.date) return;
        var d = it.date, end = it.end_date && it.end_date > it.date ? it.end_date : it.date, guard = 0;
        while (d <= end && guard++ < 62) { (map[d] = map[d] || []).push(it); d = addDays(d, 1); }
      });
      var cells = '';
      for (var i = 0; i < 42; i++) {
        var d = addDays(start, i), inM = d.slice(0, 7) === ym, list = map[d] || [];
        if ((i === 28 || i === 35) && !inM) break; // 다음 달로만 채워지는 줄은 그리지 않음
        cells += '<button type="button" class="cal-d' + (inM ? '' : ' out') + (d === today ? ' today' : '') + (d === picked ? ' sel' : '') + (list.length ? ' has' : '') + (i % 7 === 0 ? ' sun' : '') + '" data-d="' + d + '" aria-label="' + fmtDay(d) + (list.length ? ', ' + list.length + '건' : '') + '"><span class="n">' + parts(d).d + '</span><span class="cal-items">' +
          list.slice(0, 3).map(function (it) { return '<i class="cal-chip t-' + it.type + (it.status === 'cancel' ? ' x' : '') + (it.late ? ' late' : '') + '">' + esc((it.time ? it.time + ' ' : '') + it.title) + '</i>'; }).join('') +
          (list.length > 3 ? '<i class="cal-more">+' + (list.length - 3) + '</i>' : '') + '</span></button>';
      }
      var last = shift(1) + '-01';
      var monthItems = items.filter(function (it) { return it.date && it.date < last && (it.end_date || it.date) >= first; });
      var shown = picked ? (map[picked] || []) : monthItems;
      var row = opt.row || function (it) { return agendaRow(it, today); };
      var types = {}; items.forEach(function (it) { types[it.type] = 1; });
      el.innerHTML = '<div class="cal"><div class="cal-head"><button type="button" data-nav="-1" aria-label="이전 달">‹</button><b>' + +ym.slice(0, 4) + '년 ' + +ym.slice(5, 7) + '월</b><button type="button" data-nav="1" aria-label="다음 달">›</button>' +
        '<button type="button" class="cal-today" data-nav="0">오늘</button><span class="cal-legend">' + Object.keys(TYPE).filter(function (k) { return types[k]; }).map(function (k) { return '<i class="cal-chip t-' + k + '">' + TYPE[k] + '</i>'; }).join('') + '</span></div>' +
        '<div class="cal-grid" role="grid">' + DOW.map(function (w, i) { return '<span class="cal-dow' + (i === 0 ? ' sun' : '') + '">' + w + '</span>'; }).join('') + cells + '</div>' +
        '<div class="cal-list"><h3>' + (picked ? fmtDay(picked) : +ym.slice(5, 7) + '월 일정') + (picked ? ' <button type="button" class="pj-link" data-all>이 달 전체 보기</button>' : ' <small>' + monthItems.length + '건</small>') + '</h3>' +
        (shown.length ? '<ul class="ag-list">' + shown.map(row).join('') + '</ul>' : '<p class="muted-s">' + (picked ? '이 날은 일정이 없습니다.' : '이 달에는 일정이 없습니다.') + '</p>') + '</div></div>';
      $$('[data-nav]', el).forEach(function (b) {
        b.onclick = function () {
          var n = +b.dataset.nav; picked = null; ym = n ? shift(n) : today.slice(0, 7);
          if (opt.load) opt.load(ym, draw); else draw();
        };
      });
      $$('.cal-d', el).forEach(function (b) { b.onclick = function () { picked = picked === b.dataset.d ? null : b.dataset.d; draw(); }; });
      var all = $('[data-all]', el); if (all) all.onclick = function () { picked = null; draw(); };
      if (opt.after) opt.after(el);
    }
    draw();
    return { redraw: draw, month: function () { return ym; } };
  }

  /* ==========================================================================
     프로젝트 화면의 탭 (X: project.js 가 넘겨주는 화면 문맥)
     ========================================================================== */
  function projItems(X) {
    var D = X.D(), today = X.today(), out = [];
    (D.events || []).forEach(function (e) { out.push({ type: 'event', kind: e.kind, date: e.date, end_date: e.end_date, time: e.time, title: e.title, sub: e.place, status: e.status }); });
    (D.tasks || []).forEach(function (t) { if (t.due_date && t.status !== 'done') out.push({ type: 'task', date: t.due_date, title: t.title, sub: t.owner_label, mine: t.mine, late: t.due_date < today }); });
    (D.approvals || []).forEach(function (a) { if (a.due_date && a.status === 'pending') out.push({ type: 'approval', date: a.due_date, title: a.title, sub: a.target_label || '', late: a.due_date < today }); });
    var money = X.isLandlord() ? (D.bills || []) : (D.money || []);
    money.forEach(function (m) { if (m.due_date && (m.status === 'plan' || m.status === 'due')) out.push({ type: 'money', date: m.due_date, title: m.label, amount: m.amount, sub: X.isAdmin() ? (m.direction === 'in' ? '받을 돈' : '줄 돈') : X.isLandlord() ? '납부 예정' : '지급 예정' }); });
    (D.units || []).forEach(function (u) { if (u.lease_end && u.status === 'leased') out.push({ type: 'lease', date: u.lease_end, title: '임대차 만기 ' + [u.floor, u.unit].filter(Boolean).join(' '), sub: u.tenant || '' }); });
    return out.sort(function (a, b) { return (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1; });
  }

  function rsvpRow(e, X) {
    if (X.isAdmin()) {
      var R = e.rsvps || [];
      return R.length ? '<p class="ev-rsvps">참석 응답: ' + R.map(function (r) { return '<span class="rv-' + r.answer + '">' + esc(r.who) + ' ' + RSVP[r.answer] + (r.note ? ' (' + esc(r.note) + ')' : '') + '</span>'; }).join(' · ') + '</p>' : '';
    }
    if (e.status !== 'plan' || X.ro()) return e.rsvp ? '<p class="ev-rsvps">내 응답: ' + RSVP[e.rsvp.answer] + '</p>' : '';
    var cur = e.rsvp ? e.rsvp.answer : '';
    return '<div class="ev-rsvp"><span>참석 여부</span>' + Object.keys(RSVP).map(function (k) { return '<button type="button" data-rsvp="' + k + '" data-ev="' + e.id + '" aria-pressed="' + (cur === k) + '">' + RSVP[k] + '</button>'; }).join('') + '</div>';
  }
  function eventCard(e, X, manager) {
    var today = X.today(), p = parts(e.date), live = e.status === 'plan';
    var canEdit = manager && (X.isAdmin() || (e.audience !== 'internal' && e.audience !== 'direct'));
    return '<li class="ev ' + e.status + '" data-id="' + e.id + '"><div class="ev-date"><b>' + p.d + '</b><span>' + p.m + '월 ' + DOW[p.w] + '</span></div><div class="ev-main">' +
      '<div class="ev-top">' + X.chip(EV_KIND[e.kind] || '일정', 'kind') + (e.audience ? X.chip(e.audience === 'direct' ? (e.direct_label || '1:1') : AUD[e.audience], 'aud-' + e.audience) : (e.direct_label ? X.chip(e.direct_label, 'aud-direct') : '')) +
        (e.status === 'done' ? X.chip('완료') : e.status === 'cancel' ? X.chip('취소', 'warn') : '') + '<span class="ev-time">' + esc(timeRange(e)) + (e.end_date ? ' ~ ' + fmtDay(e.end_date, true) : '') + '</span>' + (live && e.date >= today ? '<span class="ev-dday">' + dday(e.date, today) + '</span>' : '') + '</div>' +
      '<h3>' + esc(e.title) + '</h3>' + (e.place ? '<p class="ev-place">' + esc(e.place) + '</p>' : '') + (e.detail ? '<p class="ev-detail">' + nl(e.detail) + '</p>' : '') +
      (e.result ? '<div class="ev-result"><b>결과</b>' + nl(e.result) + '</div>' : '') + rsvpRow(e, X) +
      '<div class="ev-acts">' + (e.status !== 'cancel' ? '<a class="pj-link" href="/api/center/events?project_id=' + X.id + '&ics=1&id=' + e.id + '">내 캘린더에 추가</a>' : '') +
        (canEdit ? '<button type="button" class="pj-link" data-eedit="' + e.id + '">수정</button><button type="button" class="pj-link" data-eres="' + e.id + '">' + (e.status === 'done' ? '결과 고치기' : '완료·결과 기록') + '</button>' +
          (e.status === 'cancel' ? '<button type="button" class="pj-link" data-est="plan" data-ev="' + e.id + '">다시 예정으로</button>' : e.status === 'plan' ? '<button type="button" class="pj-link" data-est="cancel" data-ev="' + e.id + '">취소</button>' : '') +
          '<button type="button" class="pj-link danger" data-edel="' + e.id + '">삭제</button>' : '') + '</div></div></li>';
  }

  var schedView = 'list';
  function scheduleTab(el, X) {
    var D = X.D(), today = X.today(), id = X.id;
    var manager = !X.ro() && (X.isAdmin() || (X.isPartner() && X.has('tasks')));
    var evs = D.events || [];
    var up = evs.filter(function (e) { return e.status === 'plan' && (e.end_date || e.date) >= today; });
    var past = evs.filter(function (e) { return up.indexOf(e) < 0; }).reverse();
    var audOpt = X.isAdmin() ? { team: '참여자 공유', all: '임대인까지 공유', direct: '한 사람과 1:1', internal: '공백 내부' } : X.has('publish') ? { team: '참여자 공유', all: '임대인까지 공유' } : { team: '참여자 공유' };
    var people = X.isAdmin() ? D.members.filter(function (m) { return m.status === 'active'; }).map(function (m) { return '<option value="m:' + m.id + '">' + esc(m.alias + ' · ' + m.name) + '</option>'; }).join('') + (D.landlord ? '<option value="l">임대인 ' + esc(D.landlord.name) + '</option>' : '') : '';
    var html = '';
    if (manager) {
      html += '<form class="card pj-task-form" id="ev-form"><h2 id="ev-form-h">일정 등록</h2><input type="hidden" name="id"><div class="pj-tgrid">' +
        '<input name="title" placeholder="일정 이름 (예: 현장 실사, 임대 조건 미팅)" required maxlength="120" class="wide">' +
        '<select name="kind" title="종류">' + X.opts(EV_KIND, 'meeting') + '</select><input type="date" name="date" required title="날짜" value="' + today + '">' +
        '<input type="time" name="time" title="시작 시간"><input type="time" name="end_time" title="끝나는 시간">' +
        '<select name="audience" title="함께 보는 범위">' + X.opts(audOpt, X.isAdmin() && D.landlord ? 'all' : 'team') + '</select>' + (X.isAdmin() ? '<select name="direct_to" hidden><option value="">함께할 사람</option>' + people + '</select>' : '') +
        '<input name="place" placeholder="장소 (선택)" maxlength="200" class="wide"><input name="detail" placeholder="준비물·안내 (선택)" maxlength="2000" class="wide"></div>' +
        '<div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify"' + (X.isAdmin() ? ' checked' : '') + '> 함께 보는 분들에게 메일로도 알리기</label><span><button type="button" class="btn btn-outline btn-sm" id="ev-reset" hidden>취소</button> <button class="btn btn-ink btn-sm" id="ev-save">등록</button></span></div>' +
        '<p class="muted-s">등록하면 함께 보는 분들의 알림함에 표시되고, 전날과 당일 아침에 알림함으로 한 번 더 알려 드립니다.' + (X.isAdmin() ? ' 임대인에게는 파트너 이름·연락처가 가려져 보입니다.' : '') + '</p></form>';
    }
    html += '<div class="pj-bar"><div class="pills" id="ev-view"><button type="button" data-v="list" aria-pressed="' + (schedView === 'list') + '">목록<span class="c">' + up.length + '</span></button><button type="button" data-v="cal" aria-pressed="' + (schedView === 'cal') + '">달력</button></div>' +
      (evs.length ? '<a class="pj-link" href="/api/center/events?project_id=' + id + '&ics=1">전체 일정 캘린더 파일(.ics) 받기</a>' : '') + '</div><div id="ev-body"></div>';
    el.innerHTML = html;
    var body = $('#ev-body', el);

    function wireCards() {
      $$('[data-rsvp]', body).forEach(function (b) { b.onclick = function () { X.api('/api/center/events', { project_id: id, action: 'rsvp', id: +b.dataset.ev, answer: b.dataset.rsvp }).then(function (j) { if (j.ok) { X.toast('참석 여부를 알렸습니다.'); X.load(true); } }); }; });
      $$('[data-edel]', body).forEach(function (b) { b.onclick = function () { if (confirm('이 일정을 삭제할까요? 참석 응답과 결과 메모도 함께 지워집니다.')) X.api('/api/center/events', { project_id: id, action: 'delete', id: +b.dataset.edel }).then(function (j) { if (j.ok) X.load(true); }); }; });
      $$('[data-est]', body).forEach(function (b) { b.onclick = function () {
        var cancel = b.dataset.est === 'cancel';
        if (cancel && !confirm('이 일정을 취소할까요? 함께 보는 분들의 알림함에 취소 안내가 표시됩니다.')) return;
        X.api('/api/center/events', { project_id: id, action: 'status', id: +b.dataset.ev, status: b.dataset.est, notify: cancel }).then(function (j) { if (j.ok) { X.toast(cancel ? '일정을 취소했습니다.' : '다시 예정으로 바꿨습니다.'); X.load(true); } });
      }; });
      $$('[data-eres]', body).forEach(function (b) { b.onclick = function () {
        var e = evs.filter(function (x) { return x.id === +b.dataset.eres; })[0], li = b.closest('li.ev');
        if ($('.ev-resform', li)) return;
        var f = document.createElement('form'); f.className = 'ev-resform';
        f.innerHTML = '<textarea name="result" rows="3" placeholder="논의한 내용, 결정된 사항, 다음에 할 일을 남겨 주세요. 함께 보는 분들에게 공유됩니다.">' + esc(e.result || '') + '</textarea><div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify"> 메일로도 알리기</label><span><button type="button" class="btn btn-outline btn-sm" data-x>닫기</button> <button class="btn btn-ink btn-sm">완료로 저장</button></span></div>';
        $('.ev-main', li).appendChild(f); f.result.focus();
        $('[data-x]', f).onclick = function () { f.remove(); };
        f.onsubmit = function (ev) { ev.preventDefault(); X.api('/api/center/events', { project_id: id, action: 'status', id: e.id, status: 'done', result: f.result.value, notify: f.notify.checked }).then(function (j) { if (j.ok) { X.toast('저장했습니다.'); X.load(true); } }); };
      }; });
      $$('[data-eedit]', body).forEach(function (b) { b.onclick = function () {
        var e = evs.filter(function (x) { return x.id === +b.dataset.eedit; })[0], f = $('#ev-form', el), E = f.elements;
        ['id', 'title', 'kind', 'date', 'time', 'end_time', 'place', 'detail'].forEach(function (k) { E[k].value = e[k] == null ? '' : e[k]; });
        if (e.audience) E.audience.value = e.audience;
        if (E.direct_to) { E.direct_to.hidden = e.audience !== 'direct'; E.direct_to.value = e.direct_to || ''; }
        E.notify.checked = false;
        $('#ev-form-h', el).textContent = '일정 수정'; $('#ev-save', el).textContent = '수정 저장'; $('#ev-reset', el).hidden = false;
        f.scrollIntoView({ block: 'center' });
      }; });
    }
    function drawBody() {
      if (schedView === 'cal') { calendar(body, { items: function () { return projItems(X); }, today: today }); return; }
      body.innerHTML = (up.length ? '<ul class="ev-list">' + up.map(function (e) { return eventCard(e, X, manager); }).join('') + '</ul>' : '<div class="pj-empty">' + (manager ? '예정된 일정이 없습니다. 위에서 미팅·현장 방문·계약 일정을 등록해 보세요.' : '예정된 일정이 없습니다. 일정이 잡히면 여기와 알림함에 표시됩니다.') + '</div>') +
        (past.length ? '<details class="ev-past"' + (up.length ? '' : ' open') + '><summary>지난 일정 ' + past.length + '건</summary><ul class="ev-list">' + past.map(function (e) { return eventCard(e, X, manager); }).join('') + '</ul></details>' : '');
      wireCards();
    }
    drawBody();
    $$('#ev-view button', el).forEach(function (b) { b.onclick = function () { schedView = b.dataset.v; $$('#ev-view button', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); drawBody(); }; });
    var f = $('#ev-form', el);
    if (f) {
      var E = f.elements;
      E.audience.onchange = function () { if (E.direct_to) E.direct_to.hidden = E.audience.value !== 'direct'; };
      $('#ev-reset', el).onclick = function () { f.reset(); E.id.value = ''; E.date.value = today; if (E.direct_to) E.direct_to.hidden = true; $('#ev-form-h', el).textContent = '일정 등록'; $('#ev-save', el).textContent = '등록'; $('#ev-reset', el).hidden = true; };
      f.onsubmit = function (ev) {
        ev.preventDefault();
        if (E.direct_to && E.audience.value === 'direct' && !E.direct_to.value) { X.toast('함께할 사람을 선택해 주세요.', true); return; }
        if (E.end_time.value && !E.time.value) { X.toast('시작 시간을 함께 입력해 주세요.', true); return; }
        var b = { project_id: id, action: 'save', id: E.id.value || null, title: E.title.value, kind: E.kind.value, date: E.date.value, time: E.time.value, end_time: E.end_time.value, place: E.place.value, detail: E.detail.value,
          audience: E.audience.value, direct_to: E.direct_to ? E.direct_to.value : '', notify: E.notify.checked };
        X.api('/api/center/events', b).then(function (j) { if (j.ok) { X.toast((b.id ? '일정을 고쳤습니다.' : '일정을 등록했습니다.') + (j.mailed ? ' 메일 ' + j.mailed + '통 발송' : '')); X.load(true); } });
      };
    }
  }

  /* ---------- 확인 요청 ---------- */
  function apChip(a, X) { return X.chip(AP_ST[a.status], a.status === 'pending' ? 'hot' : a.status === 'approved' ? 'aud-all' : a.status === 'cancel' ? '' : 'warn'); }
  // 요청받은 사람(임대인·파트너)의 응답 카드
  function approvalCard(a, X) {
    var today = X.today(), late = a.due_date && a.due_date < today;
    return '<li class="ap-card" data-id="' + a.id + '"><div class="ap-head">' + X.chip(AP_KIND[a.kind] || '확인 요청', 'hot') + (a.due_date ? '<span class="ap-due' + (late ? ' late' : '') + '">기한 ' + fmtDay(a.due_date, true) + ' · ' + dday(a.due_date, today) + '</span>' : '') + '</div>' +
      '<h3>' + esc(a.title) + '</h3>' + (a.detail ? '<p class="ap-detail">' + X.rich(a.detail) + '</p>' : '') +
      (a.file ? '<p class="ap-file"><a href="/api/center/files?id=' + a.file.id + '">첨부 자료: ' + esc(a.file.name) + '</a></p>' : '') +
      (X.ro() ? '' : '<form class="ap-form"><textarea name="response" rows="2" placeholder="의견이 있으면 남겨 주세요. 수정 요청·보류는 이유를 적어 주세요."></textarea><div class="ap-btns">' +
        '<button type="button" class="btn btn-primary btn-sm" data-ap="approved">' + (a.kind === 'confirm' ? '확인했습니다' : '승인합니다') + '</button><button type="button" class="btn btn-outline btn-sm" data-ap="changes">수정 요청</button><button type="button" class="btn btn-outline btn-sm" data-ap="declined">보류</button></div>' +
        '<p class="muted-s">' + NOTE_APPROVAL + '</p></form>') + '</li>';
  }
  function wireApprovalCards(scope, X) {
    $$('.ap-card [data-ap]', scope).forEach(function (b) {
      b.onclick = function () {
        var li = b.closest('.ap-card'), f = $('.ap-form', li), st = b.dataset.ap;
        if (st !== 'approved' && !f.response.value.trim()) { X.toast('어떤 점을 바꾸거나 더 확인하면 좋을지 적어 주세요.', true); f.response.focus(); return; }
        if (!confirm("'" + AP_ST[st] + "'(으)로 응답할까요? 응답은 기록으로 남습니다.")) return;
        X.api('/api/center/approvals', { project_id: X.id, action: 'respond', id: +li.dataset.id, status: st, response: f.response.value }).then(function (j) { if (j.ok) { X.toast('응답을 보냈습니다. 공백이 확인하고 이어서 진행합니다.'); X.load(true); } });
      };
    });
  }
  // 관리자: 확인 요청 만들기·현황
  function approvalsTab(el, X) {
    var D = X.D(), id = X.id, A = D.approvals || [], today = X.today();
    var act = D.members.filter(function (m) { return m.status === 'active'; });
    var pend = A.filter(function (a) { return a.status === 'pending'; }), done = A.filter(function (a) { return a.status !== 'pending'; });
    var fileOpts = (D.files || []).map(function (f) { return '<option value="' + f.id + '">' + esc(f.name) + '</option>'; }).join('');
    function row(a) {
      var late = a.status === 'pending' && a.due_date && a.due_date < today;
      return '<li class="ap-row ' + a.status + '"><div class="ap-head">' + apChip(a, X) + X.chip(AP_KIND[a.kind] || '', 'kind') + '<b>' + esc(a.target_label || '') + '</b>' + (a.due_date ? '<span class="ap-due' + (late ? ' late' : '') + '">기한 ' + esc(a.due_date) + '</span>' : '') + '<time>' + kstDt(a.created_at) + ' 요청</time></div>' +
        '<h3>' + esc(a.title) + '</h3>' + (a.detail ? '<p class="ap-detail">' + X.rich(a.detail) + '</p>' : '') + (a.file ? '<p class="ap-file"><a href="/api/center/files?id=' + a.file.id + '">첨부: ' + esc(a.file.name) + '</a></p>' : '') +
        (a.responded_at ? '<div class="ap-resp"><b>' + AP_ST[a.status] + '</b> · ' + kstDt(a.responded_at) + (a.response ? '<p>' + nl(a.response) + '</p>' : '') + '</div>' : '') +
        (X.ro() ? '' : '<div class="ev-acts">' + (a.status === 'pending' ? '<button type="button" class="pj-link" data-arem="' + a.id + '">다시 알리기</button><button type="button" class="pj-link" data-acan="' + a.id + '">요청 취소</button>' : a.status !== 'cancel' ? '<button type="button" class="pj-link" data-areo="' + a.id + '">다시 요청하기</button>' : '') +
          '<button type="button" class="pj-link danger" data-adel="' + a.id + '">삭제</button></div>') + '</li>';
    }
    el.innerHTML = (X.ro() ? '' : '<form class="card pj-task-form" id="ap-form"><h2>확인 요청 보내기</h2><div class="pj-tgrid">' +
        '<input name="title" required maxlength="160" class="wide" placeholder="확인받을 내용 한 줄 (예: 1층 임대 조건안 승인, 공사 견적 확인)">' +
        '<select name="kind" title="종류">' + X.opts(AP_KIND, 'approve') + '</select>' +
        '<select name="target" required title="요청받을 사람"><option value="">요청받을 사람</option>' + (D.landlord ? '<option value="l">임대인 ' + esc(D.landlord.name) + '</option>' : '') + act.map(function (m) { return '<option value="m:' + m.id + '">' + esc(m.alias + ' · ' + m.name) + '</option>'; }).join('') + '</select>' +
        '<input type="date" name="due_date" title="응답 기한"><select name="file_id" title="첨부 자료"><option value="">첨부 자료 없음</option>' + fileOpts + '</select>' +
        '<textarea name="detail" rows="3" class="wide" placeholder="배경과 선택지를 적어 주세요. 임대인에게는 파트너 이름·연락처가 가려져 보입니다."></textarea></div>' +
        '<div class="pj-form-foot"><label class="pj-mini"><input type="checkbox" name="notify" checked> 메일로도 알리기</label><button class="btn btn-ink btn-sm">요청 보내기</button></div>' +
        '<p class="muted-s">요청받은 분은 승인 · 수정 요청 · 보류 중 하나로 응답하고, 응답과 시각이 기록으로 남습니다. 자료를 첨부하려면 먼저 자료실에 올려 주세요.</p></form>') +
      '<div class="card"><h2>응답 대기 <small>' + pend.length + '건</small></h2>' + (pend.length ? '<ul class="ap-list">' + pend.map(row).join('') + '</ul>' : '<p class="muted-s">응답을 기다리는 요청이 없습니다.</p>') + '</div>' +
      (done.length ? '<div class="card"><h2>응답 완료·취소 <small>' + done.length + '건</small></h2><ul class="ap-list">' + done.map(row).join('') + '</ul></div>' : '');
    var f = $('#ap-form', el);
    if (f) f.onsubmit = function (e) {
      e.preventDefault(); var E = f.elements;
      X.api('/api/center/approvals', { project_id: id, action: 'create', title: E.title.value, kind: E.kind.value, target: E.target.value, due_date: E.due_date.value, file_id: E.file_id.value, detail: E.detail.value, notify: E.notify.checked })
        .then(function (j) { if (j.ok) { X.toast('확인 요청을 보냈습니다.' + (j.mailed ? ' 메일도 보냈습니다.' : '')); X.load(true); } });
    };
    function act1(sel, action, msg, ask) { $$(sel, el).forEach(function (b) { b.onclick = function () { if (ask && !confirm(ask)) return; X.api('/api/center/approvals', { project_id: id, action: action, id: +b.dataset[Object.keys(b.dataset)[0]] }).then(function (j) { if (j.ok) { X.toast(msg + (j.mailed ? ' 메일도 보냈습니다.' : '')); X.load(true); } }); }; }); }
    act1('[data-arem]', 'remind', '다시 알렸습니다.');
    act1('[data-acan]', 'cancel', '요청을 취소했습니다.', '이 확인 요청을 취소할까요?');
    act1('[data-areo]', 'reopen', '다시 요청했습니다.', '응답을 다시 받도록 요청할까요? 이전 응답은 변경 기록에 남아 있습니다.');
    act1('[data-adel]', 'delete', '삭제했습니다.', '이 확인 요청을 삭제할까요? 응답 기록도 함께 지워집니다.');
  }

  /* ---------- 비용·정산 (임대인) ---------- */
  function billsTab(el, X) {
    var D = X.D(), B = D.bills || [], today = X.today();
    var sum = function (sts) { return B.filter(function (x) { return sts.indexOf(x.status) > -1; }).reduce(function (a, x) { return a + (x.amount || 0); }, 0); };
    el.innerHTML = '<div class="kpis"><div class="kpi"><div class="l">납부하실 금액 (청구)</div><div class="v sm">' + won(sum(['due'])) + '</div></div><div class="kpi"><div class="l">예정 금액</div><div class="v sm">' + won(sum(['plan'])) + '</div><div class="s">조건이 확정되면 청구됩니다</div></div>' +
      '<div class="kpi"><div class="l">납부 완료</div><div class="v sm">' + won(sum(['done'])) + '</div></div></div>' +
      '<div class="card"><h2>청구·납부 내역 <small>부가세 포함 여부는 비고를 확인해 주세요</small></h2><div class="tbl-wrap flat"><table class="tbl"><thead><tr><th>항목</th><th class="num">금액</th><th>상태</th><th>납부 기한</th><th>납부 확인일</th><th>세금계산서</th></tr></thead><tbody>' +
      (B.length ? B.map(function (x) {
        var late = x.status === 'due' && x.due_date && x.due_date < today;
        return '<tr><td>' + esc(x.label) + (x.memo ? '<div class="age">' + esc(x.memo) + '</div>' : '') + (x.due_date && x.status !== 'done' ? '<div class="age only-narrow' + (late ? ' late' : '') + '">납부 기한 ' + fmtDay(x.due_date, true) + '</div>' : '') + '</td><td class="num nw"><b>' + won(x.amount) + '</b></td><td class="nw">' + X.chip(MONEY_ST[x.status] || '', x.status === 'due' ? 'hot' : x.status === 'done' ? 'aud-all' : '') + '</td>' +
          '<td class="nw' + (late ? ' late' : '') + '">' + esc(x.due_date || '-') + '</td><td class="nw">' + esc(x.done_date || '-') + '</td><td class="nw">' + (x.invoice === 'issued' ? '발행' : '-') + '</td></tr>';
      }).join('') : '<tr class="empty-row"><td colspan="6">청구된 내역이 없습니다.</td></tr>') + '</tbody></table></div>' +
      (D.pay_note ? '<div class="msg-box" style="margin-top:14px"><b>납부 안내</b><br>' + nl(D.pay_note) + '</div>' : '') +
      '<p class="muted-s" style="margin-top:12px">금액이나 일정에 궁금한 점이 있으면 소통 탭에서 ‘공백에게만’으로 남겨 주세요. 계약서의 조건이 이 화면보다 우선합니다.</p></div>';
  }

  /* ---------- 기록 (모든 참여자) ---------- */
  var histFilter = 'all';
  function historyItems(X) {
    var D = X.D(), C = X.C, L = X.isLandlord(), out = [];
    (D.stage_log || []).forEach(function (s, i) { var lab = (L ? C.STAGE_EXT : C.STAGE)[s.to] || s.to; out.push({ at: s.at, k: 'stage', title: i === 0 ? '프로젝트 시작 — ' + lab : '단계 변경 — ' + lab }); });
    (D.posts || []).forEach(function (p) { if (!p.parent_id && (p.kind === 'decision' || p.kind === 'report')) out.push({ at: p.created_at, k: 'post', title: (p.kind === 'decision' ? '결정 사항' : '진행 보고') + ' · ' + p.author, body: p.body }); });
    (D.approvals || []).forEach(function (a) {
      out.push({ at: a.created_at, k: 'approval', title: (AP_KIND[a.kind] || '확인 요청') + (a.target_label ? ' → ' + a.target_label : '') + ' — ' + a.title });
      if (a.responded_at) out.push({ at: a.responded_at, k: 'approval', title: '응답: ' + AP_ST[a.status] + ' — ' + a.title, body: a.response });
    });
    (D.events || []).forEach(function (e) { if (e.status === 'done') out.push({ at: e.date + 'T' + (e.time || '09:00') + ':00+09:00', k: 'event', title: (EV_KIND[e.kind] || '일정') + ' — ' + e.title, body: e.result }); });
    (D.files || []).forEach(function (f) { out.push({ at: f.created_at, k: 'file', title: '자료 — ' + f.name + ' (' + f.by + ')' }); });
    (D.tasks || []).forEach(function (t) { if (t.status === 'done' && t.done_at) out.push({ at: t.done_at, k: 'task', title: '완료 — ' + t.title + ' (' + t.owner_label + ')', body: t.note }); });
    return out.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function stars(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '">★</i>'; return '<span class="stars" aria-label="' + n + '점">' + s + '</span>'; }
  function historyTab(el, X) {
    var D = X.D(), P = D.project, C = X.C, items = historyItems(X);
    var F = { all: '전체', stage: '단계', post: '보고·결정', approval: '확인 요청', event: '일정', file: '자료', task: '완료한 일' };
    var counts = {}; items.forEach(function (x) { counts[x.k] = (counts[x.k] || 0) + 1; });
    var closed = ['closing', 'done', 'dropped'].indexOf(P.stage) > -1;
    var S = D.stats, dec = (D.posts || []).filter(function (p) { return !p.parent_id && p.kind === 'decision'; }).length;
    var stageNow = (X.isLandlord() ? C.STAGE_EXT : C.STAGE)[P.stage] || '';
    var html = '<div class="grid2"><div>';
    html += '<div class="card"><h2>프로젝트 요약 <small><button type="button" class="pj-link" id="h-print">기록 인쇄·PDF 저장</button></small></h2><div class="pj-sum hist-sum"><div><span>기간</span><b>' + esc(P.start_date || X.day(P.created_at)) + ' ~ ' + (P.closed_at ? X.day(P.closed_at) : '진행 중') + '</b></div><div><span>단계</span><b>' + esc(stageNow) + '</b></div>' +
      '<div><span>진행 항목</span><b>' + S.tasks_done + ' / ' + S.tasks_total + '</b></div><div><span>결정 사항</span><b>' + dec + '건</b></div><div><span>자료</span><b>' + (D.files || []).length + '건</b></div></div>' +
      (P.outcome ? '<h3 class="pj-h3">결과 요약</h3><div class="msg-box">' + X.rich(P.outcome) + '</div>' : (X.isAdmin() ? '' : closed ? '<p class="muted-s" style="margin-top:12px">결과 요약은 공백이 정리해 올립니다.</p>' : '')) +
      (X.isAdmin() && !X.ro() ? '<details class="hist-outcome"' + (closed && !P.outcome ? ' open' : '') + '><summary>' + (P.outcome ? '결과 요약 고치기' : '결과 요약 쓰기') + '</summary><form id="h-outcome"><textarea name="outcome" rows="4" placeholder="무엇을 했고 어떤 결과가 났는지, 남은 과제는 무엇인지 적어 주세요. 임대인과 참여 파트너에게 보입니다(임대인에게는 파트너 이름이 별칭으로 바뀝니다).">' + esc(P.outcome || '') + '</textarea><div class="pj-form-foot"><span class="muted-s">마무리·완료 단계에서 써 두면 기록 인쇄본의 첫 장에 들어갑니다.</span><button class="btn btn-ink btn-sm">저장</button></div></form></details>' : '') + '</div>';
    html += '<div class="pills" id="h-pills">' + Object.keys(F).map(function (k) { var n = k === 'all' ? items.length : (counts[k] || 0); return (k === 'all' || n) ? '<button type="button" data-f="' + k + '" aria-pressed="' + (k === histFilter) + '">' + F[k] + '<span class="c">' + n + '</span></button>' : ''; }).join('') + '</div><div class="card"><ul class="timeline-a" id="h-list"></ul></div>';
    html += '</div><div>';
    // 만족도 평가
    if (X.isAdmin()) {
      var R = D.reviews || [];
      html += '<div class="card"><h2>만족도 평가 <small>' + R.length + '건</small></h2>' + (R.length ? '<ul class="mini-list rv-list">' + R.map(function (r) { return '<li><span><b>' + esc(r.who) + '</b> ' + stars(r.rating) + (r.comment ? '<br><span class="age">' + esc(r.comment) + '</span>' : '') + '</span><span class="age">' + X.day(r.at) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted-s">마무리·완료 단계가 되면 임대인과 파트너 화면에 평가 요청이 나타납니다.</p>') + '</div>';
    } else if (closed || D.review) html += reviewCard(X);
    if (X.isAdmin()) {
      var K = { create: '생성', stage: '단계', update: '정보', member: '참여자', task: '추진사항', file: '자료', approve: '승인', reject: '비공개', money: '정산', access: '임대인 열람', invite: '안내 메일', landlord: '임대인', delete: '삭제', event: '일정', approval: '확인 요청', review: '평가' };
      html += '<details class="card hist-log"><summary>변경 기록 <small>관리자만 · 최근 ' + (D.log || []).length + '건</small></summary><ul class="timeline-a">' + ((D.log || []).map(function (x) { return '<li class="k-' + (x.kind === 'stage' ? 'stage' : x.kind === 'file' ? 'doc' : x.kind === 'approve' ? 'email' : '') + '"><div class="meta">' + kstDt(x.created_at) + ' · ' + (K[x.kind] || x.kind) + (x.actor ? ' · ' + esc(x.actor) : '') + '</div><div class="body">' + esc(x.body) + '</div></li>'; }).join('') || '<li>기록이 없습니다.</li>') + '</ul></details>';
    }
    html += '<div class="card pj-guide"><h2>기록 안내</h2><ul><li><b>남는 것</b> 단계 변경, 진행 보고와 결정 사항, 확인 요청과 응답, 끝난 일정의 결과, 공유한 자료, 완료한 일이 날짜순으로 쌓입니다.</li><li><b>보관</b> 프로젝트가 끝난 뒤에도 임대인센터의 지난 프로젝트에서 다시 볼 수 있습니다.</li><li><b>인쇄</b> ‘기록 인쇄·PDF 저장’을 누르고 인쇄 창에서 PDF로 저장하면 파일로 보관할 수 있습니다.</li></ul></div>';
    html += '</div></div>';
    el.innerHTML = html;
    function draw() {
      var list = items.filter(function (x) { return histFilter === 'all' || x.k === histFilter; });
      $('#h-list', el).innerHTML = list.map(function (x) { return '<li class="k-' + (x.k === 'stage' ? 'stage' : x.k === 'file' ? 'doc' : x.k === 'approval' ? 'email' : '') + '"><div class="meta">' + kstDt(x.at) + '</div><div class="body"><b>' + esc(x.title) + '</b>' + (x.body ? '<p class="hist-body">' + nl(String(x.body).slice(0, 400)) + (String(x.body).length > 400 ? '…' : '') + '</p>' : '') + '</div></li>'; }).join('') || '<li>아직 기록이 없습니다.</li>';
    }
    draw();
    $$('#h-pills button', el).forEach(function (b) { b.onclick = function () { histFilter = b.dataset.f; $$('#h-pills button', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); }; });
    $('#h-print', el).onclick = function () { printRecord(X); };
    var of = $('#h-outcome', el); if (of) of.onsubmit = function (e) { e.preventDefault(); X.api('/api/center/project', { id: X.id, action: 'update', outcome: of.outcome.value }).then(function (j) { if (j.ok) { X.toast('결과 요약을 저장했습니다.'); X.load(true); } }); };
    wireReview(el, X);
  }
  function reviewCard(X) {
    var r = X.D().review;
    if (X.ro()) return '';
    return '<form class="card rv-form" id="rv-form"><h2>' + (r ? '남겨 주신 평가' : '프로젝트는 어떠셨나요?') + '</h2><p class="muted-s">' + (r ? '평가는 언제든 고칠 수 있습니다.' : '진행 과정에서 좋았던 점과 아쉬웠던 점을 알려 주시면 다음 프로젝트에 반영하겠습니다. 평가는 공백만 봅니다.') + '</p>' +
      '<div class="rv-stars" role="radiogroup" aria-label="만족도">' + [1, 2, 3, 4, 5].map(function (n) { return '<label class="' + (r && n <= r.rating ? 'on' : '') + '"><input type="radio" name="rating" value="' + n + '"' + (r && r.rating === n ? ' checked' : '') + '><span>★</span><em>' + n + '</em></label>'; }).join('') + '</div>' +
      '<textarea name="comment" rows="3" placeholder="의견 (선택)">' + esc(r && r.comment || '') + '</textarea><div class="pj-form-foot"><span></span><button class="btn btn-ink btn-sm">' + (r ? '평가 고치기' : '평가 보내기') + '</button></div></form>';
  }
  function wireReview(scope, X) {
    var f = $('#rv-form', scope); if (!f) return;
    $$('.rv-stars input', f).forEach(function (inp) { inp.onchange = function () { $$('.rv-stars label', f).forEach(function (l, i) { l.classList.toggle('on', i < +inp.value); }); }; });
    f.onsubmit = function (e) {
      e.preventDefault(); var v = (f.querySelector('input[name=rating]:checked') || {}).value;
      if (!v) { X.toast('별점을 골라 주세요.', true); return; }
      X.api('/api/center/feedback', { project_id: X.id, action: 'review', rating: +v, comment: f.comment.value }).then(function (j) { if (j.ok) { X.toast('평가를 보내 주셔서 감사합니다.'); X.load(true); } });
    };
  }

  /* ---------- 개요 탭 위쪽: 공지, 확인 요청, 다가오는 일정 ---------- */
  function overviewTop(X) {
    var D = X.D(), today = X.today(), html = '';
    var pins = (D.posts || []).filter(function (p) { return p.pinned && !p.parent_id; });
    if (pins.length) html += '<div class="card pj-pins"><h2>공지 <small><a href="#" data-go="feed">소통에서 보기</a></small></h2><ul>' + pins.slice(0, 3).map(function (p) { return '<li><div class="pl-top"><b>' + esc(p.author) + '</b><span class="pl-t">' + X.ago(p.created_at) + '</span></div><p>' + X.rich(String(p.body).slice(0, 300)) + (String(p.body).length > 300 ? '…' : '') + '</p></li>'; }).join('') + '</ul></div>';
    if (!X.isAdmin()) {
      var mine = (D.approvals || []).filter(function (a) { return a.mine && a.status === 'pending'; });
      if (mine.length) html += '<div class="card pj-ask ap-wait"><h2>확인이 필요한 사항 <small>' + mine.length + '건</small></h2><ul class="ap-cards">' + mine.map(function (a) { return approvalCard(a, X); }).join('') + '</ul></div>';
      var due = (D.bills || []).filter(function (b) { return b.status === 'due'; });
      if (X.isLandlord() && due.length) html += '<div class="pj-strip"><span><b>납부 안내</b> 청구된 항목이 ' + due.length + '건 있습니다. 합계 ' + won(due.reduce(function (a, b) { return a + (b.amount || 0); }, 0)) + '</span><a href="#" data-go="bills">내역 보기</a></div>';
    } else {
      var S = D.stats, lines = [];
      if (S.waiting) lines.push(['red', '<a href="#" data-go="feed" data-filter="waiting">답변을 기다리는 문의·요청 ' + S.waiting + '건</a>', '임대인·파트너가 남긴 요청 글입니다. 답글을 달면 ‘답변 완료’로 바뀝니다.']);
      if (S.approvals_wait) lines.push(['amber', '<a href="#" data-go="approvals">응답을 기다리는 확인 요청 ' + S.approvals_wait + '건</a>', '기한이 지나면 ‘다시 알리기’로 한 번 더 요청할 수 있습니다.']);
      if (S.claims) lines.push(['amber', '<a href="#" data-go="money">파트너 지급 요청 ' + S.claims + '건</a>', '금액을 확인하고 상태를 ‘청구·확정’이나 ‘완료’로 바꿔 주세요.']);
      if (lines.length) html += '<div class="card pj-alert"><h2>응답·요청 현황</h2><ul class="todo">' + lines.map(function (t) { return '<li><span class="dot ' + t[0] + '"></span><div>' + t[1] + '<p>' + t[2] + '</p></div></li>'; }).join('') + '</ul></div>';
    }
    var up = (D.events || []).filter(function (e) { return e.status === 'plan' && (e.end_date || e.date) >= today; }).slice(0, 3);
    if (up.length) html += '<div class="card pj-upnext"><h2>다가오는 일정 <small><a href="#" data-go="schedule">전체 보기</a></small></h2><ul class="up-list">' + up.map(function (e) {
      return '<li><span class="ag-d"><b>' + fmtDay(e.date, true) + '</b><em>' + esc(e.time || dday(e.date, today)) + '</em></span><span class="ag-b"><span class="ag-t">' + X.chip(EV_SHORT[e.kind] || '일정', 't-event') + '<b>' + esc(e.title) + '</b></span>' + (e.place ? '<small>' + esc(e.place) + '</small>' : '') + '</span>' +
        (!X.isAdmin() && !X.ro() ? '<span class="up-rsvp">' + (e.rsvp ? '<em>' + RSVP[e.rsvp.answer] + '</em>' : '<button type="button" class="pj-link" data-go="schedule">참석 여부 알리기</button>') + '</span>' : '') + '</li>';
    }).join('') + '</ul></div>';
    var P = D.project;
    if (P.stage === 'done' && P.outcome) html += '<div class="card pj-outcome"><h2>결과 요약 <small><a href="#" data-go="history">기록 보기</a></small></h2><div class="msg-box">' + X.rich(P.outcome) + '</div></div>';
    if (!X.isAdmin() && !X.ro() && (P.stage === 'closing' || P.stage === 'done') && !D.review) html += reviewCard(X);
    return html ? '<div class="pj-top">' + html + '</div>' : '';
  }
  function wireTop(el, X) { wireApprovalCards(el, X); wireReview(el, X); }

  /* ---------- 기록 인쇄 (브라우저 인쇄 → PDF 저장) ---------- */
  function printRecord(X) {
    var D = X.D(), P = D.project, C = X.C, L = X.isLandlord();
    var th = function (a) { return '<tr>' + a.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr>'; };
    var tr = function (a) { return '<tr>' + a.map(function (x) { return '<td>' + (x == null || x === '' ? '-' : x) + '</td>'; }).join('') + '</tr>'; };
    var nw = function (x) { return x ? '<span class="nw">' + x + '</span>' : ''; };
    var sec = function (t, body) { return body ? '<section><h2>' + t + '</h2>' + body + '</section>' : ''; };
    var tbl = function (head, rows) { return rows.length ? '<table><thead>' + th(head) + '</thead><tbody>' + rows.join('') + '</tbody></table>' : ''; };
    var kinds = String(P.kinds || '').split(',').filter(Boolean).map(function (k) { return C.KINDS[k] || k; }).join(', ');
    var stageL = L ? C.STAGE_EXT : C.STAGE;
    var posts = (D.posts || []).filter(function (p) { return !p.parent_id && (p.kind === 'decision' || p.kind === 'report'); }).reverse();
    var money = L ? (D.bills || []) : (D.money || []);
    var html = '<header><p class="pr-brand">GONG BAEK 공백 · 임대인센터 프로젝트 기록</p><h1>' + esc(P.title) + '</h1><p>' + [P.code, P.address, kinds].filter(Boolean).map(esc).join(' · ') + '</p>' +
      '<p class="pr-meta">기간 ' + esc(P.start_date || X.day(P.created_at)) + ' ~ ' + (P.closed_at ? X.day(P.closed_at) : '진행 중') + ' · 현재 단계 ' + esc(stageL[P.stage] || '') + ' · 출력 ' + X.today() + ' (' + (X.isAdmin() ? '관리자용' : L ? '임대인용' : '파트너용') + ')</p></header>' +
      sec('의뢰 내용', '<dl>' + (P.request ? '<dt>요청 사항</dt><dd>' + nl(P.request) + '</dd>' : '') + (P.goal ? '<dt>목표</dt><dd>' + nl(P.goal) + '</dd>' : '') + (P.outcome ? '<dt>결과 요약</dt><dd>' + nl(P.outcome) + '</dd>' : '') + '</dl>') +
      sec('단계 이력', tbl(['일시', '단계'], (D.stage_log || []).map(function (s) { return tr([kstDt(s.at), esc(stageL[s.to] || s.to)]); }))) +
      sec('진행 보고·결정 사항', posts.map(function (p) { return '<div class="pr-post"><p class="pr-meta">' + kstDt(p.created_at) + ' · ' + (p.kind === 'decision' ? '결정 사항' : '진행 보고') + ' · ' + esc(p.author) + '</p><p>' + nl(p.body) + '</p></div>'; }).join('')) +
      sec('확인 요청과 응답', tbl(['요청일', '내용', '응답', '응답일', '의견'], (D.approvals || []).filter(function (a) { return a.status !== 'cancel'; }).map(function (a) { return tr([nw(X.day(a.created_at)), esc(a.title) + (a.target_label ? '<br><small>' + esc(a.target_label) + '</small>' : ''), AP_ST[a.status], a.responded_at ? nw(kstDt(a.responded_at)) : '', esc(a.response || '')]); }))) +
      sec('추진사항', tbl(['단계', '할 일', '담당', '기한', '상태', '메모'], (D.tasks || []).map(function (t) { return tr([esc(t.phase || ''), esc(t.title), esc(t.owner_label), esc(t.due_date || ''), C.TASK_ST[t.status] + (t.done_at ? ' ' + X.day(t.done_at) : ''), esc(t.note || '')]); }))) +
      sec('일정', tbl(['날짜', '시간', '내용', '장소', '상태·결과'], (D.events || []).map(function (e) { return tr([nw(esc(e.date)), nw(esc(timeRange(e))), esc(e.title), esc(e.place || ''), (e.status === 'done' ? '완료' : e.status === 'cancel' ? '취소' : '예정') + (e.result ? '<br><small>' + nl(e.result) + '</small>' : '')]); }))) +
      sec('자료 목록', tbl(['자료', '분류', '올린 사람', '날짜'], (D.files || []).map(function (f) { return tr([esc(f.name), esc(C.FILE_CAT[f.category] || ''), esc(f.by), X.day(f.created_at)]); }))) +
      sec(L ? '청구·납부 내역' : X.isAdmin() ? '정산 내역' : '지급 내역', tbl(X.isAdmin() ? ['구분', '항목', '금액', '상태', '예정일', '완료일'] : ['항목', '금액', '상태', '예정일', '완료일'], money.filter(function (m) { return m.status !== 'cancel'; }).map(function (m) {
        var row = [esc(m.label), won(m.amount), L ? MONEY_ST[m.status] : C.MONEY_ST[m.status], esc(m.due_date || ''), esc(m.done_date || '')]; if (X.isAdmin()) row.unshift(m.direction === 'in' ? '받을 돈' : '줄 돈'); return tr(row);
      }))) +
      '<footer>주식회사 블랭크 · 공실개발 솔루션 공백 · vacancy.co.kr — 이 기록은 프로젝트 진행 목적으로만 사용해 주세요.</footer>';
    var old = $('.gb-print'); if (old) old.remove();
    var box = document.createElement('div'); box.className = 'gb-print'; box.innerHTML = html; document.body.appendChild(box);
    document.documentElement.classList.add('gb-printing');
    var done = function () { document.documentElement.classList.remove('gb-printing'); box.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(function () { window.print(); setTimeout(function () { if (document.documentElement.classList.contains('gb-printing') && !window.matchMedia('print').matches) done(); }, 1500); }, 60);
  }

  /* ==========================================================================
     알림함 (센터·관리자 공용)
     o: { req(method, path, body), toast, onCount(n) }
     ========================================================================== */
  var N_KIND = { post: '소통', task: '할 일', event: '일정', approval: '확인 요청', stage: '단계', file: '자료', money: '정산', review: '평가', info: '안내' };
  function ago(iso) { var h = (Date.now() - new Date(iso).getTime()) / 36e5; if (h < 1) return '방금'; if (h < 24) return Math.floor(h) + '시간 전'; if (h < 24 * 30) return Math.floor(h / 24) + '일 전'; return kstDt(iso).slice(0, 10); }
  function notifItem(n) {
    return '<li class="nt' + (n.read_at ? '' : ' new') + '"><a href="' + esc(n.link || '#') + '" data-nid="' + n.id + '"><span class="nt-k k-' + esc(n.kind || 'info') + '">' + esc(N_KIND[n.kind] || '안내') + '</span><span class="nt-b"><b>' + esc(n.title) + '</b>' +
      (n.body ? '<span class="nt-x">' + esc(n.body) + '</span>' : '') + '<small>' + esc(n.ptitle || '') + (n.ptitle ? ' · ' : '') + ago(n.created_at) + '</small></span></a></li>';
  }
  function notifPanel(el, o) {
    var items = [], unread = 0, prefs = null, more = true;
    function draw() {
      el.innerHTML = '<div class="nt-wrap"><div class="card"><h2>알림 <small>읽지 않은 알림 ' + unread + '건</small></h2>' + (items.length ? '<div class="nt-tools"><button type="button" class="pj-link" id="nt-all"' + (unread ? '' : ' disabled') + '>모두 읽음으로</button></div><ul class="nt-list">' + items.map(notifItem).join('') + '</ul>' +
        (more ? '<p style="text-align:center;margin-top:12px"><button type="button" class="btn btn-outline btn-sm" id="nt-more">이전 알림 더 보기</button></p>' : '') : '<p class="muted-s">아직 알림이 없습니다. 새 소식, 확인 요청, 일정, 담당 업무가 생기면 여기에 쌓입니다.</p>') + '</div>' +
        (prefs && !o.noPrefs ? '<form class="card nt-prefs" id="nt-prefs"><h2>알림 설정</h2><p class="muted-s">화면 알림은 항상 남고, 메일로 받을지만 고를 수 있습니다.</p>' +
          '<label class="pj-switch"><input type="checkbox" name="mail_now"' + (prefs.mail_now ? ' checked' : '') + '><span><b>소식이 올 때 메일 받기</b><br><span class="muted-s">공백이 새 소식·확인 요청·일정을 메일로 함께 보낼 때 받습니다.</span></span></label>' +
          '<label class="pj-switch"><input type="checkbox" name="mail_digest"' + (prefs.mail_digest ? ' checked' : '') + '><span><b>아침 요약 메일 받기</b><br><span class="muted-s">공백이 요약 메일을 보내는 경우, 기한이 오늘·내일인 일이나 내일 일정이 있는 날에만 하루 한 통 받습니다.</span></span></label>' +
          '<p class="muted-s">처음 초대하는 안내 메일과 비밀번호 재설정 메일은 설정과 관계없이 발송됩니다.</p></form>' : '') + '</div>';
      var all = $('#nt-all', el); if (all) all.onclick = function () { o.req('POST', '/api/center/notifs', { action: 'read_all' }).then(function (j) { if (j.ok) { items.forEach(function (n) { n.read_at = n.read_at || 'x'; }); unread = 0; if (o.onCount) o.onCount(0); draw(); } }); };
      var mb = $('#nt-more', el); if (mb) mb.onclick = function () { load(items[items.length - 1].id); };
      $$('a[data-nid]', el).forEach(function (a) { a.addEventListener('click', function () { var n = items.filter(function (x) { return x.id === +a.dataset.nid; })[0]; if (n && !n.read_at) { o.req('POST', '/api/center/notifs', { action: 'read', id: n.id }); } }); });
      var pf = $('#nt-prefs', el); if (pf) $$('input', pf).forEach(function (c) { c.onchange = function () { o.req('POST', '/api/center/notifs', { action: 'prefs', mail_now: pf.mail_now.checked, mail_digest: pf.mail_digest.checked }).then(function (j) { if (o.toast) o.toast(j.ok ? '알림 설정을 저장했습니다.' : '저장하지 못했습니다.', !j.ok); }); }; });
    }
    function load(before) {
      o.req('GET', '/api/center/notifs?limit=30' + (before ? '&before=' + before : '')).then(function (j) {
        if (!j.ok) { el.innerHTML = '<p class="muted-s">알림을 불러오지 못했습니다.</p>'; return; }
        items = before ? items.concat(j.items) : j.items; unread = j.unread; prefs = j.prefs; more = j.items.length >= 30;
        if (o.onCount) o.onCount(unread); draw();
      });
    }
    load(0);
  }

  window.GBWork = {
    tabs: { schedule: scheduleTab, approvals: approvalsTab, bills: billsTab, history: historyTab },
    overviewTop: overviewTop, wireTop: wireTop, printRecord: printRecord, calendar: calendar, agendaRow: agendaRow, notifPanel: notifPanel, notifItem: notifItem,
    fmtDay: fmtDay, dday: dday, addDays: addDays, kstToday: kstToday, won: won, EV_KIND: EV_KIND, EV_SHORT: EV_SHORT, AP_ST: AP_ST, AP_KIND: AP_KIND, RSVP: RSVP,
  };
})();

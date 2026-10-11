/* 공간 사전진단 — 브라우저 안에서만 계산합니다. 서버 전송·저장 없음. */
(function () {
  var form = document.getElementById('assess');
  if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll('.a-step'));
  var dots = form.querySelectorAll('.assess-steps span');
  var prev = document.getElementById('a-prev');
  var next = document.getElementById('a-next');
  var err = document.getElementById('a-err');
  var cur = 0;

  function show(i) {
    cur = i;
    steps.forEach(function (s, k) { s.hidden = k !== i; });
    dots.forEach(function (d, k) { d.className = k < i ? 'done' : (k === i ? 'on' : ''); });
    prev.disabled = i === 0;
    next.textContent = i === steps.length - 2 ? '결과 보기' : (i === steps.length - 1 ? '처음부터 다시' : '다음');
    err.hidden = true;
    var top = form.getBoundingClientRect().top + window.scrollY - 96;
    if (i > 0) window.scrollTo({ top: top, behavior: 'smooth' });
    if (i === steps.length - 1) render();
  }

  function valid(i) {
    var groups = {};
    steps[i].querySelectorAll('input[type=radio]').forEach(function (r) { groups[r.name] = groups[r.name] || form.querySelector('input[name=' + r.name + ']:checked'); });
    var ok = true;
    Object.keys(groups).forEach(function (n) { if (!groups[n]) ok = false; });
    return ok;
  }

  next.addEventListener('click', function () {
    if (cur === steps.length - 1) { form.reset(); show(0); return; }
    if (!valid(cur)) { err.hidden = false; return; }
    show(cur + 1);
  });
  prev.addEventListener('click', function () { if (cur > 0) show(cur - 1); });

  function v(name) { var el = form.querySelector('input[name=' + name + ']:checked'); return el ? el.value : null; }

  /* ---- 점수 산정 ---- */
  function evaluate() {
    var a = {
      goal: v('goal'), use: v('use'), size: v('size'), floor: v('floor'), ev: v('ev'), parking: v('parking'),
      light: v('light'), ceiling: v('ceiling'), water: v('water'), noise: v('noise'), entry: v('entry'),
      budget: +v('budget'), term: +v('term'), operator: v('operator'), tenure: v('tenure')
    };
    var common = [];
    if (a.use === 'resi') common.push('주거 용도에서는 대부분의 상업 모델이 용도변경 없이는 어렵습니다. 건축물대장과 용도변경 가능성을 먼저 확인하세요.');
    if (a.use === 'other') common.push('건축물대장에서 현재 용도를 확인해야 가능한 업종이 정해집니다.');
    if (a.tenure === 'lease_no') common.push('임차 공간이라면 임대인의 전대 동의와 범위를 서면으로 확보해야 진행할 수 있습니다.');
    if (a.term === 1) common.push('운영 가능 기간이 2년 미만이면 투자 회수가 어렵습니다. 투자비를 최소화하는 구성만 검토합니다.');
    if (a.water === 'hard') common.push('급배수 조건이 확인되지 않으면 공사비 추정이 크게 달라집니다. 현장 확인이 필요합니다.');

    var models = [];

    // 1. 예약형 공간대여
    (function () {
      var s = 55, t = [], gate = null;
      if (a.noise === 'high') gate = '주거 인접으로 소음 민원 가능성이 높습니다. 방음 공사 범위와 운영 시간 제한을 확인하기 전에는 권장하지 않습니다.';
      if (a.noise === 'mid') { s -= 10; t.push('상하층 용도와 야간 운영 가능 시간을 확인합니다.'); }
      if (a.entry === 'y') s += 15; else { s -= 12; t.push('공용 출입구의 심야 개방 여부와 보안 체계를 확인합니다.'); }
      if (a.size === 'm' || a.size === 'l') s += 12; else if (a.size === 's') { s -= 10; t.push('15평 미만은 룸 구성이 제한됩니다. 소규모 스튜디오·클래스룸 위주로 검토합니다.'); } else s += 6;
      if (a.floor === '3' || a.floor === 'b') s += 6;
      if (a.goal === 'operate' || a.goal === 'valueup') s += 8;
      if (a.goal === 'rent') { s -= 5; t.push('고정 임대료가 목표라면 운영위탁보다 입점·전대 구조를 함께 비교합니다.'); }
      if (a.water === 'in') s += 5; else if (a.water === 'move') t.push('화장실·급수 이설 비용을 공사비에 반영합니다.');
      if (a.budget === 1) { s -= 6; t.push('예산 3천만 원 미만은 기존 마감 재사용을 전제로 구성합니다.'); }
      if (a.parking === 'none') t.push('대중교통 접근성과 인근 주차장 안내 동선을 확인합니다.');
      if (a.use === 'resi') s -= 25;
      models.push({ id: 'rental', name: '예약형 공간대여', ex: '파티룸 · 모임공간 · 스튜디오 · 클래스룸', score: s, tasks: t, gate: gate });
    })();

    // 2. 무인 F&B·리테일
    (function () {
      var s = 40, t = [], gate = null;
      if (a.floor === '1') s += 28; else if (a.floor === '2') { s += 4; t.push('2층은 외부 계단 사인과 가시성 확보가 전제입니다.'); } else { s -= 18; t.push('3층 이상·지하는 무인 F&B의 노출이 크게 떨어집니다. 배후 수요가 확실할 때만 검토합니다.'); }
      if (a.light === 'good') s += 14; else if (a.light === 'none') { s -= 14; t.push('길에서 보이지 않는 공간은 무인 매장 모델에 불리합니다.'); }
      if (a.size === 's' || a.size === 'm') s += 8; else if (a.size === 'xl') { s -= 8; t.push('60평 이상은 무인 F&B 단독보다 복합 구성이 맞습니다.'); }
      if (a.use === 'retail') s += 6; else if (a.use === 'office' || a.use === 'lodging') { s -= 6; t.push('식품 영업신고가 가능한 용도인지 확인합니다.'); }
      if (a.use === 'resi') gate = '주거 용도에서는 식품 영업신고가 어렵습니다.';
      if (a.water === 'in') s += 6; else if (a.water === 'hard') s -= 8;
      if (a.operator === 'full') t.push('보충·청소 동선을 포함한 위탁 범위를 정합니다.');
      if (a.goal === 'own') s += 5;
      t.push('도난·파손 대응과 출입 통제 체계를 설계합니다.');
      models.push({ id: 'unmanned', name: '무인 F&B · 리테일', ex: '무인 디저트카페 · 소형 쇼룸 · 셀프 리테일', score: s, tasks: t, gate: gate });
    })();

    // 3. 체험형 공간
    (function () {
      var s = 40, t = [], gate = null;
      if (a.size === 'l') s += 14; else if (a.size === 'xl') s += 20; else if (a.size === 's') { s -= 18; t.push('체험형은 보통 30평 이상에서 성립합니다.'); } else s -= 4;
      if (a.ceiling === 'high') s += 8; else if (a.ceiling === 'low') { s -= 8; t.push('층고 2.4m 미만은 체험 설비 설치에 제약이 있습니다.'); }
      if (a.parking === 'in') s += 8; else if (a.parking === 'none') { s -= 6; t.push('가족 단위 방문이 많은 모델은 주차 대안이 필요합니다.'); }
      if (a.noise === 'high') { s -= 14; t.push('소음·진동 민원 가능성을 현장에서 확인합니다.'); }
      if (a.budget >= 3) s += 8; else if (a.budget === 1) { s -= 12; t.push('체험 설비 투자비가 커서 예산 3천만 원 미만에서는 어렵습니다.'); }
      if (a.use === 'resi') gate = '주거 용도에서는 체험형 상업시설 운영이 어렵습니다.';
      t.push('연령별 안전 기준과 보험, 안전관리 인력을 확인합니다.');
      models.push({ id: 'experience', name: '체험형 공간', ex: '키즈 · 게임 · 브랜드 체험 · 웰니스', score: s, tasks: t, gate: gate });
    })();

    // 4. 입점·전대형
    (function () {
      var s = 45, t = [], gate = null;
      if (a.tenure === 'lease_no') gate = '전대 가능 여부가 확인되지 않았습니다. 임대인의 전대 동의가 있어야 검토할 수 있습니다.';
      if (a.tenure === 'own') s += 10;
      if (a.goal === 'rent') s += 18;
      if (a.goal === 'operate') s -= 6;
      if (a.floor === '1' || a.floor === '2') s += 10; else { s -= 4; t.push('상층부·지하는 입점 브랜드의 선택지가 줄어듭니다. 예약형 운영사 입점을 우선 검토합니다.'); }
      if (a.size === 'l' || a.size === 'xl') s += 8;
      if (a.term === 3) s += 8; else if (a.term === 1) { s -= 10; t.push('입점 브랜드는 보통 2년 이상의 계약기간을 요구합니다.'); }
      if (a.operator === 'full') s += 6;
      t.push('원상복구 범위와 운영주체의 신용·이력을 확인합니다.');
      models.push({ id: 'sublease', name: '입점 · 전대형', ex: '외부 브랜드 · 오피스 · 리테일 · F&B 입점', score: s, tasks: t, gate: gate });
    })();

    // 5. 복합형
    (function () {
      var s = 35, t = [], gate = null;
      if (a.size === 'xl') s += 24; else if (a.size === 'l') s += 10; else { s -= 12; t.push('복합형은 보통 2개 층 이상 또는 60평 이상에서 검토합니다.'); }
      if (a.term === 3) s += 8; else if (a.term === 1) s -= 8;
      if (a.operator === 'partner' || a.operator === 'full') s += 8; else t.push('복합 운영은 관리 복잡도가 높아 운영 파트너 구성을 권합니다.');
      if (a.budget >= 3) s += 8; else if (a.budget === 1) s -= 10;
      if (a.goal === 'valueup') s += 6;
      t.push('용도 혼합에 따른 인허가와 시간대별 출입·보안을 설계합니다.');
      models.push({ id: 'hybrid', name: '복합형', ex: '쇼룸 + 클래스 · 카페 + 체험 · 층별 복합', score: s, tasks: t, gate: gate });
    })();

    models.forEach(function (m) { m.score = Math.max(0, Math.min(100, Math.round(m.score))); if (m.gate) m.score = Math.min(m.score, 30); });
    models.sort(function (x, y) { return y.score - x.score; });
    return { a: a, models: models, common: common };
  }

  function grade(m) {
    if (m.gate) return { c: 'grade-no', l: '확인 전 보류' };
    if (m.score >= 70) return { c: 'grade-hi', l: '적합도 높음' };
    if (m.score >= 45) return { c: 'grade-mid', l: '보통' };
    return { c: 'grade-lo', l: '확인 필요' };
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    var r = evaluate();
    var list = document.getElementById('result-list');
    var html = '';
    r.models.forEach(function (m, i) {
      var g = grade(m);
      var tasks = (m.gate ? [m.gate] : []).concat(m.tasks).slice(0, 4);
      if (!tasks.length) tasks = ['큰 결격 조건은 보이지 않습니다. 현장진단에서 동선·설비·소음·주변 수요를 확인합니다.'];
      html += '<div class="result-item' + (i === 0 && !m.gate && m.score >= 45 ? ' top' : '') + '">' +
        '<div><h3>' + esc(m.name) + '</h3><p class="tiny">' + esc(m.ex) + '</p></div>' +
        '<span class="grade ' + g.c + '">' + g.l + '</span>' +
        '<div class="meter" aria-label="적합도 ' + m.score + '점"><i style="--w:' + m.score + '%"></i></div>' +
        '<ul>' + tasks.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '</div>';
    });
    list.innerHTML = html;

    var top = r.models[0];
    var nextEl = document.getElementById('result-next');
    var title, body, action;
    var hardStop = r.a.use === 'resi' || r.a.term === 1;
    if (hardStop) {
      title = '개발 보류 또는 조건 변경 검토';
      body = r.a.use === 'resi' ? '주거 용도에서는 용도변경 없이 상업 모델을 적용하기 어렵습니다. 용도변경 가능성과 비용을 먼저 확인한 뒤 다시 진단해 보세요.' : '운영 가능 기간이 짧아 투자 회수가 어렵습니다. 계약기간을 늘릴 수 있는지, 투자비를 최소화한 구성이 가능한지 상담으로 확인하는 것이 먼저입니다.';
      action = '조건 상담 요청';
    } else if (!top.gate && top.score >= 70) {
      title = '현장진단 권장';
      body = esc(top.name) + ' 모델이 조건에 잘 맞습니다. 현장에서 동선·설비·소음·주변 수요를 확인하면 1차 수지 비교까지 진행할 수 있습니다.';
      action = '현장진단 요청';
    } else if (!top.gate && top.score >= 45) {
      title = '추가 자료 확인 후 판단';
      body = '가능성은 있지만 확인할 조건이 남아 있습니다. 건축물대장, 도면, 현장 사진과 함께 문의를 남겨주시면 1차 검토 방향을 회신드립니다.';
      action = '자료 보내고 검토 요청';
    } else {
      title = '대체 모델 검토';
      body = '입력하신 조건으로는 다섯 모델 모두 확인 과제가 많습니다. 조건이 바뀔 수 있는 항목(전대 동의, 예산, 운영주체)을 정리한 뒤 상담으로 다른 선택지를 찾아보는 것을 권합니다.';
      action = '다른 선택지 상담';
    }
    var common = r.common.length ? '<ul style="margin-top:12px;color:rgba(255,255,255,.85);font-size:.9rem">' + r.common.map(function (c) { return '<li style="margin-top:4px">· ' + esc(c) + '</li>'; }).join('') + '</ul>' : '';
    nextEl.innerHTML = '<b>다음 단계: ' + title + '</b><p>' + body + '</p>' + common +
      '<div class="acts"><a class="btn btn-primary" href="/contact?from=assessment&top=' + encodeURIComponent(top.id) + '">' + action + '</a>' +
      '<button type="button" class="btn btn-light" id="copy-result">결과 요약 복사</button></div>';

    var summary = buildSummary(r);
    document.getElementById('copy-result').addEventListener('click', function () {
      var btn = this;
      function done() { btn.textContent = '복사됨'; setTimeout(function () { btn.textContent = '결과 요약 복사'; }, 1800); }
      if (navigator.clipboard) navigator.clipboard.writeText(summary).then(done, function () { window.prompt('아래 내용을 복사하세요', summary); });
      else window.prompt('아래 내용을 복사하세요', summary);
    });
    try { sessionStorage.setItem('gb_assess_summary', summary); } catch (e) {}
  }

  var LABEL = {
    goal: { rent: '고정 임대료', operate: '운영수익', valueup: '매각 전 밸류업', own: '직접 창업' },
    use: { retail: '근린생활시설', office: '업무시설', lodging: '숙박시설', resi: '주거', other: '기타·모름' },
    size: { s: '15평 미만', m: '15~30평', l: '30~60평', xl: '60평 이상' },
    floor: { b: '지하', '1': '1층', '2': '2층', '3': '3층 이상' },
    ev: { y: 'EV 있음', n: 'EV 없음' },
    parking: { 'in': '건물 내 주차', near: '인근 주차장', none: '주차 없음' },
    light: { good: '가시성 좋음', mid: '가시성 보통', none: '가시성 없음' },
    ceiling: { low: '층고 2.4m 미만', mid: '층고 2.4~3m', high: '층고 3m 이상' },
    water: { 'in': '급배수 층 내', move: '급배수 이설 가능', hard: '급배수 어려움' },
    noise: { low: '소음 민원 낮음', mid: '소음 민원 보통', high: '소음 민원 높음' },
    entry: { y: '독립 출입 가능', n: '공용 출입구' },
    budget: { 1: '예산 3천만 원 미만', 2: '예산 3천만~6천만 원', 3: '예산 6천만~1억 원', 4: '예산 1억 원 이상' },
    term: { 1: '운영 기간 2년 미만', 2: '운영 기간 2~5년', 3: '운영 기간 5년 이상' },
    operator: { self: '직접 운영', partner: '일부 위탁', full: '전부 위탁' },
    tenure: { own: '직접 소유', lease_ok: '임차·전대 가능', lease_no: '임차·전대 불가/모름' }
  };
  function buildSummary(r) {
    var a = r.a, parts = [];
    Object.keys(LABEL).forEach(function (k) { if (a[k] != null && LABEL[k][a[k]]) parts.push(LABEL[k][a[k]]); });
    var lines = ['[공간 사전진단 요약]', '조건: ' + parts.join(' / '), '모델별 적합도:'];
    r.models.forEach(function (m) { lines.push('- ' + m.name + ': ' + grade(m).l + ' (' + m.score + ')'); });
    return lines.join('\n');
  }

  show(0);
})();

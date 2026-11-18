/* 공백 관리자 — KPI 리포트 (#/kpi)
 * 홈페이지 방문·행동(자체 집계)과 회원·문의·임대인센터 지표를 기간별로 보여줍니다. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var NAMES = window.GB_PAGE_NAMES || {};
  var CH = { direct: '직접 방문', search: '검색', map: '지도·플레이스', blog: '블로그·카페', social: 'SNS·메신저', campaign: '캠페인(UTM)', referral: '다른 사이트', internal: '내부 이동' };
  var DEV = { mobile: '모바일', tablet: '태블릿', desktop: 'PC' };
  var OS = { iOS: 'iOS', Android: 'Android', Windows: 'Windows', macOS: 'macOS', Linux: 'Linux', etc: '기타' };
  var BR = { KakaoTalk: '카카오톡 앱', NAVER: '네이버 앱', Instagram: '인스타그램 앱', Facebook: '페이스북 앱', LINE: '라인 앱', Daum: '다음 앱', Whale: '네이버 웨일',
    Samsung: '삼성 인터넷', Edge: 'Edge', Firefox: 'Firefox', Chrome: 'Chrome', Safari: 'Safari', etc: '기타' };
  var CK = { tel: '전화 연결', mail: '이메일', kakao: '카카오톡', out: '외부 링크', file: '파일 내려받기', cta: '문의·진단 버튼', nav: '페이지 이동', button: '버튼' };
  var TYPE = { develop: '공실개발 검토', valueup: '매각 전 밸류업', partner: '파트너 제안', tenant: '입점·운영 등록', other: '기타' };
  var ROLE = { owner: '임대인·건물주', seller: '매각 예정·투자자', broker: '중개', developer: '시행·디벨로퍼', operator: '운영사·브랜드', other: '기타' };
  var STAGE = { new: '신규', review: '검토 중', replied: '1차 회신', site: '현장진단', proposal: '제안', contract: '계약', hold: '보류', closed: '종료' };
  var REF = [
    [/^(search\.)?naver\.com$/, '네이버 검색'], [/^blog\.naver\.com$/, '네이버 블로그'], [/^cafe\.naver\.com$/, '네이버 카페'], [/^(post|in)\.naver\.com$/, '네이버 포스트·인플루언서'],
    [/^(map|place|pcmap)\.naver\.com$/, '네이버 지도·플레이스'], [/^maps\.google\./, '구글 지도'], [/^google\./, '구글'], [/^(search\.)?daum\.net$/, '다음 검색'], [/^cafe\.daum\.net$/, '다음 카페'],
    [/^map\.kakao\.com$/, '카카오맵'], [/kakao\.com$/, '카카오'], [/^bing\.com$/, '빙'], [/^zum\.com$/, '줌'], [/instagram\.com$/, '인스타그램'], [/facebook\.com$/, '페이스북'],
    [/^(youtube\.com|youtu\.be)$/, '유튜브'], [/tistory\.com$/, '티스토리'], [/^brunch\.co\.kr$/, '브런치'], [/^(t\.co|x\.com|twitter\.com)$/, 'X(트위터)'], [/^threads\.net$/, '스레드'],
    [/^(linkedin\.com|lnkd\.in)$/, '링크드인'], [/^band\.us$/, '밴드'],
  ];
  var TABS = [['overview', '요약'], ['content', '콘텐츠'], ['traffic', '유입 경로'], ['action', '클릭·전환'], ['people', '회원·문의'], ['guide', '지표 설명']];
  var PRESETS = [['today', '오늘'], ['yesterday', '어제'], ['7d', '최근 7일'], ['30d', '최근 30일'], ['90d', '최근 90일'], ['month', '이번 달'], ['lastmonth', '지난달'], ['custom', '직접 선택']];

  var HINT = {
    uv: '기간 안에 홈페이지를 연 브라우저 수입니다. 같은 사람이 휴대폰과 PC로 들어오면 2명으로 셉니다.',
    sessions: '한 번 들어와서 나갈 때까지를 1회로 셉니다. 30분 넘게 움직임이 없다가 다시 보면 새 방문입니다.',
    pv: '페이지를 연 횟수입니다. 같은 페이지를 다시 열어도 각각 셉니다.',
    dwell: '방문 1회에 화면을 보고 있던 시간의 평균입니다. 다른 탭에 가 있거나 2분 넘게 움직임이 없던 시간은 뺍니다.',
    bounce: '한 페이지만 보고 10초 안에 나간 방문의 비율입니다. 낮을수록 좋습니다.',
    cv: '기간 중 접수된 문의 건수를 순방문자 수로 나눈 값입니다.',
  };

  /* ---------- 날짜·숫자 ---------- */
  function kday(ms) { return new Date(ms + 9 * 36e5).toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function isDay(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !isNaN(Date.parse(v + 'T00:00:00Z')); }
  function md(d) { return +d.slice(5, 7) + '.' + +d.slice(8, 10); }
  function wd(d) { return '일월화수목금토'.charAt(new Date(d + 'T00:00:00Z').getUTCDay()); }
  function dayList(a, b) { var out = []; for (var d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }
  function presetRange(key) {
    var t = kday(Date.now()), f;
    switch (key) {
      case 'today': return [t, t];
      case 'yesterday': f = addDays(t, -1); return [f, f];
      case '7d': return [addDays(t, -6), t];
      case '90d': return [addDays(t, -89), t];
      case 'month': return [t.slice(0, 8) + '01', t];
      case 'lastmonth': f = addDays(t.slice(0, 8) + '01', -1); return [f.slice(0, 8) + '01', f];
      default: return [addDays(t, -29), t];
    }
  }
  function num(v) { return Math.round(+v || 0).toLocaleString('ko-KR'); }
  function dec(v) { return (+v || 0).toFixed(1); }
  function dur(ms) {
    ms = +ms || 0; if (!ms) return '–'; if (ms < 1000) return '1초 미만';
    var s = Math.round(ms / 1000); if (s < 60) return s + '초';
    var m = Math.floor(s / 60), r = s % 60; if (m < 60) return m + '분' + (r ? ' ' + r + '초' : '');
    return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
  }
  function hours(h) { if (h == null) return '–'; if (h < 1) return Math.max(1, Math.round(h * 60)) + '분'; if (h < 48) return dec(h) + '시간'; return dec(h / 24) + '일'; }
  function rate(a, b) { return b ? (+a || 0) / b * 100 : null; }
  function pct(v) { return v == null ? '–' : (v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function short(v) { return v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '만' : num(v); }
  function delta(cur, prev, o) {
    o = o || {};
    if (cur == null || prev == null) return '';
    var diff, txt;
    if (o.pp) { diff = cur - prev; if (Math.abs(diff) < 0.05) return '<span class="d flat">이전과 같음</span>'; txt = Math.abs(diff).toFixed(1) + '%p'; }
    else {
      if (!prev) return cur ? '<span class="d flat">이전 기간 0</span>' : '';
      diff = (cur - prev) / prev * 100; if (Math.abs(diff) < 0.5) return '<span class="d flat">이전과 같음</span>';
      txt = Math.round(Math.abs(diff)) + '%';
    }
    var good = o.invert ? diff < 0 : diff > 0;
    return '<span class="d ' + (good ? 'up' : 'down') + '" title="이전 기간 대비">' + (diff > 0 ? '▲ ' : '▼ ') + txt + '</span>';
  }
  function index(list, key) { var m = {}; (list || []).forEach(function (r) { m[r[key]] = r; }); return m; }
  function pname(path, title) {
    if (NAMES[path]) return NAMES[path];
    if (title && title !== '__404') return String(title).replace(/\s+[—|]\s+공백.*$/, '').replace(/\s+[—|]\s+주식회사 블랭크.*$/, '') || path;
    return path;
  }
  function refName(h) { for (var i = 0; i < REF.length; i++) if (REF[i][0].test(h)) return REF[i][1]; return h; }

  /* ---------- 화면 조각 ---------- */
  function card(title, inner, o) {
    o = o || {};
    return '<div class="card' + (o.cls ? ' ' + o.cls : '') + '"><h2>' + title + (o.small ? ' <small>' + o.small + '</small>' : '') + '</h2>' + inner + '</div>';
  }
  function more(tab, text) { return '<a href="#" data-tab="' + tab + '">' + (text || '자세히') + '</a>'; }
  function empty(t) { return '<p class="muted-s k-empty">' + (t || '이 기간에는 기록이 없습니다.') + '</p>'; }
  function tile(o) {
    var tag = o.href ? 'a' : o.tab ? 'button' : 'div', attr = o.href ? ' href="' + o.href + '"' : o.tab ? ' type="button" data-tab="' + o.tab + '"' : '';
    return '<' + tag + ' class="kpi kt' + (o.href || o.tab ? ' go' : '') + '"' + attr + (o.hint ? ' title="' + esc(o.hint) + '"' : '') + '><div class="l">' + o.l + (o.hint ? ' <span class="q" aria-hidden="true">?</span>' : '') + '</div>' +
      '<div class="v">' + o.v + '</div><div class="s">' + (o.d || '') + (o.s ? '<span>' + o.s + '</span>' : '') + '</div></' + tag + '>';
  }
  function kbars(list, o) {
    o = o || {};
    if (!list.length) return empty(o.empty);
    var max = Math.max.apply(null, list.map(function (x) { return x.value; })) || 1;
    return '<ul class="kbars">' + list.map(function (x, i) {
      var label = x.href ? '<a href="' + x.href + '">' + x.label + '</a>' : x.label;
      return '<li' + (o.hi && i === 0 ? ' class="pt"' : '') + '><span class="t">' + label + (x.sub ? '<small>' + x.sub + '</small>' : '') + '</span><span class="v">' + x.display + '</span>' +
        '<i style="--w:' + Math.max(1.5, x.value / max * 100).toFixed(1) + '%"></i></li>';
    }).join('') + '</ul>';
  }
  function share(list) {
    var tot = list.reduce(function (a, x) { return a + x.n; }, 0);
    if (!tot) return empty();
    return '<div class="share"><div class="share-bar">' + list.map(function (x, i) { return x.n ? '<i class="c' + i + '" style="flex-basis:' + (x.n / tot * 100) + '%" title="' + esc(x.label) + ' ' + pct(x.n / tot * 100) + '"></i>' : ''; }).join('') + '</div>' +
      '<ul class="share-leg">' + list.map(function (x, i) { return '<li><span class="sw c' + i + '"></span>' + esc(x.label) + '<b>' + pct(x.n / tot * 100) + '</b><span class="muted-s">' + num(x.n) + '</span></li>'; }).join('') + '</ul></div>';
  }
  function funnel(steps) {
    var base = steps[0].n || 0;
    return '<ol class="funnel">' + steps.map(function (s, i) {
      var w = base ? Math.min(100, s.n / base * 100) : 0;
      return '<li><div class="fl"><b>' + s.label + '</b>' + (s.note ? '<small>' + s.note + '</small>' : '') + '</div>' +
        '<div class="fb"><i style="width:' + Math.max(w ? 1 : 0, w).toFixed(1) + '%"></i></div>' +
        '<div class="fn"><b>' + num(s.n) + '</b>' + (i ? '<small>' + (base ? s.base || '방문의 ' + pct(s.n / base * 100) : '') + '</small>' : '') + '</div></li>';
    }).join('') + '</ol>';
  }
  function heatmap(heat) {
    var g = {}, max = 0; (heat || []).forEach(function (r) { g[r.w + '-' + r.h] = r.n; if (r.n > max) max = r.n; });
    if (!max) return empty();
    var order = [[1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금'], [6, '토'], [0, '일']], h, html = '<div class="heat-wrap"><div class="heat"><span></span>';
    for (h = 0; h < 24; h++) html += '<span class="hx">' + (h % 3 === 0 ? h : '') + '</span>';
    order.forEach(function (o) {
      html += '<span class="hy">' + o[1] + '</span>';
      for (h = 0; h < 24; h++) { var n = g[o[0] + '-' + h] || 0; html += '<i' + (n ? ' style="--a:' + (0.12 + n / max * 0.88).toFixed(2) + '"' : '') + ' title="' + o[1] + '요일 ' + h + '시 · 페이지뷰 ' + n + '"></i>'; }
    });
    return html + '</div></div><p class="muted-s k-foot">색이 진할수록 페이지뷰가 많은 시간입니다. 문의 회신·광고 시간대를 정할 때 참고하세요.</p>';
  }

  /* ---------- 표 (정렬·CSV) ---------- */
  function table(id, cols, data, o) {
    S.tables[id] = { cols: cols, data: data, o: o || {} };
    var lim = (o || {}).limit, moreBtn = lim && data.length > lim ? '<button type="button" class="k-more" data-more="' + id + '">전체 ' + num(data.length) + '개 보기</button>' : '';
    return '<div class="tbl-wrap"><table class="tbl tbl-static" id="' + id + '"><thead><tr>' + cols.filter(function (c) { return !c.hide; }).map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + '><button type="button" class="th-sort" data-sort="' + id + ':' + cols.indexOf(c) + '"' + (c.hint ? ' title="' + esc(c.hint) + '"' : '') + '>' + c.l + '</button></th>';
    }).join('') + '</tr></thead><tbody>' + tbody(id) + '</tbody></table></div>' + moreBtn;
  }
  function sval(c, r) { var v = c.v ? c.v(r) : r[c.k]; return v == null ? -Infinity : v; }
  function tbody(id) {
    var T = S.tables[id], st = S.sort[id], d = T.data.slice(), vis = T.cols.filter(function (c) { return !c.hide; });
    if (st) { var c = T.cols[st.i]; d.sort(function (a, b) { var x = sval(c, a), y = sval(c, b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); }
    if (T.o.limit && !S.expand[id]) d = d.slice(0, T.o.limit);
    if (!d.length) return '<tr class="empty-row"><td colspan="' + vis.length + '">' + (T.o.empty || '이 기간에는 기록이 없습니다.') + '</td></tr>';
    return d.map(function (r) {
      return '<tr>' + vis.map(function (c) { return '<td' + (c.num ? ' class="num"' : c.cls ? ' class="' + c.cls + '"' : '') + '>' + (c.f ? c.f(r) : esc(r[c.k])) + '</td>'; }).join('') + '</tr>';
    }).join('');
  }
  function csvBtn(id, name) { return '<button type="button" class="btn btn-outline btn-sm k-csv" data-csv="' + id + ':' + name + '">CSV</button>'; }
  function downloadCsv(id, name) {
    var T = S.tables[id]; if (!T) return;
    var cell = function (v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    var lines = [T.cols.map(function (c) { return cell(c.cl || c.l); }).join(',')].concat(T.data.map(function (r) {
      return T.cols.map(function (c) { return cell(c.csv ? c.csv(r) : r[c.k]); }).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'gongbaek-kpi-' + name + '-' + S.from + '_' + S.to + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  /* ---------- 차트 (SVG, 화면 너비에 맞춰 다시 그림) ---------- */
  function ticks(max) {
    if (max <= 0) return [0, 1];
    var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
    var st = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag), out = [];
    for (var v = 0; v < max + st; v += st) { out.push(v); if (v >= max) break; }
    return out;
  }
  function chart(box, o) {
    if (!box) return;
    var W = Math.max(260, box.clientWidth || 600), H = o.h || (W < 500 ? 200 : 240), pl = 42, pr = 12, pt = 14, pb = 28;
    var n = o.labels.length, max = 0;
    o.series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    var tk = ticks(max), top = tk[tk.length - 1] || 1, iw = W - pl - pr, ih = H - pt - pb, bar = o.type === 'bar';
    var band = iw / Math.max(1, n);
    var x = function (i) { return bar ? pl + band * (i + 0.5) : pl + (n <= 1 ? iw / 2 : i * iw / (n - 1)); };
    var y = function (v) { return pt + ih - v / top * ih; };
    var s = '<svg class="kc-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || '') + '">';
    tk.forEach(function (t) { s += '<line class="g" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text class="ty" x="' + (pl - 8) + '" y="' + (y(t) + 4) + '">' + short(t) + '</text>'; });
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
    o.labels.forEach(function (l, i) { if ((n - 1 - i) % every === 0) s += '<text class="tx" x="' + x(i) + '" y="' + (H - 8) + '">' + esc(l) + '</text>'; });
    if (bar) {
      var gw = Math.min(band * 0.72, 42), bw = gw / o.series.length;
      o.series.forEach(function (se, k) {
        se.values.forEach(function (v, i) { if (v > 0) s += '<rect class="bar ' + se.cls + '" x="' + (x(i) - gw / 2 + k * bw + 0.5) + '" y="' + y(v) + '" width="' + Math.max(1, bw - 1) + '" height="' + (pt + ih - y(v)) + '" rx="2"/>'; });
      });
    } else {
      o.series.forEach(function (se) {
        var pts = se.values.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); });
        if (se.area && n > 1) s += '<path class="area ' + se.cls + '" d="M' + pts[0] + ' L' + pts.join(' L') + ' L' + x(n - 1).toFixed(1) + ',' + (pt + ih) + ' L' + x(0).toFixed(1) + ',' + (pt + ih) + ' Z"/>';
        s += '<polyline class="ln ' + se.cls + '" points="' + pts.join(' ') + '"/>';
        if (n <= 1) s += '<circle class="pt ' + se.cls + '" cx="' + x(0) + '" cy="' + y(se.values[0]) + '" r="4"/>';
      });
    }
    s += '<line class="guide" x1="0" x2="0" y1="' + pt + '" y2="' + (pt + ih) + '" visibility="hidden"/>';
    if (!bar) o.series.forEach(function (se) { s += '<circle class="hd ' + se.cls + '" r="4.5" cx="0" cy="0" visibility="hidden"/>'; });
    s += '<rect class="hit" x="' + pl + '" y="' + pt + '" width="' + iw + '" height="' + ih + '"/></svg>';
    var legend = o.series.length > 1 ? '<div class="kc-legend">' + o.series.map(function (se) { return '<span class="lg ' + se.cls + '">' + esc(se.name) + '</span>'; }).join('') + '</div>' : '';
    box.innerHTML = legend + '<div class="kc-in">' + s + '<div class="kc-tip" hidden></div></div>';
    var svg = $('svg', box), tip = $('.kc-tip', box), guide = $('.guide', svg), dots = svg.querySelectorAll('.hd'), inner = $('.kc-in', box);
    function show(cx) {
      var r = svg.getBoundingClientRect(), px = (cx - r.left) * (W / r.width);
      var i = bar ? Math.floor((px - pl) / band) : (n <= 1 ? 0 : Math.round((px - pl) / (iw / (n - 1))));
      i = Math.max(0, Math.min(n - 1, i));
      var gx = x(i);
      guide.setAttribute('x1', gx); guide.setAttribute('x2', gx); guide.setAttribute('visibility', 'visible');
      Array.prototype.forEach.call(dots, function (dt, k) { dt.setAttribute('cx', gx); dt.setAttribute('cy', y(o.series[k].values[i])); dt.setAttribute('visibility', 'visible'); });
      tip.innerHTML = o.tip(i); tip.hidden = false;
      var left = gx / W * inner.clientWidth, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(inner.clientWidth - tw, left > inner.clientWidth / 2 ? left - tw - 12 : left + 12)) + 'px';
    }
    function hide() { tip.hidden = true; guide.setAttribute('visibility', 'hidden'); Array.prototype.forEach.call(dots, function (dt) { dt.setAttribute('visibility', 'hidden'); }); }
    svg.addEventListener('pointermove', function (e) { show(e.clientX); });
    svg.addEventListener('pointerdown', function (e) { show(e.clientX); });
    svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
  }

  /* ---------- 상태 ---------- */
  var S = { tab: 'overview', preset: '30d', from: '', to: '', cache: {}, tables: {}, sort: {}, expand: {}, charts: [], data: null, el: null, ctx: null, poll: 0 };
  var BODY = function () { return S.el && $('#k-body', S.el); };

  function mount(root, ctx) {
    S.ctx = ctx; S.tables = {}; S.sort = {};
    var q = ctx.qs();
    S.tab = TABS.some(function (t) { return t[0] === q.tab; }) ? q.tab : 'overview';
    if (isDay(q.from) && isDay(q.to)) { S.preset = 'custom'; S.from = q.from <= q.to ? q.from : q.to; S.to = q.from <= q.to ? q.to : q.from; }
    else { S.preset = PRESETS.some(function (p) { return p[0] === q.range; }) && q.range !== 'custom' ? q.range : '30d'; var r = presetRange(S.preset); S.from = r[0]; S.to = r[1]; }
    root.innerHTML = '<div class="kpi-page">' +
      '<div class="v-head"><div><h1>KPI 리포트</h1><p>홈페이지 방문과 행동, 회원·문의 성과를 기간별로 봅니다. 날짜는 한국시간 기준입니다.</p></div>' +
        '<div class="acts"><span class="rt-chip" id="k-rt" title="최근 5분 안에 페이지를 연 방문"><i></i><span>지금 접속 –</span></span><button type="button" class="btn btn-outline btn-sm" id="k-reload">새로고침</button></div></div>' +
      '<div class="k-bar"><div class="pills k-pre">' + PRESETS.map(function (p) { return '<button type="button" data-pre="' + p[0] + '" aria-pressed="' + (p[0] === S.preset) + '">' + p[1] + '</button>'; }).join('') + '</div>' +
        '<form class="k-custom" id="k-custom"' + (S.preset === 'custom' ? '' : ' hidden') + '><input type="date" name="from" value="' + S.from + '" aria-label="시작일"><span>~</span><input type="date" name="to" value="' + S.to + '" aria-label="종료일"><button class="btn btn-ink btn-sm">적용</button></form>' +
        '<p class="k-range" id="k-range"></p></div>' +
      '<div class="k-tabs" role="tablist">' + TABS.map(function (t) { return '<button type="button" role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === S.tab) + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<div id="k-body"></div></div>';
    S.el = $('.kpi-page', root);
    S.el.addEventListener('click', onClick);
    $('#k-custom', S.el).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target.from.value, t = e.target.to.value;
      if (!isDay(f) || !isDay(t)) { ctx.toast('날짜를 확인해 주세요.', true); return; }
      if (f > t) { var x = f; f = t; t = x; }
      if ((Date.parse(t) - Date.parse(f)) / 864e5 > 400) { ctx.toast('기간은 400일 안으로 골라 주세요.', true); return; }
      S.from = f; S.to = t; syncHash(); load();
    });
    clearInterval(S.poll);
    S.poll = setInterval(function () {
      if (!S.el || !document.body.contains(S.el)) { clearInterval(S.poll); return; }
      ctx.get('/api/admin/kpi?brief=1').then(function (j) { if (j.ok) setRt(j.active); });
    }, 60000);
    load();
  }
  function setRt(n) { var el = S.el && $('#k-rt', S.el); if (el) { el.classList.toggle('on', n > 0); $('span', el).textContent = '지금 접속 ' + num(n) + '명'; } }
  function syncHash() {
    history.replaceState(null, '', '#/kpi?' + (S.preset === 'custom' ? 'from=' + S.from + '&to=' + S.to : 'range=' + S.preset) + (S.tab !== 'overview' ? '&tab=' + S.tab : ''));
  }
  function onClick(e) {
    var t = e.target.closest('[data-pre],[data-tab],[data-sort],[data-csv],[data-more],#k-reload,#k-notrack,#u-copy');
    if (!t) return;
    if (t.dataset.pre) {
      S.preset = t.dataset.pre;
      Array.prototype.forEach.call(S.el.querySelectorAll('[data-pre]'), function (b) { b.setAttribute('aria-pressed', String(b === t)); });
      var form = $('#k-custom', S.el); form.hidden = S.preset !== 'custom';
      if (S.preset === 'custom') { form.from.value = S.from; form.to.value = S.to; form.from.focus(); return; }
      var r = presetRange(S.preset); S.from = r[0]; S.to = r[1]; syncHash(); load(); return;
    }
    if (t.dataset.tab) { e.preventDefault(); S.tab = t.dataset.tab; syncHash(); draw(); window.scrollTo(0, Math.min(window.scrollY, $('.k-tabs', S.el).offsetTop - 10)); return; }
    if (t.dataset.sort) {
      var p = t.dataset.sort.split(':'), id = p[0], i = +p[1], cur = S.sort[id];
      S.sort[id] = { i: i, dir: cur && cur.i === i ? -cur.dir : (S.tables[id].cols[i].num ? -1 : 1) };
      var tb = $('#' + id + ' tbody', S.el); if (tb) tb.innerHTML = tbody(id);
      Array.prototype.forEach.call(S.el.querySelectorAll('#' + id + ' th button'), function (b) { var k = +b.dataset.sort.split(':')[1]; b.parentNode.setAttribute('aria-sort', k === i ? (S.sort[id].dir > 0 ? 'ascending' : 'descending') : 'none'); });
      return;
    }
    if (t.dataset.more) { S.expand[t.dataset.more] = true; var mb = $('#' + t.dataset.more + ' tbody', S.el); if (mb) mb.innerHTML = tbody(t.dataset.more); t.remove(); return; }
    if (t.dataset.csv) { var q = t.dataset.csv.split(':'); downloadCsv(q[0], q[1]); return; }
    if (t.id === 'k-reload') { load(true); return; }
    if (t.id === 'k-notrack') {
      try { localStorage.setItem('gb_notrack', localStorage.getItem('gb_notrack') === '1' ? '0' : '1'); } catch (x) {}
      draw(); return;
    }
    if (t.id === 'u-copy') {
      var v = $('#u-out', S.el).textContent;
      var done = function () { S.ctx.toast('링크를 복사했습니다.'); };
      if (navigator.clipboard) navigator.clipboard.writeText(v).then(done, function () { window.prompt('아래 링크를 복사하세요', v); }); else window.prompt('아래 링크를 복사하세요', v);
    }
  }
  function rangeText() {
    var days = Math.round((Date.parse(S.to) - Date.parse(S.from)) / 864e5) + 1;
    var pf = addDays(S.from, -days), pt = addDays(S.from, -1);
    return (S.from === S.to ? S.from + ' (' + wd(S.from) + ')' : S.from + ' ~ ' + S.to + ' · ' + days + '일') + '<span>비교: ' + (pf === pt ? pf : md(pf) + ' ~ ' + md(pt)) + '</span>';
  }
  function load(force) {
    var key = S.from + '_' + S.to, body = BODY();
    $('#k-range', S.el).innerHTML = rangeText();
    if (!force && S.cache[key]) { S.data = S.cache[key]; draw(); return; }
    if (body) body.innerHTML = '<p class="muted-s k-loading">불러오는 중…</p>';
    S.ctx.get('/api/admin/kpi?from=' + S.from + '&to=' + S.to).then(function (j) {
      if (key !== S.from + '_' + S.to || !S.el || !document.body.contains(S.el)) return;
      if (!j.ok) { BODY().innerHTML = '<div class="card"><p class="muted-s">' + esc(S.ctx.errText(j)) + '</p></div>'; return; }
      S.cache[key] = j; S.data = j; draw();
    });
  }
  function draw() {
    var d = S.data, body = BODY(); if (!d || !body) return;
    Array.prototype.forEach.call(S.el.querySelectorAll('.k-tabs [data-tab]'), function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === S.tab)); });
    setRt(d.realtime.active);
    S.tables = {}; S.charts = []; S.expand = {};
    body.innerHTML = ({ overview: tOverview, content: tContent, traffic: tTraffic, action: tAction, people: tPeople, guide: tGuide })[S.tab](d);
    S.charts.forEach(function (fn) { fn(); });
    if (S.tab === 'traffic') utmBuild();
  }
  var rz; window.addEventListener('resize', function () {
    clearTimeout(rz); rz = setTimeout(function () { if (S.el && document.body.contains(S.el)) S.charts.forEach(function (fn) { fn(); }); }, 180);
  });

  /* ---------- 공통 계산 ---------- */
  function prevOk(d) { return !!d.data_since && d.data_since <= d.range.prev_to; }
  function goalMap(list) { var m = {}; (list || []).forEach(function (r) { m[r.kind] = r; }); return m; }
  function clickMap(list) { var m = {}; (list || []).forEach(function (r) { m[r.kind] = r; }); return m; }
  function notice(d) {
    if (!d.data_since) return '<div class="k-note">홈페이지 방문 집계를 시작했습니다. 방문이 생기면 몇 분 안에 이곳에 나타납니다. 회원·문의 지표는 지금도 볼 수 있습니다.</div>';
    if (d.data_since > d.range.from) return '<div class="k-note">방문 기록은 ' + d.data_since + '부터 모으고 있어, 그 전 날짜의 방문 지표는 0으로 보입니다.</div>';
    return '';
  }
  function T(d, cur, prev, o) { return prevOk(d) ? delta(cur, prev, o) : '<span class="d flat">비교 기록 없음</span>'; }
  function pageRows(d) {
    return d.pages.map(function (r) { var x = {}; for (var k in r) x[k] = r[k]; x.name = pname(r.path, r.title); x.deepRate = rate(r.deep, r.pv); x.exitRate = rate(r.exits, r.pv); return x; });
  }
  function techSum(d, key, names) {
    var m = {}; d.tech.forEach(function (r) { var k = r[key] || 'etc'; m[k] = (m[k] || 0) + r.n; });
    return Object.keys(m).map(function (k) { return { k: k, label: names[k] || k, n: m[k] }; }).sort(function (a, b) { return b.n - a.n; });
  }
  function channelList(d) {
    var tot = d.channels.reduce(function (a, r) { return a + r.sessions; }, 0);
    return d.channels.map(function (r) { return { label: CH[r.ch] || r.ch, value: r.sessions, display: num(r.sessions) + '<small>' + pct(rate(r.sessions, tot)) + '</small>' }; });
  }
  function contactFunnel(d) {
    var f = d.funnel, g = goalMap(d.goals.cur);
    return funnel([
      { label: '방문', n: f.s_all || 0, note: '홈페이지에 들어온 방문' },
      { label: '서비스 탐색', n: f.s_explore || 0, note: '솔루션·모델·사례·인사이트 등을 본 방문' },
      { label: '문의 페이지', n: f.s_contact || 0, note: '공간 검토 요청 화면을 연 방문' },
      { label: '문의 접수', n: (g.contact_submit || {}).ss || 0, note: '접수를 마친 방문' },
    ]);
  }

  /* ---------- 요약 ---------- */
  function tOverview(d) {
    var c = d.traffic.cur, p = d.traffic.prev;
    var br = rate(c.bounces, c.sessions), brp = rate(p.bounces, p.sessions), cv = rate(d.inquiries.cur, c.uv), cvp = rate(d.inquiries.prev, p.uv);
    var pages = pageRows(d).slice(0, 7).map(function (r) { return { label: esc(r.name), sub: '순방문자 ' + num(r.uv) + ' · 평균 ' + dur(r.dwell), value: r.pv, display: num(r.pv) }; });
    var clicks = d.clicks.slice(0, 6).map(function (r) { return { label: esc(r.label), sub: (CK[r.kind] || r.kind) + ' · ' + esc(r.area), value: r.n, display: num(r.n) }; });
    var rt = d.realtime;
    S.charts.push(function () { trend($('#k-trend', S.el), d); });
    return notice(d) +
      '<div class="kpis k4">' +
        tile({ l: '순방문자', v: num(c.uv), d: T(d, c.uv, p.uv), s: '처음 온 방문자 ' + pct(rate(c.new_visitors, c.uv)), tab: 'traffic', hint: HINT.uv }) +
        tile({ l: '방문 수', v: num(c.sessions), d: T(d, c.sessions, p.sessions), s: '1명당 ' + dec(c.uv ? c.sessions / c.uv : 0) + '회', tab: 'traffic', hint: HINT.sessions }) +
        tile({ l: '페이지뷰', v: num(c.pv), d: T(d, c.pv, p.pv), s: '방문당 ' + dec(c.pages_per_session) + '페이지', tab: 'content', hint: HINT.pv }) +
        tile({ l: '평균 체류시간', v: dur(c.avg_session_dwell), d: T(d, c.avg_session_dwell, p.avg_session_dwell), s: '페이지당 ' + dur(c.avg_dwell_pv), tab: 'content', hint: HINT.dwell }) +
        tile({ l: '이탈률', v: pct(br), d: T(d, br, brp, { pp: true, invert: true }), s: '10초 안에 나간 방문', tab: 'content', hint: HINT.bounce }) +
        tile({ l: '문의 접수', v: num(d.inquiries.cur) + '<small>건</small>', d: delta(d.inquiries.cur, d.inquiries.prev), s: '처리 대기 ' + num(d.inquiries.open) + '건', tab: 'people' }) +
        tile({ l: '문의 전환율', v: pct(cv), d: T(d, cv, cvp, { pp: true }), s: '방문자 대비 문의', tab: 'action', hint: HINT.cv }) +
        tile({ l: '신규 회원', v: num(d.members.new_cur) + '<small>명</small>', d: delta(d.members.new_cur, d.members.new_prev), s: '전체 ' + num(d.members.total) + '명', tab: 'people' }) +
      '</div>' +
      card(d.range.days <= 2 ? '시간대별 페이지뷰' : '방문 추이', '<div class="kc" id="k-trend"></div>', { small: d.range.days <= 2 ? '' : '점을 누르면 그날의 문의·가입도 함께 보입니다' }) +
      '<div class="grid2 k-gap"><div>' +
        card('문의까지 이어지는 흐름', contactFunnel(d), { small: more('action', '클릭·전환 보기') }) +
        card('많이 본 페이지', kbars(pages, { hi: true }), { small: more('content', '전체 페이지') }) +
        card('많이 누른 항목', kbars(clicks), { small: more('action', '전체 클릭') }) +
      '</div><div>' +
        card('지금 접속 중', '<div class="rt-big"><b>' + num(rt.active) + '</b>명<span>최근 5분</span></div>' +
          (rt.pages.length ? '<ul class="mini-list">' + rt.pages.map(function (r) { return '<li><span>' + esc(pname(r.path)) + '</span><span class="age">' + num(r.n) + '명</span></li>'; }).join('') + '</ul>' : '') +
          '<p class="muted-s k-foot">오늘 순방문자 ' + num(rt.today.uv) + '명 · 페이지뷰 ' + num(rt.today.pv) + '</p>') +
        card('유입 경로', kbars(channelList(d), { hi: true }), { small: more('traffic', '자세히') }) +
        card('접속 기기', share(techSum(d, 'device', DEV).map(function (x) { return { label: x.label, n: x.n }; })), { small: '방문 기준' }) +
      '</div></div>';
  }
  function trend(box, d) {
    if (!box) return;
    if (d.range.days <= 2) {
      var hrs = []; for (var h = 0; h < 24; h++) hrs.push(0);
      d.heat.forEach(function (r) { hrs[r.h] += r.n; });
      chart(box, { type: 'bar', label: '시간대별 페이지뷰', labels: hrs.map(function (_, i) { return i + '시'; }), series: [{ name: '페이지뷰', values: hrs, cls: 'a' }],
        tip: function (i) { return '<b>' + i + '시</b>페이지뷰 ' + num(hrs[i]); } });
      return;
    }
    var days = dayList(d.range.from, d.range.to), m = index(d.series, 'day'), iq = index(d.inq_series, 'd'), sg = index(d.sign_series, 'd');
    var v = function (x, k) { return (m[x] || {})[k] || 0; };
    chart(box, { type: 'line', label: '일별 방문 추이', labels: days.map(md),
      series: [{ name: '순방문자', values: days.map(function (x) { return v(x, 'uv'); }), cls: 'a', area: true }, { name: '페이지뷰', values: days.map(function (x) { return v(x, 'pv'); }), cls: 'b' }],
      tip: function (i) { var x = days[i]; return '<b>' + md(x) + ' (' + wd(x) + ')</b>순방문자 ' + num(v(x, 'uv')) + ' · 방문 ' + num(v(x, 'ss')) + '<br>페이지뷰 ' + num(v(x, 'pv')) + '<br>문의 ' + num((iq[x] || {}).n) + '건 · 가입 ' + num((sg[x] || {}).n) + '명'; } });
  }

  /* ---------- 콘텐츠 ---------- */
  function tContent(d) {
    var rows = pageRows(d);
    var cols = [
      { l: '페이지', k: 'name', v: function (r) { return r.name; }, f: function (r) { return '<b>' + esc(r.name) + '</b><div class="age">' + esc(r.path) + '</div>'; }, cls: 'k-pg' },
      { l: '주소', k: 'path', hide: true },
      { l: '페이지뷰', k: 'pv', num: true, f: function (r) { return num(r.pv); } },
      { l: '순방문자', k: 'uv', num: true, f: function (r) { return num(r.uv); } },
      { l: '평균 체류', cl: '평균 체류(초)', k: 'dwell', num: true, f: function (r) { return dur(r.dwell); }, csv: function (r) { return Math.round((r.dwell || 0) / 1000); }, hint: '이 페이지를 보고 있던 시간의 평균' },
      { l: '끝까지 본 비율', k: 'deepRate', num: true, f: function (r) { return pct(r.deepRate); }, csv: function (r) { return r.deepRate == null ? '' : r.deepRate.toFixed(1); }, hint: '페이지의 75% 이상까지 스크롤한 비율' },
      { l: '평균 스크롤', k: 'scroll', num: true, f: function (r) { return r.scroll == null ? '–' : Math.round(r.scroll) + '%'; }, csv: function (r) { return r.scroll == null ? '' : Math.round(r.scroll); } },
      { l: '랜딩', k: 'entries', num: true, f: function (r) { return num(r.entries); }, hint: '방문을 이 페이지로 시작한 횟수' },
      { l: '종료율', k: 'exitRate', num: true, f: function (r) { return pct(r.exitRate); }, csv: function (r) { return r.exitRate == null ? '' : r.exitRate.toFixed(1); }, hint: '이 페이지를 마지막으로 보고 나간 비율' },
    ];
    var ins = rows.filter(function (r) { return /^\/insights\/./.test(r.path); }).sort(function (a, b) { return b.uv - a.uv; }).slice(0, 8)
      .map(function (r) { return { label: esc(r.name.replace(/^인사이트:\s*/, '')), sub: '평균 ' + dur(r.dwell) + ' · 끝까지 본 비율 ' + pct(r.deepRate), value: r.uv, display: num(r.uv) + '명' }; });
    var long = rows.filter(function (r) { return r.pv >= 3 && r.dwell; }).sort(function (a, b) { return b.dwell - a.dwell; }).slice(0, 8)
      .map(function (r) { return { label: esc(r.name), sub: '페이지뷰 ' + num(r.pv), value: r.dwell, display: dur(r.dwell) }; });
    var nf = d.notfound.length ? card('없는 주소로 들어온 방문', '<p class="muted-s k-lead">지운 페이지나 잘못된 링크일 수 있습니다. 자주 나오는 주소는 맞는 페이지로 연결(리디렉션)해 두세요.</p>' +
      table('t-nf', [{ l: '주소', k: 'path' }, { l: '횟수', k: 'n', num: true, f: function (r) { return num(r.n); } }, { l: '마지막', k: 'last', num: true, f: function (r) { return new Date(r.last + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' '); } }], d.notfound)) : '';
    return notice(d) +
      card('페이지별 지표', '<p class="muted-s k-lead">제목을 누르면 정렬됩니다. 체류시간과 스크롤은 페이지를 떠날 때 기록되어, 방금 연 페이지는 조금 늦게 반영됩니다.</p>' +
        table('t-pages', cols, rows, { empty: '이 기간에는 페이지 방문 기록이 없습니다.', limit: 30 }), { small: csvBtn('t-pages', 'pages') }) +
      '<div class="grid2 k-gap"><div>' + card('인사이트 글 순위', kbars(ins, { hi: true, empty: '이 기간에 인사이트 글을 본 방문이 없습니다.' }), { small: '순방문자 기준' }) + '</div>' +
        '<div>' + card('오래 머문 페이지', kbars(long, { empty: '페이지뷰 3회 이상인 페이지가 아직 없습니다.' }), { small: '평균 체류시간' }) + '</div></div>' +
      card('요일·시간대별 방문', heatmap(d.heat), { cls: 'k-gap' }) + nf;
  }

  /* ---------- 유입 경로 ---------- */
  function tTraffic(d) {
    var tot = d.channels.reduce(function (a, r) { return a + r.sessions; }, 0);
    var ch = d.channels.map(function (r) { return { ch: r.ch, name: CH[r.ch] || r.ch, sessions: r.sessions, uv: r.uv, share: rate(r.sessions, tot), conv: r.conv, cvr: rate(r.conv, r.sessions) }; });
    var chCols = [
      { l: '채널', k: 'name', f: function (r) { return '<b>' + esc(r.name) + '</b>'; } },
      { l: '방문', k: 'sessions', num: true, f: function (r) { return num(r.sessions); } },
      { l: '순방문자', k: 'uv', num: true, f: function (r) { return num(r.uv); } },
      { l: '비중', k: 'share', num: true, f: function (r) { return '<span class="cellbar"><i style="width:' + (r.share || 0).toFixed(1) + '%"></i></span>' + pct(r.share); }, csv: function (r) { return r.share == null ? '' : r.share.toFixed(1); } },
      { l: '문의 접수', k: 'conv', num: true, f: function (r) { return num(r.conv); }, hint: '이 채널로 들어온 방문 중 문의 접수까지 마친 방문' },
      { l: '전환율', k: 'cvr', num: true, f: function (r) { return pct(r.cvr); }, csv: function (r) { return r.cvr == null ? '' : r.cvr.toFixed(1); } },
    ];
    var refs = d.refs.map(function (r) { return { name: refName(r.ref), host: r.ref, n: r.n }; });
    var lands = d.landings.slice(0, 10).map(function (r) { return { label: esc(pname(r.path)), sub: esc(r.path), value: r.n, display: num(r.n) }; });
    var kw = d.keywords.length ? table('t-kw', [{ l: '검색어', k: 'kw', f: function (r) { return '<b>' + esc(r.kw) + '</b>'; } }, { l: '검색엔진', k: 'ref', f: function (r) { return esc(refName(r.ref)); } }, { l: '방문', k: 'n', num: true, f: function (r) { return num(r.n); } }], d.keywords)
      : '<p class="muted-s">네이버·구글은 대부분 검색어를 넘겨주지 않아 이곳에는 일부만 나타납니다. 어떤 검색어로 노출·클릭되는지는 네이버 서치어드바이저와 구글 서치콘솔에서 함께 확인하세요.</p>';
    var cmp = table('t-cmp', [
      { l: '출처', k: 'source', f: function (r) { return '<b>' + esc(r.source) + '</b>'; } }, { l: '매체', k: 'medium' }, { l: '캠페인', k: 'campaign' },
      { l: '방문', k: 'sessions', num: true, f: function (r) { return num(r.sessions); } }, { l: '문의 접수', k: 'conv', num: true, f: function (r) { return num(r.conv); } },
    ], d.campaigns, { empty: '아직 캠페인 링크로 들어온 방문이 없습니다. 아래에서 링크를 만들어 블로그·SNS·문자에 붙여 보세요.' });
    var techList = function (key, names) { var l = techSum(d, key, names), t = l.reduce(function (a, x) { return a + x.n; }, 0); return kbars(l.map(function (x) { return { label: esc(x.label), value: x.n, display: pct(rate(x.n, t)) + '<small>' + num(x.n) + '</small>' }; })); };
    return notice(d) +
      card('유입 채널', table('t-ch', chCols, ch, { empty: '이 기간에는 방문 기록이 없습니다.' }), { small: csvBtn('t-ch', 'channels') }) +
      '<div class="grid2 k-gap"><div>' +
        card('유입 사이트', table('t-ref', [{ l: '사이트', k: 'name', f: function (r) { return '<b>' + esc(r.name) + '</b>' + (r.name !== r.host ? '<div class="age">' + esc(r.host) + '</div>' : ''); } }, { l: '방문', k: 'n', num: true, f: function (r) { return num(r.n); } }], refs,
          { empty: '다른 사이트에서 들어온 방문이 아직 없습니다.', limit: 12 }), { small: csvBtn('t-ref', 'referrers') }) +
        card('검색어', kw) +
      '</div><div>' +
        card('처음 들어온 페이지', kbars(lands, { hi: true }), { small: '랜딩 페이지' }) +
        card('기기', techList('device', DEV)) + card('운영체제', techList('os', OS)) + card('브라우저·앱', techList('browser', BR), { small: '카카오톡·네이버 앱 안에서 연 경우 포함' }) +
      '</div></div>' +
      card('캠페인(UTM)', cmp + utmForm(), { cls: 'k-gap', small: d.campaigns.length ? csvBtn('t-cmp', 'campaigns') : '' });
  }
  function utmForm() {
    var main = ['/', '/solution', '/models', '/cases', '/assessment', '/contact', '/about', '/partners', '/insights'];
    return '<div class="utm"><h3>캠페인 링크 만들기</h3><p class="muted-s">블로그 글, 인스타그램 프로필, 카카오톡 채널, 문자 발송 등에 이 링크를 쓰면 어디서 들어왔는지와 문의로 이어졌는지 따로 볼 수 있습니다.</p>' +
      '<div class="utm-f"><label><span>연결할 페이지</span><select id="u-page">' + main.map(function (p) { return '<option value="' + p + '">' + esc(pname(p)) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>출처 <code>utm_source</code></span><input id="u-src" placeholder="예: naver_blog" autocomplete="off"></label>' +
      '<label><span>매체 <code>utm_medium</code></span><input id="u-med" placeholder="예: social, sms, email" autocomplete="off"></label>' +
      '<label><span>캠페인 이름 <code>utm_campaign</code></span><input id="u-cmp" placeholder="예: 2026_owner_winter" autocomplete="off"></label></div>' +
      '<div class="utm-out"><code id="u-out"></code><button type="button" class="btn btn-outline btn-sm" id="u-copy">링크 복사</button></div></div>';
  }
  function utmBuild() {
    var el = S.el, out = $('#u-out', el); if (!out) return;
    function upd() {
      var q = [['utm_source', $('#u-src', el).value], ['utm_medium', $('#u-med', el).value], ['utm_campaign', $('#u-cmp', el).value]]
        .filter(function (x) { return x[1].trim(); }).map(function (x) { return x[0] + '=' + encodeURIComponent(x[1].trim().replace(/\s+/g, '_')); });
      var p = $('#u-page', el).value;
      out.textContent = location.origin + (p === '/insights' ? '/insights/' : p) + (q.length ? '?' + q.join('&') : '');
    }
    ['#u-page', '#u-src', '#u-med', '#u-cmp'].forEach(function (s) { $(s, el).addEventListener('input', upd); $(s, el).addEventListener('change', upd); });
    upd();
  }

  /* ---------- 클릭·전환 ---------- */
  function tAction(d) {
    var g = goalMap(d.goals.cur), gp = goalMap(d.goals.prev), k = clickMap(d.click_kinds), f = d.funnel;
    var gs = function (m, key) { return (m[key] || {}).ss || 0; }, kn = function (key) { return (k[key] || {}).n || 0; };
    var started = gs(g, 'assessment_start'), done = gs(g, 'assessment_done');
    var rows = d.clicks.map(function (r) { return { label: r.label, kind: CK[r.kind] || r.kind, area: r.area, target: r.target, tname: r.target && r.target.charAt(0) === '/' ? pname(r.target) : r.target, n: r.n, ss: r.ss }; });
    var kinds = d.click_kinds.map(function (r) { return { label: esc(CK[r.kind] || r.kind), value: r.n, display: num(r.n) + '<small>' + num(r.ss) + '방문</small>' }; });
    return notice(d) +
      '<div class="kpis k4">' +
        tile({ l: '문의 접수', v: num(gs(g, 'contact_submit')), d: T(d, gs(g, 'contact_submit'), gs(gp, 'contact_submit')), s: '접수를 마친 방문', hint: '홈페이지 문의 폼에서 접수를 마친 방문 수입니다. 관리자 화면의 문의 건수와 조금 다를 수 있습니다.' }) +
        tile({ l: '문의·진단 버튼 클릭', v: num(kn('cta')), s: '문의·사전진단으로 가는 버튼' }) +
        tile({ l: '사전진단 시작', v: num(started), d: T(d, started, gs(gp, 'assessment_start')), s: '진단 페이지 방문 ' + num(f.s_assess) }) +
        tile({ l: '사전진단 완료', v: num(done), d: T(d, done, gs(gp, 'assessment_done')), s: '시작 대비 ' + pct(rate(done, started)) }) +
        tile({ l: '회원가입', v: num(gs(g, 'signup')), d: T(d, gs(g, 'signup'), gs(gp, 'signup')), s: '가입 완료 화면까지 간 방문', tab: 'people' }) +
        tile({ l: '전화 연결', v: num(kn('tel')), s: '전화번호를 누른 횟수' }) +
        tile({ l: '카카오톡', v: num(kn('kakao')), s: '카카오톡 링크를 누른 횟수' }) +
        tile({ l: '이메일', v: num(kn('mail')), s: '이메일 주소를 누른 횟수' }) +
      '</div>' +
      '<div class="grid2 k-gap"><div>' +
        card('문의까지 이어지는 흐름', contactFunnel(d)) +
        card('사전진단 흐름', funnel([
          { label: '진단 페이지', n: f.s_assess || 0, note: '공간 사전진단 화면을 연 방문' },
          { label: '진단 시작', n: started, note: '첫 질문에 답하고 다음으로 넘어감' },
          { label: '결과 확인', n: done, note: '마지막 결과 화면까지 봄' },
          { label: '결과 후 문의 페이지', n: f.assess_to_contact || 0, note: '결과를 본 뒤 문의 화면을 연 방문' },
        ].map(function (s, i, arr) { if (i) s.base = '진단 페이지의 ' + pct(rate(s.n, arr[0].n)); return s; }))) +
      '</div><div>' + card('클릭 종류', kbars(kinds, { hi: true })) + '</div></div>' +
      card('누른 항목', '<p class="muted-s k-lead">링크와 버튼을 누른 기록입니다. 같은 이름이라도 위치(상단 메뉴·본문·바닥글)가 다르면 따로 셉니다.</p>' + table('t-clicks', [
        { l: '항목', k: 'label', f: function (r) { return '<b>' + esc(r.label) + '</b>'; } },
        { l: '종류', k: 'kind', cls: 'nw' }, { l: '위치', k: 'area', cls: 'nw' },
        { l: '이동한 곳', k: 'tname', f: function (r) { return esc(r.tname || '-') + (r.target && r.tname !== r.target ? '<div class="age">' + esc(r.target) + '</div>' : ''); }, csv: function (r) { return r.target; } },
        { l: '클릭', k: 'n', num: true, f: function (r) { return num(r.n); } }, { l: '클릭한 방문', k: 'ss', num: true, f: function (r) { return num(r.ss); } },
      ], rows, { empty: '이 기간에는 클릭 기록이 없습니다.', limit: 20 }), { cls: 'k-gap', small: csvBtn('t-clicks', 'clicks') });
  }

  /* ---------- 회원·문의 ---------- */
  function tPeople(d) {
    var M = d.members, I = d.inquiries, C = d.center, D = d.deliveries || {};
    var lbl = function (map) { return function (r) { return { label: esc(map[r.k] || r.k || '미지정'), value: r.n, display: num(r.n) }; }; };
    var stageRows = Object.keys(STAGE).map(function (s) { var f = I.by_stage.filter(function (r) { return r.k === s; })[0]; return { k: s, n: f ? f.n : 0 }; }).filter(function (r) { return r.n; });
    var PST = (window.GBProject && window.GBProject.STAGE) || {};
    S.charts.push(function () { peopleChart($('#k-people', S.el), d); });
    return '<div class="kpis k4">' +
        tile({ l: '전체 회원', v: num(M.total) + '<small>명</small>', s: '이메일 인증 ' + pct(rate(M.verified, M.total)), href: '#/members' }) +
        tile({ l: '신규 가입', v: num(M.new_cur) + '<small>명</small>', d: delta(M.new_cur, M.new_prev), s: '이전 기간 ' + num(M.new_prev) + '명', href: '#/members' }) +
        tile({ l: '로그인한 회원', v: num(M.active_cur) + '<small>명</small>', s: '기간 중 마지막 로그인 기준' }) +
        tile({ l: '마케팅 수신 동의', v: num(M.marketing) + '<small>명</small>', s: '전체의 ' + pct(rate(M.marketing, M.total)), href: '#/members?filter=marketing' }) +
        tile({ l: '문의 접수', v: num(I.cur) + '<small>건</small>', d: delta(I.cur, I.prev), s: '이전 기간 ' + num(I.prev) + '건', href: '#/inquiries' }) +
        tile({ l: '평균 첫 회신', v: hours(I.reply.hrs), s: '회신·자료를 보낸 문의 ' + num(I.reply.n) + '건', hint: '기간 중 접수된 문의에 처음 메일 회신이나 자료를 보내기까지 걸린 시간의 평균입니다.' }) +
        tile({ l: '처리 대기 문의', v: num(I.open) + '<small>건</small>', s: '신규·검토 중 (전체 기간)', href: '#/inquiries?stage=open' }) +
        tile({ l: '진행 중 프로젝트', v: C ? num(C.active) + '<small>건</small>' : '–', s: C ? '기간 중 새로 만든 프로젝트 ' + num(C.new_cur) + '건' : '임대인센터', href: '#/projects' }) +
      '</div>' +
      card('일별 문의·가입', '<div class="kc" id="k-people"></div>') +
      '<div class="grid2 k-gap"><div>' +
        card('최근 가입 회원', M.recent.length ? '<ul class="mini-list">' + M.recent.map(function (u) {
          return '<li><span><a href="#/member/' + u.id + '">' + esc(u.name) + '</a> · ' + esc(ROLE[u.role] || '구분 없음') + (u.company ? ' · ' + esc(u.company) : '') + (u.email_verified ? '' : ' <span class="age late">미인증</span>') + '</span><span class="age">' + kday(Date.parse(u.created_at)) + '</span></li>';
        }).join('') + '</ul>' : empty('아직 가입한 회원이 없습니다.'), { small: '<a href="#/members">회원 목록 전체 보기</a>' }) +
        card('기간 중 접수된 문의', I.recent.length ? '<ul class="mini-list">' + I.recent.map(function (r) {
          return '<li><span><a href="#/inquiry/' + r.id + '">#' + r.id + ' ' + esc(r.name) + '</a> · ' + esc(TYPE[r.type] || r.type) + '</span><span class="age">' + esc(STAGE[r.stage || 'new'] || '') + ' · ' + kday(Date.parse(r.created_at)).slice(5) + '</span></li>';
        }).join('') + '</ul>' : empty('이 기간에 접수된 문의가 없습니다.'), { small: '<a href="#/inquiries">문의 관리</a>' }) +
        card('자료 발송', '<dl class="dl"><dt>보낸 자료</dt><dd>' + num(D.sent) + '건</dd><dt>열람</dt><dd>' + num(D.opened) + '건 (' + pct(rate(D.opened, D.sent)) + ')</dd></dl>', { small: '<a href="#/documents">발송 이력</a>' }) +
      '</div><div>' +
        card('문의 유형', kbars(I.by_type.map(lbl(TYPE)), { hi: true, empty: '이 기간에 접수된 문의가 없습니다.' })) +
        card('문의 고객 구분', kbars(I.by_role.map(lbl(ROLE)), { empty: '이 기간에 접수된 문의가 없습니다.' })) +
        card('문의 진행 단계', kbars(stageRows.map(lbl(STAGE)), { empty: '이 기간에 접수된 문의가 없습니다.' }), { small: '기간 중 접수 건' }) +
        card('회원 구분', kbars(M.by_role.map(lbl(ROLE)), { empty: '아직 가입한 회원이 없습니다.' }), { small: '전체 회원' }) +
        (C ? card('임대인센터 프로젝트', kbars(C.by_stage.filter(function (r) { return r.n; }).sort(function (a, b) { var o = Object.keys(PST); return o.indexOf(a.k) - o.indexOf(b.k); }).map(lbl(PST)), { empty: '아직 만든 프로젝트가 없습니다.' }), { small: '<a href="#/projects">프로젝트 보기</a>' }) : '') +
      '</div></div>';
  }
  function peopleChart(box, d) {
    if (!box) return;
    var days = dayList(d.range.from, d.range.to), iq = index(d.inq_series, 'd'), sg = index(d.sign_series, 'd');
    var a = days.map(function (x) { return (iq[x] || {}).n || 0; }), b = days.map(function (x) { return (sg[x] || {}).n || 0; });
    chart(box, { type: 'bar', label: '일별 문의·가입', labels: days.map(md), series: [{ name: '문의', values: a, cls: 'a' }, { name: '가입', values: b, cls: 'b' }],
      tip: function (i) { return '<b>' + md(days[i]) + ' (' + wd(days[i]) + ')</b>문의 ' + num(a[i]) + '건 · 가입 ' + num(b[i]) + '명'; } });
  }

  /* ---------- 지표 설명 ---------- */
  function tGuide(d) {
    var off = false; try { off = localStorage.getItem('gb_notrack') === '1'; } catch (e) {}
    var defs = [
      ['순방문자', HINT.uv], ['방문 수', HINT.sessions], ['페이지뷰', HINT.pv], ['평균 체류시간', HINT.dwell], ['이탈률', HINT.bounce],
      ['끝까지 본 비율', '페이지의 75% 이상까지 스크롤한 페이지뷰의 비율입니다. 글이 끝까지 읽히는지 볼 때 씁니다.'],
      ['랜딩·종료율', '랜딩은 방문을 그 페이지로 시작한 횟수, 종료율은 그 페이지를 마지막으로 보고 나간 비율입니다.'],
      ['문의 전환율', HINT.cv + ' 클릭·전환 탭의 문의 접수는 방문 기록 기준이라 관리자 화면의 문의 건수와 조금 다를 수 있습니다.'],
      ['유입 채널', '방문을 시작할 때 어디서 왔는지로 나눕니다. 검색(네이버·구글·다음), 지도·플레이스, 블로그·카페, SNS·메신저, 다른 사이트, 캠페인(UTM 링크), 직접 방문(주소 입력·즐겨찾기·카카오톡 대화방 링크 등)입니다.'],
      ['클릭', '링크와 주요 버튼을 누른 기록입니다. 전화·이메일·카카오톡 연결, 외부 링크, 문의·진단 버튼, 페이지 이동으로 나눕니다. 마이페이지·임대인센터 화면의 클릭은 기록하지 않습니다.'],
    ];
    return card('지표 정의', '<dl class="k-defs">' + defs.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>') +
      card('집계 방식', '<ul class="k-list">' +
        '<li>홈페이지에 넣은 자체 집계 스크립트로 모읍니다. 외부 분석 서비스로 보내지 않고, 이름·연락처·IP 주소는 저장하지 않습니다.</li>' +
        '<li>관리자 계정으로 로그인한 상태의 방문, 검색엔진 수집 프로그램, 미리보기 주소(pages.dev)의 방문은 빼고 셉니다.</li>' +
        '<li>브라우저에서 추적 거부(GPC·Do Not Track)를 켠 방문과 광고 차단 프로그램이 막은 방문은 빠지므로, 실제보다 조금 적게 잡힐 수 있습니다.</li>' +
        '<li>방문 기록은 13개월 동안 보관한 뒤 자동으로 지웁니다. 회원·문의 지표는 각 관리 메뉴의 데이터를 그대로 셉니다.</li>' +
        '<li>방문 기록 시작일: ' + (d.data_since || '아직 기록 없음') + '</li></ul>') +
      card('이 브라우저의 방문', '<p class="muted-s k-lead">' + (off ? '지금 이 브라우저의 홈페이지 방문은 집계에서 빠집니다. 관리자 화면에 들어오면 자동으로 빠지도록 설정됩니다.' : '지금 이 브라우저의 홈페이지 방문도 집계됩니다.') + '</p>' +
        '<button type="button" class="btn btn-outline btn-sm" id="k-notrack">' + (off ? '이 브라우저 방문도 집계하기' : '이 브라우저 방문은 빼기') + '</button>');
  }

  window.GBKpi = { mount: mount };
})();

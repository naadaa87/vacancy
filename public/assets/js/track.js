/* 공백 홈페이지 방문 통계 (자체 집계)
 * 페이지 방문, 머문 시간, 스크롤, 누른 링크, 문의·사전진단·가입 완료를 셉니다.
 * 이름·연락처는 보내지 않고, 브라우저에 저장한 임의 번호로 방문만 구분합니다.
 * 브라우저에서 추적 거부(GPC·Do Not Track)를 켠 경우와 관리자 브라우저는 집계하지 않습니다. */
(function () {
  'use strict';
  var W = window, D = document, N = navigator, EP = '/api/track';
  var queue = W.gbq = W.gbq || [];
  W.gbTrack = function () { queue.push([].slice.call(arguments)); };

  var ua = N.userAgent || '';
  try {
    if (N.webdriver || /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|yeti\/|daumoa/i.test(ua)) return;
    if (N.globalPrivacyControl === true || N.doNotTrack === '1' || W.doNotTrack === '1') return;
  } catch (e) { return; }

  var LS = null;
  try { LS = W.localStorage; LS.setItem('gb_t', '1'); LS.removeItem('gb_t'); } catch (e) { LS = null; }
  function lget(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function lset(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) {} }
  if (lget('gb_notrack') === '1') return;

  function rid() {
    var a = new Uint8Array(12), c = W.crypto || W.msCrypto, s = '';
    if (c && c.getRandomValues) c.getRandomValues(a); else for (var i = 0; i < 12; i++) a[i] = Math.floor(Math.random() * 256);
    for (var j = 0; j < a.length; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  function norm(p) {
    p = String(p || '/').split(/[?#]/)[0].replace(/\/{2,}/g, '/').replace(/\.html$/i, '').replace(/\/index$/i, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }
  var PATH = norm(location.pathname);
  var PRIVATE = /^\/(account|center|documents|reset-password)(\/|$)/.test(PATH); // 개인 화면: 클릭 내용은 남기지 않음

  // 방문자(브라우저) 번호와 방문(세션) 번호 — 30분 동안 움직임이 없으면 새 방문으로 봅니다
  var vid = lget('gb_vid'), isNew = 0;
  if (!vid || !/^[0-9a-f]{24}$/.test(vid)) { vid = rid(); isNew = 1; lset('gb_vid', vid); }
  var sid = lget('gb_sid'), last = +lget('gb_slast') || 0, entry = 0;
  if (!sid || !/^[0-9a-f]{24}$/.test(sid) || Date.now() - last > 30 * 60 * 1000) { sid = rid(); entry = 1; lset('gb_sid', sid); }
  function touch() { lset('gb_slast', String(Date.now())); }
  touch();

  // 기기·운영체제·브라우저 (카카오톡·네이버 앱 안에서 연 경우 구분)
  var tp = (N.maxTouchPoints || 0) > 1;
  var dev = (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || (/Macintosh/.test(ua) && tp)) ? 'tablet'
    : /Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua) ? 'mobile' : 'desktop';
  var os = (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && tp)) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux|CrOS/.test(ua) ? 'Linux' : 'etc';
  var br = /KAKAOTALK/i.test(ua) ? 'KakaoTalk' : /NAVER\(inapp/i.test(ua) ? 'NAVER' : /Instagram/.test(ua) ? 'Instagram' : /FBAN|FBAV/.test(ua) ? 'Facebook'
    : /\bLine\//.test(ua) ? 'LINE' : /DaumApps/.test(ua) ? 'Daum' : /Whale\//.test(ua) ? 'Whale' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Edg(e|A|iOS)?\//.test(ua) ? 'Edge'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'etc';

  // 캠페인 (utm_*, 구글·네이버 광고 클릭)
  var utm = {};
  try {
    var q = new URLSearchParams(location.search);
    utm = { s: q.get('utm_source') || '', m: q.get('utm_medium') || '', c: q.get('utm_campaign') || '' };
    if (!utm.s && q.get('gclid')) utm = { s: 'google', m: 'cpc', c: '' };
    if (!utm.s && (q.get('NaPm') || q.get('n_media'))) utm = { s: 'naver', m: 'cpc', c: q.get('n_campaign') || '' };
  } catch (e) {}

  function send(o, beacon) {
    var body = JSON.stringify(o);
    try {
      if (beacon && N.sendBeacon && N.sendBeacon(EP, body)) return;
      if (W.fetch) W.fetch(EP, { method: 'POST', body: body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' } })['catch'](function () {});
    } catch (e) {}
  }

  // 페이지뷰
  var pvId, active, lastTick, lastInput, maxScroll, sentW, sentS, vis = D.visibilityState !== 'hidden';
  function pageview(isEntry) {
    pvId = rid(); active = 0; lastTick = Date.now(); lastInput = Date.now(); maxScroll = 0; sentW = -1; sentS = -1;
    var nf = D.body && D.body.classList.contains('page-404');
    send({ t: 'pv', id: pvId, vid: vid, sid: sid, p: PATH, ti: nf ? '__404' : D.title, r: D.referrer || '', u: utm, d: dev, o: os, b: br, n: isNew, e: isEntry });
    isNew = 0;
    measureScroll();
  }

  // 머문 시간: 화면이 보이고, 2분 안에 움직임이 있었던 시간만 셉니다
  function tick() {
    var now = Date.now();
    if (vis && now - lastInput < 120000) active += Math.min(now - lastTick, 15000);
    lastTick = now;
  }
  function measureScroll() {
    var h = Math.max(D.documentElement.scrollHeight, D.body ? D.body.scrollHeight : 0);
    var seen = (W.scrollY || W.pageYOffset || 0) + W.innerHeight;
    var pct = h > 0 ? Math.min(100, Math.round(seen / h * 100)) : 100;
    if (pct > maxScroll) maxScroll = pct;
  }
  function leave() {
    tick();
    if (active === sentW && maxScroll === sentS) return;
    sentW = active; sentS = maxScroll;
    send({ t: 'lv', id: pvId, w: active, s: maxScroll }, true);
  }
  var scrollRaf = 0;
  function onInput() { lastInput = Date.now(); }
  ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'wheel'].forEach(function (e) { W.addEventListener(e, onInput, { passive: true }); });
  W.addEventListener('scroll', function () {
    lastInput = Date.now();
    if (!scrollRaf) scrollRaf = (W.requestAnimationFrame || setTimeout)(function () { scrollRaf = 0; measureScroll(); });
  }, { passive: true });
  setInterval(function () { tick(); if (vis && Date.now() - lastInput < 120000) touch(); }, 5000);
  D.addEventListener('visibilitychange', function () {
    if (D.visibilityState === 'hidden') { leave(); vis = false; }
    else { vis = true; lastTick = Date.now(); lastInput = Date.now(); }
  });
  W.addEventListener('pagehide', leave);
  // 뒤로 가기로 다시 열린 페이지는 새 페이지뷰로 셉니다
  W.addEventListener('pageshow', function (e) { if (e.persisted) { vis = true; touch(); pageview(0); } });

  // 클릭: 링크와 data-track 표시가 있는 요소
  function areaOf(el) {
    if (el.closest('#mobile-menu')) return '모바일 메뉴';
    if (el.closest('.site-header')) return '상단 메뉴';
    if (el.closest('.site-footer')) return '바닥글';
    if (el.closest('.sticky-cta')) return '하단 고정 버튼';
    return '본문';
  }
  D.addEventListener('click', function (e) {
    if (PRIVATE) return;
    var el = e.target && e.target.closest ? e.target.closest('a[href], [data-track], .nav-toggle') : null;
    if (!el || el.closest('[data-notrack]')) return;
    var href = el.getAttribute('href') || '', kind = 'button', target = '';
    var label = (el.getAttribute('data-track') || el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (el.classList.contains('nav-toggle')) { label = el.getAttribute('aria-expanded') === 'true' ? '모바일 메뉴 닫기' : '모바일 메뉴 열기'; }
    else if (el.tagName === 'A') {
      if (/^tel:/i.test(href)) { kind = 'tel'; target = '전화'; }
      else if (/^mailto:/i.test(href)) { kind = 'mail'; target = '이메일'; }
      else if (href.charAt(0) === '#' && !el.hasAttribute('data-track')) return;
      else {
        var u; try { u = new URL(el.href, location.href); } catch (x) { return; }
        if (u.host !== location.host) { kind = /(^|\.)kakao\.com$/.test(u.hostname) ? 'kakao' : 'out'; target = (u.hostname + u.pathname).slice(0, 200); }
        else {
          target = norm(u.pathname);
          kind = /\.(pdf|zip|hwp|hwpx|docx?|xlsx?|pptx?)$/i.test(u.pathname) ? 'file' : (target === '/contact' || target === '/assessment') ? 'cta' : 'nav';
        }
      }
    }
    if (!label) label = target || '(이름 없음)';
    touch();
    send({ t: 'ev', y: 'click', vid: vid, sid: sid, p: PATH, k: kind, l: label, g: target, a: areaOf(el) }, true);
  }, true);

  // 목표 달성: gbTrack('goal', 'contact_submit', '유형')
  function track(type, kind, label) {
    if (type !== 'goal') return;
    touch();
    send({ t: 'ev', y: 'goal', vid: vid, sid: sid, p: PATH, k: String(kind || ''), l: String(label || '').slice(0, 80) }, true);
  }
  W.gbTrack = track;

  pageview(entry);
  for (var i = 0; i < queue.length; i++) { try { track.apply(null, queue[i]); } catch (e) {} }
  queue.length = 0;
})();

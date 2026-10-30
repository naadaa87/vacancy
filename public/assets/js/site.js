/* 공통 동작: 헤더 스크롤 상태, 모바일 메뉴 */
(function () {
  var header = document.querySelector('.site-header');
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('mobile-menu');

  function onScroll() { if (header) header.classList.toggle('is-scrolled', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // 건물 단면도: 좁은 화면에서는 건물 본체만 확대해서 보여줍니다.
  var bld = document.querySelector('svg.building[data-mobile-viewbox]');
  if (bld) {
    var full = bld.getAttribute('viewBox');
    function fitBuilding() {
      var narrow = window.innerWidth < 600;
      bld.setAttribute('viewBox', narrow ? bld.getAttribute('data-mobile-viewbox') : full);
      bld.classList.toggle('is-compact', narrow);
    }
    fitBuilding();
    window.addEventListener('resize', fitBuilding);
  }

  // 로그인 상태면 '로그인' 링크를 '마이페이지'로 바꿉니다 (gb_li 쿠키는 표시용 힌트)
  if (/(?:^|;\s*)gb_li=1/.test(document.cookie)) {
    document.querySelectorAll('[data-auth-link]').forEach(function (a) { a.textContent = '마이페이지'; a.href = '/account'; });
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.setAttribute('aria-label', open ? '메뉴 열기' : '메뉴 닫기');
      menu.hidden = open;
      document.body.classList.toggle('menu-open', !open);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1240 && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    });
  }
})();

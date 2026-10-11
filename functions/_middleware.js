/**
 * 미리보기 주소(*.pages.dev) 정리
 * - vacancy0100.pages.dev 로 들어오면 → https://vacancy.co.kr 같은 경로로 301 이동
 * - 배포 미리보기 주소(예: abc123.vacancy0100.pages.dev)는 그대로 보여주되 검색엔진 수집 금지
 */
const PROD_PAGES_HOST = 'vacancy0100.pages.dev';
const CANONICAL_ORIGIN = 'https://vacancy.co.kr';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname;

  if (host === PROD_PAGES_HOST) {
    return Response.redirect(CANONICAL_ORIGIN + url.pathname + url.search, 301);
  }

  const response = await context.next();

  if (host.endsWith('.pages.dev')) {
    const res = new Response(response.body, response);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  return response;
}

# 공백 (GONG BAEK) 홈페이지 — vacancy.co.kr

주식회사 블랭크의 공실개발 솔루션 **공백** 정식 홈페이지입니다.
빌드 도구 없이 동작하는 순수 HTML/CSS/JS 사이트이며, GitHub에 올리고 Cloudflare Pages에 연결하면 바로 배포됩니다.

```
gongbaek-site/
├─ public/              ← 실제로 배포되는 사이트 (Cloudflare Pages 출력 디렉터리)
│  ├─ index.html, solution.html, models.html, cases.html, brands.html,
│  │  about.html, partners.html, assessment.html, insights.html, contact.html,
│  │  privacy.html, terms.html, 404.html
│  ├─ insights/*.html   ← 인사이트 칼럼 6편
│  ├─ assets/css/site.css · assets/js/*.js · assets/img/og-image.png
│  ├─ _headers, _redirects, robots.txt, sitemap.xml, site.webmanifest, favicon.*
├─ functions/api/contact.js   ← 문의 폼 접수 API (Cloudflare Pages Functions)
├─ functions/schema.sql       ← (선택) D1에 문의 저장용 테이블
└─ tools/               ← 콘텐츠 데이터(data.py)와 HTML 생성 스크립트(build.py). 배포에는 포함되지 않음
```

---

## 1. 배포하기 (GitHub → Cloudflare Pages)

터미널 없이 웹 화면만으로 진행할 수 있습니다.

### 1-1. GitHub에 올리기
1. github.com 로그인 → 우측 상단 **+** → **New repository**
2. Repository name: `gongbaek-site` (원하는 이름), **Private** 선택 → **Create repository**
3. 생성된 저장소 화면에서 **uploading an existing file** 링크 클릭
4. 이 폴더의 내용물(`public`, `functions`, `tools`, `README.md`, `.gitignore`)을 드래그해서 올리기
   - 폴더째로 드래그하면 하위 파일이 함께 올라갑니다. (GitHub Desktop을 쓰시면 폴더를 열고 **Publish repository**)
5. 하단 **Commit changes** 클릭

### 1-2. Cloudflare Pages 연결
1. dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 위에서 만든 저장소 선택 → **Begin setup**
3. 설정값
   - Project name: `gongbaek` (원하는 이름)
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: **비워 둠**
   - Build output directory: **`public`**
4. **Save and Deploy** → 1~2분 뒤 `https://gongbaek.pages.dev` 같은 임시 주소가 생깁니다.

### 1-3. 도메인 연결 (vacancy.co.kr)
1. Pages 프로젝트 → **Custom domains** → **Set up a custom domain** → `vacancy.co.kr` 입력
2. 도메인이 이미 Cloudflare DNS에 있으면 자동으로 레코드가 추가됩니다. (`www.vacancy.co.kr`도 같은 방법으로 추가)
3. 기존 사이트(아임웹 등)를 가리키던 A/CNAME 레코드가 남아 있으면 삭제합니다.

> 미리보기 주소(`*.pages.dev`)는 검색엔진에 노출하지 않는 것이 좋습니다.
> 임시 주소로 먼저 확인만 하고, 도메인 연결 후에는 Pages 설정 **Settings → Builds → Preview deployments**에서 접근 제한(Access policy)을 켜 두세요.

---

## 2. 문의 폼을 실제로 받게 만들기

문의 폼은 `/api/contact`(Cloudflare Pages Functions)로 전송됩니다. 아래 둘 중 하나 이상을 설정해야 접수됩니다.
아무것도 설정하지 않으면 폼은 "이메일로 보내기" 버튼으로 자동 전환되어 작성 내용이 담긴 메일을 띄웁니다. (접수가 막히지는 않습니다.)

### 방법 A. 이메일 알림 (권장, 무료) — Resend
1. resend.com 가입 → **API Keys** → **Create API Key** → 키 복사
2. (권장) **Domains** → `vacancy.co.kr` 추가 → 안내되는 DNS 레코드를 Cloudflare DNS에 추가해 인증
   - 인증 전에는 발신 주소가 `onboarding@resend.dev`로 고정되고, **가입한 본인 이메일로만** 수신됩니다.
3. Cloudflare Pages 프로젝트 → **Settings → Variables and Secrets** → 추가 (Production, Preview 둘 다)
   | 변수 | 값 |
   |---|---|
   | `RESEND_API_KEY` | 복사한 키 (Secret으로 저장) |
   | `CONTACT_TO` | `spaceblank0100@gmail.com` |
   | `CONTACT_FROM` | `공백 <noreply@vacancy.co.kr>` (도메인 인증 후) |
4. **Deployments → Retry deployment** 로 다시 배포하면 적용됩니다.

### 방법 B. (선택) D1 데이터베이스에 저장
1. **Workers & Pages → D1 → Create database** → 이름 `gongbaek-inquiries`
2. 만들어진 DB의 **Console** 탭에서 `functions/schema.sql` 내용을 붙여넣고 실행
3. Pages 프로젝트 → **Settings → Bindings → Add → D1 database** → Variable name `DB`, 위 DB 선택
4. 다시 배포. 이후 D1 콘솔에서 `SELECT * FROM inquiries ORDER BY id DESC;` 로 확인할 수 있습니다.

### (선택) 봇 차단 — Turnstile
`TURNSTILE_SECRET` 변수를 넣으면 Turnstile 검증을 요구합니다. 이 경우 `contact.html` 폼 안에 Turnstile 위젯 스크립트를 함께 넣어야 합니다. 기본 상태에서는 허니팟 필드로만 봇을 거릅니다.

---

## 3. 내용 수정하기

### 가장 쉬운 방법 — `public/` 안의 HTML 직접 수정
GitHub 웹에서 파일을 열고 연필 아이콘(Edit) → 수정 → Commit 하면 1~2분 안에 자동 재배포됩니다.

### 수치·사례·브랜드를 한 곳에서 관리 — `tools/data.py` + 빌드
모든 페이지의 숫자, 사례, 브랜드, 모델, 연혁, 인사이트 글, SEO 문안은 `tools/data.py` 한 파일에 있습니다.
이 파일을 고친 뒤 아래 명령을 실행하면 `public/`의 HTML이 모두 다시 생성됩니다.

```bash
pip install jinja2          # 최초 1회
python3 tools/build.py      # public/ 생성
python3 tools/serve.py      # 로컬 미리보기 → http://localhost:8787
```

> 두 방법을 섞어 쓰면 빌드가 직접 수정한 HTML을 덮어씁니다. 팀에서 어느 한쪽으로 정하는 것을 권합니다.

### 자주 바꾸는 항목 위치 (`tools/data.py`)
| 항목 | 변수 |
|---|---|
| 회사 정보·연락처·도메인 | `SITE` |
| 대표 수치 (10년+, 340개+, 120여 개) | `CLAIMS`, `CLAIMS_EXTRA` |
| 시장 공실률 통계 | `MARKET` |
| 개발 사례 6건 | `CASES` (수치 각주는 `CASE_FOOTNOTE`) |
| 개발모델 · 프로세스 · 서비스 유형 · 협업 방식 | `MODELS`, `PROCESS`, `SERVICE_TYPES`, `COLLAB` |
| 연혁 · 대표 소개 · 일하는 원칙 | `TIMELINE`, `CEO`, `PRINCIPLES` |
| 운영 브랜드 (노출 여부는 `public: True/False`) | `BRANDS` |
| 인사이트 글 | `INSIGHTS` |
| 페이지 제목·설명(SEO) | `PAGES` |
| 평가 플랫폼(BLANK SPACE INDEX) 주소 | `SITE["index_url"]` — 오픈 후 주소를 넣으면 회사소개에 버튼이 생깁니다 |
| Cloudflare Web Analytics | `SITE["cf_analytics_token"]` |

---

## 4. 로고·사진 교체
- **로고**: 현재는 SVG로 재구성한 마크(`base.html`의 `.brand-mark`)와 워드마크를 씁니다. 원본 로고를 쓰려면 `public/assets/img/logo.svg`(또는 png)를 넣고 `tools/templates/base.html`의 `<svg class="brand-mark">` 부분을 `<img src="/assets/img/logo.svg" alt="공백" height="34">`로 바꾼 뒤 빌드하세요. 파비콘은 `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-512.png`를 같은 이름으로 교체하면 됩니다.
- **현장 사진**: 사례 카드는 사진 없이도 완결되도록 만들었습니다. 사진을 넣으려면 `public/assets/img/cases/홍대.jpg` 같은 파일을 두고 `_case_row.html`에 `<img>`를 추가하면 됩니다. 권장 비율 4:3, 가로 1600px, 같은 밝기로 통일.
- **OG 이미지**(카카오톡·SNS 미리보기): `public/assets/img/og-image.png` (1200×630)

---

## 5. 공개 전 대표가 확인할 항목
홈페이지 개선기획서(2026.07)의 기준을 따랐지만, 아래는 내부 자료로 최종 확인이 필요합니다.

1. **쏘플파티룸 운영 공간 수** — 기획서(2026.07 검증)의 "전국 120여 개"를 사용했습니다. 2026 소개서에는 130여 개로 표기되어 있어 현재 기준으로 하나를 확정해 주세요. (`CLAIMS`, `BRANDS`)
2. **공개 사례 6건의 수치** — "공실 당시 기대임대료 대비 개발 후 월평균 매출"로 표기했습니다. 원자료가 매출이 맞는지, 집계 기간이 무엇인지 확인해 주세요. (`CASES`)
3. **수익 구조 시뮬레이션** — 기존 홈페이지의 36개월 예시(투자 4,000 → 운영 9,200 + 매각 3,400)를 '예시'로 명시해 실었습니다. 수익의 정의(매출/영업이익)와 가정을 상담 시 제공한다는 각주가 있습니다. 빼려면 `index.html` 템플릿에서 `_simulation.html` 포함 부분을 삭제하세요.
4. **대표 전화번호 공개 여부** — 푸터·문의·회사정보에 010-2384-9580을 넣었습니다. 대표번호를 따로 쓰시면 `SITE["phone"]`을 바꿔 주세요.
5. **연혁 연도** — 쏘플 100호점 돌파를 2022년으로 표기했습니다(choisijun.com 기준). 2023년이면 `TIMELINE`을 고쳐 주세요.
6. **브랜드 노출 범위** — 공백·쏘플·밍글·플레이션을 현재 운영으로, 소셜팩토리를 과거 레퍼런스로 표기했습니다. 플레이맘·레스텔·워블 라운지는 `public: False`로 숨겨 두었습니다.
7. **개인정보처리방침·이용약관** — 시행일을 2026년 10월 1일로 넣었습니다. 법률 검토 후 필요한 부분을 조정해 주세요.
8. **기존 주소 리다이렉트** — `/intro → /about`, `/start → /contact`, `/seminar → /solution`, `/article → /insights` 를 `_redirects`에 넣었습니다.

---

## 6. 검색엔진 등록 (배포 후)
1. Google Search Console: 속성 추가 → `vacancy.co.kr` → DNS 확인 → **Sitemaps**에 `https://vacancy.co.kr/sitemap.xml` 제출
2. 네이버 서치어드바이저: 사이트 등록 → 소유 확인(HTML 태그 방식이면 `base.html` `<head>`에 메타태그 추가 후 빌드) → 사이트맵 제출
3. Cloudflare Web Analytics: Pages 프로젝트 → **Metrics → Enable Web Analytics** (또는 토큰을 `SITE["cf_analytics_token"]`에 입력)

---

## 7. 페이지 구성
| 주소 | 내용 |
|---|---|
| `/` | 홈 — 핵심 메시지, 검증 수치, 시장 통계, 판단 기준, 5단계 프로세스, 수익 구조, 대표 사례 3건, 모델, 브랜드, 사전진단, 문의 |
| `/solution` | 공실개발 솔루션 — 5단계, 서비스 유형 5가지, 산출물 7종, 협업 방식 3가지, FAQ |
| `/models` | 개발모델 6군 — 유리한 조건과 확인 사항, 필수 고지 |
| `/cases` | 개발사례 6건(필터) + 공실 유형별 접근 9가지 |
| `/brands` | 운영 브랜드와 SPMS 시스템 |
| `/about` | 회사소개 — 시작한 이유, 연혁, 대표, 일하는 원칙, 회사 정보, BLANK SPACE INDEX 안내 |
| `/partners` | 파트너 — 3자 역할, 협업 유형 5가지, 대가 고지 |
| `/assessment` | 공간 사전진단 — 4단계 입력 → 모델별 적합도·확인 과제·다음 단계 (브라우저 안에서만 계산) |
| `/insights`, `/insights/*` | 인사이트 칼럼 6편 |
| `/contact` | 문의 — 실제 전송 폼, 개인정보 동의, 접수 완료 화면 |
| `/privacy`, `/terms` | 개인정보처리방침, 이용약관 |

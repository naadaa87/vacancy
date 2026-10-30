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
├─ functions/api/            ← 서버 기능 (문의 접수, 회원가입·로그인, 마이페이지, 관리자)
├─ functions/_middleware.js  ← *.pages.dev 미리보기 주소 정리
├─ lib/server.js             ← 서버 공통 모듈 (DB 자동 생성, 비밀번호·세션, 메일)
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

## 2. 문의 접수·회원 기능 켜기 (Cloudflare 대시보드에서 클릭으로)

문의 접수, 회원가입·로그인, 마이페이지, 관리자 페이지(/admin)는 모두 **D1 데이터베이스 1개 + 이메일 발송(Resend)** 으로 동작합니다.
설정 상태는 언제든 `https://vacancy.co.kr/setup-check` 에서 확인할 수 있습니다.

### 2-1. D1 데이터베이스 만들고 연결 (필수)
1. Cloudflare → **Storage & databases → D1 SQL database → Create database**
2. 이름 `gongbaek-db` → **Create** (위치는 기본값)
3. **Workers & Pages → vacancy0100 → Settings → Bindings → Add → D1 database**
4. Variable name: **`DB`** (대문자 그대로), D1 database: `gongbaek-db` → **Save**
5. **Deployments** 탭 → 최신 배포의 `…` → **Retry deployment**

테이블은 사이트가 처음 DB에 접근할 때 자동으로 만들어집니다. SQL을 실행할 필요가 없습니다.
이 단계만 끝나도 문의가 DB에 저장되고 회원가입이 됩니다.

### 2-2. 이메일 발송 설정 — Resend (문의 알림·인증 메일·비밀번호 찾기)
1. resend.com 가입 → **Domains → Add Domain** → `vacancy.co.kr`
2. 안내되는 DNS 레코드(TXT·MX 등)를 Cloudflare → vacancy.co.kr → **DNS → Records**에 그대로 추가 (Proxy 끔, 회색 구름)
   - Resend 화면에 Cloudflare 자동 연결 버튼이 보이면 그걸 쓰면 더 쉽습니다.
3. Resend에서 **Verify** → Verified 표시 확인
4. **API Keys → Create API Key** (Sending access) → 키 복사
5. Cloudflare Pages → **Settings → Variables and Secrets → Add** (Production)

| 변수 | 종류 | 값 |
|---|---|---|
| `RESEND_API_KEY` | **Secret** | 복사한 키 |
| `CONTACT_FROM` | Text | `공백 <noreply@vacancy.co.kr>` |
| `CONTACT_TO` | Text | `spaceblank0100@gmail.com` (문의 알림 받을 주소, 여러 개면 쉼표) |
| `ADMIN_EMAILS` | Text | 관리자로 쓸 이메일 (예: `spaceblank0100@gmail.com`) |
| `SITE_URL` | Text | `https://vacancy.co.kr` (메일 속 링크 주소) |
| `SEND_CONFIRMATION` | Text | (선택) `off` 로 넣으면 문의자에게 가는 접수 확인 메일을 끔 |

6. 다시 **Retry deployment**

### 2-3. 관리자 계정 만들기
1. `https://vacancy.co.kr/signup` 에서 `ADMIN_EMAILS`에 넣은 이메일로 가입
2. 메일함의 **이메일 인증하기** 클릭 (관리자 권한은 이메일 인증을 마친 계정에만 열립니다)
3. `https://vacancy.co.kr/admin` 접속 → 관리자 로그인 화면에서 로그인

> Resend 설정 전에 관리자 화면을 먼저 쓰고 싶다면: D1 → gongbaek-db → **Console**에서
> `UPDATE users SET email_verified = 1 WHERE email = '관리자이메일';` 실행

### 2-4. 점검
1. `/admin` → **설정 점검** 메뉴에서 항목 확인 (또는 `/setup-check`)
2. 비로그인 상태로 `/contact`에서 테스트 문의 → 알림 메일 도착, 관리자 대시보드에 표시되는지 확인
3. 관리자 화면에서 그 문의에 **회신 메일**을 보내고, **자료 보내기**로 PDF를 하나 보낸 뒤, 받은 메일의 버튼으로 열람 → **발송 이력**에서 '열람'으로 바뀌는지 확인

### 2-5. 관리자 화면 (/admin) 사용법

| 메뉴 | 할 수 있는 일 |
|---|---|
| **대시보드** | 처리 대기 문의, 최근 7일 문의, 회원 수, 자료 열람률 / 오늘 확인할 일(2일 넘게 대기 중인 신규 문의, 메일 실패, 설정 누락 등) / 최근 30일 문의 추이 / 진행 단계·문의 유형·고객 구분 분포 |
| **문의 관리** | 단계별 목록(신규 → 검토 중 → 1차 회신 → 현장진단 → 제안 → 계약 / 보류·종료), 검색, 엑셀 내려받기 / 문의 상세: 단계 변경, 한 줄 메모, 처리 이력 기록, **고객에게 메일 회신**(보내면 자동으로 '1차 회신'), **자료 보내기**, 같은 고객의 다른 문의 |
| **회원 관리** | 목록·검색·필터(수신 동의, 미인증, 구분별), 엑셀 내려받기, 여러 명 선택 → 자료 발송 / 회원 상세: 문의 내역·받은 자료, 이메일 인증 처리, 삭제 |
| **자료·안내 발송** | 받는 사람: 선택한 회원 / 문의 고객 / 회원 그룹(전체·인증·수신 동의·구분별) / 이메일 직접 입력 · 문안 불러오기(진단 리포트, 현장진단 일정, 제안서, 뉴스레터) · 파일 첨부(10MB) 또는 링크 · 미리보기 · 받는 사람 수 확인 후 발송 |
| **발송 이력** | 자료별 받는 사람, 메일 성공, **열람·다운로드 여부와 시각**, 다른 분께 추가 발송, 삭제 |
| **설정 점검** | DB·메일·관리자 설정 상태와 운영 메모 |

**받는 사람 쪽**: 메일의 버튼 → `/documents/view` 에서 내용 확인·파일 내려받기 (개인별 링크, 로그인 불필요). 회원은 마이페이지 **받은 자료**에서도 볼 수 있습니다.

**광고성 메일(뉴스레터·프로모션)**: '광고성 정보'를 체크하면 제목에 (광고) 표기, 마케팅 수신 동의 회원에게만 발송, 하단에 수신거부 링크·회사 정보 자동 삽입, 수신거부 즉시 반영(정보통신망법 제50조). 야간(21시~08시) 광고 발송은 별도 동의가 필요하니 낮에 보내세요.

**한도·참고**
- Resend 무료: 하루 100통·월 3,000통. 한 번에 최대 500명까지 발송합니다.
- 첨부 파일은 D1에 나눠 저장합니다(10MB 이하). R2 설정이 필요 없습니다.
- 비밀번호 암호화 계산 때문에 Cloudflare **Workers 유료 요금제(월 $5)** 를 권장합니다. 무료 요금제는 요청당 CPU 시간이 짧아 로그인이 가끔 실패할 수 있습니다.

### 2-6. 임대인센터 (/center) — 건물·임대인별 프로젝트 협업

건물주의 의뢰(공실해결, 임차유치, 상가MD, 건물 매입·매각, 명도, 매각·투자 전략 등)를 **프로젝트**로 만들고, 함께 일하는 **파트너**(중개사·중개법인, 자산운용사, 명도·투자유치·리테일 담당 등)와 **임대인**이 권한만큼만 보며 소통하는 공간입니다. 추가 설정은 필요 없습니다(테이블은 처음 접속할 때 자동으로 만들어집니다).

**처음 시작하는 순서**
1. `/admin` → **파트너** → 새 파트너 등록 (이름·소속·분야·이메일, 기본 수수료율·성과보수·컨설팅비). 안내 메일을 받은 파트너가 **같은 이메일로 가입하고 이메일 인증**을 마치면 자동으로 연결됩니다.
2. **프로젝트** → 새 프로젝트 (또는 문의 상세의 *임대인센터 프로젝트로 만들기*) → 임대인 등록, 의뢰 유형 선택. 유형별 기본 추진사항과 임대인 요청 자료가 자동으로 들어갑니다.
3. 프로젝트의 **참여자·권한** 탭에서 파트너 추가 → 역할, 임대인에게 보일 별칭, 열람 권한, 이 프로젝트의 정산 조건을 정합니다.
4. 같은 탭에서 **임대인센터 안내 메일**을 보내면 임대인도 같은 방법으로 연결됩니다.
5. **임대인 화면 미리보기 / 파트너 화면 보기**로 실제로 무엇이 보이는지 확인하세요.

**프로젝트 화면 (탭)**
| 탭 | 내용 |
|---|---|
| 개요 | 진행 단계(접수 → 진단·검토 → 제안 → 수임·계약 → 실행 → 마무리·정산 → 완료 / 보류·중단), 진행률, 다음 할 일, 최근 소통, 확인할 일 |
| 건물·임대 | 건물 정보, 의뢰 내용, 가격·재무, 층별 임대 현황(호실·면적·임차인·보증금·월세·만기, 공실률 자동 계산) |
| 추진사항 | 단계별 할 일, 담당(공백·파트너·임대인), 기한·지연 표시, 공개 범위, **임대인 자료 요청**(임대인이 파일을 올리면 자동 완료) |
| 소통 | 공개 범위를 골라 글 쓰기: 공백 내부 / 참여자 공유 / 임대인까지 공유 / 1:1. 파트너가 임대인에게 공유하려는 글은 **공백이 검토·수정한 뒤 공개** |
| 자료실 | 파일 올리기(10MB), 공개 범위 지정. 임대인이 보낸 자료와 파트너의 임대인 공개 요청 자료는 공백 확인 후 공유 |
| 참여자·권한 | 파트너별 역할·별칭·권한·정산 조건, 참여 종료, 임대인 열람 허용, 안내 메일, 미리보기 (관리자만) |
| 정산 | 받을 돈(컨설팅비·성과보수·중개보수)과 줄 돈(파트너 수수료: 기준 금액 × 수수료율 자동 계산), 상태(예정·청구/확정·완료) (관리자만) |
| 기록 | 단계 변경, 권한 변경, 승인, 자료, 정산 등 모든 변경 기록 (관리자만) |

**파트너 권한** (프로젝트마다 따로 설정, 빠른 설정: 열람 위주 / 실무 담당 / 핵심 파트너)
| 권한 | 켜면 |
|---|---|
| 임대인 정보 | 임대인 이름·연락처를 봅니다 (임대인 동의를 받은 경우에만 켜세요) |
| 임대 현황 | 층별 임차인·보증금·월세를 봅니다 |
| 가격·재무 | 매각 희망가·대출 등 재무 정보를 봅니다 |
| 자료실 / 자료 올리기 | 공유 자료를 보고 / 파일을 올립니다 |
| 추진사항 관리 | 추진사항을 등록·수정합니다 (없으면 본인 담당 건의 상태만 바꿈) |
| 참여자 공개 | 다른 파트너의 실명·소속을 봅니다 (없으면 별칭으로 보임) |
| 임대인 직접 공유 | 공백 승인 없이 임대인에게 글·자료를 공개합니다 |

**익명 처리 (임대인이 파트너에게 직접 연락하지 못하도록)**
- 임대인 화면에는 파트너가 “중개 파트너”, “명도 파트너”처럼 **별칭으로만** 표시됩니다. 서버가 임대인에게 보내는 데이터에 파트너의 이름·회사·연락처가 아예 들어가지 않습니다.
- 글·추진사항·파일 이름에 파트너의 이름이나 회사명이 들어 있으면 별칭으로 바꾸고, 공백 외 전화번호·이메일·카카오톡 링크는 `[연락처 비공개]`로 가립니다. 알림 메일에도 똑같이 적용됩니다.
- 반대로 임대인 정보 권한이 없는 파트너에게는 임대인이 “임대인”으로 보이고 연락처가 가려집니다.
- 파일 **안의** 내용(회사 로고·명함 등)은 자동으로 가릴 수 없으니, 임대인 공개 요청 자료는 열어 보고 승인하세요.

**권한이 없는 사람**: 헤더에 임대인센터 메뉴가 보이지 않고, `/center`에 들어와도 프로젝트 목록 대신 안내 문구만 보입니다. 다른 프로젝트 주소를 직접 입력해도 “찾을 수 없음”으로 처리됩니다. 파트너를 *이용 중지*로 바꾸거나 참여를 종료하면 즉시 접근이 막힙니다.

### 회원 기능 요약
| 주소 | 기능 |
|---|---|
| `/signup` | 회원가입 (이메일·비밀번호·이름·구분 / 선택: 연락처·소속·마케팅 동의) |
| `/login` | 로그인 (5회 실패 시 15분 잠금) |
| `/forgot-password`, `/reset-password` | 비밀번호 재설정 메일 (1시간 유효) |
| `/account` | 마이페이지 — 받은 자료, 내 문의 내역과 진행 단계, 내 정보 수정, 비밀번호 변경, 탈퇴 |
| `/documents/view` | 받은 자료 보기·내려받기 |
| `/center` | 임대인센터 — 초대받은 파트너·임대인 전용 (프로젝트 진행 현황, 소통, 자료, 내 할 일) |
| `/admin` | 관리자 시스템 (임대인센터 프로젝트·임대인·파트너·정산 관리 포함) |

**보안**: 비밀번호는 PBKDF2-SHA256(10만 회)로 해시 저장, 로그인은 HttpOnly·Secure 쿠키(30일), 다른 사이트에서 보내는 요청 차단, 비밀번호 변경·재설정 시 다른 기기 로그아웃.
회원·관리 페이지는 검색엔진 수집에서 제외됩니다(noindex, robots.txt).

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

-- (선택) Cloudflare D1에 문의 내용을 저장하려면 이 스키마를 적용하고 Pages 프로젝트에 DB 바인딩(변수명: DB)을 추가합니다.
-- 대시보드: Workers & Pages > D1 > Create database > Console 탭에 아래 SQL 붙여넣기 실행
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  type TEXT NOT NULL,
  address TEXT NOT NULL,
  floor_area TEXT,
  status TEXT,
  conditions TEXT,
  message TEXT NOT NULL,
  marketing INTEGER DEFAULT 0,
  source TEXT,
  page TEXT,
  ip TEXT,
  user_agent TEXT,
  handled INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries (created_at);

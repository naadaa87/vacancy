-- 참고용 문서입니다. 실행할 필요가 없습니다.
-- 회원·문의 테이블(users, sessions, user_tokens, inquiries)은 사이트가 처음 DB에 접근할 때
-- lib/server.js 의 db() 함수가 자동으로 만듭니다. 구조는 lib/server.js 의 SCHEMA 를 보세요.
-- 임대인센터 테이블(landlords, partners, projects, project_members, project_posts, project_tasks, project_units,
-- project_files, pfile_chunks, project_money, project_log, project_seen)은 lib/center.js 의 cdb() 가 자동으로 만듭니다.
-- 방문 집계 테이블(an_pv: 페이지뷰·체류·스크롤·유입, an_ev: 클릭·목표 달성)은 lib/analytics.js 의 adb() 가 자동으로 만듭니다.
--
-- D1 콘솔에서 자주 쓰는 조회 예시
SELECT id, created_at, name, phone, email, type, address, handled FROM inquiries ORDER BY id DESC LIMIT 50;
SELECT id, created_at, name, email, phone, role, email_verified FROM users ORDER BY id DESC LIMIT 50;
-- 관리자 이메일 인증을 수동으로 처리해야 할 때(이메일 발송 설정 전 등)
-- UPDATE users SET email_verified = 1 WHERE email = 'spaceblank0100@gmail.com';

-- 임대인센터 조회 예시
SELECT id, code, title, stage, landlord_id, updated_at FROM projects ORDER BY updated_at DESC LIMIT 50;
SELECT id, name, company, email, status, user_id FROM partners ORDER BY id DESC;

-- 방문 집계 조회 예시 (날짜는 한국시간)
SELECT day, COUNT(DISTINCT vid) visitors, COUNT(*) pageviews FROM an_pv GROUP BY day ORDER BY day DESC LIMIT 30;
SELECT path, COUNT(*) pv FROM an_pv WHERE day >= date('now', '-30 days') GROUP BY path ORDER BY pv DESC LIMIT 20;

-- ---------------------------------------------------------------------------
-- 임대인센터 업무 기능 (lib/center.js 가 처음 접속할 때 자동으로 만듭니다)
--   project_events    일정 (미팅·현장·계약·공사), event_rsvp  참석 응답
--   project_approvals 확인 요청과 응답 (승인 / 수정 요청 / 보류)
--   post_acks         글 확인(확인했습니다), project_reviews  만족도 평가
--   notifs            알림함, user_prefs  알림 메일 수신 설정
--   app_kv            운영 설정 (납부 안내 문구, 요약 메일, 하루 알림 실행일, 테이블 버전)
-- 기존 테이블에 추가된 컬럼: project_posts(pinned, answered_at, resolved_at), project_files(post_id),
--   project_tasks(note, nudged_at), project_money(landlord_visible, invoice, claim), projects(outcome)
--
-- 예) 답변을 기다리는 임대인·파트너 문의
--   SELECT p.code, x.created_at, substr(x.body, 1, 60) FROM project_posts x JOIN projects p ON p.id = x.project_id
--    WHERE x.parent_id IS NULL AND x.kind = 'request' AND x.author_type != 'admin' AND x.answered_at IS NULL AND x.resolved_at IS NULL;
-- 예) 확인 요청 응답 내역
--   SELECT p.code, a.title, a.status, a.responded_at, a.response FROM project_approvals a JOIN projects p ON p.id = a.project_id ORDER BY a.id DESC;

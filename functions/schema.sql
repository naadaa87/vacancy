-- 참고용 문서입니다. 실행할 필요가 없습니다.
-- 회원·문의 테이블(users, sessions, user_tokens, inquiries)은 사이트가 처음 DB에 접근할 때
-- lib/server.js 의 db() 함수가 자동으로 만듭니다. 구조는 lib/server.js 의 SCHEMA 를 보세요.
-- 임대인센터 테이블(landlords, partners, projects, project_members, project_posts, project_tasks, project_units,
-- project_files, pfile_chunks, project_money, project_log, project_seen)은 lib/center.js 의 cdb() 가 자동으로 만듭니다.
--
-- D1 콘솔에서 자주 쓰는 조회 예시
SELECT id, created_at, name, phone, email, type, address, handled FROM inquiries ORDER BY id DESC LIMIT 50;
SELECT id, created_at, name, email, phone, role, email_verified FROM users ORDER BY id DESC LIMIT 50;
-- 관리자 이메일 인증을 수동으로 처리해야 할 때(이메일 발송 설정 전 등)
-- UPDATE users SET email_verified = 1 WHERE email = 'spaceblank0100@gmail.com';

-- 임대인센터 조회 예시
SELECT id, code, title, stage, landlord_id, updated_at FROM projects ORDER BY updated_at DESC LIMIT 50;
SELECT id, name, company, email, status, user_id FROM partners ORDER BY id DESC;

-- 참고용 문서입니다. 실행할 필요가 없습니다.
-- 회원·문의 테이블(users, sessions, user_tokens, inquiries)은 사이트가 처음 DB에 접근할 때
-- lib/server.js 의 db() 함수가 자동으로 만듭니다. 구조는 lib/server.js 의 SCHEMA 를 보세요.
--
-- D1 콘솔에서 자주 쓰는 조회 예시
SELECT id, created_at, name, phone, email, type, address, handled FROM inquiries ORDER BY id DESC LIMIT 50;
SELECT id, created_at, name, email, phone, role, email_verified FROM users ORDER BY id DESC LIMIT 50;
-- 관리자 이메일 인증을 수동으로 처리해야 할 때(이메일 발송 설정 전 등)
-- UPDATE users SET email_verified = 1 WHERE email = 'spaceblank0100@gmail.com';

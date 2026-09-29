-- CX 미팅 로그: 논의사항마다 '결과(어떻게 처리하기로 했는지)' 칸 추가
-- Supabase > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
alter table meeting_items add column if not exists result text;

-- 리뷰 전체 목록: 리뷰마다 직원 체크(긍정·부정·체크필요)와 VOC 연결
-- Supabase > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
alter table review_items add column if not exists check_status text;          -- 긍정 / 부정 / 체크필요
alter table review_items add column if not exists voc_case_id bigint references voc_cases(id) on delete set null;
create index if not exists review_items_check_idx on review_items (check_status);

-- VOC: 상품 마스터에 없는 상품(세트 등)의 대분류·중분류를 직접 입력할 수 있게 칸 추가
-- Supabase > SQL Editor 에 붙여넣고 Run 한 번만 실행하면 돼요.
alter table voc_cases add column if not exists category text;
alter table voc_cases add column if not exists sub_category text;

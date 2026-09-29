-- 상품 마스터에 '추가분류'(앵커 / 레귤러 등) 칸 추가 → VOC 목록에서 보고 거를 수 있게
-- Supabase > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
-- 실행 후: 데이터 업로드 > 상품 마스터 올리기에 오클릭 카테고리 파일을 한 번 올리면 기존 상품에도 채워져요
alter table products add column if not exists line_type text;

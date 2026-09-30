-- =====================================================================
-- FINCA·HaTA CX 대시보드 - 오클릭 주문 기준으로 통일 (2026-09-30)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 1. 주문 품목에 판매처 품목 번호·바코드 칸 추가
--    오클릭은 세트를 구성품으로 나눠서 여러 줄 → 판매처 품목 번호로 다시 묶어 '상품 수'를 셈
alter table order_items add column if not exists item_no text;   -- 오클릭 판매처보조번호 (= 판매처의 품목 번호)
alter table order_items add column if not exists barcode text;   -- 오클릭 바코드

-- 2. CS 데일리: 지금까지 손으로 넣은 주문건·출고전 취소를 따로 보관 (오클릭 기준으로 다시 계산하기 전 원본)
alter table cs_daily add column if not exists orders_manual int;
alter table cs_daily add column if not exists cancels_manual int;
update cs_daily
   set orders_manual = orders, cancels_manual = cancels
 where orders_manual is null and cancels_manual is null;

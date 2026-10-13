-- =====================================================================
-- FINCA·HaTA CX 대시보드 - 예약배송 품절 상품 구분 (2026-10-13)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 오클릭 미출고 파일의 '상품상태'(판매·종료/취소·생산 등) · '입고예정일' · '품절메모'를 상품 줄마다 저장
-- → 예약주문 안에 섞인 품절 상품(재고 0)을 '단종'과 '입고 대기'로 나눠 보여 줌
alter table preorder_lines add column if not exists item_state text;
alter table preorder_lines add column if not exists restock_eta text;
alter table preorder_lines add column if not exists soldout_memo text;

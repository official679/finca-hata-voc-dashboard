-- =====================================================================
-- FINCA·HaTA CX 대시보드 - 출고전 취소를 '처음 확인된 날'로 세기 (2026-10-02)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 주문 품목에 '취소를 처음 확인한 데이터 날짜' 칸 추가
--   · 새로 올라온 취소(오클릭 '취소' 줄, 사방넷 '취소완료')는 올린 날의 전날로 저장
--   · 지금까지 저장된 취소는 비워 둠 → 예전처럼 주문 날짜로 셈 (지난 CS 데일리 숫자 그대로)
alter table order_items add column if not exists cancel_seen_date date;
create index if not exists order_items_cancel_seen_idx on order_items (brand, cancel_seen_date);

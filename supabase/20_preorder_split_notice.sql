-- =====================================================================
-- FINCA·HaTA CX 대시보드 - 예약배송 저재고(분리배송) 안내 기록 (2026-10-07)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
-- =====================================================================

-- 저재고 상품이 든 주문에 '분리배송/재고 소량' 안내를 했는지 기록 (1차·2차 지연 안내와 따로)
alter table preorder_lines add column if not exists split_notice_method text;   -- 유선 / 문자
alter table preorder_lines add column if not exists split_notice_date date;

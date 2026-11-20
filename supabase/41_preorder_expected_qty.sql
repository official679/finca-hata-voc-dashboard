-- 41: 예약상품 예상입고수량 (2026-11-20)
-- MD 예약시트 '2026 예약설정' H칸 '예상입고수량'을 대시보드 예약상품에도 넣음
-- → 예약상품 일정 탭에서 '남는 수 = 예상입고수량 − 대기 수량'(마이너스 = 들어올 것보다 주문이 많음) 확인
-- 재고 맞추기 시트도 같은 수량으로 예약 재고를 나눔
alter table preorder_products add column if not exists expected_qty integer;

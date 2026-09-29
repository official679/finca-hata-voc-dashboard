-- 예약배송 사은품 목록 (기준 관리 > 예약배송 사은품에서 추가·숨기기 가능)
-- Supabase > SQL Editor 에 붙여넣고 Run (여러 번 실행해도 안전)
insert into code_items (group_key, label, sort_order) values
  ('preorder_gift', '101088 단품) 멀티체크 러그 민트브라운 50x70', 1),
  ('preorder_gift', '102539 단품) 실키 리본 노트북 케이스 13인치_화이트', 2),
  ('preorder_gift', '102540 단품) 실키 리본 노트북 케이스 13인치_라이트퍼플', 3),
  ('preorder_gift', '102541 단품) 실키 리본 노트북 케이스 13인치_블루', 4),
  ('preorder_gift', '102542 단품) 실키 리본 노트북 케이스 13인치_블랙', 5),
  ('preorder_gift', '102543 단품) 실키 리본 노트북 케이스 15인치_화이트', 6),
  ('preorder_gift', '102544 단품) 실키 리본 노트북 케이스 15인치_라이트퍼플', 7),
  ('preorder_gift', '102546 단품) 실키 리본 노트북 케이스 15인치_블랙', 8),
  ('preorder_gift', '103785 단품) 파우더블루 스트라이프 페이스 타월', 9),
  ('preorder_gift', '104556 단품) 아나톨리아 러그 버건디브라운 50x70', 10),
  ('preorder_gift', '104568 단품) 아나톨리아 러그 그린 50x70', 11)
on conflict (group_key, label) do nothing;

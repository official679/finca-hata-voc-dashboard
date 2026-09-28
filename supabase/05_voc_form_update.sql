-- =====================================================================
-- VOC 접수 폼 기준 변경 (9월 5주차 VOC 회의 4번 반영)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. 한 번만 실행하세요.
-- =====================================================================

-- 1. 새 칸: 처리 구분(반품/교환), 담당 부서, 완료일
alter table voc_cases add column if not exists handling text;
alter table voc_cases add column if not exists department text;
alter table voc_cases add column if not exists completed_at date;

-- 2. 기존 VOC: '(반품)브랜드과실' → 구분 '품질' + 처리 구분 '반품' (교환도 동일)
update voc_cases set handling = '반품' where handling is null and voc_type like '(반품)%';
update voc_cases set handling = '교환' where handling is null and voc_type like '(교환)%';
update voc_cases set voc_type = '품질' where voc_type like '%브랜드과실';

-- 3. VOC 구분 새 목록 (기존 항목은 숨김 처리, 삭제하지 않음)
update code_items set active = false where group_key = 'voc_type';
insert into code_items (group_key, label, sort_order, active) values
  ('voc_type', '품질', 1, true), ('voc_type', '배송', 2, true), ('voc_type', '반품/교환', 3, true),
  ('voc_type', '재입고 문의', 4, true), ('voc_type', '상품 정보', 5, true), ('voc_type', '사이즈·핏', 6, true),
  ('voc_type', '색상 차이', 7, true), ('voc_type', '세탁·이염', 8, true), ('voc_type', '내구성', 9, true),
  ('voc_type', '기타', 99, true)
on conflict (group_key, label) do update set sort_order = excluded.sort_order, active = true;

-- 4. 상담방법(문의 채널): 1:1 채팅 → 해피톡, 교환반품접수는 숨김
update voc_cases set consult_method = '해피톡' where consult_method = '1:1 채팅';
delete from code_items where group_key = 'consult_method' and label = '1:1 채팅';
update code_items set active = false where group_key = 'consult_method' and label = '교환반품접수';
insert into code_items (group_key, label, sort_order, active) values
  ('consult_method', '게시판', 1, true), ('consult_method', '해피톡', 2, true), ('consult_method', '전화', 3, true),
  ('consult_method', '리뷰', 4, true), ('consult_method', '기타', 99, true)
on conflict (group_key, label) do update set sort_order = excluded.sort_order, active = true;

-- 5. 새 선택 목록: 처리 구분, 담당 부서 (기준 관리에서 수정 가능)
insert into code_items (group_key, label, sort_order) values
  ('handling', '반품', 1), ('handling', '교환', 2), ('handling', '해당 없음', 3),
  ('department', 'CX', 1), ('department', '상품', 2), ('department', '물류', 3), ('department', '마케팅', 4)
on conflict (group_key, label) do nothing;

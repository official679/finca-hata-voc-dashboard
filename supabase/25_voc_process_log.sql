-- 25. VOC 처리 기록 (2026-10-14)
-- 팀마다 한 줄씩 쌓는 처리 기록: [{ "d": "2026-10-14", "dept": "물류", "text": "재발송 처리" }, ...]
-- 담당 부서(department)는 기록에 나온 부서로 자동 채움, 처리 메모(note)는 기록을 글로 이어 붙인 것 (데일리 리포트·검색용)
alter table voc_cases add column if not exists process_log jsonb not null default '[]'::jsonb;

-- 예전 처리 메모 → 첫 기록으로 옮김 (날짜 = 접수일, 부서 = 담당 부서 첫 번째, 없으면 CX)
update voc_cases
set process_log = jsonb_build_array(jsonb_build_object(
  'd', received_date::text,
  'dept', coalesce(nullif(btrim(split_part(coalesce(department, ''), ',', 1)), ''), 'CX'),
  'text', btrim(note)))
where note is not null and btrim(note) <> '' and process_log = '[]'::jsonb;

-- 확인: 옮긴 건수
select count(*) as moved from voc_cases where jsonb_array_length(process_log) > 0;

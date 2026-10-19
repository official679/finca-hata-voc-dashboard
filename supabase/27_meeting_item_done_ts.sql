-- 27. 회의 논의사항 완료 시각 (2026-10-20)
-- 회의록을 쓰기 전에 완료한 논의사항은 그 회의로 따라가지 않게 하려고, 완료한 '날짜'뿐 아니라 '시각'도 저장
-- (회의록을 만든 시각보다 먼저 완료했으면 안 따라감, 회의록을 만든 뒤 회의 중에 완료하면 그 회의에 '완료'로 남음)
alter table meeting_items add column if not exists done_ts timestamptz;

select 'ok' as result;

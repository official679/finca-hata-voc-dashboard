-- 40: 접수일 없는 반품·교환 정리 (2026-11-13, 39 다음)
--   1) 9/30에 올린 옛 줄(접수일 없음) 중, 10월 이후 다른 파일로 다시 들어온 주문은 옛 줄을 지운다 (29CM 약 25 · 아임웹 약 31줄)
--   2) 그래도 접수일이 없는 줄은 접수일 = 주문일로 넣는다 (사용자 결정: 주문한 달로 세기)
-- 순서: ① 미리 보기 → ② 지우기 → ③ 접수일 채우기 → ④ 확인

-- ① 미리 보기
select platform, count(*) as 지울_옛줄
from return_items o
where o.claim_date is null and o.created_at < '2026-10-01'
  and exists (select 1 from return_items n
              where n.platform = o.platform and n.order_no = o.order_no
                and n.claim_date is not null and n.created_at >= '2026-10-01')
group by platform;

-- ② 중복 옛 줄 지우기
delete from return_items o
where o.claim_date is null and o.created_at < '2026-10-01'
  and exists (select 1 from return_items n
              where n.platform = o.platform and n.order_no = o.order_no
                and n.claim_date is not null and n.created_at >= '2026-10-01');

-- ③ 남은 줄: 접수일 = 주문일
update return_items
set claim_date = order_date
where claim_date is null and order_date is not null;

-- ④ 확인
select platform, count(*) filter (where claim_date is null) as 접수일없음, count(*) as 전체
from return_items group by platform order by platform;

-- 39: 반품·교환 중복 정리 (2026-11-13)
-- 상황: 9/30에 올린 반품·교환(29CM·아임웹, 2026년 1~9월 주문)은 '접수일'이 비어 있었음.
--       11/13 빈 기간을 다시 받아 올렸더니, 파일 형식이 달라 같은 주문이 한 번 더 저장됨.
-- 정리 (옛 줄을 살리고 새 줄의 접수일만 옮김):
--   1) 옛 줄(접수일 없음)에 같은 판매처·주문번호·구분의 11/13 새 줄 접수일을 채운다
--   2) 그 주문의 11/13 새 줄은 지운다 (옛 줄과 중복)
--   11/13 새 줄 중 옛 줄에 없는 주문(무신사·EQL·W컨셉 전부, 29CM·아임웹 일부)은 그대로 둔다.
--   11/13에 함께 생긴 과실 VOC(처리완료 206건)는 주문번호로 이어져 있어 그대로 둔다.
-- 순서: ① 미리 보기 → ② 접수일 채우기 → ③ 중복 지우기 → ④ 확인. ②③은 한 번씩만.

-- ① 미리 보기
select o.platform,
       count(*) filter (where true) as 접수일_채울_옛줄
from return_items o
where o.platform in ('29CM', '아임웹') and o.claim_date is null and o.created_at < '2026-10-01'
  and exists (select 1 from return_items n
              where n.platform = o.platform and n.order_no = o.order_no
                and n.created_at >= '2026-11-13 10:00:00+09' and n.claim_date is not null)
group by o.platform;

select n.platform, count(*) as 지울_새줄
from return_items n
where n.platform in ('29CM', '아임웹') and n.created_at >= '2026-11-13 10:00:00+09'
  and exists (select 1 from return_items o
              where o.platform = n.platform and o.order_no = n.order_no
                and o.claim_date is null and o.created_at < '2026-10-01')
group by n.platform;

-- ② 접수일 채우기 (같은 구분이 있으면 그 날짜, 없으면 그 주문의 가장 이른 접수일)
update return_items o
set claim_date = coalesce(
  (select min(n.claim_date) from return_items n
    where n.platform = o.platform and n.order_no = o.order_no and n.kind = o.kind
      and n.created_at >= '2026-11-13 10:00:00+09'),
  (select min(n.claim_date) from return_items n
    where n.platform = o.platform and n.order_no = o.order_no
      and n.created_at >= '2026-11-13 10:00:00+09'))
where o.platform in ('29CM', '아임웹') and o.claim_date is null and o.created_at < '2026-10-01'
  and exists (select 1 from return_items n
              where n.platform = o.platform and n.order_no = o.order_no
                and n.created_at >= '2026-11-13 10:00:00+09' and n.claim_date is not null);

-- ③ 중복 새 줄 지우기 (②를 실행한 뒤)
delete from return_items n
where n.platform in ('29CM', '아임웹') and n.created_at >= '2026-11-13 10:00:00+09'
  and exists (select 1 from return_items o
              where o.platform = n.platform and o.order_no = n.order_no
                and o.created_at < '2026-10-01');

-- ④ 확인: 판매처별 접수일 없는 줄 / 전체
select platform, count(*) filter (where claim_date is null) as 접수일없음, count(*) as 전체
from return_items group by platform order by platform;

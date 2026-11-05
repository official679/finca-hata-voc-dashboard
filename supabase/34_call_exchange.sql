-- 34: CS 데일리 전화 유형을 전화 시스템 ARS 번호와 맞춤 — 반품/교환을 반품·교환 두 칸으로 나눔 (2026-11-05)
-- ARS(IVR): 1 배송 · 2 반품 · 3 교환 · 4 취소/변경 · 5 상품. 예전 '반품/교환' 숫자는 그대로 '반품' 칸에 남아요.

-- ① 교환 칸 추가 (여러 번 실행해도 안전)
alter table cs_daily add column if not exists call_exchange int not null default 0;

-- ② 숫자 규칙 매뉴얼(id 6)에 전화 세는 법 넣기 (두 번 실행해도 한 번만 들어가게)
update manuals set body = regexp_replace(body, '(\n[^\n]*직접 넣는 칸[^\n]*)',
  E'\\1\n- **전화 = 전화 시스템(IPCC) 녹취이력조회, 전날 · 정상 통화만** 세요. 그냥 끊은 전화는 안 세요. (2026-11-05)\n  - **수신 + 정상** = 총 인입, ARS 번호로 나눠요: **1 배송 · 2 반품 · 3 교환 · 4 취소/변경 · 5 상품** · 번호 없음 = 기타\n  - **발신 + 정상** = 총 발신\n  - 11/4 데이터까지는 반품·교환을 한 칸(반품)에 넣었어요.')
where id = 6 and body not like '%녹취이력조회, 전날%';

-- 확인: 둘 다 1이 나오면 끝
select
  (select count(*) from information_schema.columns where table_name = 'cs_daily' and column_name = 'call_exchange')::int as "교환 칸",
  (select (body like '%녹취이력조회, 전날%')::int from manuals where id = 6) as "전화 규칙";

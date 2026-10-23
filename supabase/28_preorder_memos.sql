-- =====================================================================
-- FINCA·HaTA CX 대시보드 - 예약배송 주문 메모 (아임웹 관리자 메모처럼 주문 단위, 2026-10-23)
-- Supabase > SQL Editor 에 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
-- order_key = 판매처주문번호(없으면 오클릭 주문번호) · log = [{ d: 'YYYY-MM-DD HH:mm', who, text }]
-- =====================================================================

create table if not exists preorder_memos (
  order_key text primary key,
  log jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

alter table preorder_memos enable row level security;
drop policy if exists "staff all" on preorder_memos;
create policy "staff all" on preorder_memos for all to authenticated using (true) with check (true);

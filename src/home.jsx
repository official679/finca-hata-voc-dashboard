// 메인: 한눈에 보는 요약 대시보드

// 최근 n주 (데이터 월~일 = 보고일 화~월, 보고서와 같은 주 구분)
function recentWeeks(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
  return Array.from({ length: n }, (_, i) => {
    const s = addDays(d, -7 * (n - 1 - i));
    return { from: toISODate(s), to: toISODate(addDays(s, 6)), label: fmtMD(addDays(s, -1)) };
  });
}

// 값 목록을 세로 막대로 (라벨·값 표시)
function ColumnChart({ items, format = (v) => v, color = 'var(--accent)', highlightMax }) {
  const max = Math.max(0, ...items.map(i => i.value || 0)) || 1;
  const top = highlightMax ? Math.max(...items.map(i => i.value || 0)) : null;
  return (
    <div className="columns">
      {items.map(i => (
        <div className="column" key={i.label} title={`${i.label}: ${i.value === null ? '-' : format(i.value)}`}>
          <div className="column-value">{i.value === null ? '-' : format(i.value)}</div>
          <div className="column-bar" style={{ height: `${((i.value || 0) / max) * 100}%`, background: highlightMax && i.value === top && top > 0 ? 'var(--danger)' : color }} />
          <div className="column-label">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

// 요약·보고서용 가벼운 조회 (기본: 최근 13개월만)
function useLight(table, columns, since = monthsAgo(12)) {
  return useSince(table, columns, since)[0];
}

// 리뷰 목록에서 '체크필요'로 표시했는데 아직 VOC로 안 보낸 리뷰 수
function useReviewCheckCount(brand) {
  const [n, setN] = useState(null);
  useEffect(() => {
    db.from('review_items').select('id', { count: 'exact', head: true }).eq('brand', brand).eq('check_status', '체크필요').is('voc_case_id', null)
      .then(({ count, error }) => setN(error ? -1 : count || 0));
  }, [brand]);
  return n;
}

// 메인: ① 오늘 챙길 것 ② 이번 달 핵심 지표 ③ 주간 그래프 ④ 과실 사유·재입고 상품
function HomePage() {
  const { cases, productById } = useApp();
  const daily = useDaily();
  const board = useLight('board_items', 'brand,inquiry_type,written_at,product_name,product_id,option_text', toISODate(addDays(new Date(), -90)));
  const [brand, setBrand] = useState('핀카');
  const preorder = usePreorderPending();   // 예약배송은 브랜드 구분 없이 (지금은 핀카만 운영)
  const taskSum = useTaskSummary();
  const checkNeed = useReviewCheckCount(brand);

  if (!daily || !board) return <div className="loading-screen">요약 불러오는 중...</div>;

  const byBrand = (rows) => rows.filter(r => !brand || r.brand === brand);
  const d = byBrand(daily).filter(r => r.platform !== BRAND_TOTAL);

  // 이번 달 (보고서와 같은 주차 기준) vs 지난달 '같은 기간' (월 중간에도 공정하게 비교)
  const now = new Date();
  const ym = weekOf(toISODate(now))?.ym || toISODate(now).slice(0, 7);
  const mw = monthWeeks(ym);
  const monthRows = d.filter(r => r.report_date >= mw[0].from && r.report_date <= mw[mw.length - 1].to);
  const s = sumRows(monthRows);
  const lastDay = maxDate(monthRows.map(r => r.report_date)) || mw[0].from;
  const elapsed = Math.round((parseDate(lastDay) - parseDate(mw[0].from)) / 86400000);
  const prevYm = toISODate(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1)).slice(0, 7);
  const pw = monthWeeks(prevYm);
  const pTo = [toISODate(addDays(parseDate(pw[0].from), elapsed)), pw[pw.length - 1].to].sort()[0];
  const p = sumRows(d.filter(r => r.report_date >= pw[0].from && r.report_date <= pTo));
  const ratio = (a, n) => (n ? a / n : null);
  const periodNote = `${dataLabel(mw[0].from).split('~')[0]}~${dataLabel(lastDay).split('~').pop()} · 지난달 같은 기간 대비`;

  // 주간 추이 (최근 5주)
  const weeks = recentWeeks(5).map(w => ({ ...w, s: sumRows(d.filter(r => r.report_date >= w.from && r.report_date <= w.to)) }));

  // VOC
  const c = byBrand(cases);
  const since30 = toISODate(addDays(now, -30));
  const faults30 = c.filter(x => isFault(x.voc_type) && x.received_date >= since30);
  const openCases = c.filter(x => x.status === '접수' || x.status === '확인중');

  // 재입고 문의 (최근 90일)
  const bd = byBrand(board).filter(r => r.written_at && isInquiry(r));
  const unlinkedRestock = bd.filter(r => r.inquiry_type === '재입고' && !r.product_id && !r.product_name).length;

  const link = (to, text = '자세히 →') => <a className="btn-link" href={`#/${to}`}>{text}</a>;
  const todo = [
    { label: '처리 대기 VOC', value: openCases.length, to: 'voc-list', sub: '접수·확인중' },
    { label: '예약배송 안내 필요', value: !preorder ? null : preorder.error ? '-' : preorder.pending, to: 'preorder', sub: preorder && !preorder.error ? `출고대기 ${preorder.open}건` : '예약배송 관리' },
    { label: '업무 마감 임박', value: !taskSum ? null : taskSum.error ? '-' : taskSum.due, to: 'tasks', sub: taskSum && !taskSum.error ? `진행 전·중 ${taskSum.open}건${taskSum.mine !== null ? ` · 내 업무 ${taskSum.mine}` : ''}` : '업무 보드' },
    { label: '리뷰 체크필요', value: checkNeed === null ? null : checkNeed < 0 ? '-' : checkNeed, to: `review-list?period=all&check=${encodeURIComponent('체크필요')}&brand=${encodeURIComponent(brand)}`, sub: 'VOC로 안 보낸 것' },
  ];

  return (
    <>
      <PageHeader title="한눈에 보기" desc={`${Number(ym.slice(5))}월 현황 · 매일 입력·업로드한 데이터로 자동 계산돼요`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
      </PageHeader>

      <div className="detail-section" style={{ marginTop: 0 }}>🔔 오늘 챙길 것</div>
      <div className="grid grid-kpi">
        {todo.map(t => (
          <a key={t.label} href={`#/${t.to}`} className={`kpi todo-kpi${typeof t.value === 'number' && t.value > 0 ? ' alert' : ''}`}>
            <div className="kpi-label">{t.label}</div>
            <div className="kpi-value">{t.value === null ? '...' : typeof t.value === 'number' ? t.value.toLocaleString() : t.value}</div>
            <div className="kpi-sub">{t.sub} →</div>
          </a>
        ))}
      </div>

      <div className="detail-section">📊 {Number(ym.slice(5))}월 핵심 지표 <small className="muted" style={{ fontWeight: 400 }}>{periodNote}</small></div>
      <div className="grid grid-kpi">
        <Kpi label="주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count vs="지난달 같은 기간" />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratio(returnsExchanges(s), s.orders)} prev={ratio(returnsExchanges(p), p.orders)} vs="지난달 같은 기간" />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratio(faults(s), s.orders)} prev={ratio(faults(p), p.orders)} vs="지난달 같은 기간" />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratio(s.reviews_negative, s.reviews_total)} prev={ratio(p.reviews_negative, p.reviews_total)} vs="지난달 같은 기간" />} />
      </div>

      <div className="grid home-bottom">
        <ComboChart title={`${brand} 주간 주문건 · 반품교환율 (최근 5주)`} color={BRAND_COLOR[brand]}
          items={weeks.map(w => ({ label: `${w.label}~`, bar: w.s.orders, line: ratio(returnsExchanges(w.s), w.s.orders) }))} />
        <div className="card">
          <div className="card-title">과실 VOC 사유 <small>최근 30일 · {faults30.length}건 {link('report')}</small></div>
          <Bars items={countBy(faults30, x => x.reason_category).slice(0, 6)} color="var(--danger)" empty="최근 30일 과실 VOC가 없어요" />
        </div>
        <div className="card">
          <div className="card-title">재입고 문의 많은 상품 <small>최근 90일 · 리오더 검토{unlinkedRestock ? ` · 상품 못 찾은 ${unlinkedRestock}건 제외` : ''} {link('board')}</small></div>
          <Bars items={restockRanking(bd, productById).slice(0, 6).map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" wide empty="최근 90일 재입고 문의가 없어요 (게시판 파일을 올리면 보여요)" />
        </div>
      </div>
    </>
  );
}

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

function HomePage() {
  const { cases, productById } = useApp();
  const daily = useDaily();
  const reviews = useLight('review_items', 'brand,rating,written_at,content', monthsAgo(4));   // 최근 5개월 (코멘트 분석용 내용 포함)
  const board = useLight('board_items', 'brand,inquiry_type,written_at,product_name,product_id');
  const [brand, setBrand] = useState('핀카');

  if (!daily || !reviews || !board) return <div className="loading-screen">요약 불러오는 중...</div>;

  const byBrand = (rows) => rows.filter(r => !brand || r.brand === brand);
  const d = byBrand(daily).filter(r => r.platform !== BRAND_TOTAL);
  const dAll = byBrand(daily);

  // 이번 달 (월간 보고와 같은 주차 기준)
  const now = new Date();
  const ym = weekOf(toISODate(now))?.ym || toISODate(now).slice(0, 7);
  const mw = monthWeeks(ym);
  const monthRows = d.filter(r => r.report_date >= mw[0].from && r.report_date <= mw[mw.length - 1].to);
  const s = sumRows(monthRows);
  const prevYm = toISODate(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1)).slice(0, 7);
  const pw = monthWeeks(prevYm);
  const p = sumRows(d.filter(r => r.report_date >= pw[0].from && r.report_date <= pw[pw.length - 1].to));
  const ratio = (a, n) => (n ? a / n : null);

  // 주간 추이 (최근 5주)
  const weeks = recentWeeks(5).map(w => ({ ...w, s: sumRows(d.filter(r => r.report_date >= w.from && r.report_date <= w.to)) }));

  // VOC · 후속 조치
  const c = byBrand(cases);
  const since30 = toISODate(addDays(now, -30));
  const faults30 = c.filter(x => isFault(x.voc_type) && x.received_date >= since30);
  const pendingActions = c.filter(x => x.action_required && !x.action_done);
  const openCases = c.filter(x => x.status === '접수' || x.status === '확인중');

  // 리뷰 월별 긍정·부정 비중 (최근 5개월, 1~3점 부정) + 많이 나온 코멘트
  const rv = byBrand(reviews).filter(r => r.written_at && r.rating !== null);
  const months = [...new Set(rv.map(r => r.written_at.slice(0, 7)))].sort().slice(-5);
  const reviewMonthly = months.map(m => { const rs = rv.filter(r => r.written_at.startsWith(m)); return { label: `${Number(m.slice(5))}월`, total: rs.length, neg: rs.filter(r => r.rating <= 3).length }; });
  const since3m = toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const rv3 = rv.filter(r => r.written_at.slice(0, 10) >= since3m);
  const posRv = rv3.filter(r => r.rating > 3), negRv = rv3.filter(r => r.rating <= 3);
  const topThemes = (rows, negative) => countBy(rows.flatMap(r => reviewThemes(r.content, negative)), t => t).slice(0, 5);
  const neg30 = rv.filter(r => r.rating <= 3 && r.written_at.slice(0, 10) >= since30).length;

  // 게시판
  const bd = byBrand(board).filter(r => r.written_at && isInquiry(r));
  const bdRecent = bd.filter(r => r.written_at.slice(0, 10) >= toISODate(addDays(now, -90)));
  const bdScope = bdRecent.length ? bdRecent : bd;
  const unlinkedRestock = bdScope.filter(r => r.inquiry_type === '재입고' && !r.product_id && !r.product_name).length;
  const restock30 = bd.filter(r => r.inquiry_type === '재입고' && r.written_at.slice(0, 10) >= since30).length;

  const link = (to, text = '자세히 →') => <a className="btn-link" href={`#/${to}`}>{text}</a>;

  return (
    <>
      <PageHeader title="한눈에 보기" desc={`${Number(ym.slice(5))}월 현황 · 지난달과 비교 · 매일 입력·업로드한 데이터로 자동 계산돼요`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="이번 달 주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratio(returnsExchanges(s), s.orders)} prev={ratio(returnsExchanges(p), p.orders)} />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratio(faults(s), s.orders)} prev={ratio(faults(p), p.orders)} />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratio(s.reviews_negative, s.reviews_total)} prev={ratio(p.reviews_negative, p.reviews_total)} />} />
      </div>
      <div className="grid grid-kpi">
        <Kpi label="이번 달 VOC 접수" value={c.filter(x => x.received_date >= toISODate(new Date(now.getFullYear(), now.getMonth(), 1))).length} sub={link('voc-list', 'VOC 목록 →')} />
        <Kpi label="처리 대기 VOC" value={openCases.length} sub={link('voc-list', 'VOC 목록 →')} alert={openCases.length > 0} />
        <Kpi label="부정 리뷰 (최근 30일)" value={neg30.toLocaleString()} sub={link('reviews', '리뷰 분석 →')} />
        <Kpi label="재입고 문의 (최근 30일)" value={restock30} sub={link('board', '게시판 분석 →')} />
      </div>

      <div className="grid grid-2w">
        <div className="card">
          <div className="card-title">주간 반품·교환율 <small>최근 5주 · 빨간 막대 = 가장 높은 주</small></div>
          <ColumnChart items={weeks.map(w => ({ label: w.label, value: w.s.orders ? returnsExchanges(w.s) / w.s.orders : null }))} format={v => `${(v * 100).toFixed(1)}%`} highlightMax />
        </div>
        <div className="card">
          <div className="card-title">주간 주문건 <small>최근 5주</small></div>
          <ColumnChart items={weeks.map(w => ({ label: w.label, value: w.s.orders || null }))} format={v => v.toLocaleString()} color="#7FA7EF" />
        </div>
        <div className="card">
          <div className="card-title">월별 긍정·부정 리뷰 비중 <small>최근 5개월 · 부정 = 1~3점 {link('reviews')}</small></div>
          <SplitColumns items={reviewMonthly} />
        </div>
        <div className="card">
          <div className="card-title">게시판 문의 유형 <small>{bdRecent.length ? '최근 90일' : '전체'} {link('board')}</small></div>
          <Bars items={countBy(bdScope, r => r.inquiry_type).slice(0, 7)} />
        </div>
        <div className="card">
          <div className="card-title">과실 VOC 사유 <small>최근 30일 · {faults30.length}건 {link('report')}</small></div>
          <Bars items={countBy(faults30, x => x.reason_category).slice(0, 7)} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">재입고 문의 많은 상품 <small>{bdRecent.length ? '최근 90일' : '전체'} · 리오더 검토{unlinkedRestock ? ` · 상품 못 찾은 ${unlinkedRestock}건 제외` : ''} {link('board')}</small></div>
          <Bars items={restockRanking(bdScope, productById).slice(0, 7).map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" />
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">😊 긍정 리뷰에서 많이 나온 말 <small>최근 3개월 · 긍정 {posRv.length.toLocaleString()}건 ({pct(posRv.length, rv3.length)}) {link('reviews')}</small></div>
          <Bars items={topThemes(posRv, false)} color="var(--success)" />
        </div>
        <div className="card">
          <div className="card-title">😟 부정 리뷰에서 많이 나온 불만 <small>최근 3개월 · 부정 {negRv.length.toLocaleString()}건 ({pct(negRv.length, rv3.length)}) {link('reviews')}</small></div>
          <Bars items={topThemes(negRv, true)} color="var(--danger)" />
        </div>
      </div>
    </>
  );
}

// 월별 긍정(초록)·부정(빨강) 비중을 100% 누적 막대로
function SplitColumns({ items }) {
  if (!items.length) return <div className="empty">데이터가 없습니다</div>;
  return (
    <>
      <div className="columns">
        {items.map(i => {
          const negShare = i.total ? i.neg / i.total : 0;
          return (
            <div className="column" key={i.label} title={`${i.label}: 리뷰 ${i.total}건 · 긍정 ${i.total - i.neg} · 부정 ${i.neg}`}>
              <div className="column-value" style={{ color: 'var(--danger)', fontWeight: 700 }}>{i.total ? `${(negShare * 100).toFixed(1)}%` : '-'}</div>
              <div className="column-bar split-bar">
                <div style={{ height: `${negShare * 100}%`, background: 'var(--danger)', minHeight: i.neg ? 3 : 0 }} />
                <div style={{ flex: 1, background: 'var(--success)', opacity: 0.75 }} />
              </div>
              <div className="column-label">{i.label}</div>
            </div>
          );
        })}
      </div>
      <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
        <span style={{ color: 'var(--danger)' }}>■</span> 부정(숫자 = 부정 비중) · <span style={{ color: 'var(--success)' }}>■</span> 긍정
      </div>
    </>
  );
}

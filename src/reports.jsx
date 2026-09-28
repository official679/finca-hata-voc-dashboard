// 보고서: 주간 보고 · 월간 리뷰

const REPORT_TABS = [{ key: 'weekly', label: '📅 주간 보고' }, { key: 'monthly', label: '📆 월간 리뷰' }];
const inRange = (d, from, to) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const ratioOf = (a, n) => (n ? a / n : null);
const DOW = '일월화수목금토';

// 기간 안의 부정 리뷰 불만 TOP
function complaintTop(reviews, brand, from, to, n = 5) {
  const neg = reviews.filter(r => r.brand === brand && r.rating !== null && r.rating <= 3 && inRange(r.written_at, from, to));
  const counts = new Map();
  neg.forEach(r => reviewThemes(r.content, true).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  return { neg, total: reviews.filter(r => r.brand === brand && inRange(r.written_at, from, to)).length, top: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, n) };
}

function ReportsPage() {
  const daily = useDaily();
  const reviews = useLight('review_items', 'brand,rating,content,written_at');
  const board = useLight('board_items', 'brand,inquiry_type,written_at,product_name,product_id,option_text');
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('reportTab') || 'weekly'; } catch { return 'weekly'; } });
  const [brand, setBrand] = useState('핀카');
  useEffect(() => { try { localStorage.setItem('reportTab', tab); } catch {} }, [tab]);

  if (!daily || !reviews || !board) return <div className="loading-screen">보고서 불러오는 중...</div>;
  if (!daily.length) return <><PageHeader title="보고서" /><div className="card empty">CS 데일리 데이터가 아직 없어요</div></>;

  const controls = (
    <>
      <Segmented options={REPORT_TABS} value={tab} onChange={setTab} />
      <Segmented options={BRAND_ONLY} value={brand} onChange={setBrand} />
    </>
  );
  const props = { daily, reviews, board, brand, controls };
  return tab === 'weekly' ? <WeeklyReport {...props} /> : <MonthlyReview {...props} />;
}

// ---------- 주간 보고 ----------
function WeeklyReport({ daily, reviews, board, brand, controls }) {
  const { cases, productById } = useApp();
  const weeks = useMemo(() => {
    const m = new Map();
    daily.forEach(r => { const w = weekOf(r.report_date); if (w && !m.has(w.from)) m.set(w.from, w); });
    return [...m.values()].sort((a, b) => b.from.localeCompare(a.from));
  }, [daily]);
  const [wf, setWf] = useState('');
  const week = weeks.find(w => w.from === wf) || weeks[0];
  if (!week) return null;

  const prevFrom = toISODate(addDays(parseDate(week.from), -7)), prevTo = toISODate(addDays(parseDate(week.to), -7));
  const rows = daily.filter(r => r.brand === brand && r.report_date >= week.from && r.report_date <= week.to);
  const s = sumRows(rows);
  const p = sumRows(daily.filter(r => r.brand === brand && r.report_date >= prevFrom && r.report_date <= prevTo));
  const dates = [...new Set(rows.map(r => r.report_date))].sort();
  const byDate = dates.map(d => ({ d, s: sumRows(rows.filter(r => r.report_date === d)) }));

  const vocs = cases.filter(c => c.brand === brand && c.received_date >= week.from && c.received_date <= week.to);
  const rv = complaintTop(reviews, brand, week.from, week.to);
  const restock = restockRanking(board.filter(r => r.brand === brand && inRange(r.written_at, week.from, week.to)), productById).slice(0, 5);

  const DAY_ROWS = [
    ['주문건', x => x.orders], ['출고전 취소', x => x.cancels],
    ['단순 반품', x => x.return_simple], ['과실 반품', faultReturns], ['단순 교환', x => x.exchange_simple], ['과실 교환', faultExchanges],
    ['반품·교환율', x => pct(returnsExchanges(x), x.orders), true],
    ['작성 리뷰', x => x.reviews_total], ['부정 리뷰', x => x.reviews_negative],
    ['게시판', x => x.board_total], ['해피톡', x => x.ht_total], ['전화 인입', x => x.call_in],
  ];

  return (
    <>
      <PageHeader title={`${brand} 주간 보고 · ${week.label}`} desc={`데이터 ${week.range} (월~일, 전일 기준 · 보고일 ${fmtMD(parseDate(week.from))}~${fmtMD(parseDate(week.to))}) · 지난주와 비교`}>
        {controls}
        <Select value={week.from} onChange={setWf} options={weeks.map(w => ({ value: w.from, label: `${w.label} (${w.range})` }))} />
        <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄</button>
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count vs="지난주" />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratioOf(returnsExchanges(s), s.orders)} prev={ratioOf(returnsExchanges(p), p.orders)} vs="지난주" />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratioOf(faults(s), s.orders)} prev={ratioOf(faults(p), p.orders)} vs="지난주" />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratioOf(s.reviews_negative, s.reviews_total)} prev={ratioOf(p.reviews_negative, p.reviews_total)} vs="지난주" />} />
        <Kpi label="게시판 문의" value={s.board_total} sub={<Delta cur={s.board_total} prev={p.board_total} count vs="지난주" />} />
        <Kpi label="해피톡 상담" value={s.ht_total} sub={<Delta cur={s.ht_total} prev={p.ht_total} count vs="지난주" />} />
      </div>

      <div className="section-title">날짜별 현황 <small className="muted">데이터 날짜 기준 (월요일 보고분 = 금~일)</small></div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table report-table">
            <thead><tr><th>구분</th>{byDate.map(x => <th key={x.d} className="num">{dataLabel(x.d)}<div className="th-sub">{parseDate(x.d).getDay() === 1 ? '금~일' : DOW[addDays(parseDate(x.d), -1).getDay()]}</div></th>)}<th className="num">합계</th><th className="num">지난주</th></tr></thead>
            <tbody>
              {DAY_ROWS.map(([label, fn, key]) => (
                <tr key={label} className={key ? 'key-row' : ''}>
                  <td>{label}</td>
                  {byDate.map(x => <td key={x.d} className="num">{fn(x.s)}</td>)}
                  <td className="num total">{fn(s)}</td>
                  <td className="num muted">{fn(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2w" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">반품·교환 유형 <small>{returnsExchanges(s)}건</small></div>
          <Bars items={[
            { label: '단순 반품', count: s.return_simple }, { label: '단순 교환', count: s.exchange_simple },
            { label: '과실 · 상품이상', count: s.return_defect + s.exchange_defect },
            { label: '과실 · 오배송/오매핑', count: s.return_misship + s.exchange_misship },
            { label: '과실 · 기타', count: s.return_etc + s.exchange_etc },
          ]} />
        </div>
        <ChannelTable brand={brand} rows={rows.filter(r => r.platform !== BRAND_TOTAL)} />
        <div className="card">
          <div className="card-title">이번 주 VOC 접수 <small>{vocs.length}건 · 과실 {vocs.filter(c => isFault(c.voc_type)).length}건</small></div>
          <Bars items={countBy(vocs, c => c.reason_category).slice(0, 6)} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">이번 주 부정 리뷰 불만 <small>업로드한 리뷰 {rv.total}건 중 부정 {rv.neg.length}건</small></div>
          <Bars items={rv.top} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">이번 주 재입고 문의 TOP 5 <small>게시판</small></div>
          <Bars items={restock.map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" />
        </div>
      </div>
    </>
  );
}

// ---------- 월간 리뷰 ----------
function MonthlyReview({ daily, reviews, board, brand, controls }) {
  const { cases, productById } = useApp();
  const months = useMemo(() => [...new Set(daily.map(r => weekOf(r.report_date)?.ym).filter(Boolean))].sort().reverse(), [daily]);
  const [ymSel, setYm] = useState('');
  const ym = ymSel || months[0];
  const range = (m) => { const w = monthWeeks(m); return [w[0].from, w[w.length - 1].to]; };
  const prevOf = (m) => toISODate(new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 2, 1)).slice(0, 7);

  const weeks = monthWeeks(ym);
  const [from, to] = range(ym);
  const monthRows = (m) => { const [a, b] = range(m); return daily.filter(r => r.brand === brand && r.report_date >= a && r.report_date <= b); };
  const rows = monthRows(ym);
  const s = sumRows(rows), p = sumRows(monthRows(prevOf(ym)));
  const trend = [prevOf(prevOf(ym)), prevOf(ym), ym].map(m => ({ m, s: sumRows(monthRows(m)) }));

  const rv = complaintTop(reviews, brand, from, to);
  const restock = restockRanking(board.filter(r => r.brand === brand && inRange(r.written_at, from, to)), productById).slice(0, 5);
  const faultCases = cases.filter(c => c.brand === brand && isFault(c.voc_type) && c.received_date >= from && c.received_date <= to);
  const issueProducts = countBy(faultCases, c => caseProductName(c, productById)).slice(0, 5);
  const [y, mo] = ym.split('-');

  return (
    <>
      <PageHeader title={`${brand} ${y}년 ${Number(mo)}월 월간 리뷰`} desc={`데이터 ${fmtMD(addDays(parseDate(from), -1))} ~ ${fmtMD(addDays(parseDate(to), -1))} · 한 주 = 월~일 (전일 데이터 기준)`}>
        {controls}
        <Select value={ym} onChange={setYm} options={months.map(v => ({ value: v, label: `${v.slice(0, 4)}년 ${Number(v.slice(5))}월` }))} />
        <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄 / PDF</button>
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratioOf(returnsExchanges(s), s.orders)} prev={ratioOf(returnsExchanges(p), p.orders)} />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratioOf(faults(s), s.orders)} prev={ratioOf(faults(p), p.orders)} />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratioOf(s.reviews_negative, s.reviews_total)} prev={ratioOf(p.reviews_negative, p.reviews_total)} />} />
      </div>

      <div className="section-title">주간 주문 · 반품교환 · 과실 · 리뷰 현황 <small className="muted">빨간 칸 = 그달 가장 높았던 주</small></div>
      <BrandWeekTable brand={brand} rows={rows} weeks={weeks} />

      <div className="grid grid-2w" style={{ marginTop: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>최근 3개월 추이</div>
          <div className="table-wrap">
            <table className="table report-table">
              <thead><tr><th>구분</th>{trend.map(t => <th key={t.m} className="num">{Number(t.m.slice(5))}월</th>)}</tr></thead>
              <tbody>
                {[['주문건', x => x.orders.toLocaleString()], ['반품·교환율', x => pct(returnsExchanges(x), x.orders), true], ['과실률', x => pct(faults(x), x.orders), true],
                  ['부정 리뷰율', x => pct(x.reviews_negative, x.reviews_total), true], ['게시판', x => x.board_total], ['해피톡', x => x.ht_total]].map(([label, fn, key]) => (
                  <tr key={label} className={key ? 'key-row' : ''}><td>{label}</td>{trend.map(t => <td key={t.m} className="num">{t.s.orders || t.s.reviews_total ? fn(t.s) : '-'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <ChannelTable brand={brand} rows={rows.filter(r => r.platform !== BRAND_TOTAL)} />
        <div className="card">
          <div className="card-title">이달의 리뷰 · 불만 TOP 5 <small>업로드한 리뷰 {rv.total.toLocaleString()}건 · 부정 {pct(rv.neg.length, rv.total)}</small></div>
          <Bars items={rv.top} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">과실 이슈 상품 TOP 5 <small>VOC 접수 {faultCases.length}건</small></div>
          <Bars items={issueProducts} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">재입고 문의 TOP 5 <small>게시판 · 리오더 검토</small></div>
          <Bars items={restock.map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" />
        </div>
        <MonthNotes ym={ym} brand={brand} />
      </div>
    </>
  );
}

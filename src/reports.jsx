// 보고서: 주간 리뷰(한 달 안의 주차별) · 월간 리뷰(월별 비교)

const REPORT_TABS = [{ key: 'weekly', label: '📅 주간 리뷰' }, { key: 'monthly', label: '📆 월간 리뷰' }];
const inRange = (d, from, to) => !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
const ratioOf = (a, n) => (n ? a / n : null);
const monthRange = (ym) => { const w = monthWeeks(ym); return [w[0].from, w[w.length - 1].to]; };
const prevMonthOf = (ym) => toISODate(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)) - 2, 1)).slice(0, 7);

// 막대(주문건) + 꺾은선(반품·교환율) 그래프
function ComboChart({ items, color, lineColor = '#E5484D', title }) {
  // 숫자가 겹치지 않도록 막대는 아래 62%, 꺾은선은 위쪽 띠(72~100%)에 따로 그림
  const W = 640, H = 280, L = 48, R = 24, T = 30, B = 36;
  const iw = W - L - R, ih = H - T - B;
  const maxBar = Math.max(1, ...items.map(i => i.bar || 0));
  const lines = items.map(i => i.line).filter(v => v !== null && v !== undefined);
  const minLine = Math.min(...lines, 0), maxLine = Math.max(...lines, 0.001);
  const step = iw / Math.max(1, items.length);
  const bw = Math.min(64, step * 0.55);
  const x = (i) => L + step * i + step / 2;
  const yb = (v) => T + ih - (v / maxBar) * ih * 0.62;
  const yl = (v) => T + ih * (1 - 0.72 - 0.28 * ((v - minLine) / ((maxLine - minLine) || 1)));
  const pts = items.map((it, i) => (it.line === null ? null : [x(i), yl(it.line)])).filter(Boolean);
  return (
    <div className="card">
      <div className="card-title">{title} <small><span className="legend" style={{ background: color }} />주문건 <span className="legend line" style={{ background: lineColor }} />반품·교환율</small></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={title}>
        {[0, 0.5, 1].map(f => <line key={f} x1={L} x2={W - R} y1={T + ih - ih * 0.62 * f} y2={T + ih - ih * 0.62 * f} stroke="#E5E7EB" />)}
        {[0, 0.5, 1].map(f => <text key={'b' + f} x={L - 8} y={T + ih - ih * 0.62 * f + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{Math.round(maxBar * f).toLocaleString()}</text>)}
        {items.map((it, i) => it.bar ? (
          <g key={i}>
            <rect x={x(i) - bw / 2} y={yb(it.bar)} width={bw} height={T + ih - yb(it.bar)} fill={color} rx="3" />
            <text x={x(i)} y={Math.min(T + ih - 8, yb(it.bar) + 18)} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{it.bar.toLocaleString()}</text>
          </g>
        ) : null)}
        {pts.length > 1 && <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke={lineColor} strokeWidth="2.5" />}
        {items.map((it, i) => it.line === null ? null : (
          <g key={'p' + i}>
            <circle cx={x(i)} cy={yl(it.line)} r="4" fill={lineColor} />
            <text x={x(i)} y={yl(it.line) - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill={lineColor} stroke="#fff" strokeWidth="3" paintOrder="stroke">{(it.line * 100).toFixed(1)}%</text>
          </g>
        ))}
        {items.map((it, i) => <text key={'x' + i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="12" fill="#6B7280">{it.label}</text>)}
      </svg>
    </div>
  );
}

// 기간 안의 리뷰: 부정(1~3점) 불만 TOP · 긍정(4~5점) 좋았던 점 TOP
function complaintTop(reviews, brand, from, to, n = 5) {
  const all = reviews.filter(r => r.brand === brand && inRange(r.written_at, from, to));
  const neg = all.filter(r => r.rating !== null && r.rating <= 3);
  const pos = all.filter(r => r.rating !== null && r.rating > 3);
  const topOf = (rows, negative) => {
    const counts = new Map();
    rows.forEach(r => reviewThemes(r.content, negative).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, n);
  };
  return { total: all.length, neg, pos, top: topOf(neg, true), posTop: topOf(pos, false) };
}

function ReportsPage() {
  const daily = useDaily();
  const reviews = useLight('review_items', 'brand,rating,content,written_at,product_name,product_id');
  const board = useLight('board_items', 'brand,inquiry_type,written_at,product_name,product_id,option_text');
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('reportTab') === 'monthly' ? 'monthly' : 'weekly'; } catch { return 'weekly'; } });
  const [brand, setBrand] = useState('핀카');
  useEffect(() => { try { localStorage.setItem('reportTab', tab); } catch {} }, [tab]);
  const months = useMemo(() => daily ? [...new Set(daily.map(r => weekOf(r.report_date)?.ym).filter(Boolean))].sort() : [], [daily]);
  const [ymSel, setYm] = useState('');

  if (!daily || !reviews || !board) return <div className="loading-screen">보고서 불러오는 중...</div>;
  if (!months.length) return <><PageHeader title="보고서" /><div className="card empty">CS 데일리 데이터가 아직 없어요</div></>;
  const ym = ymSel || months[months.length - 1];

  const controls = (
    <>
      <Segmented options={REPORT_TABS} value={tab} onChange={setTab} />
      <Segmented options={BRAND_ONLY} value={brand} onChange={setBrand} />
      <Select value={ym} onChange={setYm} options={[...months].reverse().map(v => ({ value: v, label: `${v.slice(0, 4)}년 ${Number(v.slice(5))}월` }))} />
      <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄 / PDF</button>
    </>
  );
  const props = { daily, reviews, board, brand, ym, months, controls };
  return tab === 'weekly' ? <WeeklyReview {...props} /> : <MonthlyReview {...props} />;
}

// 공통: 선택한 달의 상세 (리뷰 불만 · 과실 상품 · 재입고 · 메모)
function MonthDetails({ reviews, board, brand, ym }) {
  const { cases, productById } = useApp();
  const [from, to] = monthRange(ym);
  const rv = complaintTop(reviews, brand, from, to);
  // 리뷰 수 많은 상품 (상품 마스터 이름 우선, 사이즈·옵션 괄호는 합침)
  const byProduct = (rows) => countBy(rows, r => { const n = (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name; return n ? coreName(n) : null; })
    .filter(x => x.label !== '(미입력)').slice(0, 5);
  const restock = restockRanking(board.filter(r => r.brand === brand && inRange(r.written_at, from, to)), productById).slice(0, 5);
  const faultCases = cases.filter(c => c.brand === brand && isFault(c.voc_type) && c.received_date >= from && c.received_date <= to);
  const m = Number(ym.slice(5));
  // 상품 이름을 누르면 리뷰 목록에서 그 상품 리뷰 (전체 기간 · 이름으로 검색)
  const openProduct = (stars) => (name) => openReviewList({ brand, period: 'all', stars, q: name });
  return (
    <>
      {/* ① 이번 달 요약 (결론) */}
      <div className="detail-section">📝 {m}월 요약</div>
      <div className="grid grid-pair">
        <MonthNotes ym={ym} brand={brand} />
      </div>

      {/* ② 리뷰: 왼쪽 부정(빨강) · 오른쪽 긍정(초록) */}
      <div className="detail-section">⭐ {m}월 리뷰 <small className="muted" style={{ fontWeight: 400 }}>업로드한 리뷰 {rv.total.toLocaleString()}건 · 부정 {rv.neg.length.toLocaleString()}건 ({pct(rv.neg.length, rv.total)}) · 긍정 {rv.pos.length.toLocaleString()}건 ({pct(rv.pos.length, rv.total)})</small></div>
      <div className="grid grid-pair">
        <div className="card">
          <div className="card-title">😟 불만 TOP 5 <small>1~3점 리뷰에서 많이 나온 말</small></div>
          <Bars items={rv.top} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">😊 좋았던 점 TOP 5 <small>4~5점 리뷰에서 많이 나온 말</small></div>
          <Bars items={rv.posTop} color="var(--success)" />
        </div>
        <div className="card">
          <div className="card-title">부정 리뷰 많은 상품 TOP 5 <small>1~3점 · 누르면 리뷰 보기</small></div>
          <Bars items={byProduct(rv.neg)} color="var(--danger)" wide onPick={openProduct('neg')} />
        </div>
        <div className="card">
          <div className="card-title">칭찬 많은 상품 TOP 5 <small>4~5점 · 누르면 리뷰 보기</small></div>
          <Bars items={byProduct(rv.pos)} color="var(--success)" wide onPick={openProduct('pos')} />
        </div>
      </div>

      {/* ③ VOC · 재입고 */}
      <div className="detail-section">🛠 {m}월 VOC · 재입고</div>
      <div className="grid grid-pair">
        <div className="card">
          <div className="card-title">과실 이슈 상품 TOP 5 <small>VOC 접수 {faultCases.length}건</small></div>
          <Bars items={countBy(faultCases, c => caseProductName(c, productById)).slice(0, 5)} color="var(--danger)" wide empty="이달 접수된 과실 VOC가 없어요" />
        </div>
        <div className="card">
          <div className="card-title">추가분류별 과실 VOC <small>앵커 = 브랜드 대표 · 캐리오버 = 재생산 검토</small></div>
          <Bars items={countBy(faultCases.filter(c => caseLineType(c, productById)), c => caseLineType(c, productById))} color="var(--danger)" empty="상품 마스터와 연결된 과실 VOC가 없어요" />
        </div>
        <div className="card">
          <div className="card-title">재입고 문의 TOP 5 <small>게시판 · 리오더 검토</small></div>
          <Bars items={restock.map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" wide empty="이달 재입고 문의가 없어요 (게시판 파일을 올리면 보여요)" />
        </div>
      </div>
    </>
  );
}

// ---------- 주간 리뷰: 한 달 안의 주차별 ----------
function WeeklyReview({ daily, reviews, board, brand, ym, controls }) {
  const weeks = monthWeeks(ym).map(w => ({ ...w, short: w.label.split(' ')[1] }));
  const [from, to] = monthRange(ym);
  const [pf, pt] = monthRange(prevMonthOf(ym));
  const rows = daily.filter(r => r.brand === brand && r.report_date >= from && r.report_date <= to);
  const s = sumRows(rows);
  const p = sumRows(daily.filter(r => r.brand === brand && r.report_date >= pf && r.report_date <= pt));
  const weekSums = weeks.map(w => ({ w, s: sumRows(rows.filter(r => r.report_date >= w.from && r.report_date <= w.to)) }));   // 표와 같이 그달 주차 전부 (데이터 없는 주는 빈칸)
  const [y, mo] = ym.split('-');

  return (
    <>
      <PageHeader title={`${brand} · ${y}년 ${Number(mo)}월 주간 리뷰`} desc={`데이터 ${weeks[0].range.split('~')[0]} ~ ${weeks[weeks.length - 1].range.split('~')[1]} · 한 주 = 월~일 (전일 데이터 기준)`}>{controls}</PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratioOf(returnsExchanges(s), s.orders)} prev={ratioOf(returnsExchanges(p), p.orders)} />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratioOf(faults(s), s.orders)} prev={ratioOf(faults(p), p.orders)} />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratioOf(s.reviews_negative, s.reviews_total)} prev={ratioOf(p.reviews_negative, p.reviews_total)} />} />
      </div>

      <div className="section-title">주간 주문 · 반품교환 · 과실 · 리뷰 현황 <small className="muted">빨간 칸 = 그달 가장 높았던 주</small></div>
      {/* 표는 왼쪽, 그래프·채널별 현황은 오른쪽 (화면이 좁으면 아래로) */}
      <div className="report-split">
        <BrandWeekTable brand={brand} rows={rows} weeks={weeks} totalLabel={`${Number(mo)}월 합계·평균`} worstLabel="이달 중 가장 높은 주" />
        <div className="report-side">
          <ComboChart title={`${brand} 주간 주문건 · 반품교환율`} color={BRAND_COLOR[brand]}
            items={weekSums.map(x => ({ label: `${Number(mo)}월 ${x.w.short}`, bar: x.s.orders, line: ratioOf(returnsExchanges(x.s), x.s.orders) }))} />
          <ChannelTable brand={brand} rows={rows.filter(r => r.platform !== BRAND_TOTAL)} period={`${Number(mo)}월 합계 (1~${weeks.length}주차)`} />
        </div>
      </div>

      <MonthDetails reviews={reviews} board={board} brand={brand} ym={ym} />
    </>
  );
}

// ---------- 월간 리뷰: 월별 비교 ----------
function MonthlyReview({ daily, reviews, board, brand, ym, months, controls }) {
  // 선택한 달까지 최근 6개월
  const shown = months.filter(m => m <= ym).slice(-6);
  const periods = shown.map(m => { const [a, b] = monthRange(m); return { from: a, to: b, short: `${Number(m.slice(5))}월`, range: `${fmtMD(addDays(parseDate(a), -1))}~${fmtMD(addDays(parseDate(b), -1))}`, ym: m }; });
  const [from] = monthRange(shown[0]);
  const [, to] = monthRange(ym);
  const rows = daily.filter(r => r.brand === brand && r.report_date >= from && r.report_date <= to);
  const sums = periods.map(p => ({ p, s: sumRows(rows.filter(r => r.report_date >= p.from && r.report_date <= p.to)) }));
  const platforms = [...new Set(rows.filter(r => r.platform !== BRAND_TOTAL).map(r => r.platform))];
  const [y, mo] = ym.split('-');

  return (
    <>
      <PageHeader title={`${brand} · 월간 리뷰 (${shown.map(m => `${Number(m.slice(5))}월`).join(' · ')})`} desc="월별로 나란히 비교 · 한 주 = 월~일 (전일 데이터 기준) · 각 달 = 그달 1~5주차 합계">{controls}</PageHeader>

      <div className="section-title">월별 주문 · 반품교환 · 과실 · 리뷰 현황 <small className="muted">빨간 칸 = 가장 높았던 달</small></div>
      <div className="report-split">
      <BrandWeekTable brand={brand} rows={rows} weeks={periods} totalLabel="기간 합계·평균" worstLabel="가장 높은 달" />

      <div className="report-side">
        <ComboChart title={`${brand} 월별 주문건 · 반품교환율`} color={BRAND_COLOR[brand]}
          items={sums.map(x => ({ label: x.p.short, bar: x.s.orders, line: ratioOf(returnsExchanges(x.s), x.s.orders) }))} />
        <div className="card brand-card" style={{ padding: 0, '--brand': BRAND_COLOR[brand] }}>
          <div className="brand-bar">{brand} 채널별 월 추이 <span style={{ fontWeight: 400, opacity: 0.85 }}>· 주문건 / 반품·교환율</span></div>
          <div className="table-wrap">
            <table className="table report-table">
              <thead><tr><th>채널</th>{periods.map(p => <th key={p.ym} className="num">{p.short}</th>)}</tr></thead>
              <tbody>
                {platforms.map(pl => (
                  <tr key={pl}>
                    <td>{pl}</td>
                    {periods.map(p => { const s = sumRows(rows.filter(r => r.platform === pl && r.report_date >= p.from && r.report_date <= p.to)); return <td key={p.ym} className="num">{s.orders ? <>{s.orders.toLocaleString()}<div className="th-sub">{pct(returnsExchanges(s), s.orders)}</div></> : '-'}</td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>

      <div className="section-title">{y}년 {Number(mo)}월 상세 <small className="muted">오른쪽 위에서 달을 바꿀 수 있어요</small></div>
      <MonthDetails reviews={reviews} board={board} brand={brand} ym={ym} />
    </>
  );
}

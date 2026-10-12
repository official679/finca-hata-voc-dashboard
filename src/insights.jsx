// VOC 현황

// 브랜드는 한 번에 하나씩 (핀카 먼저). '전체' 보기는 쓰지 않음
const BRAND_FILTER = [{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }];

function ReportPage({ go }) {
  const { cases, productById } = useApp();
  const [period, setPeriod] = useState('thisMonth');
  const [brand, setBrand] = useState('핀카');

  const [from, to] = periodRange(period);
  const brandCases = useMemo(() => cases.filter(c => !brand || c.brand === brand), [cases, brand]);
  const inPeriod = useMemo(() => brandCases.filter(c => c.received_date >= from && c.received_date <= to), [brandCases, from, to]);
  const faults = inPeriod.filter(c => isFault(c.voc_type));
  const open = inPeriod.filter(c => c.status === '접수' || c.status === '확인중');

  // 최근 5주 추이
  const weeks = useMemo(() => {
    const start = weekStart(new Date());
    return Array.from({ length: 5 }, (_, i) => {
      const ws = addDays(start, -7 * (4 - i));
      const we = addDays(ws, 6);
      const a = toISODate(ws), b = toISODate(we);
      const rows = brandCases.filter(c => c.received_date >= a && c.received_date <= b);
      return { label: `${fmtMD(ws)}~`, total: rows.length, fault: rows.filter(c => isFault(c.voc_type)).length };
    });
  }, [brandCases]);

  const topProducts = useMemo(() => {
    const m = new Map();
    faults.forEach(c => {
      const name = caseProductName(c, productById);
      const e = m.get(name) || { name, brand: c.brand, count: 0, reasons: new Map(), actions: new Set() };
      e.count++;
      if (c.reason_category) e.reasons.set(c.reason_category, (e.reasons.get(c.reason_category) || 0) + 1);
      if (c.action_required) e.actions.add(c.action_required);
      m.set(name, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [faults, productById]);

  return (
    <>
      <PageHeader title="VOC 현황" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~ ${fmtDate(to)}`} · VOC 접수 기준`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="VOC 접수" value={inPeriod.length} sub="건" />
        <Kpi label="브랜드 과실 (반품·교환)" value={faults.length} sub={inPeriod.length ? `VOC의 ${Math.round(faults.length / inPeriod.length * 100)}%` : ' '} />
        {/* 재입고 문의는 게시판 탭·메인에서 (VOC로 따로 접수한 재입고는 아래 'VOC 구분'에 나옴) */}
        <Kpi label="처리 대기" value={open.length} sub="접수·확인중" alert={open.length > 0} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">주간 VOC 추이 <small>최근 5주</small></div>
          <ColumnChart items={weeks.map(w => ({ label: w.label, value: w.total }))} />
        </div>
        <div className="card">
          <div className="card-title">과실 사유</div>
          <Bars items={countBy(faults, c => c.reason_category).slice(0, 8)} />
        </div>
        <div className="card">
          <div className="card-title">대분류별 과실 VOC</div>
          <Bars items={countBy(faults, c => caseCategory(c, productById))} color="var(--danger)" />
        </div>
        <div className="card">
          <div className="card-title">추가분류별 VOC <small>앵커 = 브랜드 대표 상품 · 괄호 = 과실</small></div>
          <Bars items={countBy(inPeriod.filter(c => caseLineType(c, productById)), c => caseLineType(c, productById))
            .map(x => ({ ...x, label: `${x.label} (과실 ${faults.filter(c => caseLineType(c, productById) === x.label).length})` }))}
            empty="상품 마스터와 연결된 VOC가 없어요" />
        </div>
        <div className="card">
          <div className="card-title">플랫폼별 VOC</div>
          <Bars items={countBy(inPeriod, c => c.platform)} />
        </div>
        <div className="card">
          <div className="card-title">VOC 구분</div>
          <Bars items={countBy(inPeriod, c => c.voc_type)} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div className="card-title" style={{ padding: '18px 20px 0' }}>과실 이슈 상품 TOP 10</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>상품명</th><th>브랜드</th><th className="num">과실 건수</th><th>주요 사유</th>{SHOW_FOLLOWUP && <th>지정된 후속 조치</th>}</tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name}>
                  <td className="muted">{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.brand}</td>
                  <td className="num"><b>{p.count}</b></td>
                  <td>{[...p.reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => <span key={r} className="chip" style={{ marginRight: 4 }}>{r} {n}</span>)}</td>
                  {SHOW_FOLLOWUP && <td>{p.actions.size ? [...p.actions].map(a => <span key={a} className="chip chip-red" style={{ marginRight: 4 }}>{a}</span>) : <span className="muted">-</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {topProducts.length === 0 && <div className="empty">이 기간에 브랜드 과실 VOC가 없어요</div>}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>주문 수·반품교환율·리뷰·상담 지표는 <a href="#/monthly"><b>보고 · 회의 → 보고서</b></a>에서 볼 수 있어요.</p>
    </>
  );
}

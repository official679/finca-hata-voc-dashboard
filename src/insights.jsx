// VOC 현황 · 후속 조치 보드

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
  const pendingActions = brandCases.filter(c => c.action_required && !c.action_done);

  // 최근 8주 추이
  const weeks = useMemo(() => {
    const start = weekStart(new Date());
    return Array.from({ length: 8 }, (_, i) => {
      const ws = addDays(start, -7 * (7 - i));
      const we = addDays(ws, 6);
      const a = toISODate(ws), b = toISODate(we);
      const rows = brandCases.filter(c => c.received_date >= a && c.received_date <= b);
      return { label: `${fmtMD(ws)}~`, total: rows.length, fault: rows.filter(c => isFault(c.voc_type)).length };
    });
  }, [brandCases]);
  const weekMax = Math.max(1, ...weeks.map(w => w.total));

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
        <Kpi label="재입고 문의 (개별 접수)" value={inPeriod.filter(c => c.voc_type === '재입고 문의').length} sub="게시판 집계는 게시판 업로드 후 추가" />
        <Kpi label="처리 대기" value={open.length} sub="접수·확인중" alert={open.length > 0} />
        <Kpi label="진행 중인 조치" value={pendingActions.length} sub="기간 무관 · 후속 조치 보드" alert={pendingActions.length > 0} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">주간 VOC 추이 <small>최근 8주 · 진한 색 = 브랜드 과실</small></div>
          <div className="columns">
            {weeks.map(w => (
              <div className="column" key={w.label} title={`${w.label} 전체 ${w.total}건 / 과실 ${w.fault}건`}>
                <div className="column-value">{w.total}</div>
                <div style={{ width: '100%', maxWidth: 36, height: `${(w.total / weekMax) * 100}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 2 }}>
                  <div style={{ flex: w.total - w.fault, background: '#BFD3F6', borderRadius: w.fault === w.total ? 0 : '4px 4px 0 0' }} />
                  <div style={{ flex: w.fault, background: 'var(--accent)', borderRadius: w.fault === w.total ? '4px 4px 0 0' : 0 }} />
                </div>
                <div className="column-label">{w.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">과실 사유 <small>브랜드 과실 {faults.length}건</small></div>
          <Bars items={countBy(faults, c => c.reason_category).slice(0, 8)} />
        </div>
        <div className="card">
          <div className="card-title">대분류별 과실 VOC <small>상품 마스터 기준</small></div>
          <Bars items={countBy(faults, c => categoryOf(c.product_id, productById))} color="var(--danger)" />
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
            <thead><tr><th>#</th><th>상품명</th><th>브랜드</th><th className="num">과실 건수</th><th>주요 사유</th><th>지정된 후속 조치</th></tr></thead>
            <tbody>
              {topProducts.map((p, i) => (
                <tr key={p.name}>
                  <td className="muted">{i + 1}</td>
                  <td>{p.name}</td>
                  <td>{p.brand}</td>
                  <td className="num"><b>{p.count}</b></td>
                  <td>{[...p.reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => <span key={r} className="chip" style={{ marginRight: 4 }}>{r} {n}</span>)}</td>
                  <td>{p.actions.size ? [...p.actions].map(a => <span key={a} className="chip chip-red" style={{ marginRight: 4 }}>{a}</span>) : <span className="muted">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {topProducts.length === 0 && <div className="empty">이 기간에 브랜드 과실 VOC가 없어요</div>}
        </div>
      </div>

      <p className="hint" style={{ marginTop: 12 }}>주문 수·반품교환율·리뷰·상담 지표는 <b>월간 보고</b>에서 볼 수 있어요.</p>
    </>
  );
}

// ---------- 후속 조치 보드 ----------

function groupByProduct(rows, productById) {
  const m = new Map();
  rows.forEach(c => {
    const name = caseProductName(c, productById);
    const e = m.get(name) || { name, brand: c.brand, cases: [] };
    e.cases.push(c);
    m.set(name, e);
  });
  return [...m.values()].map(e => ({
    ...e,
    latest: e.cases.reduce((a, c) => (c.received_date > a ? c.received_date : a), ''),
    reasons: countBy(e.cases, c => c.reason_category),
  })).sort((a, b) => b.cases.length - a.cases.length || b.latest.localeCompare(a.latest));
}

function ActionCard({ group, children, onOpenCase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="board-card">
      <div className="board-card-title">{group.name}</div>
      <div className="board-card-meta">
        <span className="chip chip-blue">{group.brand}</span>
        {group.reasons.slice(0, 3).map(r => <span className="chip" key={r.label}>{r.label} {r.count}</span>)}
      </div>
      <div className="board-card-foot">
        <button className="btn-link" onClick={() => setOpen(!open)}>VOC {group.cases.length}건 {open ? '접기' : '보기'}</button>
        <span>최근 {fmtDate(group.latest)}</span>
      </div>
      {open && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {group.cases.map(c => (
            <div key={c.id} style={{ fontSize: 12, padding: '4px 0', cursor: 'pointer' }} onClick={() => onOpenCase(c)}>
              <span className="muted">{fmtDate(c.received_date)}</span> {c.reason_category || c.voc_type || ''} · <span className="muted">{(c.reason_detail || '').slice(0, 40)}</span>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// 리오더 칸 위에 보이는 게시판 재입고 문의 TOP 5
function RestockHint({ rows, brand, days }) {
  const { productById } = useApp();
  if (!rows) return null;
  const since = toISODate(addDays(new Date(), -Number(days)));
  const top = restockRanking(rows.filter(r => !brand || r.brand === brand), productById, since).slice(0, 5);
  return (
    <div className="board-card" style={{ background: 'var(--warn-soft)', borderColor: 'transparent' }}>
      <div className="board-card-title">💬 게시판 재입고 문의 TOP 5 <span className="muted" style={{ fontWeight: 400 }}>· 최근 {days}일</span></div>
      {top.length === 0 ? <div className="hint">최근 재입고 문의가 없어요</div> : top.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginTop: 6 }}>
          <span className="ellipsis" style={{ maxWidth: 200 }} title={p.name}>{p.name}</span><b>{p.count}건</b>
        </div>
      ))}
      <div style={{ marginTop: 8 }}><a className="btn-link" href="#/board">게시판 분석에서 보기 →</a></div>
    </div>
  );
}

function ActionsPage() {
  const { cases, setCases, codeOptions, productById } = useApp();
  const [boardRows] = useBoard();
  const toast = useToast();
  const [brand, setBrand] = useState('핀카');
  const [windowDays, setWindowDays] = useState('30');
  const [editing, setEditing] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const scoped = useMemo(() => cases.filter(c => !brand || c.brand === brand), [cases, brand]);
  const actions = codeOptions('action');

  const since = toISODate(addDays(new Date(), -Number(windowDays)));
  const suggestions = useMemo(() => groupByProduct(
    scoped.filter(c => isFault(c.voc_type) && !c.action_required && c.received_date >= since), productById)
    .filter(g => g.cases.length >= 2), [scoped, since, productById]);

  const updateCases = async (ids, patch, message) => {
    const { data, error } = await db.from('voc_cases').update(patch).in('id', ids).select();
    if (error) { toast('❌ 변경 실패: ' + error.message, 'err'); return; }
    const byId = new Map(data.map(d => [d.id, d]));
    setCases(prev => prev.map(c => byId.get(c.id) || c));
    toast(message);
  };

  const columns = actions.map(action => ({
    action,
    groups: groupByProduct(scoped.filter(c => c.action_required === action && !c.action_done), productById),
  }));
  const done = groupByProduct(scoped.filter(c => c.action_required && c.action_done), productById);

  return (
    <>
      <PageHeader title="후속 조치 보드" desc="상품개선·리오더 등 후속 조치가 필요한 상품을 모아 봐요.">
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
      </PageHeader>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">
          <span>🔎 검토 필요 <small>최근 {windowDays}일 안에 브랜드 과실 VOC가 2건 이상인데 후속 조치가 지정되지 않은 상품</small></span>
          <Select value={windowDays} onChange={setWindowDays} options={[{ value: '14', label: '최근 14일' }, { value: '30', label: '최근 30일' }, { value: '90', label: '최근 90일' }]} />
        </div>
        {suggestions.length === 0 ? <div className="empty">검토가 필요한 상품이 없어요 👍</div> : (
          <div className="board" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {suggestions.map(g => (
              <ActionCard key={g.name} group={g} onOpenCase={setEditing}>
                <div style={{ marginTop: 10 }}>
                  <Select value="" placeholder="후속 조치 지정..." options={actions} onChange={a => a && updateCases(g.cases.map(c => c.id), { action_required: a, action_done: false }, `✅ ${g.cases.length}건에 '${a}' 지정`)} />
                </div>
              </ActionCard>
            ))}
          </div>
        )}
      </div>

      <div className="board">
        {columns.map(col => (
          <div className="board-col" key={col.action}>
            <div className="board-col-title"><span>{col.action}</span><span className="chip">{col.groups.length}개 상품</span></div>
            {col.action === '리오더' && <RestockHint rows={boardRows} brand={brand} days={windowDays} />}
            {col.groups.length === 0 && <div className="empty" style={{ padding: 16 }}>없음</div>}
            {col.groups.map(g => (
              <ActionCard key={g.name} group={g} onOpenCase={setEditing}>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => updateCases(g.cases.map(c => c.id), { action_done: true }, '✅ 완료 처리했어요')}>완료</button>
                  <button className="btn btn-sm" onClick={() => updateCases(g.cases.map(c => c.id), { action_required: null, action_done: false }, '후속 조치를 해제했어요')}>해제</button>
                </div>
              </ActionCard>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="btn-link" onClick={() => setShowDone(!showDone)}>완료된 후속 조치 {done.length}개 상품 {showDone ? '접기' : '보기'}</button>
        {showDone && (
          <div className="board" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {done.map(g => (
              <ActionCard key={g.name} group={g} onOpenCase={setEditing}>
                <div className="board-card-meta">{[...new Set(g.cases.map(c => c.action_required))].map(a => <span key={a} className="chip chip-green">{a} 완료</span>)}</div>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => updateCases(g.cases.map(c => c.id), { action_done: false }, '다시 진행 중으로 옮겼어요')}>진행 중으로 되돌리기</button>
                </div>
              </ActionCard>
            ))}
          </div>
        )}
      </div>

      <VocEditPanel vocCase={editing} onClose={() => setEditing(null)} />
    </>
  );
}

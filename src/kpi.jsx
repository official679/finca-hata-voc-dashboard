// KPI: 월별 핵심 지표 · 목표 대비 달성 여부 · 최근 6개월 추이 (대표님 보고 + 팀 목표 공용)
// 목표값은 code_items (group 'kpi_target', label '브랜드|지표키|값')에 저장해서 화면에서 바로 고침

const KPI_DEFS = [
  { key: 'return_rate', label: '반품·교환율', unit: '%', lowerBetter: true, def: 3, desc: '반품·교환 건수 ÷ 주문건 (CS 데일리)',
    calc: (s) => (s.orders ? returnsExchanges(s) / s.orders * 100 : null) },
  { key: 'fault_rate', label: '과실률', unit: '%', lowerBetter: true, def: 0.5, desc: '과실 반품·교환 ÷ 주문건 (CS 데일리)',
    calc: (s) => (s.orders ? faults(s) / s.orders * 100 : null) },
  // needs: 이 칸들을 그달 한 번도 입력하지 않았으면 0%가 아니라 '미입력' (예: 8월 출고전 취소·전화는 입력 안 함)
  { key: 'cancel_rate', label: '출고전 취소율', unit: '%', lowerBetter: true, def: 5, desc: '출고전 취소 ÷ 주문건 (CS 데일리)', needs: ['cancels'],
    calc: (s) => (s.orders ? s.cancels / s.orders * 100 : null) },
  { key: 'neg_review_rate', label: '부정 리뷰율', unit: '%', lowerBetter: true, def: 5, desc: '1~3점 리뷰 ÷ 작성 리뷰 (CS 데일리)',
    calc: (s) => (s.reviews_total ? s.reviews_negative / s.reviews_total * 100 : null) },
  { key: 'inquiry_per_100', label: '주문 100건당 문의', unit: '건', lowerBetter: true, def: 8, desc: '(게시판+해피톡+전화 인입) ÷ 주문건 × 100', needs: ['board_total', 'ht_total'],   // 전화는 하타처럼 없는 달도 있어서 제외
    calc: (s) => (s.orders ? (s.board_total + s.ht_total + s.call_in) / s.orders * 100 : null) },
  { key: 'voc_done_rate', label: 'VOC 처리 완료율', unit: '%', lowerBetter: false, def: 90, desc: '그달 접수 VOC 중 처리완료·보상완료 비율',
    calc: (s, v) => (v.total ? v.done / v.total * 100 : null) },
];
const DONE_STATUSES = ['처리완료', '보상완료'];

function KpiPage() {
  const { cases, codes, loadCodes } = useApp();
  const daily = useDaily();
  const toast = useToast();
  const preorder = usePreorderPending();
  const [brand, setBrand] = useState('핀카');
  const [ymSel, setYm] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});

  if (!daily) return <div className="loading-screen">KPI 불러오는 중...</div>;
  const months = [...new Set(daily.map(r => weekOf(r.report_date)?.ym).filter(Boolean))].sort();
  if (!months.length) return <><PageHeader title="KPI" /><div className="card empty">CS 데일리 데이터가 아직 없어요</div></>;
  const ym = ymSel || months[months.length - 1];

  // 목표값: 저장된 값 → 없으면 기본값
  const targetItems = (codes || []).filter(c => c.group_key === 'kpi_target');
  const target = (key) => {
    const it = targetItems.find(c => c.label.startsWith(`${brand}|${key}|`));
    const v = it ? Number(it.label.split('|')[2]) : NaN;
    return Number.isFinite(v) ? v : KPI_DEFS.find(d => d.key === key).def;
  };

  // 달마다 CS 데일리 합계 + VOC 접수·완료
  const rowsOf = (m) => { const [a, b] = monthRange(m); return daily.filter(r => r.brand === brand && periodDate(r.report_date) >= a && periodDate(r.report_date) <= b); };
  const vocOf = (m) => { const cs = cases.filter(c => c.brand === brand && (c.received_date || '').startsWith(m)); return { total: cs.length, done: cs.filter(c => DONE_STATUSES.includes(c.status)).length }; };
  // 미입력 = NaN (0%와 구분), 데이터 없음 = null
  const valueOf = (d, m) => { const s = sumRows(rowsOf(m)); if (s.orders && (d.needs || []).some(f => !s[f])) return NaN; return d.calc(s, vocOf(m)); };
  const idx = months.indexOf(ym);
  const trendMonths = months.slice(Math.max(0, idx - 5), idx + 1);
  const prevYm = idx > 0 ? months[idx - 1] : null;

  const fmt = (v, d) => (Number.isNaN(v) ? '미입력' : v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(d.unit === '%' ? 1 : 1)}${d.unit === '%' ? '%' : '건'}`);
  const ok = (v, d, t) => (v === null || !Number.isFinite(v) ? null : d.lowerBetter ? v <= t : v >= t);

  const saveTargets = async () => {
    for (const d of KPI_DEFS) {
      const raw = draft[d.key];
      if (raw === undefined || raw === '' || !Number.isFinite(Number(raw))) continue;
      const label = `${brand}|${d.key}|${Number(raw)}`;
      const it = targetItems.find(c => c.label.startsWith(`${brand}|${d.key}|`));
      const { error } = it ? await db.from('code_items').update({ label }).eq('id', it.id) : await db.from('code_items').insert({ group_key: 'kpi_target', label, sort_order: 1 });
      if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    }
    await loadCodes();
    setEditing(false);
    toast('✅ 목표를 저장했어요');
  };

  const results = KPI_DEFS.map(d => ({ d, t: target(d.key), cur: valueOf(d, ym), prev: prevYm ? valueOf(d, prevYm) : null, trend: trendMonths.map(m => ({ m, v: valueOf(d, m) })) }));
  const hit = results.filter(r => ok(r.cur, r.d, r.t) === true).length, measured = results.filter(r => ok(r.cur, r.d, r.t) !== null).length;

  return (
    <>
      <PageHeader title={`🎯 ${brand} KPI · ${Number(ym.slice(5))}월`} desc={`목표 달성 ${hit} / ${measured}개 · 한 달 = 그달 1~${monthWeeks(ym).length}주차 (보고서와 같은 기준)`}>
        <Segmented options={BRAND_ONLY} value={brand} onChange={setBrand} />
        <Select value={ym} onChange={setYm} options={[...months].reverse().map(v => ({ value: v, label: `${v.slice(0, 4)}년 ${Number(v.slice(5))}월` }))} />
        {editing
          ? <><button className="btn btn-primary no-print" onClick={saveTargets}>목표 저장</button><button className="btn no-print" onClick={() => setEditing(false)}>취소</button></>
          : <button className="btn no-print" onClick={() => { setDraft(Object.fromEntries(KPI_DEFS.map(d => [d.key, String(target(d.key))]))); setEditing(true); }}>✏️ 목표 수정</button>}
        <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄 / PDF</button>
      </PageHeader>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table kpi-table">
            <thead><tr><th>KPI</th><th className="num">목표</th><th className="num">{Number(ym.slice(5))}월</th><th className="num">지난달</th><th>달성</th><th>최근 6개월</th></tr></thead>
            <tbody>
              {results.map(({ d, t, cur, prev, trend }) => {
                const pass = ok(cur, d, t);
                const better = prev !== null && cur !== null && Number.isFinite(prev) && Number.isFinite(cur) ? (d.lowerBetter ? cur < prev : cur > prev) : null;
                return (
                  <tr key={d.key}>
                    <td><b>{d.label}</b><div className="hint">{d.desc}</div></td>
                    <td className="num">{editing
                      ? <input className="input" style={{ width: 80, textAlign: 'right' }} value={draft[d.key] ?? ''} onChange={e => setDraft(p => ({ ...p, [d.key]: e.target.value }))} />
                      : <>{d.lowerBetter ? '≤ ' : '≥ '}{t}{d.unit === '%' ? '%' : '건'}</>}</td>
                    <td className="num kpi-cur">{fmt(cur, d)}</td>
                    <td className="num">{fmt(prev, d)}{better !== null && cur !== prev && <span style={{ color: better ? 'var(--success)' : 'var(--danger)', marginLeft: 4 }}>{better ? '▲좋아짐' : '▼나빠짐'}</span>}</td>
                    <td>{pass === null ? <span className="muted">{Number.isNaN(cur) ? '미입력 (CS 데일리에 입력 필요)' : '데이터 없음'}</span> : pass ? <span className="chip chip-green">✅ 달성</span> : <span className="chip chip-red">⚠️ 미달</span>}</td>
                    <td><KpiTrend trend={trend} d={d} t={t} /></td>
                  </tr>
                );
              })}
              <tr>
                <td><b>예약배송 지연 안내 완료율</b><div className="hint">지금 기준 · 지연 주문 중 안내를 마친 비율</div></td>
                <td className="num">≥ 100%</td>
                <td className="num kpi-cur">{!preorder || preorder.error ? '-' : preorder.delayed ? `${((1 - preorder.pending / preorder.delayed) * 100).toFixed(1)}%` : '지연 없음'}</td>
                <td className="num"><span className="muted">-</span></td>
                <td>{!preorder || preorder.error || !preorder.delayed ? <span className="muted">-</span> : preorder.pending ? <span className="chip chip-red">⚠️ 안내 필요 {preorder.pending}건</span> : <span className="chip chip-green">✅ 달성</span>}</td>
                <td><span className="muted">예약배송 관리에서 확인</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>숫자는 CS 데일리에 저장된 값으로 계산돼요. 반품·교환·해피톡·전화를 입력하지 않은 날이 있으면 실제보다 낮게 나와요. 출고전 취소·게시판·해피톡을 그달 한 번도 입력하지 않았으면 '미입력'으로 보여요. 목표는 브랜드마다 따로 저장돼요.</div>
    </>
  );
}

// 최근 6개월 작은 막대 (목표 넘은 달은 빨강)
function KpiTrend({ trend, d, t }) {
  const vals = trend.map(x => x.v).filter(v => v !== null && Number.isFinite(v));
  const max = Math.max(t, ...vals, 0.0001);
  return (
    <div className="kpi-trend">
      {trend.map(({ m, v }) => {
        const has = v !== null && Number.isFinite(v);
        const bad = has && (d.lowerBetter ? v > t : v < t);
        return (
          <div key={m} className="kpi-trend-col" title={`${Number(m.slice(5))}월 ${has ? v.toFixed(1) : '-'}`}>
            <div className="kpi-trend-bar" style={{ height: `${has ? Math.max(4, (v / max) * 100) : 0}%`, background: bad ? 'var(--danger)' : 'var(--accent)' }} />
            <div className="kpi-trend-label">{Number(m.slice(5))}</div>
          </div>
        );
      })}
    </div>
  );
}

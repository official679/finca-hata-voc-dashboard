// 반품·교환 분석 (return_items, 17 SQL) · 상품별·사유별·월별
// 상반기(1~6월)는 판매처 반품·교환 파일을 한 번에 가져옴 (2026-09-30). 하반기 업로드는 데일리 파일 형식을 받으면 추가

// 판매처마다 다른 사유 이름 → 묶은 사유. 위에서부터 먼저 맞는 것 (불량·오배송을 배송보다 먼저)
const RETURN_REASON_GROUPS = [
  { group: '불량·파손', fault: true, re: /불량|파손|하자/ },
  { group: '오배송·누락', fault: true, re: /오배송|누락|배송오류|잘못 ?배송|상품등록오류|오매핑/ },
  { group: '사이즈·옵션', fault: false, re: /사이즈|옵션|색상 및 사이즈/ },
  { group: '단순변심', fault: false, re: /변심|구매 ?의사|다른 상품 잘못 주문|재주문/ },
  { group: '배송', fault: false, re: /배송 ?지연|분실/ },
  { group: '상품불만족·정보상이', fault: false, re: /불만족|정보 ?상이|상이/ },
];
const RETURN_GROUP_ORDER = [...RETURN_REASON_GROUPS.map(g => g.group), '기타'];

// 판매처 사유로 먼저, 사유가 비어 있으면 고객이 적은 상세 사유로
function returnReasonGroup(raw, detail) {
  for (const text of [raw, detail]) {
    const t = String(text || '').trim();
    if (!t) continue;
    const g = RETURN_REASON_GROUPS.find(x => x.re.test(t));
    return g ? { group: g.group, fault: g.fault } : { group: '기타', fault: false };
  }
  return { group: '기타', fault: false };
}

const ORDER_SUMMARY_UNTIL = '2026-06';   // 이 달까지 주문은 order_monthly(요약)에만 있음

// 판매된 상품 수 (반품·교환율 분모): 취소 뺀 주문
//   상반기 = order_monthly (월·상품별 요약), 7월부터 = order_items (오클릭·사방넷, 품목 번호로 묶음)
async function loadNetOrders(brand, fromYm, toYm) {
  const [monthly, items] = await Promise.all([
    fetchAll(() => db.from('order_monthly').select('ym,platform,product_name,lines,cancels').eq('brand', brand).gte('ym', fromYm).lte('ym', toYm).order('id')),
    fetchAll(() => db.from('order_items').select('platform,order_date,status,claim_status,order_no,item_no,product_name').eq('brand', brand)
      .gte('order_date', `${fromYm}-01`).lte('order_date', toISODate(new Date(Number(toYm.slice(0, 4)), Number(toYm.slice(5)), 0))).order('id')),
  ]);
  const byMonth = {}, byProduct = {};
  const add = (ym, name, n) => { byMonth[ym] = (byMonth[ym] || 0) + n; const k = normProductName(name); if (k) byProduct[k] = (byProduct[k] || 0) + n; };
  // 6월까지 = 요약(판매처 파일), 7월부터 = 오클릭·사방넷. 오클릭에 섞인 6월 예약주문은 요약에 이미 들어 있어 제외
  monthly.forEach(r => { if (r.ym <= ORDER_SUMMARY_UNTIL) add(r.ym, r.product_name, Math.max(0, r.lines - r.cancels)); });
  const seen = new Set(), cancelled = new Set();
  items.forEach(r => { if (r.status === '취소') cancelled.add(`${r.platform}|${r.order_no}|${r.item_no}`); });
  items.forEach(r => {
    if (r.order_date.slice(0, 7) <= ORDER_SUMMARY_UNTIL) return;
    if (/취소|분실/.test(r.status || '') || (r.claim_status && /교환|회수/.test(r.claim_status))) return;
    const k = r.item_no ? `${r.platform}|${r.order_no}|${r.item_no}` : null;
    if (k && (seen.has(k) || cancelled.has(k))) return;
    if (k) seen.add(k);
    add(r.order_date.slice(0, 7), r.product_name, 1);
  });
  return { byMonth, byProduct };
}

function ReturnsPage() {
  const [brand, setBrand] = useState('핀카');
  const [rows, setRows] = useState(null);
  const [orders, setOrders] = useState(null);
  const [from, setFrom] = useState('2026-01');
  // 반품·교환 파일은 지금 상반기만 (7월 이후는 일부 판매처만 섞여 있음) → 기본 1~6월
  const [to, setTo] = useState('2026-06');
  const [platform, setPlatform] = useState('');
  const [faultOnly, setFaultOnly] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    setRows(null); setOrders(null);
    fetchAll(() => db.from('return_items').select('*').eq('brand', brand).order('id'))
      .then(r => { if (alive) setRows(r); }).catch(() => { if (alive) setRows([]); });
    loadNetOrders(brand, from, to).then(o => { if (alive) setOrders(o); }).catch(() => { if (alive) setOrders({ byMonth: {}, byProduct: {} }); });
    return () => { alive = false; };
  }, [brand, from, to]);

  const monthOf = (r) => (r.order_date || r.claim_date || '').slice(0, 7);
  const months = [];
  for (let d = parseDate(`${from}-01`); toISODate(d).slice(0, 7) <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(toISODate(d).slice(0, 7));
  const monthOpts = [];
  for (let d = new Date(2026, 0, 1); d <= new Date(); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) monthOpts.push(toISODate(d).slice(0, 7));

  const inPeriod = (rows || []).filter(r => { const m = monthOf(r); return m && m >= from && m <= to; });
  const platforms = [...new Set(inPeriod.map(r => r.platform))].sort();
  const view = inPeriod.filter(r => (!platform || r.platform === platform) && (!faultOnly || r.is_fault) && matchQuery(q, r.product_name, r.option_text, r.reason_raw, r.reason_detail));
  const ret = view.filter(r => r.kind === '반품').length, exc = view.filter(r => r.kind === '교환').length;
  const fault = view.filter(r => r.is_fault).length;
  const totalOrders = orders ? months.reduce((a, m) => a + (orders.byMonth[m] || 0), 0) : null;
  const ratio = (n, d) => (d ? `${(n / d * 100).toFixed(1)}%` : '-');

  // 상품별
  const prodMap = new Map();
  view.forEach(r => {
    const k = normProductName(r.product_name) || '(상품 확인 불가)';
    if (!prodMap.has(k)) prodMap.set(k, { name: r.product_name || '(상품 확인 불가)', category: r.category, ret: 0, exc: 0, fault: 0, reasons: {} });
    const p = prodMap.get(k);
    if (r.kind === '반품') p.ret++; else p.exc++;
    if (r.is_fault) p.fault++;
    p.reasons[r.reason_group] = (p.reasons[r.reason_group] || 0) + 1;
    p.key = k;
  });
  const products = [...prodMap.values()].sort((a, b) => (b.ret + b.exc) - (a.ret + a.exc)).slice(0, 30);

  return (
    <>
      <PageHeader title="반품·교환 분석" desc="상품별·사유별 반품·교환 · 반품·교환율 = 반품·교환 ÷ 판매 상품 수(취소 제외)">
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
      </PageHeader>
      <div className="filters">
        <select className="select" value={from} onChange={e => setFrom(e.target.value)}>{monthOpts.map(m => <option key={m} value={m}>{m.replace('-', '.')}부터</option>)}</select>
        <select className="select" value={to} onChange={e => setTo(e.target.value)}>{monthOpts.map(m => <option key={m} value={m}>{m.replace('-', '.')}까지</option>)}</select>
        <select className="select" value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="">판매처 전체</option>{platforms.map(p => <option key={p}>{p}</option>)}
        </select>
        <label className={`chip ${faultOnly ? 'chip-red' : ''}`} style={{ cursor: 'pointer', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={faultOnly} onChange={e => setFaultOnly(e.target.checked)} style={{ width: 'auto' }} /> 과실만
        </label>
        <input className="input" style={{ maxWidth: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="상품·사유 검색 (단어 일부)" />
      </div>

      {!rows ? <div className="empty">불러오는 중...</div> : !inPeriod.length ? (
        <div className="empty">이 기간에 반품·교환 데이터가 없어요. (지금은 2026년 1~6월만 들어 있어요)</div>
      ) : (
        <>
          <div className="grid grid-kpi">
            <div className="kpi"><div className="kpi-label">반품</div><div className="kpi-value">{ret.toLocaleString()}</div><div className="kpi-sub">건 (상품 기준)</div></div>
            <div className="kpi"><div className="kpi-label">교환</div><div className="kpi-value">{exc.toLocaleString()}</div><div className="kpi-sub">건</div></div>
            <div className="kpi"><div className="kpi-label">과실 (불량·파손·오배송·누락)</div><div className="kpi-value">{fault.toLocaleString()}</div><div className="kpi-sub">반품·교환 중 {ratio(fault, ret + exc)}</div></div>
            <div className="kpi"><div className="kpi-label">반품·교환율</div><div className="kpi-value">{platform || faultOnly || q ? '-' : ratio(ret + exc, totalOrders)}</div>
              <div className="kpi-sub">{platform || faultOnly || q ? '필터를 풀면 보여요' : totalOrders === null ? '판매 수 불러오는 중...' : `판매 ${totalOrders.toLocaleString()}개 기준`}</div></div>
          </div>

          <div className="grid grid-2w" style={{ marginTop: 16 }}>
            <div className="card">
              <div className="card-title">사유별 <small>빨강 = 과실</small></div>
              {RETURN_GROUP_ORDER.map(g => ({ g, n: view.filter(r => r.reason_group === g).length, fault: RETURN_REASON_GROUPS.some(x => x.group === g && x.fault) }))
                .filter(x => x.n).sort((a, b) => b.n - a.n).map(x => (
                  <div className="bar-row" key={x.g}>
                    <span className="bar-label">{x.g}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${x.n / view.length * 100}%`, background: x.fault ? 'var(--danger)' : 'var(--accent)' }} /></div>
                    <span className="bar-value">{x.n} <small className="muted">{ratio(x.n, view.length)}</small></span>
                  </div>
                ))}
            </div>
            <div className="card">
              <div className="card-title">판매처별</div>
              <Bars items={countBy(view, r => r.platform)} />
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, padding: 0 }}>
            <div className="card-title" style={{ padding: '18px 20px 4px' }}>월별 <small>주문일 기준 (주문일이 없으면 요청일)</small></div>
            <div className="table-wrap">
              <table className="table report-table">
                <thead><tr><th>월</th><th className="num">판매 상품 수</th><th className="num">반품</th><th className="num">교환</th><th className="num">반품·교환율</th><th className="num">과실</th><th className="num">과실률</th></tr></thead>
                <tbody>
                  {months.map(m => {
                    const rs = view.filter(r => monthOf(r) === m);
                    const o = orders ? orders.byMonth[m] || 0 : null;
                    const f = rs.filter(r => r.is_fault).length;
                    return (
                      <tr key={m}>
                        <td>{m.replace('-', '.')}</td>
                        <td className="num">{o === null ? '...' : o ? o.toLocaleString() : '-'}</td>
                        <td className="num">{rs.filter(r => r.kind === '반품').length.toLocaleString()}</td>
                        <td className="num">{rs.filter(r => r.kind === '교환').length.toLocaleString()}</td>
                        <td className="num">{platform || faultOnly || q ? '-' : ratio(rs.length, o)}</td>
                        <td className="num">{f.toLocaleString()}</td>
                        <td className="num">{platform || faultOnly || q ? '-' : ratio(f, o)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16, padding: 0 }}>
            <div className="card-title" style={{ padding: '18px 20px 4px' }}>반품·교환 많은 상품 <small>상위 30개 · 율 = 이 상품 반품·교환 ÷ 판매 수 · 상품명이 바뀐 적 있으면 판매 수가 적게 잡혀 율이 높게 나올 수 있어요</small></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>상품</th><th>대분류</th><th className="num">판매</th><th className="num">반품</th><th className="num">교환</th><th className="num">율</th><th className="num">과실</th><th>주요 사유</th></tr></thead>
                <tbody>
                  {products.map(p => {
                    const sold = orders && p.key ? orders.byProduct[p.key] || 0 : 0;
                    const top = Object.entries(p.reasons).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([g, n]) => `${g} ${n}`).join(' · ');
                    return (
                      <tr key={p.key || p.name}>
                        <td><div className="clamp-2" title={p.name}>{p.name}</div></td>
                        <td>{p.category || '-'}</td>
                        <td className="num">{sold ? sold.toLocaleString() : '-'}</td>
                        <td className="num">{p.ret}</td>
                        <td className="num">{p.exc}</td>
                        <td className="num">{sold ? ratio(p.ret + p.exc, sold) : '-'}</td>
                        <td className="num">{p.fault ? <b style={{ color: 'var(--danger)' }}>{p.fault}</b> : 0}</td>
                        <td className="muted">{top}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

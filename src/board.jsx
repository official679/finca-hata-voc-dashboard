// 게시판 업로드 · 게시판 분석

// 문의 유형 자동 분류 (위에서부터 먼저 맞는 유형). 담당자가 화면에서 직접 바꿀 수 있음
const BOARD_TYPES = [
  ['재입고', /재입고|재 입고|입고\s*(예정|계획|일정|되나|될까|언제|문의)|언제\s*입고|재생산|리오더|다시\s*(판매|입고|나오|들어)|품절.*(언제|예정|다시)|restock/i],
  ['불량/하자', /불량|하자|구멍|오염|얼룩|이염|뜯어|찢어|끊어|파손|박음질|실밥|누락|깨져|깨졌/],
  ['교환/반품', /교환|반품|환불|회수/],
  ['취소/변경', /취소|주소\s*변경|옵션\s*변경|변경\s*(가능|하고|부탁|요청)/],
  ['배송', /배송|출고|발송|송장|운송장|도착|언제\s*(받|오|와)|택배|못\s*받|받지\s*못|안\s*와|안\s*오/],
  ['사이즈/상품정보', /사이즈|크기|치수|길이|무게|재질|소재|두께|세탁|색상|컬러|구성|실측|착용|호수/],
];
const BOARD_TYPE_NAMES = [...BOARD_TYPES.map(t => t[0]), '기타'];
const classifyBoard = (text) => (BOARD_TYPES.find(([, re]) => re.test(text || '')) || ['기타'])[0];

function BoardUploadPage() {
  const [count, setCount] = useState(null);
  const refresh = () => db.from('board_items').select('id', { count: 'exact', head: true }).then(({ count }) => setCount(count));
  useEffect(() => { refresh(); }, []);
  return (
    <>
      <PageHeader title="게시판 업로드" desc={`플랫폼 게시판 문의 파일을 그대로 올리세요. 지금까지 저장된 문의 ${count === null ? '...' : count.toLocaleString()}건`} />
      <UploadPanel
        kind="board"
        table="board_items"
        guide="29CM · 무신사 · 아임웹 · 카페24 게시판 다운로드 파일을 알아봐요. 올리면 재입고·배송·교환/반품 등 문의 유형이 자동으로 분류돼요. 작성자 이름·아이디는 저장하지 않아요."
        toRow={(r) => ({
          product_name: str(r.product_name), option_text: str(r.option_text), platform_category: str(r.platform_category),
          title: str(r.title), content: str(r.content), written_at: r.when ? r.when.iso : null,
          answer: str(r.answer), answered_at: r.answered ? r.answered.iso : null,
          inquiry_type: classifyBoard(`${r.platform_category || ''} ${r.title || ''} ${r.content || ''}`),
        })}
        onDone={refresh}
      />
    </>
  );
}

function useBoard() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    fetchAll(() => db.from('board_items').select('id,brand,platform,product_name,product_id,option_text,title,content,written_at,answer,inquiry_type,note').order('written_at', { ascending: false }))
      .then(setRows).catch(() => setRows([]));
  }, []);
  return [rows, setRows];
}

// 재입고 문의가 많은 상품 (후속 조치 보드에서도 사용)
function restockRanking(rows, productById, since) {
  const m = new Map();
  rows.filter(r => r.inquiry_type === '재입고' && (!since || (r.written_at || '') >= since)).forEach(r => {
    const name = (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name || '(상품 미지정)';
    const e = m.get(name) || { name, brand: r.brand, count: 0, options: new Map(), latest: '' };
    e.count++;
    if (r.option_text) e.options.set(r.option_text, (e.options.get(r.option_text) || 0) + 1);
    if ((r.written_at || '') > e.latest) e.latest = r.written_at;
    m.set(name, e);
  });
  return [...m.values()].sort((a, b) => b.count - a.count);
}

function BoardAnalysisPage() {
  const [rows, setRows] = useBoard();
  const { productById } = useApp();
  const toast = useToast();
  const [brand, setBrand] = useState('');
  const [platform, setPlatform] = useState('');
  const [period, setPeriod] = useState('3');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [product, setProduct] = useState('');

  const [from, to] = reviewPeriodStart(period);
  const scoped = useMemo(() => (rows || []).filter(r =>
    (!brand || r.brand === brand) && (!platform || r.platform === platform) &&
    r.written_at && r.written_at.slice(0, 10) >= from && r.written_at.slice(0, 10) <= to), [rows, brand, platform, from, to]);

  if (!rows) return <div className="loading-screen">게시판 문의 불러오는 중...</div>;
  if (!rows.length) return <><PageHeader title="게시판 분석" /><div className="card empty">아직 올린 게시판 문의가 없어요. <a href="#/upload-board">게시판 업로드</a>에서 파일을 올려주세요.</div></>;

  const types = BOARD_TYPE_NAMES.map(t => ({ label: t, count: scoped.filter(r => r.inquiry_type === t).length })).filter(t => t.count).sort((a, b) => b.count - a.count);
  const restock = scoped.filter(r => r.inquiry_type === '재입고');
  const ranking = restockRanking(scoped, productById).slice(0, 15);
  const platforms = [...new Set(rows.map(r => r.platform))].sort();

  const months = [...new Set(scoped.map(r => r.written_at.slice(0, 7)))].sort().slice(-12);
  const monthly = months.map(m => { const rs = scoped.filter(r => r.written_at.startsWith(m)); return { m, total: rs.length, restock: rs.filter(r => r.inquiry_type === '재입고').length }; });
  const monthMax = Math.max(1, ...monthly.map(x => x.total));

  const query = q.trim().toLowerCase();
  const list = scoped.filter(r => (!type || r.inquiry_type === type) && (!product || ((r.product_id && productById.get(r.product_id)?.product_name) || r.product_name || '(상품 미지정)') === product) &&
    (!query || [r.product_name, r.title, r.content].some(v => (v || '').toLowerCase().includes(query)))).slice(0, 100);

  const setInquiryType = async (id, t) => {
    const { error } = await db.from('board_items').update({ inquiry_type: t }).eq('id', id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, inquiry_type: t } : r));
    toast('✅ 유형을 바꿨어요');
  };

  return (
    <>
      <PageHeader title="게시판 분석" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~`} · 작성일 기준`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
        <Select value={platform} onChange={setPlatform} options={platforms} placeholder="플랫폼 전체" />
        <Segmented options={REVIEW_PERIODS} value={period} onChange={setPeriod} />
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="게시판 문의" value={scoped.length.toLocaleString()} sub="건" />
        <Kpi label="재입고 문의" value={restock.length.toLocaleString()} sub={`전체의 ${pct(restock.length, scoped.length)}`} alert={restock.length > 0} />
        <Kpi label="재입고 문의 상품 수" value={restockRanking(scoped, productById).length} sub="상품" />
        {types.filter(t => t.label !== '재입고').slice(0, 2).map(t => <Kpi key={t.label} label={`${t.label} 문의`} value={t.count.toLocaleString()} sub={`전체의 ${pct(t.count, scoped.length)}`} />)}
      </div>

      <div className="grid grid-2w">
        <div className="card">
          <div className="card-title">문의 유형 <small>누르면 해당 문의를 볼 수 있어요</small></div>
          <ThemeBars items={types} total={scoped.length} color="var(--accent)" onPick={t => { setType(t); setProduct(''); }} />
        </div>
        <div className="card">
          <div className="card-title">월별 문의 <small>진한 색 = 재입고 문의</small></div>
          <div className="columns">
            {monthly.map(x => (
              <div className="column" key={x.m} title={`${x.m} 전체 ${x.total}건 / 재입고 ${x.restock}건`}>
                <div className="column-value">{x.total}</div>
                <div style={{ width: '100%', maxWidth: 36, height: `${(x.total / monthMax) * 100}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 2 }}>
                  <div style={{ flex: x.total - x.restock, background: '#BFD3F6', borderRadius: '4px 4px 0 0' }} />
                  <div style={{ flex: x.restock, background: 'var(--warn)' }} />
                </div>
                <div className="column-label">{Number(x.m.slice(5))}월</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div className="card-title" style={{ padding: '18px 20px 0' }}>🔁 재입고 문의가 많은 상품 <small>리오더 검토용 · 누르면 문의를 볼 수 있어요</small></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>#</th><th>상품명</th><th>브랜드</th><th className="num">재입고 문의</th><th>많이 찾는 옵션</th><th>최근 문의</th></tr></thead>
            <tbody>
              {ranking.map((p, i) => (
                <tr key={p.name} className="clickable" onClick={() => { setProduct(p.name); setType('재입고'); }}>
                  <td className="muted">{i + 1}</td>
                  <td className="ellipsis" title={p.name}>{p.name}</td>
                  <td>{p.brand}</td>
                  <td className="num"><b>{p.count}</b></td>
                  <td>{[...p.options.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, n]) => <span key={o} className="chip" style={{ marginRight: 4 }}>{o} {n}</span>)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(p.latest.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ranking.length === 0 && <div className="empty">재입고 문의가 없어요</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <span>문의 목록 <small>{list.length >= 100 ? '최근 100건' : `${list.length}건`}{product ? ` · ${product}` : ''} · 유형이 틀리면 바로 바꿀 수 있어요</small></span>
          <span className="filters">
            <Select value={type} onChange={v => { setType(v); }} options={BOARD_TYPE_NAMES} placeholder="유형 전체" />
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="상품명·내용 검색" />
            {(type || product || q) && <button className="btn-link" onClick={() => { setType(''); setProduct(''); setQ(''); }}>초기화</button>}
          </span>
        </div>
        {list.length === 0 ? <div className="empty">해당하는 문의가 없어요</div> : list.map(r => (
          <div className="review-card" key={r.id}>
            <div className="review-head">
              <Select value={r.inquiry_type || '기타'} onChange={t => setInquiryType(r.id, t)} options={BOARD_TYPE_NAMES} />
              <span className="chip">{r.platform}</span>
              <span className="muted">{fmtDate((r.written_at || '').slice(0, 10))}</span>
              <span className="review-product" title={r.product_name || ''}>{r.product_name || r.title || ''}</span>
              {r.option_text && <span className="chip">{r.option_text}</span>}
            </div>
            <div className="review-body">{r.title && r.title !== r.product_name ? <b>{r.title} · </b> : null}{r.content}</div>
            {r.answer && <div className="hint" style={{ marginTop: 6 }}>↳ 답변: {r.answer.slice(0, 160)}{r.answer.length > 160 ? '…' : ''}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

// 리뷰 업로드 · 리뷰 분석

// 리뷰에서 자주 나오는 이야기 (정규식으로 찾음). 긍정·부정 리뷰 각각에서 몇 건씩 나오는지 셈
const REVIEW_THEMES = [
  ['색감·색상', /색감|색상|컬러|색이|색깔|색도/],
  ['디자인·예쁨', /예뻐|예쁘|예쁜|이뻐|이쁘|이쁜|디자인|귀여/],
  ['촉감·부드러움', /부드럽|촉감|보들|감촉|매끈|까슬|거칠/],
  ['두께·무게', /두께|두껍|두꺼|얇|무게|가볍|가벼|묵직/],
  ['사이즈·핏', /사이즈|크기|핏이|작아|작네|커요|크네|넉넉|길이|짧/],
  ['시원함', /시원|냉감|쿨링/],
  ['따뜻함', /따뜻|따듯|보온/],
  ['품질·재질', /품질|퀄리티|재질|소재|원단|마감이 좋/],
  ['구김', /구김|구겨/],
  ['보풀·먼지·털', /보풀|먼지|털빠|털 빠|털날|털이/],
  ['이염·얼룩·물빠짐', /이염|물빠|물 빠|색빠|번짐|얼룩|오염/],
  ['봉제·박음질', /봉제|박음질|실밥|뜯어|터졌|터짐|올이|올 나/],
  ['냄새', /냄새|악취/],
  ['세탁', /세탁|빨래|건조기/],
  ['흡수력', /흡수/],
  ['상세페이지와 다름', /상세|사진이랑|사진과|사진보다|화면이랑|화면과|실물/],
  ['배송', /배송|도착|늦게 와|빨리 와|빠르게 와/],
  ['포장·선물', /포장|박스|패키지|선물/],
  ['가격·가성비', /가격|가성비|비싸|저렴|할인/],
  ['재구매·추천', /재구매|또 ?살|또 ?구매|추천|쟁여|깔별/],
];
const reviewThemes = (text) => REVIEW_THEMES.filter(([, re]) => re.test(text || '')).map(([name]) => name);

function useReviews() {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    setRows(await fetchAll(() => db.from('review_items').select('id,brand,platform,product_name,product_id,rating,content,written_at,note,handled').order('written_at', { ascending: false })));
  }, []);
  useEffect(() => { load(); }, [load]);
  return [rows, setRows, load];
}

function ReviewUploadPage() {
  const [count, setCount] = useState(null);
  const refresh = () => db.from('review_items').select('id', { count: 'exact', head: true }).then(({ count }) => setCount(count));
  useEffect(() => { refresh(); }, []);
  return (
    <>
      <PageHeader title="리뷰 업로드" desc={`플랫폼에서 받은 리뷰 파일을 그대로 올리세요. 지금까지 저장된 리뷰 ${count === null ? '...' : count.toLocaleString()}건`} />
      <UploadPanel
        kind="review"
        table="review_items"
        guide="29CM · 아임웹 · 무신사 리뷰 다운로드 파일과 기존 시트의 '리뷰 low' 형식을 알아봐요. 같은 리뷰를 다시 올려도 중복으로 저장되지 않아요. 고객 이름·아이디는 저장하지 않아요."
        toRow={(r) => ({ product_name: str(r.product_name), rating: r.rating, content: str(r.content), written_at: r.when ? r.when.iso : null, order_no: str(r.order_no) })}
        onDone={refresh}
      />
    </>
  );
}

const REVIEW_PERIODS = [
  { key: '1', label: '이번 달' }, { key: '-1', label: '지난 달' }, { key: '3', label: '최근 3개월' }, { key: '6', label: '최근 6개월' }, { key: 'all', label: '전체' },
];
function reviewPeriodStart(key) {
  const now = new Date();
  if (key === 'all') return ['2000-01-01', '2999-12-31'];
  if (key === '-1') return [toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toISODate(new Date(now.getFullYear(), now.getMonth(), 0))];
  return [toISODate(new Date(now.getFullYear(), now.getMonth() - (Number(key) - 1), 1)), '2999-12-31'];
}

function loadNegMax() { try { return Number(localStorage.getItem('reviewNegMax')) || 3; } catch { return 3; } }

function ReviewAnalysisPage() {
  const [reviews, setReviews] = useReviews();
  const { productById } = useApp();
  const toast = useToast();
  const [brand, setBrand] = useState('');
  const [platform, setPlatform] = useState('');
  const [period, setPeriod] = useState('3');
  const [negMax, setNegMax] = useState(loadNegMax);
  const [theme, setTheme] = useState(null);     // { name, side }
  const [product, setProduct] = useState('');
  const [listMode, setListMode] = useState('unhandled');

  useEffect(() => { try { localStorage.setItem('reviewNegMax', String(negMax)); } catch {} }, [negMax]);

  const [from, to] = reviewPeriodStart(period);
  const scoped = useMemo(() => (reviews || []).filter(r =>
    (!brand || r.brand === brand) && (!platform || r.platform === platform) &&
    r.written_at && r.written_at.slice(0, 10) >= from && r.written_at.slice(0, 10) <= to), [reviews, brand, platform, from, to]);
  const isNeg = (r) => r.rating !== null && r.rating <= negMax;
  const enriched = useMemo(() => scoped.map(r => ({ ...r, neg: isNeg(r), themes: reviewThemes(r.content), name: (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name || '(상품명 없음)' })), [scoped, negMax, productById]);

  if (!reviews) return <div className="loading-screen">리뷰 불러오는 중...</div>;
  if (!reviews.length) return <><PageHeader title="리뷰 분석" /><div className="card empty">아직 올린 리뷰가 없어요. <a href="#/upload-reviews">리뷰 업로드</a>에서 파일을 올려주세요.</div></>;

  const neg = enriched.filter(r => r.neg);
  const pos = enriched.filter(r => !r.neg);
  const avg = enriched.length ? (enriched.reduce((a, r) => a + (r.rating || 0), 0) / enriched.filter(r => r.rating).length).toFixed(2) : '-';
  const themeCount = (rows) => REVIEW_THEMES.map(([name]) => ({ label: name, count: rows.filter(r => r.themes.includes(name)).length })).filter(t => t.count).sort((a, b) => b.count - a.count);
  const platforms = [...new Set(reviews.map(r => r.platform))].sort();

  // 월별 추이 (최근 12개월)
  const months = [...new Set(enriched.map(r => r.written_at.slice(0, 7)))].sort().slice(-12);
  const monthly = months.map(m => { const rows = enriched.filter(r => r.written_at.startsWith(m)); return { m, total: rows.length, neg: rows.filter(r => r.neg).length }; });
  const monthMax = Math.max(1, ...monthly.map(x => x.total));

  // 상품별
  const byProduct = [...enriched.reduce((m, r) => { const e = m.get(r.name) || { name: r.name, brand: r.brand, rows: [] }; e.rows.push(r); m.set(r.name, e); return m; }, new Map()).values()]
    .map(e => ({ ...e, count: e.rows.length, neg: e.rows.filter(r => r.neg).length, avg: e.rows.reduce((a, r) => a + (r.rating || 0), 0) / e.rows.length, negThemes: themeCount(e.rows.filter(r => r.neg)).slice(0, 3) }))
    .filter(e => e.neg > 0).sort((a, b) => b.neg - a.neg || a.avg - b.avg).slice(0, 15);

  const listRows = (theme ? enriched.filter(r => r.themes.includes(theme.name) && (theme.side === 'neg' ? r.neg : !r.neg))
    : product ? enriched.filter(r => r.name === product && r.neg)
    : neg.filter(r => listMode === 'all' || !r.handled)).slice(0, 100);

  const updateReview = async (id, patch) => {
    const { error } = await db.from('review_items').update(patch).eq('id', id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  return (
    <>
      <PageHeader title="리뷰 분석" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~`} · 작성일 기준 · 부정 = ${negMax}점 이하`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
        <Select value={platform} onChange={setPlatform} options={platforms} placeholder="플랫폼 전체" />
        <Segmented options={REVIEW_PERIODS} value={period} onChange={setPeriod} />
        <Select value={String(negMax)} onChange={v => setNegMax(Number(v))} options={[{ value: '3', label: '부정: 3점 이하' }, { value: '2', label: '부정: 2점 이하' }]} />
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="리뷰 수" value={enriched.length.toLocaleString()} sub="건" />
        <Kpi label="평균 별점" value={avg} sub="5점 만점" />
        <Kpi label="긍정 비중" value={pct(pos.length, enriched.length)} sub={`${pos.length.toLocaleString()}건 · ${negMax + 1}~5점`} />
        <Kpi label="부정 비중" value={pct(neg.length, enriched.length)} sub={`${neg.length.toLocaleString()}건 · 1~${negMax}점`} alert={neg.length > 0} />
        <Kpi label="처리 안 된 부정 리뷰" value={neg.filter(r => !r.handled).length} sub="아래 목록에서 처리" alert={neg.some(r => !r.handled)} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">월별 리뷰 <small>진한 색 = 부정 리뷰</small></div>
          <div className="columns">
            {monthly.map(x => (
              <div className="column" key={x.m} title={`${x.m} 전체 ${x.total}건 / 부정 ${x.neg}건 (${pct(x.neg, x.total)})`}>
                <div className="column-value">{pct(x.neg, x.total)}</div>
                <div style={{ width: '100%', maxWidth: 36, height: `${(x.total / monthMax) * 100}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 2 }}>
                  <div style={{ flex: x.total - x.neg, background: '#BFD3F6', borderRadius: '4px 4px 0 0' }} />
                  <div style={{ flex: x.neg, background: 'var(--danger)', minHeight: x.neg ? 2 : 0 }} />
                </div>
                <div className="column-label">{Number(x.m.slice(5))}월</div>
              </div>
            ))}
          </div>
          <div className="hint">막대 위 숫자 = 그 달의 부정 비중</div>
        </div>
        <div className="card">
          <div className="card-title">별점 분포</div>
          <Bars items={[5, 4, 3, 2, 1].map(n => ({ label: `${'★'.repeat(n)} ${n}점`, count: enriched.filter(r => r.rating === n).length }))} />
        </div>
      </div>

      <div className="grid grid-2w" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title">👍 긍정 리뷰에서 많이 나온 이야기 <small>누르면 리뷰를 볼 수 있어요</small></div>
          <ThemeBars items={themeCount(pos).slice(0, 10)} total={pos.length} color="var(--accent)" onPick={name => { setTheme({ name, side: 'pos' }); setProduct(''); }} />
        </div>
        <div className="card">
          <div className="card-title">👎 부정 리뷰에서 많이 나온 이야기 <small>누르면 리뷰를 볼 수 있어요</small></div>
          <ThemeBars items={themeCount(neg).slice(0, 10)} total={neg.length} color="var(--danger)" onPick={name => { setTheme({ name, side: 'neg' }); setProduct(''); }} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div className="card-title" style={{ padding: '18px 20px 0' }}>부정 리뷰가 많은 상품 <small>누르면 해당 상품의 부정 리뷰를 볼 수 있어요</small></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>상품명</th><th>브랜드</th><th className="num">리뷰</th><th className="num">부정</th><th className="num">부정 비중</th><th className="num">평균 별점</th><th>부정 리뷰 주요 이야기</th></tr></thead>
            <tbody>
              {byProduct.map(p => (
                <tr key={p.name} className="clickable" onClick={() => { setProduct(p.name); setTheme(null); }}>
                  <td className="ellipsis" title={p.name}>{p.name}</td>
                  <td>{p.brand}</td>
                  <td className="num">{p.count}</td>
                  <td className="num"><b>{p.neg}</b></td>
                  <td className="num">{pct(p.neg, p.count)}</td>
                  <td className="num">{p.avg.toFixed(1)}</td>
                  <td>{p.negThemes.map(t => <span key={t.label} className="chip chip-red" style={{ marginRight: 4 }}>{t.label} {t.count}</span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {byProduct.length === 0 && <div className="empty">부정 리뷰가 없어요</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">
          <span>
            {theme ? `${theme.side === 'neg' ? '👎 부정' : '👍 긍정'} 리뷰 · "${theme.name}"` : product ? `부정 리뷰 · ${product}` : '부정 리뷰 관리'}
            <small> {listRows.length >= 100 ? '최근 100건' : `${listRows.length}건`}</small>
          </span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(theme || product) ? <button className="btn btn-sm" onClick={() => { setTheme(null); setProduct(''); }}>← 부정 리뷰 관리로</button>
              : <Segmented options={[{ key: 'unhandled', label: '처리 안 됨' }, { key: 'all', label: '전체' }]} value={listMode} onChange={setListMode} />}
          </span>
        </div>
        {listRows.length === 0 ? <div className="empty">해당하는 리뷰가 없어요</div> : listRows.map(r => (
          <ReviewCard key={r.id} r={r} onUpdate={updateReview} />
        ))}
      </div>
    </>
  );
}

function ThemeBars({ items, total, color, onPick }) {
  if (!items.length) return <div className="empty">데이터가 없습니다</div>;
  const top = Math.max(...items.map(i => i.count));
  return (
    <div className="bars">
      {items.map(i => (
        <div className="bar-row clickable-bar" key={i.label} onClick={() => onPick(i.label)} title={`${i.label}: ${i.count}건 (${pct(i.count, total)})`}>
          <span className="bar-label">{i.label}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.count / top) * 100}%`, background: color }} /></div>
          <span className="bar-value">{i.count}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewCard({ r, onUpdate }) {
  const [note, setNote] = useState(r.note || '');
  const [editing, setEditing] = useState(false);
  return (
    <div className={`review-card${r.neg ? ' neg' : ''}`}>
      <div className="review-head">
        <span className="stars">{'★'.repeat(r.rating || 0)}<span className="muted">{'★'.repeat(5 - (r.rating || 0))}</span></span>
        <span className="chip">{r.platform}</span>
        <span className="muted">{fmtDate(r.written_at.slice(0, 10))}</span>
        <span className="review-product" title={r.name}>{r.name}</span>
        {r.neg && (
          <label className="handled">
            <input type="checkbox" checked={r.handled} onChange={e => onUpdate(r.id, { handled: e.target.checked })} /> 처리 완료
          </label>
        )}
      </div>
      <div className="review-body">{r.content}</div>
      <div className="review-foot">
        {r.themes.map(t => <span key={t} className="chip">{t}</span>)}
        {r.neg && !editing && <button className="btn-link" onClick={() => setEditing(true)}>{r.note ? `처리 내용: ${r.note}` : '+ 처리 내용 입력'}</button>}
        {editing && (
          <span style={{ display: 'flex', gap: 6, flex: 1 }}>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="예: 상품팀 전달, 교환 안내 완료" autoFocus />
            <button className="btn btn-sm btn-primary" onClick={async () => { await onUpdate(r.id, { note: note.trim() || null }); setEditing(false); }}>저장</button>
            <button className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
          </span>
        )}
      </div>
    </div>
  );
}

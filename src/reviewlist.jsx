// 리뷰 목록: 올린 리뷰 전체를 조회·정렬·검색하고, 직원이 긍정/부정/체크필요로 표시 → 부정·체크필요는 VOC로 보냄
// (리뷰는 업로드할 때 이미 저장돼 있어서 이 화면이 저장 공간을 더 쓰지 않음. 고른 기간만 불러옴)

const REVIEW_CHECKS = [
  { key: '긍정', icon: '👍', cls: 'chip-green' },
  { key: '부정', icon: '👎', cls: 'chip-red' },
  { key: '체크필요', icon: '⚠️', cls: 'chip-amber' },
];
const REVIEW_SORTS = [
  { value: 'date', label: '최신순' }, { value: 'rating_asc', label: '별점 낮은순' }, { value: 'rating_desc', label: '별점 높은순' },
  { value: 'product', label: '상품명순' }, { value: 'platform', label: '플랫폼순' },
];

// 리뷰 분석 화면에서 조건을 넘겨 목록 열기
function openReviewList(params) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  location.hash = `/review-list?${q.toString()}`;
}

function ReviewListPage() {
  const { productById, products, cases, setCases } = useApp();
  const toast = useToast();
  const init = useMemo(() => new URLSearchParams(location.hash.split('?')[1] || ''), []);
  const [brand, setBrand] = useState(init.get('brand') || '핀카');
  const [period, setPeriod] = useState(init.get('period') || '1');
  const [platform, setPlatform] = useState('');
  const [stars, setStars] = useState(init.get('stars') || '');
  const [check, setCheck] = useState(init.get('check') || '');
  const [theme, setTheme] = useState(init.get('theme') || '');
  const [product, setProduct] = useState(init.get('product') || '');
  const [q, setQ] = useState(init.get('q') || '');
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [SIZE, setSize] = usePageSize('reviews', 15);
  // 한국 시간 0시부터 (오늘·전일처럼 하루 단위로 볼 때 새벽 리뷰가 빠지지 않게)
  const [reviews, setReviews] = useSince('review_items', '*', period === 'all' ? null : `${reviewPeriodStart(period)[0]}T00:00:00+09:00`);
  const negMax = loadNegMax();

  const nameOf = (r) => (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name || '(상품명 없음)';
  // 예전에 자동 등록된 VOC도 알아보기 ('[리뷰 ★점수] 내용'이 같은 VOC)
  const vocKeys = useMemo(() => new Map(cases.filter(c => c.consult_method === '리뷰').map(c => [c.reason_detail, c.id])), [cases]);
  const vocOf = (r) => r.voc_case_id || vocKeys.get(reviewVocKey(r)) || null;

  const [from, to] = reviewPeriodStart(period);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = (reviews || []).filter(r => r.brand === brand && r.written_at && toISODate(new Date(r.written_at)) >= from && toISODate(new Date(r.written_at)) <= to &&
      (!platform || r.platform === platform) &&
      (!stars || (stars === 'neg' ? r.rating !== null && r.rating <= negMax : stars === 'pos' ? r.rating > negMax : r.rating === Number(stars))) &&
      (!check || (check === '미확인' ? !r.check_status : r.check_status === check)) &&
      (!theme || reviewThemes(r.content, true).includes(theme) || reviewThemes(r.content, false).includes(theme)) &&
      (!product || nameOf(r) === product) &&
      matchQuery(t, nameOf(r), r.content, r.order_no));
    const by = {
      date: (a, b) => String(b.written_at).localeCompare(String(a.written_at)),
      rating_asc: (a, b) => (a.rating ?? 9) - (b.rating ?? 9) || String(b.written_at).localeCompare(String(a.written_at)),
      rating_desc: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || String(b.written_at).localeCompare(String(a.written_at)),
      product: (a, b) => nameOf(a).localeCompare(nameOf(b), 'ko') || String(b.written_at).localeCompare(String(a.written_at)),
      platform: (a, b) => String(a.platform).localeCompare(String(b.platform), 'ko') || String(b.written_at).localeCompare(String(a.written_at)),
    };
    return list.sort(by[sort]);
  }, [reviews, brand, from, to, platform, stars, check, theme, product, q, sort, productById, negMax]);
  useEffect(() => { setPage(1); }, [brand, period, platform, stars, check, theme, product, q, sort]);

  if (!reviews) return <div className="loading-screen">리뷰 불러오는 중...</div>;
  const platforms = [...new Set(reviews.map(r => r.platform))].sort();
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)), cur = Math.min(page, pages);
  const counts = Object.fromEntries(REVIEW_CHECKS.map(c => [c.key, rows.filter(r => r.check_status === c.key).length]));

  const setStatus = async (r, key) => {
    const next = r.check_status === key ? null : key;
    const { error } = await db.from('review_items').update({ check_status: next }).eq('id', r.id);
    if (error) { toast('❌ 저장 실패: ' + (/check_status/.test(error.message) ? 'DB 설정 SQL(12_review_check.sql)을 먼저 실행해 주세요' : error.message), 'err'); return; }
    setReviews(prev => prev.map(x => (x.id === r.id ? { ...x, check_status: next } : x)));
  };
  const toVoc = async (r) => {
    if (!confirm(`이 리뷰를 VOC로 접수할까요?\n${nameOf(r)} · ★${r.rating}`)) return;
    const pid = r.product_id || findReviewProductId(r.product_name, r.brand, products);
    const { data, error } = await db.from('voc_cases').insert(reviewToVocRow({ ...r, product_id: pid, product_name: pid ? productById.get(pid)?.product_name || nameOf(r) : nameOf(r) }, '리뷰 목록에서 등록')).select().single();
    if (error) { toast('❌ VOC 등록 실패: ' + error.message, 'err'); return; }
    setCases(prev => [data, ...prev]);
    const patch = { voc_case_id: data.id, ...(r.check_status ? {} : { check_status: r.rating > negMax ? '체크필요' : '부정' }) };
    const { error: e2 } = await db.from('review_items').update(patch).eq('id', r.id);
    setReviews(prev => prev.map(x => (x.id === r.id ? { ...x, ...(e2 ? {} : patch) } : x)));
    toast(pid ? <>✅ VOC로 접수했어요 · <a href="#/voc-list">VOC 목록</a>에서 사진·처리 내용을 채워주세요</> : <>✅ VOC로 접수했어요 · 상품 마스터에서 상품을 못 찾아서 <a href="#/voc-list">VOC 목록</a>에서 대분류·중분류를 직접 골라주세요</>);
  };

  // VOC로 보낸 것 되돌리기: 연결된 VOC 접수를 지우고 리뷰의 연결을 풂
  const undoVoc = async (r, vocId) => {
    const c = cases.find(x => x.id === vocId);
    const touched = c && ((c.photos || []).length || (c.status && c.status !== '접수'));
    if (!confirm(`이 리뷰로 만든 VOC 접수를 삭제할까요?${touched ? '\n⚠️ 이 VOC에는 사진이나 처리 상태가 이미 입력돼 있어요. 같이 지워져요.' : ''}\n되돌릴 수 없어요.`)) return;
    const { error } = await db.from('voc_cases').delete().eq('id', vocId);
    if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
    if (c && c.photos && c.photos.length) await db.storage.from(PHOTO_BUCKET).remove(c.photos);
    setCases(prev => prev.filter(x => x.id !== vocId));
    if (r.voc_case_id) await db.from('review_items').update({ voc_case_id: null }).eq('id', r.id);
    setReviews(prev => prev.map(x => (x.id === r.id ? { ...x, voc_case_id: null } : x)));
    toast('✅ VOC 접수를 삭제했어요');
  };

  const hasFilter = platform || stars || check || theme || product || q;
  return (
    <>
      <PageHeader title="리뷰 목록" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~`} · ${rows.length.toLocaleString()}건 · 부정·체크필요로 표시하면 VOC로 보낼 수 있어요`}>
        <Segmented options={BRAND_ONLY} value={brand} onChange={setBrand} />
        <Segmented options={REVIEW_LIST_PERIODS} value={period} onChange={setPeriod} />
      </PageHeader>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="filters">
          <Select value={platform} onChange={setPlatform} options={platforms} placeholder="플랫폼 전체" />
          <Select value={stars} onChange={setStars} options={[{ value: 'neg', label: `부정 (1~${negMax}점)` }, { value: 'pos', label: `긍정 (${negMax + 1}~5점)` }, ...[5, 4, 3, 2, 1].map(n => ({ value: String(n), label: `★${n}점` }))]} placeholder="별점 전체" />
          <Select value={check} onChange={setCheck} options={['미확인', ...REVIEW_CHECKS.map(c => c.key)]} placeholder="체크 전체" />
          <Select value={sort} onChange={setSort} options={REVIEW_SORTS} />
          <input className="input" style={{ minWidth: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="상품명·리뷰 내용·주문번호 검색" />
          {theme && <span className="chip chip-blue">주제: {theme} <button className="btn-link" onClick={() => setTheme('')}>✕</button></span>}
          {product && <span className="chip chip-blue">상품: {product} <button className="btn-link" onClick={() => setProduct('')}>✕</button></span>}
          {hasFilter && <button className="btn-link" onClick={() => { setPlatform(''); setStars(''); setCheck(''); setTheme(''); setProduct(''); setQ(''); }}>필터 초기화</button>}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>이 조건에서 체크한 리뷰: {REVIEW_CHECKS.map(c => `${c.icon} ${c.key} ${counts[c.key]}`).join(' · ')}</div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table review-table">
            <thead><tr><th>작성일</th><th>플랫폼</th><th>상품명</th><th>별점</th><th>리뷰 내용</th><th>체크</th><th>VOC</th></tr></thead>
            <tbody>
              {rows.slice((cur - 1) * SIZE, cur * SIZE).map(r => {
                const voc = vocOf(r);
                const needVoc = r.check_status === '부정' || r.check_status === '체크필요';
                return (
                  <tr key={r.id} className={r.rating !== null && r.rating <= negMax ? 'review-neg' : ''}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.written_at.slice(0, 10))}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{r.platform}</td>
                    <td style={{ minWidth: 180, maxWidth: 260 }}>{nameOf(r)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><span className="stars">{'★'.repeat(r.rating || 0)}<span className="muted">{'★'.repeat(5 - (r.rating || 0))}</span></span><span className="stars-num">{r.rating ?? '-'}점</span></td>
                    <td className={`review-text${openId === r.id ? ' open' : ''}`} onClick={() => setOpenId(openId === r.id ? null : r.id)} title="누르면 전체 내용"><div className="review-clamp">{r.content || <span className="muted">(내용 없음)</span>}</div></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {REVIEW_CHECKS.map(c => (
                        <button key={c.key} className={`chip check-btn ${r.check_status === c.key ? c.cls + ' on' : ''}`} onClick={() => setStatus(r, c.key)} title={c.key}>{c.icon} {c.key}</button>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {voc ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <a className="chip chip-green" href="#/voc-list">✓ VOC 등록됨</a>
                          <button className="btn-link" style={{ fontSize: 12, color: 'var(--danger)' }} title="VOC 접수를 지워요" onClick={() => undoVoc(r, voc)}>취소</button>
                        </span>
                        : needVoc ? <button className="btn btn-sm btn-primary" onClick={() => toVoc(r)}>→ VOC로</button>
                        : <span className="muted">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="empty">조건에 맞는 리뷰가 없어요</div>}
        </div>
        <div style={{ padding: '0 16px 16px' }}><Pager page={cur} pages={pages} onChange={setPage} size={SIZE} onSize={setSize} /></div>
      </div>
    </>
  );
}

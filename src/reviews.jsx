// 리뷰 업로드 · 리뷰 분석

// 리뷰에서 자주 나오는 이야기 (정규식으로 찾음)
// 긍정 리뷰에는 '좋았던 점', 부정 리뷰에는 '불만 사항' 목록을 따로 적용
// (같은 주제어라도 "예뻐요"는 칭찬이라 부정 리뷰에 섞이면 안 됨)
const POSITIVE_THEMES = [
  ['디자인·예쁨', /예뻐|예쁘|예쁜|이뻐|이쁘|이쁜|귀여|디자인.{0,4}(좋|맘|마음)/],
  ['색감 만족', /(색감|색상|색깔|컬러|색이).{0,6}(예뻐|예쁘|이뻐|이쁘|좋|맘|마음|고와|곱)/],
  ['촉감·부드러움', /부드럽|부드러|보들|포근|매끈|촉감.{0,4}(좋|최고)/],
  ['시원함', /시원(해|하고|합|한|했)|냉감.{0,4}(좋|최고)/],
  ['따뜻함', /따뜻|따듯|보온/],
  ['두께감·무게 만족', /두께감.{0,4}(좋|적당|딱)|적당한 ?두께|가벼워서|가볍고|묵직/],
  ['사이즈 만족', /사이즈.{0,6}(딱|잘 ?맞|적당|좋)|넉넉|핏.{0,4}(좋|예뻐|이뻐)/],
  ['품질 만족', /(품질|퀄리티|재질|소재|원단|마감).{0,6}(좋|훌륭|최고|만족|괜찮|탄탄)/],
  ['세탁 후에도 좋음', /세탁.{0,12}(괜찮|문제 ?없|멀쩡|그대로)/],
  ['배송 빠름', /배송.{0,6}(빨|빠르|빠른)|빨리 ?(와|왔|도착)|빠르게 ?(와|왔|도착)/],
  ['포장·선물', /포장|선물/],
  ['가성비', /가성비|가격.{0,6}(대비|비해).{0,6}(좋|훌륭|괜찮)|저렴/],
  ['재구매·추천', /재구매|또 ?(살|구매)|추천|쟁여|깔별/],
];
const NEGATIVE_THEMES = [
  ['색상이 사진과 다름', /색(이|상|감|깔)?.{0,8}(다르|달라|차이|탁|칙칙|어둡|진해|연해)|사진(이랑|과|보다).{0,8}(다르|달라|별로)/],
  ['상세페이지와 다름', /상세.{0,10}(다르|달라|차이|과장)|실물.{0,6}(별로|다르|달라)|기대.{0,4}(이하|와 ?달)/],
  ['얇음·비침', /얇아|얇고|얇네|얇은|비쳐|비침|비치/],
  ['사이즈 안 맞음', /작아|작네|작고|작은 ?편|커요|크네|커서|너무 ?커|길어|짧아|안 ?맞/],
  ['보풀·먼지·털빠짐', /보풀|먼지|털 ?빠|털날|털이 ?(많|날)/],
  ['구김', /구김|구겨/],
  ['이염·얼룩·물빠짐', /이염|물 ?빠|색 ?빠|번짐|얼룩|오염/],
  ['봉제·마감 불량', /봉제|박음질|실밥|뜯어|뜯겨|터졌|터짐|올이|올 ?나|마감.{0,4}(별로|아쉽|엉망|불량)/],
  ['촉감 불만 (까슬·뻣뻣)', /까슬|거칠|뻣뻣|따가|간지러/],
  ['시원하지 않음', /(안|덜) ?시원|시원하지|더워|덥다|덥고/],
  ['냄새', /냄새|악취/],
  ['흡수 안 됨', /흡수.{0,6}(안|않|못)/],
  ['세탁 후 변형', /줄어|늘어나|늘어났|수축|변형|세탁.{0,10}(망가|이상)/],
  ['품질 실망', /(품질|퀄리티).{0,6}(별로|아쉽|실망|떨어|낮)|싸구려|허접|저렴해 ?보/],
  ['가격 대비 아쉬움', /가격.{0,8}(비해|대비|치고).{0,6}(아쉽|별로|실망)|비싸/],
  ['배송 지연·문제', /배송.{0,8}(늦|지연|오래|느려)|늦게 ?(와|왔|도착)|오배송|안 ?와/],
  ['불량·파손', /불량|하자|파손|깨져|깨졌|찢어|구멍/],
];
const reviewThemes = (text, negative) => (negative ? NEGATIVE_THEMES : POSITIVE_THEMES).filter(([, re]) => re.test(text || '')).map(([name]) => name);

// 고른 기간의 리뷰만 불러옴 (전체 기간은 '전체'를 눌렀을 때만)
function useReviews(since) {
  return useSince('review_items', 'id,brand,platform,product_name,product_id,rating,content,written_at', since);
}

// 부정 리뷰 불만 키워드 → VOC 구분 (먼저 걸리는 것)
const THEME_TO_VOC_TYPE = {
  '색상이 사진과 다름': '색상 차이', '상세페이지와 다름': '상품 정보', '사이즈 안 맞음': '사이즈·핏',
  '이염·얼룩·물빠짐': '세탁·이염', '세탁 후 변형': '세탁·이염', '보풀·먼지·털빠짐': '내구성',
  '봉제·마감 불량': '품질', '불량·파손': '품질', '품질 실망': '품질', '구김': '품질', '냄새': '품질', '촉감 불만 (까슬·뻣뻣)': '품질',
  '얇음·비침': '상품 정보', '시원하지 않음': '상품 정보', '흡수 안 됨': '상품 정보', '배송 지연·문제': '배송',
};
const REVIEW_PLATFORM_TO_VOC = { '아임웹': '자사몰', '카페24': '자사몰' };
const REVIEW_VOC_NOTE = '리뷰 자동 등록';

// 새로 올라온 부정 리뷰(1~3점)를 VOC 접수로 등록 → 담당자는 VOC 목록에서 사진·처리 내용만 채움
// 리뷰 한 건 → VOC 접수 내용 (VOC 목록에서 '[리뷰 ★점수] 내용'으로 보임)
function reviewToVocRow(r, note = REVIEW_VOC_NOTE) {
  const theme = reviewThemes(r.content, true).find(t => THEME_TO_VOC_TYPE[t]);
  return {
    received_date: (r.written_at || '').slice(0, 10) || today(),
    brand: r.brand,
    platform: REVIEW_PLATFORM_TO_VOC[r.platform] || r.platform,
    order_no: r.order_no || null,
    product_id: r.product_id || null,
    product_name: r.product_name,
    voc_type: theme ? THEME_TO_VOC_TYPE[theme] : '기타',
    consult_method: '리뷰',
    status: '접수',
    reason_detail: reviewVocKey(r),
    note,
  };
}
const reviewVocKey = (r) => `[리뷰 ★${r.rating}] ${r.content || ''}`;

// 리뷰 상품명 → 상품 마스터 (VOC 대분류·중분류용). 똑같은 이름 먼저, 없으면 말머리·옵션을 뺀 핵심 단어로 찾기
function findReviewProductId(name, brand, products) {
  if (!products || !products.length || !name) return null;
  const exact = productMatcher(products)(name);
  if (exact) return exact;
  const hit = inferProduct(coreName(name), brand, buildProductIndex(products));
  return hit ? hit.id : null;
}

// 리뷰에 연결된 VOC 번호 기록 (12번 SQL 전이면 조용히 건너뜀)
async function linkReviewsToVoc(reviews, created) {
  for (let i = 0; i < reviews.length; i++) {
    if (!reviews[i].id || !created[i]) continue;
    const { error } = await db.from('review_items').update({ voc_case_id: created[i].id }).eq('id', reviews[i].id);
    if (error) return;
  }
}

async function negativeReviewsToVoc(newReviews, products) {
  const src = newReviews.filter(r => r.rating !== null && r.rating <= 3);
  const rows = src.map(r => reviewToVocRow({ ...r, product_id: r.product_id || findReviewProductId(r.product_name, r.brand, products) }));
  if (!rows.length) return null;
  const created = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await db.from('voc_cases').insert(rows.slice(i, i + 200)).select();
    if (error) throw new Error('부정 리뷰 VOC 등록 실패: ' + error.message);
    created.push(...data);
  }
  await linkReviewsToVoc(src, created);
  return created;
}

// 데이터 업로드 화면에서 쓰는 리뷰 저장 설정
const REVIEW_UPLOAD = {
  table: 'review_items',
  toRow: (r) => ({ product_name: str(r.product_name), rating: r.rating, content: str(r.content), written_at: r.when ? r.when.iso : null, order_no: str(r.order_no) }),
  // 새로 저장된 1~3점 리뷰 → VOC 접수
  afterInsert: async (newRows, app) => {
    const created = await negativeReviewsToVoc(newRows, app.products);
    if (!created) return null;
    app.setCases(prev => [...created, ...prev]);
    return <>📝 새 부정 리뷰(1~3점) <b>{created.length}건</b>을 VOC 접수로 등록했어요. <a href="#/voc-list">VOC 목록</a>에서 사진과 처리 내용을 채워주세요.</>;
  },
};

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
  const { productById, products } = useApp();
  const toast = useToast();
  const [brand, setBrand] = useState('핀카');   // 한 브랜드씩 보기 (핀카 먼저)
  const [category, setCategory] = useState('');
  const [platform, setPlatform] = useState('');
  const [period, setPeriod] = useState('6');     // 기본 최근 6개월 (데이터가 쌓여도 빠르게)
  const [reviews, setReviews] = useReviews(period === 'all' ? null : reviewPeriodStart(period)[0]);
  const [negMax, setNegMax] = useState(loadNegMax);

  useEffect(() => { try { localStorage.setItem('reviewNegMax', String(negMax)); } catch {} }, [negMax]);

  const [from, to] = reviewPeriodStart(period);
  const scoped = useMemo(() => (reviews || []).filter(r =>
    (!brand || r.brand === brand) && (!platform || r.platform === platform) && (!category || categoryOf(r.product_id, productById) === category) &&
    r.written_at && r.written_at.slice(0, 10) >= from && r.written_at.slice(0, 10) <= to), [reviews, brand, platform, category, from, to, productById]);
  const isNeg = (r) => r.rating !== null && r.rating <= negMax;
  const enriched = useMemo(() => scoped.map(r => ({ ...r, neg: isNeg(r), themes: reviewThemes(r.content, isNeg(r)), name: (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name || '(상품명 없음)' })), [scoped, negMax, productById]);

  if (!reviews) return <div className="loading-screen">리뷰 불러오는 중...</div>;
  if (!reviews.length && period === 'all') return <><PageHeader title="리뷰 분석" /><div className="card empty">아직 올린 리뷰가 없어요. <a href="#/upload">데이터 업로드</a>에서 파일을 올려주세요.</div></>;

  const neg = enriched.filter(r => r.neg);
  const pos = enriched.filter(r => !r.neg);
  const avg = enriched.length ? (enriched.reduce((a, r) => a + (r.rating || 0), 0) / enriched.filter(r => r.rating).length).toFixed(2) : '-';
  const themeCount = (rows) => [...POSITIVE_THEMES, ...NEGATIVE_THEMES].map(([name]) => ({ label: name, count: rows.filter(r => r.themes.includes(name)).length })).filter(t => t.count).sort((a, b) => b.count - a.count);
  const platforms = [...new Set(reviews.map(r => r.platform))].sort();

  // 월별 추이 (최근 12개월)
  const months = [...new Set(enriched.map(r => r.written_at.slice(0, 7)))].sort().slice(-12);
  const monthly = months.map(m => { const rows = enriched.filter(r => r.written_at.startsWith(m)); return { m, total: rows.length, neg: rows.filter(r => r.neg).length }; });
  const monthMax = Math.max(1, ...monthly.map(x => x.total));

  // 상품별
  const byProduct = [...enriched.reduce((m, r) => { const e = m.get(r.name) || { name: r.name, brand: r.brand, rows: [] }; e.rows.push(r); m.set(r.name, e); return m; }, new Map()).values()]
    .map(e => ({ ...e, count: e.rows.length, neg: e.rows.filter(r => r.neg).length, avg: e.rows.reduce((a, r) => a + (r.rating || 0), 0) / e.rows.length, negThemes: themeCount(e.rows.filter(r => r.neg)).slice(0, 3) }))
    .filter(e => e.neg > 0).sort((a, b) => b.neg - a.neg || a.avg - b.avg).slice(0, 15);

  return (
    <>
      <PageHeader title="리뷰 분석" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~`} · 작성일 기준 · 부정 = ${negMax}점 이하`}>
        <Segmented options={BRAND_ONLY} value={brand} onChange={setBrand} />
        <Select value={platform} onChange={setPlatform} options={platforms} placeholder="플랫폼 전체" />
        <Select value={category} onChange={setCategory} options={categoryOptions(products)} placeholder="대분류 전체" />
        <Segmented options={REVIEW_PERIODS} value={period} onChange={setPeriod} />
        <Select value={String(negMax)} onChange={v => setNegMax(Number(v))} options={[{ value: '3', label: '부정: 3점 이하' }, { value: '2', label: '부정: 2점 이하' }]} />
      </PageHeader>

      <div className="grid grid-kpi">
        <Kpi label="리뷰 수" value={enriched.length.toLocaleString()} sub="건" />
        <Kpi label="평균 별점" value={avg} sub="5점 만점" />
        <Kpi label="긍정 비중" value={pct(pos.length, enriched.length)} sub={`${pos.length.toLocaleString()}건 · ${negMax + 1}~5점`} />
        <Kpi label="부정 비중" value={pct(neg.length, enriched.length)} sub={`${neg.length.toLocaleString()}건 · 1~${negMax}점`} alert={neg.length > 0} />
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
          <div className="card-title">👍 좋았던 점 <small>긍정 리뷰 기준 · 누르면 리뷰 목록에서 볼 수 있어요</small></div>
          <ThemeBars items={themeCount(pos).slice(0, 10)} total={pos.length} color="var(--accent)" onPick={name => openReviewList({ brand, period, theme: name, stars: 'pos' })} />
        </div>
        <div className="card">
          <div className="card-title">👎 불만 사항 <small>부정 리뷰 기준 · 누르면 리뷰 목록에서 볼 수 있어요</small></div>
          <ThemeBars items={themeCount(neg).slice(0, 10)} total={neg.length} color="var(--danger)" onPick={name => openReviewList({ brand, period, theme: name, stars: 'neg' })} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div className="card-title" style={{ padding: '18px 20px 0' }}>부정 리뷰가 많은 상품 <small>누르면 리뷰 목록에서 이 상품의 부정 리뷰를 볼 수 있어요</small></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>상품명</th><th>브랜드</th><th className="num">리뷰</th><th className="num">부정</th><th className="num">부정 비중</th><th className="num">평균 별점</th><th>주요 불만</th></tr></thead>
            <tbody>
              {byProduct.map(p => (
                <tr key={p.name} className="clickable" onClick={() => openReviewList({ brand, period, product: p.name, stars: 'neg' })}>
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

// 리뷰 분석은 보기 전용 (부정 리뷰 처리는 VOC 목록에서)
function ReviewCard({ r }) {
  return (
    <div className={`review-card${r.neg ? ' neg' : ''}`}>
      <div className="review-head">
        <span className="stars">{'★'.repeat(r.rating || 0)}<span className="muted">{'★'.repeat(5 - (r.rating || 0))}</span></span>
        <span className="chip">{r.platform}</span>
        <span className="muted">{fmtDate(r.written_at.slice(0, 10))}</span>
        <span className="review-product" title={r.name}>{r.name}</span>
      </div>
      <div className="review-body">{r.content}</div>
      <div className="review-foot">
        {r.themes.map(t => <span key={t} className="chip">{t}</span>)}
      </div>
    </div>
  );
}

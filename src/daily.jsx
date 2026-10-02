// CS 데일리 입력 · 월간 보고

const BRAND_TOTAL = '브랜드 전체';   // 해피톡·전화처럼 플랫폼 구분 없는 값을 담는 줄

const PLATFORM_FIELDS = [
  { section: '주문', fields: [['orders', '총 주문건'], ['cancels', '출고전 취소']] },
  { section: '반품', fields: [['return_simple', '단순 반품'], ['return_defect', '과실 · 상품이상'], ['return_misship', '과실 · 오배송/오매핑'], ['return_etc', '과실 · 기타']] },
  { section: '교환', fields: [['exchange_simple', '단순 교환'], ['exchange_defect', '과실 · 상품이상'], ['exchange_misship', '과실 · 오배송/오매핑'], ['exchange_etc', '과실 · 기타']] },
  { section: '리뷰 · 게시판', fields: [['reviews_total', '총 작성 리뷰'], ['reviews_negative', '부정 리뷰'], ['reviews_positive', '긍정 리뷰'], ['board_total', '게시판 상담']] },
];
const BRAND_FIELDS = [
  { section: '해피톡 (1:1 상담)', fields: [['ht_total', '총 상담'], ['ht_only', 'ONLY 접수'], ['ht_delivery', '배송문의'], ['ht_return', '교환/반품'], ['ht_cancel', '주문취소/변경'], ['ht_product', '상품문의'], ['ht_etc', '기타문의'], ['ht_voc', 'VOC 상담']] },
  { section: '전화 상담', fields: [['call_in', '총 인입'], ['call_delivery', '배송문의'], ['call_return', '반품/교환'], ['call_cancel', '취소/변경'], ['call_product', '상품'], ['call_etc', '기타'], ['call_out', '총 발신']] },
];
const ALL_DAILY_FIELDS = [...PLATFORM_FIELDS, ...BRAND_FIELDS].flatMap(s => s.fields.map(f => f[0]));
// 합계 칸은 직접 안 넣고 세부 칸을 더해서 자동 (VOC 상담·총 발신은 따로 세는 칸이라 합계에 안 들어감)
const AUTO_TOTALS = {
  ht_total: ['ht_only', 'ht_delivery', 'ht_return', 'ht_cancel', 'ht_product', 'ht_etc'],
  call_in: ['call_delivery', 'call_return', 'call_cancel', 'call_product', 'call_etc'],
};
// 세부 칸이 하나라도 있으면 그 합계, 모두 0이면 예전에 합계만 넣어 둔 값을 그대로 둠
const withAutoTotals = (v) => {
  const out = { ...v };
  Object.entries(AUTO_TOTALS).forEach(([t, parts]) => {
    const sum = parts.reduce((a, f) => a + (Number(out[f]) || 0), 0);
    if (sum > 0) out[t] = sum;
  });
  return out;
};
const isAutoTotal = (f) => f in AUTO_TOTALS;
// 하타는 전화 상담이 없음 → 입력·리포트에서 전화 칸 숨김
const NO_CALL_BRANDS = ['하타'];
const brandFieldsOf = (brand) => BRAND_FIELDS.filter(s => !(NO_CALL_BRANDS.includes(brand) && s.section.startsWith('전화')));

// 파생 지표 (기존 시트 계산식과 동일)
const faultReturns = (r) => (r.return_defect || 0) + (r.return_misship || 0) + (r.return_etc || 0);
const faultExchanges = (r) => (r.exchange_defect || 0) + (r.exchange_misship || 0) + (r.exchange_etc || 0);
const faults = (r) => faultReturns(r) + faultExchanges(r);
const returnsExchanges = (r) => (r.return_simple || 0) + (r.exchange_simple || 0) + faults(r);

function sumRows(rows) {
  const s = {};
  ALL_DAILY_FIELDS.forEach(f => { s[f] = rows.reduce((a, r) => a + (r[f] || 0), 0); });
  return s;
}
const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-');

// 데이터는 전일 기준: 보고일 화~월 = 데이터 월~일. 월요일 보고일에는 금~일 3일치가 들어감
// 주차: 데이터 날짜 월~일 (보고일로는 매월 첫 화요일~다음 월요일) = 기존 '주간' 시트와 같은 결과
function dataLabel(reportDate) {
  const d = parseDate(reportDate);
  return d.getDay() === 1 ? `${fmtMD(addDays(d, -3))}~${addDays(d, -1).getDate()}` : fmtMD(addDays(d, -1));
}
function firstWeekStart(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  return d;
}
function monthWeeks(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = firstWeekStart(y, m - 1);
  const next = firstWeekStart(m === 12 ? y + 1 : y, m === 12 ? 0 : m);
  const weeks = [];
  for (let s = start, i = 1; s < next; s = addDays(s, 7), i++) {
    weeks.push({ label: `${m}월 ${i}주차`, from: toISODate(s), to: toISODate(addDays(s, 6)), range: `${fmtMD(addDays(s, -1))}~${fmtMD(addDays(s, 5))}` });   // 데이터 날짜 (월~일)
  }
  return weeks;
}
function weekOf(dateStr) {
  const d = parseDate(dateStr);
  for (const offset of [0, -1]) {
    const x = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    const ym = `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
    const w = monthWeeks(ym).find(w => dateStr >= w.from && dateStr <= w.to);
    if (w) return { ym, ...w };
  }
  return null;
}

// ---------- CS 데일리 입력 ----------

function useDaily() {
  const { daily, loadDaily } = useApp();
  useEffect(() => { if (!daily) loadDaily(); }, [daily, loadDaily]);
  return daily;
}

function NumCell({ value, onChange }) {
  return (
    <input className="num-input" type="number" min="0" inputMode="numeric"
      value={value === 0 ? '' : value} placeholder="0"
      onChange={e => onChange(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))}
      onFocus={e => e.target.select()} />
  );
}

// ---------- 업로드 데이터 → CS 데일리 자동 계산 ----------
// 업로드 데이터의 플랫폼 → CS 데일리 칸 (자사몰은 아임웹 칸으로. 카페24로 옮기면 여기만 바꾸면 됨)
// 출고전 취소도 오클릭(핀카)·사방넷(하타) 기준으로 자동 계산 (2026-09-30 사용자 결정, 주문건과 같은 기준)
// 손 입력으로 되돌리려면 여기에 브랜드를 넣으면 됨 (자동 채우기가 취소 칸을 덮어쓰지 않음)
const CANCEL_MANUAL_BRANDS = [];
const UPLOAD_PLATFORM_TO_DAILY = { '29CM': '29CM', '아임웹': '아임웹', '카페24': '아임웹', '무신사': '무신사', 'W컨셉': 'W컨셉', 'EQL': 'EQL' };

// 보고일 → 데이터 날짜 범위 (전일 기준, 월요일 보고일 = 금~일)
function dataRangeOf(reportDate) {
  const d = parseDate(reportDate);
  return [toISODate(addDays(d, d.getDay() === 1 ? -3 : -1)), toISODate(addDays(d, -1))];
}

// 주문건 = 상품 수 (모든 판매처 통일, 2026-09-30). 오클릭은 세트를 구성품으로 나누므로 판매처 품목 번호(item_no)로 다시 묶어 셈
//   · 교환 재발송 줄(오클릭 '교환'·'맞교환')은 새 주문이 아니라서 제외 · 품목 번호가 없는 판매처 파일은 한 줄 = 1
// 출고전 취소 = 상태에 '취소'가 들어간 상품 수, 부정 리뷰 = 1~3점, 게시판 = 우리 답변 글 제외
async function countUploadsForReport(reportDate, brand) {
  const [from, to] = dataRangeOf(reportDate);
  const start = `${from}T00:00:00+09:00`, end = `${toISODate(addDays(parseDate(to), 1))}T00:00:00+09:00`;
  const [orders, reviews, board, returns] = await Promise.all([
    fetchAll(() => db.from('order_items').select('id,platform,source_key,status,claim_status,order_no,item_no').eq('brand', brand).gte('order_date', from).lte('order_date', to).order('id')),
    fetchAll(() => db.from('review_items').select('platform,rating').eq('brand', brand).gte('written_at', start).lt('written_at', end).order('id')),
    fetchAll(() => db.from('board_items').select('platform,inquiry_type,content').eq('brand', brand).gte('written_at', start).lt('written_at', end).order('id')),
    // 반품·교환: 접수일 기준 (데일리 파일 = 전일 접수 건, 접수일 칸이 없으면 올린 날의 전날로 저장됨)
    fetchAll(() => db.from('return_items').select('platform,kind,reason_group').eq('brand', brand).gte('claim_date', from).lte('claim_date', to).order('id')).catch(() => []),
  ]);
  const byPlatform = {}, others = new Set();
  const bump = (platform, field, n = 1) => {
    const p = UPLOAD_PLATFORM_TO_DAILY[platform];
    if (!p) { others.add(platform); return; }
    byPlatform[p] = byPlatform[p] || {};
    byPlatform[p][field] = (byPlatform[p][field] || 0) + n;
  };
  const seenOrder = new Set(), seenCancel = new Set();
  orders.forEach(r => {
    // 사방넷(하타)은 '취소완료'만 취소 (하타는 취소 요청 후 거부가 많음, 2026-10-02 사용자 결정)
    const cancelled = String(r.source_key || '').startsWith('SB') ? /취소완료/.test(r.status || '') : /취소/.test(r.status || '');
    // 판매처 파일(품목 번호 없음): 한 줄 = 주문 1, 취소 상태면 출고전 취소도 1 (예전 방식)
    if (!r.item_no) { bump(r.platform, 'orders'); if (cancelled) bump(r.platform, 'cancels'); return; }
    // 오클릭·사방넷: 교환 재발송 줄, 사방넷 반품·교환 회수 줄은 새 주문이 아님
    // 오클릭 취소는 '주문' 줄과 짝을 이루는 별도 '취소' 줄로 들어옴
    if (r.claim_status && /교환|회수/.test(r.claim_status)) return;
    const item = `${r.platform}|${r.order_no}|${r.item_no}`;
    // 사방넷 '취소완료'는 원래 주문 줄 자체 → 주문 1 + 취소 1 (오클릭 '취소' 줄은 취소만)
    if (cancelled && !seenCancel.has(item)) { seenCancel.add(item); bump(r.platform, 'cancels'); }
    if ((!cancelled || r.status !== '취소') && !/분실/.test(r.status || '') && !seenOrder.has(item)) { seenOrder.add(item); bump(r.platform, 'orders'); }
  });
  reviews.forEach(r => { bump(r.platform, 'reviews_total'); bump(r.platform, r.rating !== null && r.rating <= 3 ? 'reviews_negative' : 'reviews_positive'); });
  const inquiries = board.filter(r => r.inquiry_type !== ANSWER_TYPE && !isStaffAnswer(r.content));
  inquiries.forEach(r => bump(r.platform, 'board_total'));
  // 반품·교환 → 단순 / 과실·상품이상(불량·파손) / 과실·오배송(오배송·누락). '과실·기타'는 직접 입력
  const returnPlatforms = new Set();
  returns.forEach(r => {
    const pre = r.kind === '교환' ? 'exchange' : 'return';
    const f = r.reason_group === '불량·파손' ? `${pre}_defect` : r.reason_group === '오배송·누락' ? `${pre}_misship` : `${pre}_simple`;
    bump(r.platform, f);
    if (UPLOAD_PLATFORM_TO_DAILY[r.platform]) returnPlatforms.add(UPLOAD_PLATFORM_TO_DAILY[r.platform]);
  });
  return {
    byPlatform, others: [...others], returnPlatforms: [...returnPlatforms],
    has: { orders: orders.length > 0, reviews: reviews.length > 0, board: inquiries.length > 0, returns: returns.length > 0 },
    totals: { orders: Object.values(byPlatform).reduce((a, c) => a + (c.orders || 0), 0), reviews: reviews.length, board: inquiries.length, returns: returns.length },
  };
}

function DailyEntryPage() {
  const { codeOptions, setDaily } = useApp();
  const daily = useDaily();
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [brand, setBrand] = useState('핀카');
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const platforms = codeOptions(`daily_platform:${brand}`);

  // 날짜·브랜드를 바꾸면 저장된 값을 불러옴
  useEffect(() => {
    if (!daily) return;
    const v = {};
    [...platforms, BRAND_TOTAL].forEach(p => {
      const row = daily.find(r => r.report_date === date && r.brand === brand && r.platform === p);
      v[p] = withAutoTotals(Object.fromEntries(ALL_DAILY_FIELDS.map(f => [f, row ? row[f] || 0 : 0])));
    });
    setValues(v);
    setDirty(false);
  }, [daily, date, brand, platforms.join('|')]);

  const exists = daily && daily.some(r => r.report_date === date && r.brand === brand);
  const setVal = (p, f) => (n) => { setValues(prev => ({ ...prev, [p]: withAutoTotals({ ...prev[p], [f]: n }) })); setDirty(true); };
  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState('');
  const [showReport, setShowReport] = useState(false);
  useEffect(() => { setFillNote(''); }, [date, brand]);

  // 업로드한 주문·리뷰·게시판으로 이 보고일 칸을 채움 (저장은 사람이 확인 후)
  const fillFromUploads = async () => {
    setFilling(true);
    try {
      const got = await countUploadsForReport(date, brand);
      const filled = [], skipped = [];
      setValues(prev => {
        const next = { ...prev };
        platforms.forEach(p => {
          const c = got.byPlatform[p] || {};
          const v = { ...next[p] };
          if (got.has.orders) { v.orders = c.orders || 0; if (!CANCEL_MANUAL_BRANDS.includes(brand)) v.cancels = c.cancels || 0; }
          if (got.has.reviews) { v.reviews_total = c.reviews_total || 0; v.reviews_negative = c.reviews_negative || 0; v.reviews_positive = c.reviews_positive || 0; }
          if (got.has.board) { v.board_total = c.board_total || 0; }
          // 반품·교환은 파일을 올린 판매처만 채움 (안 올린 판매처는 손으로 넣은 값 그대로)
          if (got.returnPlatforms.includes(p)) ['return_simple', 'return_defect', 'return_misship', 'exchange_simple', 'exchange_defect', 'exchange_misship'].forEach(f => { v[f] = c[f] || 0; });
          next[p] = v;
        });
        return next;
      });
      [['orders', '주문', '개(상품)'], ['reviews', '리뷰', '건'], ['board', '게시판', '건'], ['returns', '반품·교환', '건']].forEach(([k, name, unit]) => {
        if (got.has[k]) filled.push(`${name} ${got.totals[k].toLocaleString()}${unit}`); else skipped.push(name);
      });
      // 이 브랜드 CS 데일리에 칸이 없는 플랫폼(예: 핀카의 W컨셉)은 빠지므로 따로 알려줌
      const left = Object.entries(got.byPlatform).filter(([p]) => !platforms.includes(p))
        .map(([p, c]) => `${p}(주문 ${c.orders || 0}·리뷰 ${c.reviews_total || 0}·게시판 ${c.board_total || 0})`);
      setFillNote([
        filled.length ? `✅ ${dataLabel(date)} 데이터로 채웠어요: ${filled.join(' · ')}. 확인 후 저장을 눌러주세요.` : `${dataLabel(date)}에 해당하는 업로드 데이터가 없어요.`,
        skipped.length ? `올린 데이터가 없어서 그대로 둔 항목: ${skipped.join(', ')}` : '',
        got.has.orders && CANCEL_MANUAL_BRANDS.includes(brand) ? '출고전 취소는 판매처 화면 숫자로 직접 입력해 주세요 (자동 채우기는 주문건만 채워요).' : '',
        got.has.orders && !CANCEL_MANUAL_BRANDS.includes(brand) ? '출고전 취소 = 오클릭·사방넷에 들어온 뒤 취소된 상품 수 (들어오기 전에 바로 취소된 주문은 주문건·취소 모두에서 빠져요).' : '',
        left.length || got.others.length ? `이 화면에 칸이 없어 빠진 플랫폼: ${[...left, ...got.others].join(', ')} (기준 관리 → 데일리 플랫폼에서 추가 가능)` : '',
      ].filter(Boolean).join('\n'));
      if (filled.length) setDirty(true);
    } catch (e) {
      toast('❌ 불러오기 실패: ' + (e.message || e), 'err');
    } finally { setFilling(false); }
  };
  const total = sumRows(platforms.map(p => values[p] || {}));

  const save = async () => {
    setSaving(true);
    // 여러 줄을 한 번에 저장할 때 줄마다 칸 구성이 다르면 빈 칸이 null로 들어가므로 모든 칸을 채워서 보냄
    const now = new Date().toISOString();
    const rows = [...platforms, BRAND_TOTAL].map(p => ({
      report_date: date, brand, platform: p,
      ...Object.fromEntries(ALL_DAILY_FIELDS.map(f => [f, values[p]?.[f] || 0])),
      updated_at: now,
    }));
    const { data, error } = await db.from('cs_daily').upsert(rows, { onConflict: 'report_date,brand,platform' }).select();
    setSaving(false);
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    setDaily(prev => [...prev.filter(r => !(r.report_date === date && r.brand === brand && data.some(d => d.platform === r.platform))), ...data]);
    setDirty(false);
    toast(`✅ ${fmtDate(date)} ${brand} 데일리 저장 완료`);
  };

  if (!daily) return <div className="loading-screen">불러오는 중...</div>;

  const derivedRow = (label, fn, isPct) => (
    <tr className="derived">
      <td>{label}</td>
      {platforms.map(p => <td key={p} className="num">{fn(values[p] || {})}</td>)}
      <td className="num total">{fn(total)}</td>
    </tr>
  );

  return (
    <>
      <PageHeader title="CS 데일리" desc={`보고일 ${fmtDate(date)} → ${dataLabel(date)} 데이터 (전일 접수 기준) · 월요일 보고일에는 금~일 3일치를 합쳐서 입력해요`}>
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <Segmented options={[{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }]} value={brand} onChange={setBrand} />
        <button className="btn btn-primary" onClick={fillFromUploads} disabled={filling} title="업로드한 주문·리뷰·게시판 파일로 주문건·취소·리뷰·게시판 칸을 채워요">
          {filling ? '불러오는 중...' : '📥 업로드 데이터로 채우기'}
        </button>
        <button className="btn" onClick={() => (dirty && !confirm('저장하지 않은 숫자가 있어요. 리포트는 저장된 숫자로 만들어져요. 그래도 열까요?') ? null : setShowReport(true))} title="핀카·하타 숫자와 그날 VOC를 슬랙용 이미지로">📸 데일리 리포트</button>
      </PageHeader>
      {showReport && <DailyReportPanel date={date} onClose={() => setShowReport(false)} />}
      {fillNote && <div className="card" style={{ marginBottom: 16, background: 'var(--accent-soft)', border: 'none', whiteSpace: 'pre-line', lineHeight: 1.7 }}>{fillNote}</div>}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0 }}>
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>플랫폼별 <small>{exists ? '저장된 값을 수정 중' : '새로 입력'}</small></div>
          <div className="table-wrap">
            <table className="table entry-table">
              <thead><tr><th>항목</th>{platforms.map(p => <th key={p} className="num">{p}</th>)}<th className="num">합계</th></tr></thead>
              <tbody>
                {PLATFORM_FIELDS.map(s => (
                  <React.Fragment key={s.section}>
                    <tr className="section-row"><td colSpan={platforms.length + 2}>{s.section}</td></tr>
                    {s.fields.map(([f, label]) => (
                      <tr key={f}>
                        <td>{label}</td>
                        {platforms.map(p => <td key={p} className="num"><NumCell value={values[p]?.[f] || 0} onChange={setVal(p, f)} /></td>)}
                        <td className="num total">{total[f]}</td>
                      </tr>
                    ))}
                    {s.section === '교환' && (
                      <>
                        {derivedRow('과실 반품·교환 (자동)', faults)}
                        {derivedRow('총 반품·교환 (자동)', returnsExchanges)}
                        {derivedRow('반품·교환율 (자동)', r => pct(returnsExchanges(r), r.orders))}
                      </>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>{brand} {NO_CALL_BRANDS.includes(brand) ? '해피톡' : '해피톡 · 전화'} <small>{brand}만 · 플랫폼 구분 없이 입력 · 합계는 자동</small></div>
          <div className="table-wrap">
            <table className="table entry-table">
              <tbody>
                {brandFieldsOf(brand).map(s => (
                  <React.Fragment key={s.section}>
                    <tr className="section-row"><td colSpan={2}>{s.section}</td></tr>
                    {s.fields.map(([f, label]) => (
                      <tr key={f} className={isAutoTotal(f) ? 'derived' : ''}>
                        <td>{label}{isAutoTotal(f) && <span className="muted" style={{ fontSize: 12 }}> (자동 합계)</span>}</td>
                        <td className="num">{isAutoTotal(f)
                          ? <b style={{ paddingRight: 10 }}>{values[BRAND_TOTAL]?.[f] || 0}</b>
                          : <NumCell value={values[BRAND_TOTAL]?.[f] || 0} onChange={setVal(BRAND_TOTAL, f)} />}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="save-bar">
        <span className="muted">{fmtDate(date)} · {brand} {dirty ? '· 저장하지 않은 변경이 있어요' : ''}</span>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '💾 저장'}</button>
      </div>
    </>
  );
}

// ---------- 월간 보고 ----------

const WEEK_METRICS = [
  { label: '주문건', fn: (s) => s.orders },
  { label: '출고전 취소', fn: (s) => s.cancels },
  { label: '주문 대비 취소율', fn: (s) => pct(s.cancels, s.orders), rate: true },
  { label: '반품·교환건', fn: (s) => returnsExchanges(s) },
  { label: '반품·교환율', fn: (s) => pct(returnsExchanges(s), s.orders), val: (s) => s.orders ? returnsExchanges(s) / s.orders : null, key: true },
  { label: '과실건', fn: (s) => faults(s) },
  { label: '주문 대비 과실률', fn: (s) => pct(faults(s), s.orders), val: (s) => s.orders ? faults(s) / s.orders : null, key: true },
  { label: '작성 리뷰', fn: (s) => s.reviews_total },
  // 긍정 = 4~5점 = 작성 - 부정 (예전 데이터에 긍정 칸이 비어 있어도 같은 기준으로 계산)
  { label: '긍정 리뷰', fn: (s) => Math.max(0, s.reviews_total - s.reviews_negative) },
  { label: '부정 리뷰', fn: (s) => s.reviews_negative },
  // 긍정 리뷰율은 낮을수록 나쁨 → 가장 낮았던 주를 빨갛게
  { label: '긍정 리뷰율', fn: (s) => pct(Math.max(0, s.reviews_total - s.reviews_negative), s.reviews_total), val: (s) => s.reviews_total ? Math.max(0, s.reviews_total - s.reviews_negative) / s.reviews_total : null, key: true, lowIsBad: true },
  { label: '부정 리뷰율', fn: (s) => pct(s.reviews_negative, s.reviews_total), val: (s) => s.reviews_total ? s.reviews_negative / s.reviews_total : null, key: true },
  { label: '게시판', fn: (s) => s.board_total },
  { label: '해피톡', fn: (s) => s.ht_total },
  { label: '전화 인입', fn: (s) => s.call_in, phone: true },
  { label: '전화 발신', fn: (s) => s.call_out, phone: true },
];

// 브랜드 색 (기존 보고 시트와 같게: 핀카 남색, 하타 주황)
const BRAND_COLOR = { '핀카': '#1F6A8A', '하타': '#E8792F' };

// 기간(주차 또는 월)별 지표 표. periods: [{ from, to, short, range }]
function BrandWeekTable({ brand, rows, weeks, totalLabel = '합계·평균', worstLabel = '가장 높은 주' }) {
  const cols = weeks.map(w => sumRows(rows.filter(r => r.report_date >= w.from && r.report_date <= w.to)));
  const month = sumRows(rows);
  const hasPhone = month.call_in + month.call_out > 0;
  return (
    <div className="card brand-card brand-card-fit" style={{ padding: 0, '--brand': BRAND_COLOR[brand] }}>
      <div className="brand-bar">{brand}</div>
      <div className="table-wrap">
        <table className="table report-table compact">
          <thead>
            <tr><th>구분</th>{weeks.map(w => <th key={w.from} className="num" title={w.range}>{w.short || w.label.split(' ')[1]}<div className="th-sub">{w.range}</div></th>)}<th className="num">{totalLabel}</th></tr>
          </thead>
          <tbody>
            {WEEK_METRICS.filter(m => !m.phone || hasPhone).map(m => {
              // 핵심 비율은 가장 높았던(나빴던) 주를 빨갛게
              const vals = m.val ? cols.map(m.val) : [];
              const ok = vals.filter(v => v !== null);
              const worst = ok.length ? vals.indexOf(m.lowIsBad ? Math.min(...ok) : Math.max(...ok)) : -1;
              return (
              <tr key={m.label} className={m.key ? 'key-row' : ''}>
                <td>{m.label}</td>
                {cols.map((c, i) => <td key={i} className={`num${i === worst ? ' worst' : ''}`} title={i === worst ? (m.lowIsBad ? worstLabel.replace('높은', '낮은') : worstLabel) : ''}>{c.orders || c.reviews_total || c.ht_total ? m.fn(c) : <span className="muted">-</span>}</td>)}
                <td className="num total">{m.fn(month)}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelTable({ brand, rows, period }) {
  const byPlatform = countBy(rows, r => r.platform).map(p => ({ platform: p.label, s: sumRows(rows.filter(r => r.platform === p.label)) }))
    .sort((a, b) => b.s.orders - a.s.orders);
  return (
    <div className="card brand-card" style={{ padding: 0, '--brand': BRAND_COLOR[brand] }}>
      <div className="brand-bar">{brand} 채널별 현황{period ? <span style={{ fontWeight: 400, opacity: 0.85 }}> · {period}</span> : null}</div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>채널</th><th className="num">주문건</th><th className="num">반품·교환</th><th className="num">발생률</th><th className="num">과실건</th><th className="num">과실률</th></tr></thead>
          <tbody>
            {byPlatform.map(({ platform, s }) => (
              <tr key={platform}>
                <td>{platform}</td>
                <td className="num">{s.orders.toLocaleString()}</td>
                <td className="num">{returnsExchanges(s)}</td>
                <td className="num">{pct(returnsExchanges(s), s.orders)}</td>
                <td className="num">{faults(s)}</td>
                <td className="num">{pct(faults(s), s.orders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 월별 메모: '주요 VOC'와 '주요 이슈'를 각각 따로 적고 저장
function MonthNotes({ ym, brand }) {
  const [note, setNote] = useState({ voc_memo: '', issue_memo: '' });
  useEffect(() => {
    db.from('report_notes').select('*').eq('month', ym).eq('brand', brand).maybeSingle()
      .then(({ data }) => setNote(data || { voc_memo: '', issue_memo: '' }));
  }, [ym, brand]);
  const save = async (field, value) => {
    const next = { ...note, [field]: value };
    const { error } = await db.from('report_notes').upsert({ month: ym, brand, voc_memo: next.voc_memo, issue_memo: next.issue_memo, updated_at: new Date().toISOString() }, { onConflict: 'month,brand' });
    if (!error) setNote(next);
    return error;
  };
  return (
    <>
      <MemoCard key={`v-${ym}-${brand}`} title={`${brand} 주요 VOC`} value={note.voc_memo} onSave={v => save('voc_memo', v)} placeholder="예: 블랙 어글리도트 베개커버 이염·얼룩 9월 누적 6건 → 잔여 재고 전수 검수" />
      <MemoCard key={`i-${ym}-${brand}`} title={`${brand} 주요 이슈`} value={note.issue_memo} onSave={v => save('issue_memo', v)} placeholder="예: 베딩 예약배송 입고 지연 → 지연 고객 안내" />
    </>
  );
}

function MemoCard({ title, value, onSave, placeholder }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  return (
    <div className="card">
      <div className="card-title">{title} {!editing && <button className="btn btn-sm no-print" onClick={() => { setDraft(value || ''); setEditing(true); }}>수정</button>}</div>
      {editing ? (
        <>
          <textarea className="input" rows="6" value={draft} onChange={e => setDraft(e.target.value)} placeholder={placeholder} />
          <div className="form-actions">
            <button className="btn" onClick={() => setEditing(false)}>취소</button>
            <button className="btn btn-primary" onClick={async () => { const err = await onSave(draft); if (err) toast('❌ ' + err.message, 'err'); else { setEditing(false); toast('✅ 저장했어요'); } }}>저장</button>
          </div>
        </>
      ) : (
        <div className="memo"><p>{value || <span className="muted">입력된 내용이 없어요. '수정'을 눌러 적어주세요.</span>}</p></div>
      )}
    </div>
  );
}

// 지난달 대비 증감 (비율은 %p). 나빠지면 빨강, 좋아지면 초록
function Delta({ cur, prev, higherIsGood, count, vs = '지난달' }) {
  if (cur === null || prev === null || prev === undefined || (count && !prev)) return <span className="muted">{vs} 비교 없음</span>;
  const diff = cur - prev;
  if (Math.abs(diff) < (count ? 0.5 : 0.0005)) return <span className="muted">{vs} 대비 변동 없음</span>;
  const good = higherIsGood ? diff > 0 : diff < 0;
  const text = count ? `${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString()}건 (${diff > 0 ? '+' : ''}${(diff / prev * 100).toFixed(0)}%)` : `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}%p`;
  return <span className={good ? 'delta-good' : 'delta-bad'}>{diff > 0 ? '▲' : '▼'} {vs} 대비 {text}</span>;
}

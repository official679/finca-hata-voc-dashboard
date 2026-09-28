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

// 주차: 보고일 기준, 매월 첫 화요일부터 다음 월요일까지 = 1주차 (기존 '주간' 시트와 같은 결과)
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
    weeks.push({ label: `${m}월 ${i}주차`, from: toISODate(s), to: toISODate(addDays(s, 6)), range: `${fmtMD(s)}~${fmtMD(addDays(s, 6))}` });
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
      v[p] = Object.fromEntries(ALL_DAILY_FIELDS.map(f => [f, row ? row[f] || 0 : 0]));
    });
    setValues(v);
    setDirty(false);
  }, [daily, date, brand, platforms.join('|')]);

  const exists = daily && daily.some(r => r.report_date === date && r.brand === brand);
  const setVal = (p, f) => (n) => { setValues(prev => ({ ...prev, [p]: { ...prev[p], [f]: n } })); setDirty(true); };
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

  // 최근 14일 입력 현황
  const recent = useMemo(() => Array.from({ length: 14 }, (_, i) => toISODate(addDays(new Date(), -i))), []);
  const entered = (d, b) => daily && daily.some(r => r.report_date === d && r.brand === b);

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
      <PageHeader title="CS 데일리" desc="보고일(전일 접수 기준) · 브랜드별로 플랫폼 건수를 입력해요. 주말은 월요일 보고일에 합쳐서 입력하세요.">
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <Segmented options={[{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }]} value={brand} onChange={setBrand} />
      </PageHeader>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">최근 14일 입력 현황 <small>칸을 누르면 그 날짜로 이동해요</small></div>
        <div className="day-strip">
          {recent.map(d => (
            <button key={d} className={`day-chip${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>
              <span>{fmtMD(parseDate(d))} {'일월화수목금토'[parseDate(d).getDay()]}</span>
              <span>{['핀카', '하타'].map(b => <i key={b} className={entered(d, b) ? 'ok' : ''} title={`${b} ${entered(d, b) ? '입력됨' : '미입력'}`}>{b[0]}</i>)}</span>
            </button>
          ))}
        </div>
      </div>

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
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>브랜드 전체 <small>해피톡·전화는 플랫폼 구분 없이 입력</small></div>
          <div className="table-wrap">
            <table className="table entry-table">
              <tbody>
                {BRAND_FIELDS.map(s => (
                  <React.Fragment key={s.section}>
                    <tr className="section-row"><td colSpan={2}>{s.section}</td></tr>
                    {s.fields.map(([f, label]) => (
                      <tr key={f}><td>{label}</td><td className="num"><NumCell value={values[BRAND_TOTAL]?.[f] || 0} onChange={setVal(BRAND_TOTAL, f)} /></td></tr>
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
  { label: '반품·교환율', fn: (s) => pct(returnsExchanges(s), s.orders), rate: true, key: true },
  { label: '과실건', fn: (s) => faults(s) },
  { label: '주문 대비 과실률', fn: (s) => pct(faults(s), s.orders), rate: true, key: true },
  { label: '작성 리뷰', fn: (s) => s.reviews_total },
  { label: '부정 리뷰', fn: (s) => s.reviews_negative },
  { label: '부정 리뷰율', fn: (s) => pct(s.reviews_negative, s.reviews_total), rate: true, key: true },
  { label: '게시판', fn: (s) => s.board_total },
  { label: '해피톡', fn: (s) => s.ht_total },
  { label: '전화 인입', fn: (s) => s.call_in, phone: true },
  { label: '전화 발신', fn: (s) => s.call_out, phone: true },
];

function BrandWeekTable({ brand, rows, weeks }) {
  const cols = weeks.map(w => sumRows(rows.filter(r => r.report_date >= w.from && r.report_date <= w.to)));
  const month = sumRows(rows);
  const hasPhone = month.call_in + month.call_out > 0;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-title" style={{ padding: '18px 20px 4px' }}>{brand}</div>
      <div className="table-wrap">
        <table className="table report-table">
          <thead>
            <tr><th>구분</th>{weeks.map(w => <th key={w.label} className="num" title={w.range}>{w.label.split(' ')[1]}<div className="th-sub">{w.range}</div></th>)}<th className="num">합계·평균</th></tr>
          </thead>
          <tbody>
            {WEEK_METRICS.filter(m => !m.phone || hasPhone).map(m => (
              <tr key={m.label} className={m.key ? 'key-row' : ''}>
                <td>{m.label}</td>
                {cols.map((c, i) => <td key={i} className="num">{c.orders || c.reviews_total || c.ht_total ? m.fn(c) : <span className="muted">-</span>}</td>)}
                <td className="num total">{m.fn(month)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChannelTable({ brand, rows }) {
  const byPlatform = countBy(rows, r => r.platform).map(p => ({ platform: p.label, s: sumRows(rows.filter(r => r.platform === p.label)) }))
    .sort((a, b) => b.s.orders - a.s.orders);
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-title" style={{ padding: '18px 20px 4px' }}>{brand} 채널별 현황</div>
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

function MonthNotes({ ym, brand }) {
  const toast = useToast();
  const [note, setNote] = useState({ voc_memo: '', issue_memo: '' });
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    db.from('report_notes').select('*').eq('month', ym).eq('brand', brand).maybeSingle()
      .then(({ data }) => setNote(data || { voc_memo: '', issue_memo: '' }));
    setEditing(false);
  }, [ym, brand]);
  const save = async () => {
    const { error } = await db.from('report_notes').upsert({ month: ym, brand, voc_memo: note.voc_memo, issue_memo: note.issue_memo, updated_at: new Date().toISOString() }, { onConflict: 'month,brand' });
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setEditing(false);
    toast('✅ 메모 저장');
  };
  return (
    <div className="card">
      <div className="card-title">{brand} VOC · 주요 이슈 {!editing && <button className="btn btn-sm no-print" onClick={() => setEditing(true)}>수정</button>}</div>
      {editing ? (
        <>
          <div className="field"><label>VOC</label><textarea rows="4" value={note.voc_memo || ''} onChange={e => setNote({ ...note, voc_memo: e.target.value })} /></div>
          <div className="field" style={{ marginTop: 10 }}><label>주요 이슈</label><textarea rows="4" value={note.issue_memo || ''} onChange={e => setNote({ ...note, issue_memo: e.target.value })} /></div>
          <div className="form-actions"><button className="btn" onClick={() => setEditing(false)}>취소</button><button className="btn btn-primary" onClick={save}>저장</button></div>
        </>
      ) : (
        <div className="memo">
          <div><b>VOC</b><p>{note.voc_memo || <span className="muted">입력된 내용이 없어요</span>}</p></div>
          <div><b>주요 이슈</b><p>{note.issue_memo || <span className="muted">입력된 내용이 없어요</span>}</p></div>
        </div>
      )}
    </div>
  );
}

function MonthlyReportPage() {
  const daily = useDaily();
  const months = useMemo(() => {
    if (!daily) return [];
    const set = new Set(daily.map(r => weekOf(r.report_date)?.ym).filter(Boolean));
    return [...set].sort().reverse();
  }, [daily]);
  const [ym, setYm] = useState('');
  useEffect(() => { if (!ym && months.length) setYm(months[0]); }, [months, ym]);

  if (!daily) return <div className="loading-screen">불러오는 중...</div>;
  if (!months.length) return <><PageHeader title="월간 보고" /><div className="card empty">CS 데일리 데이터가 아직 없어요</div></>;
  if (!ym) return null;

  const weeks = monthWeeks(ym);
  const from = weeks[0].from, to = weeks[weeks.length - 1].to;
  const inMonth = daily.filter(r => r.report_date >= from && r.report_date <= to);
  const brandRows = (b) => inMonth.filter(r => r.brand === b);
  const [y, m] = ym.split('-');

  return (
    <>
      <PageHeader title={`${y}년 ${Number(m)}월 월간 보고`} desc={`보고일 ${fmtDate(from)} ~ ${fmtDate(to)} · 매월 첫 화요일~다음 월요일 = 1주차 (전일 접수 기준)`}>
        <Select value={ym} onChange={setYm} options={months.map(v => ({ value: v, label: `${v.slice(0, 4)}년 ${Number(v.slice(5))}월` }))} />
        <button className="btn no-print" onClick={() => window.print()}>🖨 인쇄 / PDF</button>
      </PageHeader>

      <div className="grid grid-kpi">
        {['핀카', '하타'].map(b => {
          const s = sumRows(brandRows(b));
          return (
            <React.Fragment key={b}>
              <Kpi label={`${b} 주문건`} value={s.orders.toLocaleString()} sub={`취소율 ${pct(s.cancels, s.orders)}`} />
              <Kpi label={`${b} 반품·교환율`} value={pct(returnsExchanges(s), s.orders)} sub={`${returnsExchanges(s)}건 · 과실 ${faults(s)}건`} />
              <Kpi label={`${b} 부정 리뷰율`} value={pct(s.reviews_negative, s.reviews_total)} sub={`리뷰 ${s.reviews_total}건 중 ${s.reviews_negative}건`} />
            </React.Fragment>
          );
        })}
      </div>

      <div className="section-title">주간 주문 · 반품교환 · 과실 · 리뷰 현황</div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <BrandWeekTable brand="핀카" rows={brandRows('핀카')} weeks={weeks} />
        <BrandWeekTable brand="하타" rows={brandRows('하타')} weeks={weeks} />
      </div>

      <div className="section-title">채널별 현황</div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <ChannelTable brand="핀카" rows={brandRows('핀카').filter(r => r.platform !== BRAND_TOTAL)} />
        <ChannelTable brand="하타" rows={brandRows('하타').filter(r => r.platform !== BRAND_TOTAL)} />
      </div>

      <div className="section-title">VOC · 주요 이슈</div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <MonthNotes ym={ym} brand="핀카" />
        <MonthNotes ym={ym} brand="하타" />
      </div>
    </>
  );
}

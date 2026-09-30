// CS 데일리 리포트 (슬랙 공유용 이미지): 저장된 CS 데일리 숫자 + 그날 접수된 VOC(사진 포함)
// 이미지로 복사해서 슬랙에 바로 붙여넣거나 PNG로 저장

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// VOC 사진을 이미지로 찍을 수 있게 같은 출처(blob) 주소로 바꿔 둠
function useReportPhotos(paths) {
  const [urls, setUrls] = useState({});
  const key = paths.join('|');
  useEffect(() => {
    if (!paths.length) { setUrls({}); return; }
    let alive = true;
    const made = [];
    db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600).then(async ({ data }) => {
      const out = {};
      for (const d of data || []) {
        if (!d.signedUrl) continue;
        try { const b = await (await fetch(d.signedUrl)).blob(); out[d.path] = URL.createObjectURL(b); made.push(out[d.path]); }
        catch { out[d.path] = d.signedUrl; }
      }
      if (alive) setUrls(out);
    });
    return () => { alive = false; made.forEach(u => URL.revokeObjectURL(u)); };
  }, [key]);
  return urls;
}

function DailyReportPanel({ date: startDate, onClose }) {
  const { daily, cases, productById } = useApp();
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState('');
  // ◀ ▶ 로 지난 리포트 넘겨 보기 (보고일은 평일만: 토·일 건너뜀). 저장된 숫자로 다시 만들어서 보여줌
  const [date, setDate] = useState(startDate);
  const shiftDay = (n) => {
    let x = addDays(parseDate(date), n);
    while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, n);
    setDate(toISODate(x));
  };
  const [from, to] = dataRangeOf(date);
  const d = parseDate(date);
  // 전체 / 핀카만 / 하타만 (고른 브랜드만 이미지에 들어감)
  const [only, setOnly] = useState('');
  const brands = only ? [only] : ['핀카', '하타'];
  const titleBrand = only === '핀카' ? 'FINCA' : only === '하타' ? 'HaTA' : 'FINCA / HaTA';
  const rowsOf = (brand) => (daily || []).filter(r => r.report_date === date && r.brand === brand);
  const vocOf = (brand) => cases.filter(c => c.brand === brand && c.received_date >= from && c.received_date <= to)
    .sort((a, b) => (a.received_date || '').localeCompare(b.received_date || ''));
  const photoPaths = brands.flatMap(b => vocOf(b).map(c => (c.photos || [])[0]).filter(Boolean));
  const photos = useReportPhotos(photoPaths);
  // 게시판(재입고는 최근 7일 누적도)·리뷰: 액션(리오더·상품 개선)으로 이어지게 리포트에 같이 보여줌
  const week0 = toISODate(addDays(parseDate(to), -6));
  const [extra, setExtra] = useState(null);
  useEffect(() => {
    let alive = true;
    const s = (d) => `${d}T00:00:00+09:00`, e = (d) => `${d}T23:59:59+09:00`;
    Promise.all([
      fetchAll(() => db.from('board_items').select('brand,platform,product_name,title,content,inquiry_type,written_at').gte('written_at', s(week0 < from ? week0 : from)).lte('written_at', e(to)).order('id')),
      fetchAll(() => db.from('review_items').select('brand,platform,product_name,rating,content,written_at').gte('written_at', s(from)).lte('written_at', e(to)).order('id')),
    ]).then(([boards, reviews]) => { if (alive) setExtra({ boards, reviews }); }).catch(() => { if (alive) setExtra({ boards: [], reviews: [] }); });
    return () => { alive = false; };
  }, [from, to, week0]);

  const capture = async () => {
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    return new Promise(res => canvas.toBlob(res, 'image/png'));
  };
  const copy = async () => {
    setBusy('이미지 만드는 중...');
    try {
      const blob = await capture();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('📋 복사했어요 · 슬랙 입력창에 Ctrl+V 로 붙여넣으세요');
    } catch (e) { toast('❌ 복사하지 못했어요. PNG 저장을 써주세요 (' + (e.message || e) + ')', 'err'); }
    finally { setBusy(''); }
  };
  const save = async () => {
    setBusy('이미지 만드는 중...');
    try {
      const blob = await capture();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `CS데일리리포트_${only ? only + '_' : ''}${date}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally { setBusy(''); }
  };
  const slackText = `[${titleBrand} CS 데일리 리포트]\n${date.replace(/-/g, '.')} ${WEEKDAY[d.getDay()]}요일 (전일 접수 기준 · ${dataLabel(date)})`;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-wide" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>데일리 리포트 · 슬랙 공유</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-sm" onClick={() => shiftDay(-1)} title="전 보고일">◀</button>
              <b style={{ minWidth: 92, textAlign: 'center' }}>{fmtDate(date)} ({WEEKDAY[parseDate(date).getDay()]})</b>
              <button className="btn btn-sm" onClick={() => shiftDay(1)} disabled={date >= today()} title="다음 보고일">▶</button>
            </span>
            <Segmented options={[{ key: '', label: '전체' }, { key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }]} value={only} onChange={setOnly} />
            <button className="btn btn-primary" onClick={copy} disabled={!!busy}>📋 이미지 복사</button>
            <button className="btn" onClick={save} disabled={!!busy}>⬇ PNG 저장</button>
            <button className="btn" onClick={async () => { await navigator.clipboard.writeText(slackText); toast('📋 제목 글을 복사했어요'); }}>📝 제목 글 복사</button>
            <button className="btn btn-sm" onClick={onClose}>닫기</button>
          </div>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>{busy || '저장된 CS 데일리 숫자와 그날 접수된 VOC로 만들어요. 숫자를 고쳤다면 먼저 저장해 주세요. 슬랙: 제목 글 붙여넣기 → 이미지 붙여넣기(Ctrl+V)'}</div>
        <div style={{ overflowX: 'auto' }}>
          <div ref={ref} className="dr">
            <div className="dr-head">
              <div><div className="dr-title">{titleBrand} CS 데일리 리포트</div>
                <div className="dr-sub">{date.replace(/-/g, '.')} ({WEEKDAY[d.getDay()]}) · 전일 접수 기준 · 데이터 {dataLabel(date)}</div></div>
            </div>
            {brands.map(b => <DailyReportBrand key={b} brand={b} rows={rowsOf(b)} vocs={vocOf(b)} photos={photos} productById={productById}
              extra={extra} from={from} to={to} week0={week0} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// 리포트용 요약: 게시판 유형·재입고 상품(오늘 + 7일 누적)·리뷰 긍정/부정 비중과 많이 나온 말·액션 포인트
function reportInsights(brand, extra, vocs, from, to, week0, productById) {
  if (!extra) return null;
  const day = (w) => toISODate(new Date(w));
  const inDay = (w) => { const d = day(w); return d >= from && d <= to; };
  const boards = extra.boards.filter(r => r.brand === brand && r.inquiry_type !== ANSWER_TYPE && !isStaffAnswer(r.content));
  const today = boards.filter(r => inDay(r.written_at));
  const types = BOARD_TYPE_NAMES.map(t => ({ t, n: today.filter(r => r.inquiry_type === t).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  // 재입고: 상품별 (이름 앞 말머리 빼고 묶음)
  const restock = new Map();
  boards.filter(r => r.inquiry_type === '재입고' && day(r.written_at) >= week0).forEach(r => {
    const k = normProductName(r.product_name) || '(상품 미지정)';
    if (!restock.has(k)) restock.set(k, { name: r.product_name || '(상품 미지정)', week: 0, today: 0 });
    const x = restock.get(k); x.week++; if (inDay(r.written_at)) x.today++;
  });
  const restockTop = [...restock.values()].sort((a, b) => b.today - a.today || b.week - a.week).slice(0, 5);
  // 리뷰
  const reviews = extra.reviews.filter(r => r.brand === brand);
  const neg = reviews.filter(r => r.rating !== null && r.rating <= 3), pos = reviews.filter(r => r.rating !== null && r.rating > 3);
  const themes = (rows, negative) => {
    const m = new Map(); rows.forEach(r => reviewThemes(r.content, negative).forEach(t => m.set(t, (m.get(t) || 0) + 1)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  };
  // 액션: 재입고 7일 3건 이상 → 리오더 검토 · 부정 리뷰·과실 VOC 상품 → 검수·개선
  const reorder = restockTop.filter(x => x.week >= 3 && x.name !== '(상품 미지정)').slice(0, 3);
  const fixMap = new Map();
  neg.forEach(r => { const k = normProductName(r.product_name); if (k) fixMap.set(k, { name: r.product_name, n: (fixMap.get(k)?.n || 0) + 1, why: '부정 리뷰' }); });
  vocs.filter(c => isFault(c.voc_type)).forEach(c => { const nm = caseProductName(c, productById) || ''; const k = normProductName(nm); if (k) fixMap.set(k, { name: nm, n: (fixMap.get(k)?.n || 0) + 1, why: '과실 VOC' }); });
  const fix = [...fixMap.values()].sort((a, b) => b.n - a.n).slice(0, 3);
  return { boardCount: today.length, types, restockTop, reviews, neg, pos, posThemes: themes(pos, false), negThemes: themes(neg, true), reorder, fix };
}

function DailyReportBrand({ brand, rows, vocs, photos, productById, extra, from, to, week0 }) {
  const color = BRAND_COLOR[brand];
  const plat = rows.filter(r => r.platform !== BRAND_TOTAL);
  const s = sumRows(rows);
  const re = returnsExchanges(s), fa = faults(s);
  const ratio = (a, n) => (n ? `${(a / n * 100).toFixed(1)}%` : '-');
  const noCall = NO_CALL_BRANDS.includes(brand);
  const tiles = [
    { label: '총 주문', value: s.orders },
    { label: '출고전 취소', value: s.cancels, sub: ratio(s.cancels, s.orders) },
    { label: '반품·교환', value: re, sub: ratio(re, s.orders), warn: s.orders && re / s.orders > 0.05 },
    { label: '과실', value: fa, sub: ratio(fa, s.orders), warn: fa > 0 },
    { label: '작성 리뷰', value: s.reviews_total, sub: `부정 ${s.reviews_negative}`, subWarn: s.reviews_negative > 0 },
    { label: '게시판', value: s.board_total },
    { label: '해피톡', value: s.ht_total, sub: s.ht_voc ? `VOC ${s.ht_voc}` : '' },
    ...(noCall ? [] : [{ label: '전화', value: s.call_in, sub: `발신 ${s.call_out || 0}` }]),
  ];
  // 수치가 0인 판매처도 모두 보여줌 (저장된 줄 = 기준 관리의 데일리 플랫폼)
  const shown = plat;
  const ins = reportInsights(brand, extra, vocs, from, to, week0, productById);
  const pctOf = (a, b) => (b ? Math.round(a / b * 100) : 0);
  return (
    <div className="dr-brand" style={{ '--c': color }}>
      <div className="dr-brand-bar">{brand}</div>
      {!rows.length ? <div className="dr-empty">이 날짜에 저장된 CS 데일리가 없어요</div> : <>
        <div className="dr-tiles">
          {tiles.map(t => (
            <div key={t.label} className={`dr-tile${t.warn ? ' warn' : ''}`}>
              <div className="dr-tile-label">{t.label}</div>
              <div className="dr-tile-value">{(t.value || 0).toLocaleString()}</div>
              {t.sub ? <div className="dr-tile-sub" style={t.subWarn ? { color: '#C0392B' } : null}>{t.sub}</div> : null}
            </div>
          ))}
        </div>
        {shown.length > 0 && (
          <table className="dr-table">
            <thead><tr><th>플랫폼</th><th>주문</th><th>출고전 취소</th><th>단순 반품</th><th>단순 교환</th><th>과실 반품·교환</th><th>반품·교환율</th><th>리뷰 (부정)</th><th>게시판</th></tr></thead>
            <tbody>{shown.map(r => (
              <tr key={r.platform}>
                <td>{r.platform}</td><td>{r.orders || 0}</td><td>{r.cancels || 0}</td><td>{r.return_simple || 0}</td><td>{r.exchange_simple || 0}</td>
                <td className={faults(r) ? 'bad' : ''}>{faults(r)}</td><td>{ratio(returnsExchanges(r), r.orders)}</td>
                <td>{r.reviews_total || 0}{r.reviews_negative ? <span className="bad"> ({r.reviews_negative})</span> : ''}</td><td>{r.board_total || 0}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </>}

      {ins && (
        <>
          {(ins.reorder.length > 0 || ins.fix.length > 0) && (
            <div className="dr-action">
              <div className="dr-action-title">📌 액션 포인트</div>
              {ins.reorder.length > 0 && <div><b>🔁 리오더 검토</b> · 재입고 문의 (최근 7일) {ins.reorder.map(x => `${x.name} ${x.week}건`).join(' / ')}</div>}
              {ins.fix.length > 0 && <div><b>🛠 상품 검수·개선</b> · {ins.fix.map(x => `${x.name} (${x.why} ${x.n})`).join(' / ')}</div>}
            </div>
          )}
          <div className="dr-grid">
            <div className="dr-box">
              <div className="dr-box-title">💬 게시판 문의 {ins.boardCount}건 <span>유형별</span></div>
              {ins.types.length ? <div className="dr-chips">{ins.types.map(x => <span key={x.t} className={x.t === '재입고' ? 'hot' : ''}>{x.t} {x.n}</span>)}</div> : <div className="dr-note">업로드된 게시판 문의가 없어요</div>}
              <div className="dr-box-sub">🔁 재입고 문의 상품 <span>오늘 · 최근 7일</span></div>
              {ins.restockTop.length ? (
                <table className="dr-mini"><tbody>{ins.restockTop.map(x => (
                  <tr key={x.name}><td>{x.name}</td><td className="n">{x.today}</td><td className="n muted">{x.week}</td></tr>
                ))}</tbody></table>
              ) : <div className="dr-note">최근 7일 재입고 문의 없음</div>}
            </div>
            <div className="dr-box">
              <div className="dr-box-title">⭐ 리뷰 {ins.reviews.length}건 <span>업로드 기준</span></div>
              {ins.reviews.length ? (
                <>
                  <div className="dr-ratio">
                    <div className="pos" style={{ width: `${pctOf(ins.pos.length, ins.reviews.length)}%` }}>긍정 {pctOf(ins.pos.length, ins.reviews.length)}%</div>
                    <div className="neg" style={{ width: `${100 - pctOf(ins.pos.length, ins.reviews.length)}%` }}>{ins.neg.length ? `부정 ${100 - pctOf(ins.pos.length, ins.reviews.length)}%` : ''}</div>
                  </div>
                  <div className="dr-box-sub">👍 좋았던 점</div>
                  <div className="dr-chips">{ins.posThemes.length ? ins.posThemes.map(([t, n]) => <span key={t}>{t} {n}</span>) : <span className="none">-</span>}</div>
                  <div className="dr-box-sub">👎 아쉬운 점 <span>부정 {ins.neg.length}건</span></div>
                  <div className="dr-chips">{ins.negThemes.length ? ins.negThemes.map(([t, n]) => <span key={t} className="hot">{t} {n}</span>) : <span className="none">-</span>}</div>
                  {ins.neg.slice(0, 3).map((r, i) => (
                    <div key={i} className="dr-quote"><b>{'★'.repeat(r.rating || 0)}</b> {r.product_name}<div>“{String(r.content || '').replace(/\s+/g, ' ').slice(0, 90)}{String(r.content || '').length > 90 ? '…' : ''}”</div></div>
                  ))}
                </>
              ) : <div className="dr-note">이 날짜에 업로드된 리뷰가 없어요</div>}
            </div>
          </div>
        </>
      )}

      <div className="dr-voc-title">{brand} VOC <span>{vocs.length}건</span></div>
      {!vocs.length ? <div className="dr-empty">접수된 VOC 없음</div> : (
        <table className="dr-table dr-voc">
          <thead><tr><th>NO.</th><th>상품명</th><th>고객 인입 / VOC 내용</th><th>처리 방법</th><th>이미지</th></tr></thead>
          <tbody>{vocs.map((c, i) => (
            <tr key={c.id}>
              <td>{i + 1}</td>
              <td className="dr-prod">{caseProductName(c, productById)}<div className="dr-meta">{[c.platform, c.reason_category].filter(Boolean).join(' · ')}</div></td>
              <td className="dr-text">{c.reason_detail || '-'}</td>
              <td className="dr-text">{[c.handling, c.note].filter(Boolean).join('\n') || c.status}</td>
              <td>{(c.photos || [])[0] && photos[c.photos[0]] ? <img src={photos[c.photos[0]]} alt="" /> : <span className="dr-meta">-</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

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

function DailyReportPanel({ date, onClose }) {
  const { daily, cases, productById } = useApp();
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState('');
  const [from, to] = dataRangeOf(date);
  const d = parseDate(date);
  const brands = ['핀카', '하타'];
  const rowsOf = (brand) => (daily || []).filter(r => r.report_date === date && r.brand === brand);
  const vocOf = (brand) => cases.filter(c => c.brand === brand && c.received_date >= from && c.received_date <= to)
    .sort((a, b) => (a.received_date || '').localeCompare(b.received_date || ''));
  const photoPaths = brands.flatMap(b => vocOf(b).map(c => (c.photos || [])[0]).filter(Boolean));
  const photos = useReportPhotos(photoPaths);

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
      a.href = URL.createObjectURL(blob); a.download = `CS데일리리포트_${date}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally { setBusy(''); }
  };
  const slackText = `[FINCA / HaTA CS 데일리 리포트]\n${date.replace(/-/g, '.')} ${WEEKDAY[d.getDay()]}요일 (전일 접수 기준 · ${dataLabel(date)})`;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel panel-wide" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>데일리 리포트 · 슬랙 공유</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
              <div><div className="dr-title">FINCA / HaTA CS 데일리 리포트</div>
                <div className="dr-sub">{date.replace(/-/g, '.')} ({WEEKDAY[d.getDay()]}) · 전일 접수 기준 · 데이터 {dataLabel(date)}</div></div>
            </div>
            {brands.map(b => <DailyReportBrand key={b} brand={b} rows={rowsOf(b)} vocs={vocOf(b)} photos={photos} productById={productById} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function DailyReportBrand({ brand, rows, vocs, photos, productById }) {
  const color = BRAND_COLOR[brand];
  const plat = rows.filter(r => r.platform !== BRAND_TOTAL);
  const s = sumRows(rows);
  const re = returnsExchanges(s), fa = faults(s);
  const ratio = (a, n) => (n ? `${(a / n * 100).toFixed(1)}%` : '-');
  const tiles = [
    { label: '총 주문', value: s.orders },
    { label: '출고전 취소', value: s.cancels, sub: ratio(s.cancels, s.orders) },
    { label: '반품·교환', value: re, sub: ratio(re, s.orders), warn: s.orders && re / s.orders > 0.05 },
    { label: '과실', value: fa, sub: ratio(fa, s.orders), warn: fa > 0 },
    { label: '작성 리뷰', value: s.reviews_total, sub: `부정 ${s.reviews_negative}`, subWarn: s.reviews_negative > 0 },
    { label: '게시판', value: s.board_total },
    ...(s.ht_total ? [{ label: '해피톡', value: s.ht_total, sub: s.ht_voc ? `VOC ${s.ht_voc}` : '' }] : []),
    ...(s.call_in + s.call_out ? [{ label: '전화', value: s.call_in, sub: `발신 ${s.call_out}` }] : []),
  ];
  const shown = plat.filter(r => ALL_DAILY_FIELDS.some(f => r[f]));
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

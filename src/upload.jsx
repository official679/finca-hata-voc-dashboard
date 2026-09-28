// 플랫폼 다운로드 파일(엑셀·CSV) 읽기 · 형식 자동 인식 · 업로드

const PLATFORM_NAMES = { '29cm': '29CM', 'w컨셉': 'W컨셉', 'wconcept': 'W컨셉', 'eql': 'EQL', '무신사': '무신사', '아임웹': '아임웹', '카페24': '카페24' };
const normPlatform = (p) => PLATFORM_NAMES[String(p || '').trim().toLowerCase()] || String(p || '').trim();
const normBrand = (b) => {
  const s = String(b || '').trim().toLowerCase();
  if (s.includes('핀카') || s.includes('finca')) return '핀카';
  if (s.includes('하타') || s.includes('hata')) return '하타';
  return '';
};

// 엑셀 날짜(숫자) · 'YYYY.MM.DD HH:mm:ss' 같은 문자열 → 한국 시간 기준
function parseWhen(v) {
  let y, mo, d, h = 0, mi = 0, s = 0, hasTime = false;
  if (typeof v === 'string' && /^\s*\d{5}(\.\d+)?\s*$/.test(v)) v = Number(v);   // CSV에 문자로 들어온 엑셀 날짜
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    [y, mo, d, h, mi, s] = [v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()];
    hasTime = h + mi + s > 0;
  } else if (typeof v === 'number' && v > 20000) {
    const totalSec = Math.round(v * 86400);
    const dt = new Date(Date.UTC(1899, 11, 30) + totalSec * 1000);
    [y, mo, d, h, mi, s] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds()];
    hasTime = v % 1 !== 0;
  } else {
    const m = String(v || '').match(/(\d{4})[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (m[4] !== undefined) { [h, mi, s] = [+m[4], +m[5], +(m[6] || 0)]; hasTime = true; }
  }
  if (![y, mo, d, h, mi, s].every(Number.isFinite) || y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return {
    iso: `${date}T${pad(h)}:${pad(mi)}:${pad(s)}+09:00`,
    key: hasTime ? `${date}T${pad(h)}:${pad(mi)}` : date,
  };
}

// 간단한 해시 (중복 확인용 키)
function hashText(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const contentKey = (when, text) => hashText(`${when ? when.key : ''}|${String(text || '').replace(/\s+/g, '').slice(0, 300)}`);

// 게시판 본문의 HTML 태그·붙여넣은 이미지 제거
const stripHtml = (s) => String(s || '')
  .replace(/<img[^>]*>/gi, ' [이미지] ')
  .replace(/<br\s*\/?>|<\/p>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n').trim();

const num = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// kind: review | board. 순서 중요 (더 구체적인 형식을 먼저)
const FILE_FORMATS = [
  { kind: 'review', label: '기존 시트 리뷰 low', headers: ['front_brand_name', '플랫폼', 'item_name', 'point', 'contents', 'insert_timestamp'],
    map: (r) => ({ brand: normBrand(r.front_brand_name), platform: normPlatform(r['플랫폼']), product_name: r.item_name, rating: num(r.point), content: r.contents, when: parseWhen(r.insert_timestamp), order_no: r['주문번호'] }) },
  { kind: 'review', label: '29CM 리뷰', headers: ['front_brand_name', 'item_name', 'point', 'contents', 'insert_timestamp'],
    map: (r) => ({ brand: normBrand(r.front_brand_name), platform: '29CM', product_name: r.item_name, rating: num(r.point), content: r.contents, when: parseWhen(r.insert_timestamp), order_no: r.order_serial }) },
  { kind: 'review', label: '29CM 리뷰 (파트너 화면)', headers: ['리뷰번호', '상품명', '별점', '리뷰 내용', '등록일시'],
    map: (r) => ({ platform: '29CM', product_name: r['상품명'], rating: num(r['별점']), content: r['리뷰 내용'], when: parseWhen(r['등록일시']), order_no: r['주문번호'] }) },
  { kind: 'review', label: '아임웹 리뷰', headers: ['리뷰작성일', '리뷰본문', '상품명', '리뷰별점'],
    map: (r) => ({ platform: '아임웹', product_name: r['상품명'], rating: num(r['리뷰별점']), content: r['리뷰본문'], when: parseWhen(r['리뷰작성일']), order_no: r['주문번호'] }) },
  { kind: 'review', label: '무신사 리뷰', headers: ['상품명', '후기 내용', '평점', '등록일시'],
    map: (r) => ({ platform: '무신사', product_name: r['상품명'], rating: num(r['평점']), content: r['후기 내용'], when: parseWhen(r['등록일시']) }) },

  { kind: 'board', label: '아임웹 게시판', headers: ['제목', '내용', '작성시각', '답글'],
    map: (r) => ({ platform: '아임웹', product_name: r['상품명'], option_text: r['옵션'], title: r['제목'], content: r['내용'], when: parseWhen(r['작성시각']), answer: r['답글'], answered: parseWhen(r['답글 작성시간']) }) },
  { kind: 'board', label: '카페24 게시판', headers: ['게시물 제목', '내용', '게시물 작성일시'],
    map: (r) => ({ platform: '카페24', platform_category: r['카테고리'], title: r['게시물 제목'], content: stripHtml(r['내용']), when: parseWhen(r['게시물 작성일시']) }) },
  { kind: 'board', label: '29CM 게시판', headers: ['브랜드', '상품', '문의 내용', '등록일시'],
    map: (r) => ({ brand: normBrand(r['브랜드']), platform: '29CM', product_name: r['상품'], content: r['문의 내용'], when: parseWhen(r['등록일시']) }) },
  { kind: 'board', label: '무신사 게시판', headers: ['상품명', '문의구분', '제목', '문의내용', '작성일'],
    map: (r) => ({ platform: '무신사', product_name: r['상품명'], option_text: r['옵션'], platform_category: r['문의구분'], title: r['제목'], content: r['문의내용'], when: parseWhen(r['작성일']) }) },
  { kind: 'board', label: '무신사 게시판', headers: ['상품명', '문의구분', '제목', '내용', '작성일'],
    map: (r) => ({ platform: '무신사', product_name: r['상품명'], option_text: r['옵션'], platform_category: r['문의구분'], title: r['제목'], content: r['내용'], when: parseWhen(r['작성일']) }) },
];

// 파일 → 시트별 { name, format, rows(정리된 값) }
async function readUploadFile(file, kind) {
  // raw: CSV의 날짜 모양 글자를 멋대로 바꾸지 않고 글자 그대로 읽음 (엑셀 파일에는 영향 없음)
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, codepage: 65001, raw: /\.csv$/i.test(file.name) });
  return wb.SheetNames.map(name => {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let h = 0; h < Math.min(10, grid.length); h++) {
      const header = grid[h].map(c => String(c).trim());
      const format = FILE_FORMATS.find(f => f.kind === kind && f.headers.every(x => header.includes(x)));
      if (!format) continue;
      const rows = grid.slice(h + 1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .map(r => format.map(Object.fromEntries(header.map((k, i) => [k, r[i]]))))
        // 리뷰·게시판은 내용이 있어야, 주문·반품처럼 key(품목 번호)가 있는 형식은 key가 있어야 저장
        .filter(r => (r.key !== undefined ? !!r.key : r.content && String(r.content).trim()));
      return { name, format, rows };
    }
    return { name, format: null, rows: [], empty: !grid.some(r => r.some(c => String(c).trim() !== '')) };
  });
}

// 상품 마스터 연결: 이름 앞의 [29CM 단독] 같은 말머리·공백을 빼고 비교
function normProductName(name) {
  let s = String(name || ''), prev;
  do { prev = s; s = s.replace(/^\s*(\[[^\]]*\]|\([^)]*\)|단품\))\s*/, ''); } while (s !== prev);
  return s.replace(/\(\d{5,}\)\s*$/, '').replace(/\s+/g, '').toLowerCase();
}
const str = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
function productMatcher(products) {
  const map = new Map();
  products.forEach(p => { const k = normProductName(p.product_name); if (k && !map.has(k)) map.set(k, p.id); });
  return (name) => map.get(normProductName(name)) || null;
}

// 업로드 화면 (리뷰·게시판 공통)
function UploadPanel({ kind, table, toRow, onDone, guide, afterInsert, itemLabel, linkProducts = true }) {
  const { products } = useApp();
  const toast = useToast();
  const [brand, setBrand] = useState('');
  const [sheets, setSheets] = useState(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  const pick = async (files) => {
    setResult(null);
    setBusy('파일 읽는 중...');
    try {
      const all = [];
      for (const file of files) {
        if (!brand) { const b = normBrand(file.name); if (b) setBrand(b); }
        (await readUploadFile(file, kind)).forEach(s => all.push({ ...s, file: file.name }));
      }
      setSheets(all);
    } catch (e) {
      toast('❌ 파일을 읽지 못했어요: ' + e.message, 'err');
    } finally { setBusy(''); }
  };

  const ready = sheets ? sheets.filter(s => s.format && s.rows.length) : [];
  const needsBrand = ready.some(s => s.rows.some(r => !r.brand));

  const upload = async () => {
    const match = productMatcher(products);
    const rows = [];
    ready.forEach(s => s.rows.forEach(r => {
      const b = r.brand || brand;
      if (!b) return;
      rows.push({
        ...toRow(r), brand: b, platform: r.platform,
        source_key: r.key ? String(r.key) : contentKey(r.when, (r.title || '') + r.content),
        ...(linkProducts ? { product_id: match(r.product_name) } : {}),
      });
    }));
    // 같은 파일 안의 중복 제거
    const unique = [...new Map(rows.map(r => [r.platform + '|' + r.source_key, r])).values()];
    let inserted = 0;
    const newRows = [];
    try {
      for (let i = 0; i < unique.length; i += 500) {
        setBusy(`올리는 중... ${Math.min(i + 500, unique.length).toLocaleString()} / ${unique.length.toLocaleString()}`);
        // 이번에 새로 저장된 줄만 돌아옴 (이미 있던 줄은 건너뜀)
        // 후속 처리가 필요할 때만 전체 줄을 돌려받음 (주문처럼 많은 데이터는 id만)
        const { data, error } = await db.from(table).upsert(unique.slice(i, i + 500), { onConflict: 'platform,source_key', ignoreDuplicates: true }).select(afterInsert ? '*' : 'id');
        if (error) throw error;
        inserted += data.length;
        newRows.push(...data);
      }
      let extra = null;
      if (afterInsert && newRows.length) { setBusy('후속 처리 중...'); extra = await afterInsert(newRows); }
      setResult({ total: unique.length, inserted, dup: rows.length - unique.length, skipped: unique.length - inserted, extra });
      setSheets(null);
      toast(`✅ 새 ${itemLabel || (kind === 'review' ? '리뷰' : '문의')} ${inserted.toLocaleString()}건 저장`);
      if (onDone) onDone();
    } catch (e) {
      toast('❌ 업로드 실패: ' + (e.message || e), 'err');
    } finally { setBusy(''); }
  };

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <div className="field">
          <label>브랜드 <span className="muted" style={{ fontWeight: 400 }}>(파일에 브랜드가 없을 때 사용)</span></label>
          <Segmented options={[{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }]} value={brand} onChange={setBrand} />
        </div>
        <div className="field">
          <label>파일</label>
          <button className="btn btn-primary" onClick={() => inputRef.current.click()} disabled={!!busy}>📂 파일 선택 (엑셀·CSV, 여러 개 가능)</button>
          <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" hidden onChange={e => { pick([...e.target.files]); e.target.value = ''; }} />
        </div>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>{guide}</div>

      {busy && <div className="empty">{busy}</div>}

      {sheets && !busy && (
        <>
          <div className="form-section">파일 내용 확인</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>파일 · 시트</th><th>인식된 형식</th><th>플랫폼</th><th className="num">건수</th><th>기간</th></tr></thead>
              <tbody>
                {sheets.map(s => {
                  const dates = s.rows.map(r => r.when?.key).filter(Boolean).sort();
                  return (
                    <tr key={s.file + s.name}>
                      <td>{s.file} · {s.name}</td>
                      <td>{s.format ? <span className="chip chip-green">{s.format.label}</span> : s.empty ? <span className="chip">빈 시트</span> : <span className="chip chip-amber">형식을 알 수 없어 건너뜀</span>}</td>
                      <td>{[...new Set(s.rows.map(r => r.platform))].join(', ') || '-'}</td>
                      <td className="num">{s.rows.length.toLocaleString()}</td>
                      <td>{dates.length ? `${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)}` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {needsBrand && !brand && <div className="login-error" style={{ textAlign: 'left' }}>브랜드가 없는 파일이 있어요. 위에서 브랜드를 골라주세요.</div>}
          <div className="form-actions">
            <button className="btn" onClick={() => setSheets(null)}>취소</button>
            <button className="btn btn-primary" disabled={!ready.length || (needsBrand && !brand)} onClick={upload}>
              ⬆ {ready.reduce((a, s) => a + s.rows.length, 0).toLocaleString()}건 업로드
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="card" style={{ marginTop: 16, background: 'var(--success-soft)', border: 'none' }}>
          ✅ 업로드 완료 — 새로 저장 <b>{result.inserted.toLocaleString()}건</b>
          {result.skipped > 0 && <> · 이미 있던 {result.skipped.toLocaleString()}건은 건너뜀</>}
          {result.dup > 0 && <> · 파일 안 중복 {result.dup.toLocaleString()}건 제외</>}
          {result.extra && <div style={{ marginTop: 6 }}>{result.extra}</div>}
        </div>
      )}
    </div>
  );
}

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
// kind: 'review' 한 종류 또는 ['review', 'board', 'order'] 여러 종류 (시트마다 칸 이름을 보고 알아서 판단)
async function readUploadFile(file, kind) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  // raw: CSV의 날짜 모양 글자를 멋대로 바꾸지 않고 글자 그대로 읽음 (엑셀 파일에는 영향 없음)
  // CSV는 UTF-8이 아니면 한글 윈도우 방식(CP949, 오클릭 등)으로 다시 읽음
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('euc-kr').decode(buf); }
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', cellDates: false, raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: false });
  }
  return wb.SheetNames.map(name => {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let h = 0; h < Math.min(10, grid.length); h++) {
      const header = grid[h].map(c => String(c).trim());
      const format = FILE_FORMATS.find(f => kinds.includes(f.kind) && f.headers.every(x => header.includes(x)));
      if (!format) continue;
      const rows = grid.slice(h + 1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .map(r => format.map(Object.fromEntries(header.map((k, i) => [k, r[i]]))))
        // 리뷰·게시판은 내용이 있어야, 주문·반품처럼 key(품목 번호)가 있는 형식은 key가 있어야 저장
        .filter(r => (r.key !== undefined ? !!r.key : r.content && String(r.content).trim()));
      // 품목 번호가 없는 형식(오클릭 등): 같은 내용 줄이 여러 개면 순번을 붙여 서로 다른 줄로 (파일을 다시 올려도 같은 순번 → 중복 안 됨)
      if (format.numberDupKeys) {
        const seen = new Map();
        rows.forEach(r => { const n = (seen.get(r.key) || 0) + 1; seen.set(r.key, n); if (n > 1) r.key = `${r.key}#${n}`; });
      }
      // 주문: 주문일시 칸이 날짜가 아니면 칸이 밀린 줄 → 저장하지 않고 개수만 알려줌 (수량·상품명이 엉뚱하게 들어가는 것 방지)
      if (format.kind === 'order') {
        const good = rows.filter(r => r.when);
        return { name, format, rows: good, skipped: rows.length - good.length };
      }
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

const KIND_LABEL = { review: '리뷰', board: '게시판 문의', order: '주문 품목' };

// 업로드 안내: 종류별로 무엇이 되는지 + 알아보는 파일 형식(필수 칸)은 FILE_FORMATS에서 자동으로 만듦
const KIND_GUIDE = {
  review: { icon: '⭐', title: '리뷰', does: '긍정·부정 자동 분류 · 새로 들어온 1~3점 리뷰는 VOC 접수로 자동 등록 · 고객 이름·아이디는 저장 안 함' },
  board: { icon: '💬', title: '게시판 문의', does: '재입고·배송·교환/반품 등 문의 유형 자동 분류 · 우리 답변 글은 집계에서 제외 · 작성자 정보는 저장 안 함' },
  order: { icon: '🛒', title: '주문', does: '대분류(베딩·러그·바스·홈데코·웨어·잡화·키친)와 세트 여부 자동 분류 · 주문자·수령자·연락처는 저장 안 함' },
};

// 양식 파일 받기: 첫 줄 = 꼭 있어야 하는 칸 이름, 둘째 줄 = 예시(있으면). 이 양식에 맞춰 채워서 올리면 알아봄
function downloadTemplate(name, headers, example) {
  const rows = [headers];
  if (example) rows.push(headers.map(h => example[h] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(h => ({ wch: Math.max(10, String(h).length * 2 + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '양식');
  XLSX.writeFile(wb, `양식_${name.replace(/[\\/:*?"<>|\s]+/g, '_')}.xlsx`);
}
const TemplateButton = ({ name, headers, example, label = '📄 양식' }) => (
  <button type="button" className="btn btn-sm" title="첫 줄에 필요한 칸 이름이 들어 있는 빈 엑셀" onClick={() => downloadTemplate(name, headers, example)}>{label}</button>
);

function UploadGuide({ kinds }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="upload-guide">
      <div className="upload-guide-rules">
        <b>이렇게 올리면 돼요</b>
        <ul>
          <li>플랫폼에서 받은 <b>엑셀·CSV 파일을 그대로</b> 올리세요. 칸을 지우거나 순서를 바꿀 필요 없어요.</li>
          <li>리뷰·게시판·주문 파일을 <b>한 번에 여러 개</b> 골라도 돼요. 시트마다 종류를 알아서 구분해요.</li>
          <li>한 파일에 플랫폼별 시트가 여러 개 있어도 괜찮아요. <b>첫 줄(제목 줄)의 칸 이름</b>으로 형식을 알아봐요.</li>
          <li>같은 파일·같은 기간을 다시 올려도 <b>중복 저장되지 않아요.</b></li>
          <li>파일에 브랜드 칸이 없으면 위에서 고른 브랜드로 저장돼요. 파일 이름에 '핀카'·'하타'가 있으면 자동으로 골라져요.</li>
          <li>직접 만들어 올릴 때는 아래 <b>📄 파일 형식 보기 · 양식 받기</b> 버튼 → 형식마다 있는 <b>📄 양식</b>을 받아 칸 이름을 그대로 두고 채우면 돼요.</li>
        </ul>
      </div>
      <button className="btn btn-sm" onClick={() => setOpen(!open)}>{open ? '▲ 파일 형식·양식 접기' : '📄 파일 형식 보기 · 양식 받기'}</button>
      {open && (
        <div className="grid grid-2w" style={{ marginTop: 10 }}>
          {kinds.map(k => (
            <div key={k} className="upload-guide-kind">
              <div className="upload-guide-title">{KIND_GUIDE[k].icon} {KIND_GUIDE[k].title}</div>
              <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{KIND_GUIDE[k].does}</div>
              <table className="table">
                <thead><tr><th>파일 형식</th><th>첫 줄에 꼭 있어야 하는 칸</th><th></th></tr></thead>
                <tbody>
                  {FILE_FORMATS.filter(f => f.kind === k).map(f => (
                    <tr key={f.label + f.headers.join()}><td style={{ whiteSpace: 'nowrap' }}>{f.label}</td><td>{f.headers.join(' · ')}</td>
                      <td><TemplateButton name={f.label} headers={f.headers} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 업로드 화면 (리뷰·게시판·주문 공통)
// configs: { review: { table, toRow, linkProducts, afterInsert(newRows, app) }, board: {...}, order: {...} }
function UploadPanel({ configs, onDone, guide }) {
  const app = useApp();
  const { products } = app;
  const kinds = Object.keys(configs);
  const toast = useToast();
  const [brand, setBrand] = useState('');
  const [sheets, setSheets] = useState(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [summaryMode, setSummaryMode] = useState(false);   // 주문을 월·상품별 요약으로만 저장 (지난 주문용)
  const inputRef = useRef(null);

  const pick = async (files) => {
    setResult(null);
    setBusy('파일 읽는 중...');
    try {
      const all = [];
      for (const file of files) {
        if (!brand) { const b = normBrand(file.name); if (b) setBrand(b); }
        (await readUploadFile(file, kinds)).forEach(s => all.push({ ...s, file: file.name }));
      }
      setSheets(all);
    } catch (e) {
      toast('❌ 파일을 읽지 못했어요: ' + e.message, 'err');
    } finally { setBusy(''); }
  };

  const ready = sheets ? sheets.filter(s => s.format && s.rows.length) : [];
  const needsBrand = ready.some(s => s.rows.some(r => !r.brand));

  // 종류(리뷰·게시판·주문)별로 나눠서 각자의 표에 저장
  const upload = async () => {
    const match = productMatcher(products);
    const results = [];
    try {
      for (const kind of kinds) {
        const cfg = configs[kind];
        if (kind === 'order' && summaryMode) {
          const lines = [];
          ready.filter(s => s.format.kind === 'order').forEach(s => s.rows.forEach(r => lines.push({ ...r, brand: r.brand || brand })));
          const sums = summarizeOrders(lines);
          // 같은 월·브랜드·판매처·상품은 덮어씀 → 같은 파일을 다시 올려도 두 번 세지 않음
          for (let i = 0; i < sums.length; i += 500) {
            setBusy(`주문 요약 올리는 중... ${Math.min(i + 500, sums.length).toLocaleString()} / ${sums.length.toLocaleString()}`);
            const { error } = await db.from('order_monthly').upsert(sums.slice(i, i + 500), { onConflict: 'ym,brand,platform,product_name' });
            if (error) throw new Error(`주문 요약: ${error.message}`);
          }
          results.push({ kind, summary: true, lines: lines.length, inserted: sums.length });
          continue;
        }
        const rows = [];
        ready.filter(s => s.format.kind === kind).forEach(s => s.rows.forEach(r => {
          const b = r.brand || brand;
          if (!b) return;
          rows.push({
            ...cfg.toRow(r), brand: b, platform: r.platform,
            source_key: r.key ? String(r.key) : contentKey(r.when, (r.title || '') + r.content),
            ...(cfg.linkProducts === false ? {} : { product_id: match(r.product_name) }),
          });
        }));
        if (!rows.length) continue;
        // 같은 파일 안의 중복 제거
        const unique = [...new Map(rows.map(r => [r.platform + '|' + r.source_key, r])).values()];
        let inserted = 0;
        const newRows = [];
        for (let i = 0; i < unique.length; i += 500) {
          setBusy(`${KIND_LABEL[kind]} 올리는 중... ${Math.min(i + 500, unique.length).toLocaleString()} / ${unique.length.toLocaleString()}`);
          // 이번에 새로 저장된 줄만 돌아옴 (이미 있던 줄은 건너뜀). 후속 처리가 필요할 때만 전체 줄을, 아니면 id만
          const { data, error } = await db.from(cfg.table).upsert(unique.slice(i, i + 500), { onConflict: 'platform,source_key', ignoreDuplicates: true }).select(cfg.afterInsert ? '*' : 'id');
          if (error) throw new Error(`${KIND_LABEL[kind]}: ${error.message}`);
          inserted += data.length;
          newRows.push(...data);
        }
        let extra = null;
        if (cfg.afterInsert && newRows.length) { setBusy('후속 처리 중...'); extra = await cfg.afterInsert(newRows, app); }
        results.push({ kind, inserted, dup: rows.length - unique.length, skipped: unique.length - inserted, extra });
      }
      setResult(results);
      setSheets(null);
      toast('✅ 업로드 완료');
      if (onDone) onDone();
    } catch (e) {
      if (results.length) setResult(results);
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
      {guide}

      {busy && <div className="empty">{busy}</div>}

      {sheets && !busy && (
        <>
          <div className="form-section">파일 내용 확인</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>파일 · 시트</th><th>종류</th><th>인식된 형식</th><th>플랫폼</th><th className="num">건수</th><th>기간</th></tr></thead>
              <tbody>
                {sheets.map(s => {
                  const dates = s.rows.map(r => r.when?.key).filter(Boolean).sort();
                  return (
                    <tr key={s.file + s.name}>
                      <td>{s.file} · {s.name}</td>
                      <td>{s.format ? <b>{KIND_LABEL[s.format.kind]}</b> : '-'}</td>
                      <td>{s.format ? <span className="chip chip-green">{s.format.label}</span> : s.empty ? <span className="chip">빈 시트</span> : <span className="chip chip-amber">형식을 알 수 없어 건너뜀</span>}</td>
                      <td>{[...new Set(s.rows.map(r => r.platform))].join(', ') || '-'}</td>
                      <td className="num">{s.rows.length.toLocaleString()}{s.skipped > 0 && <div className="muted" style={{ fontSize: 12 }} title="주문 날짜 칸이 비었거나 날짜가 아닌 줄 (칸이 밀렸을 수 있음) — 파일에서 고치면 다시 올릴 수 있어요">날짜 없는 {s.skipped.toLocaleString()}줄 제외</div>}</td>
                      <td>{dates.length ? `${dates[0].slice(0, 10)} ~ ${dates[dates.length - 1].slice(0, 10)}` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {ready.some(s => s.format.kind === 'order') && (
            <label className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, background: summaryMode ? 'var(--accent-soft)' : undefined, cursor: 'pointer' }}>
              <input type="checkbox" checked={summaryMode} onChange={e => setSummaryMode(e.target.checked)} style={{ marginTop: 4 }} />
              <span>
                <b>주문은 월·상품별 요약으로만 저장</b> <span className="muted">(상반기처럼 지난 주문용)</span>
                <div className="hint">한 줄씩 저장하지 않고 월·판매처·상품별 개수(주문·취소·반품·교환)만 저장해요. 용량이 약 1/20.
                  대신 CS 데일리 자동 채우기·하루 단위 분석에는 쓰이지 않아요. <b>7월부터의 주문은 체크하지 마세요.</b></div>
              </span>
            </label>
          )}
          {needsBrand && !brand && <div className="login-error" style={{ textAlign: 'left' }}>브랜드가 없는 파일이 있어요. 위에서 브랜드를 골라주세요.</div>}
          <div className="form-actions">
            <button className="btn" onClick={() => setSheets(null)}>취소</button>
            <button className="btn btn-primary" disabled={!ready.length || (needsBrand && !brand)} onClick={upload}>
              ⬆ {ready.reduce((a, s) => a + s.rows.length, 0).toLocaleString()}건 업로드
            </button>
          </div>
        </>
      )}

      {result && result.length > 0 && (
        <div className="card" style={{ marginTop: 16, background: 'var(--success-soft)', border: 'none' }}>
          {result.map(r => (
            <div key={r.kind} style={{ marginBottom: 4 }}>
              {r.summary
                ? <>✅ <b>주문 요약</b> {r.lines.toLocaleString()}줄 → 월·상품별 <b>{r.inserted.toLocaleString()}줄</b>로 묶어 저장 (아래 '요약으로 저장한 지난 주문'에서 확인)</>
                : <>✅ <b>{KIND_LABEL[r.kind]}</b> 새로 저장 <b>{r.inserted.toLocaleString()}건</b></>}
              {r.skipped > 0 && <> · 이미 있던 {r.skipped.toLocaleString()}건은 건너뜀</>}
              {r.dup > 0 && <> · 파일 안 중복 {r.dup.toLocaleString()}건 제외</>}
              {r.extra && <div style={{ marginTop: 4 }}>{r.extra}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

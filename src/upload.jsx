// 플랫폼 다운로드 파일(엑셀·CSV) 읽기 · 형식 자동 인식 · 업로드

const PLATFORM_NAMES = { '29cm': '29CM', 'w컨셉': 'W컨셉', 'wconcept': 'W컨셉', 'eql': 'EQL', '무신사': '무신사', '아임웹': '아임웹', '카페24': '카페24', 'eql/h패션몰': 'EQL' };
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
  // 아임웹 리뷰를 게시판 모양으로 받은 파일 (하타) · 작성자·주문자 연락처 등은 읽지 않음
  { kind: 'review', label: '아임웹 리뷰 (게시판형)', headers: ['글번호', '상품명', '글 내용', '작성시각', '평점'],
    map: (r) => ({ key: r['글번호'] ? 'IWR' + r['글번호'] : '', platform: '아임웹', product_name: r['상품명'], rating: num(r['평점']), content: r['글 내용'], when: parseWhen(r['작성시각']), order_no: r['주문번호'] }) },
  // W컨셉 리뷰 목록 (리뷰 글은 '제목' 칸)
  { kind: 'review', label: 'W컨셉 리뷰', headers: ['작성일', '상품명', '제목', '평점', '주문번호'],
    map: (r) => ({ brand: normBrand(r['브랜드']), platform: 'W컨셉', product_name: r['상품명'], rating: num(r['평점']), content: r['제목'], when: parseWhen(r['작성일']), order_no: r['주문번호'] }) },
  { kind: 'review', label: '무신사 리뷰', headers: ['상품명', '후기 내용', '평점', '등록일시'],
    map: (r) => ({ platform: '무신사', product_name: r['상품명'], rating: num(r['평점']), content: r['후기 내용'], when: parseWhen(r['등록일시']) }) },

  { kind: 'board', label: '아임웹 게시판', headers: ['제목', '내용', '작성시각', '답글'],
    map: (r) => ({ platform: '아임웹', product_name: r['상품명'], option_text: r['옵션'], title: r['제목'], content: r['내용'], when: parseWhen(r['작성시각']), answer: r['답글'], answered: parseWhen(r['답글 작성시간']) }) },
  { kind: 'board', label: '카페24 게시판', headers: ['게시물 제목', '내용', '게시물 작성일시'],
    map: (r) => ({ platform: '카페24', platform_category: r['카테고리'], title: r['게시물 제목'], content: stripHtml(r['내용']), when: parseWhen(r['게시물 작성일시']) }) },
  // 다운로드가 안 되는 판매처는 화면에서 긁어서 이 양식에 붙여넣기 (칸 순서 상관없음, 브랜드·상품명·제목·문의유형은 있으면 좋음)
  // 문의 내용은 없어도 됨 → 문의유형·제목으로 유형 분류 (긁기 힘든 곳은 개수·유형·상품만)
  // 내용이 비슷한 글이 같은 날 여러 개일 수 있어 순번을 붙여 구분 (같은 파일을 다시 올리면 같은 순번 → 중복 안 됨)
  { kind: 'board', label: '직접 정리한 게시판 (공통 양식)', headers: ['판매처', '작성일'], numberDupKeys: true,
    template: ['브랜드', '판매처', '작성일', '상품명', '문의유형', '제목', '문의 내용'],
    map: (r) => ({ key: 'MB' + hashText(['작성일', '판매처', '브랜드', '상품명', '문의유형', '제목', '문의 내용'].map(k => String(r[k] ?? '').trim()).join('|')),
      brand: normBrand(r['브랜드']), platform: normPlatform(r['판매처']), product_name: r['상품명'], platform_category: r['문의유형'], title: r['제목'],
      content: r['문의 내용'] || r['제목'] || r['문의유형'] || '(내용 없음)', when: parseWhen(r['작성일']) }) },
  // 아임웹 게시판을 필요한 칸만 남겨 정리한 파일 (답글 칸 없음) · 기존 아임웹 게시판과 같은 키(작성 시각+제목+내용)라 겹쳐도 중복 안 됨
  { kind: 'board', label: '아임웹 게시판 (간단)', headers: ['상품명', '문의제목', '문의내용', '작성일자'],
    map: (r) => ({ platform: '아임웹', product_name: r['상품명'], title: r['문의제목'], content: r['문의내용'], when: parseWhen(r['작성일자']) }) },
  // EQL 관리자 화면에서 받은 문의 파일
  { kind: 'board', label: 'EQL 게시판', headers: ['문의일시', '문의번호', '문의내용', '상품명'],
    map: (r) => ({ key: r['문의번호'] ? 'EQL' + r['문의번호'] : '', brand: normBrand(r['브랜드명']), platform: 'EQL', product_name: r['상품명'], content: r['문의내용'], when: parseWhen(r['문의일시']) }) },
  // W컨셉 문의 목록을 긁은 것 (번호·등록일·문의자·주문번호·제목·상품명·브랜드) · 문의자·주문번호는 읽지 않음
  { kind: 'board', label: 'W컨셉 게시판', headers: ['등록일', '주문번호', '제목', '상품명'], numberDupKeys: true,
    map: (r) => ({ key: 'WC' + hashText(`${r['등록일']}|${r['제목']}|${r['상품명']}|${r['번호'] ?? ''}`), brand: normBrand(r['브랜드']), platform: 'W컨셉', product_name: r['상품명'], title: r['제목'], content: r['제목'], when: parseWhen(r['등록일']) }) },
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
      // 칸 이름 안 줄바꿈(Alt+Enter)은 없애고 비교 ('CS 처리\n상태' → 'CS 처리상태')
      const header = grid[h].map(c => String(c).replace(/\s*\r?\n\s*/g, '').trim());
      const format = FILE_FORMATS.find(f => kinds.includes(f.kind) && f.headers.every(x => header.includes(x)));
      if (!format) continue;
      const rows = grid.slice(h + 1)
        .filter(r => r.some(c => String(c).trim() !== ''))
        .map(r => {
          const obj = Object.fromEntries(header.map((k, i) => [k, r[i]]));
          const m = format.map(obj);
          // 형식에 브랜드가 없으면: 시트의 '브랜드'·'브랜드명' 칸 → 상품명이 HaTA로 시작하면 하타 → 시트 이름('하타 아임웹' 등) (그래도 없으면 파일 이름·선택)
          if (!m.brand) m.brand = normBrand(obj['브랜드'] || obj['브랜드명'] || obj['브랜드 명']) || (/^\s*(\[[^\]]*\]\s*)*hata\b/i.test(String(m.product_name || '')) ? '하타' : '') || normBrand(name);
          return m;
        })
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

const KIND_LABEL = { review: '리뷰', board: '게시판 문의', order: '주문 품목', return: '반품·교환' };

// 업로드 안내: 종류별로 무엇이 되는지 + 알아보는 파일 형식(필수 칸)은 FILE_FORMATS에서 자동으로 만듦
const KIND_GUIDE = {
  review: { icon: '⭐', title: '리뷰', does: '긍정·부정 자동 분류 · 새로 들어온 1~3점 리뷰는 VOC 접수로 자동 등록 · 고객 이름·아이디는 저장 안 함' },
  board: { icon: '💬', title: '게시판 문의', does: '재입고·배송·교환/반품 등 문의 유형 자동 분류 · 우리 답변 글은 집계에서 제외 · 작성자 정보는 저장 안 함' },
  order: { icon: '🛒', title: '주문', does: '핀카 = 오클릭 주문 파일, 하타 = 사방넷 파일 · 대분류(베딩·러그·바스·홈데코·웨어·잡화·키친) 자동 분류 · 주문자·수령자·연락처는 저장 안 함 · 판매처 주문 파일은 지난 기간 요약용으로만' },
  return: { icon: '↩️', title: '반품·교환', does: '판매처 반품·교환 파일 그대로 · 사유 자동 묶기(과실 = 불량·파손·오배송·누락) · 29CM는 주문번호로 올려 둔 주문에서 상품을 찾아 채움 · 철회 건 제외' },
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
          <li>리뷰·게시판·주문·반품교환 파일을 <b>한 번에 여러 개</b> 골라도 돼요. 시트마다 종류를 알아서 구분해요.</li>
          <li>한 파일에 플랫폼별 시트가 여러 개 있어도 괜찮아요. <b>첫 줄(제목 줄)의 칸 이름</b>으로 형식을 알아봐요.</li>
          <li>같은 파일·같은 기간을 다시 올려도 <b>중복 저장되지 않아요.</b></li>
          <li>핀카·하타는 <b>시트 안 '브랜드' 칸</b>(줄마다 핀카/하타), 상품명(HaTA로 시작하면 하타), <b>파일 이름</b>('핀카'·'하타') 순서로 알아서 나눠요. 한 파일에 섞여 있어도 돼요. 셋 다 없을 때만 브랜드를 고르는 칸이 나와요.</li>
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
                      <td><TemplateButton name={f.label} headers={f.template || f.headers} /></td></tr>
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

// 하타 상품 이름표: 하타 주문(사방넷 등)·상품 마스터의 이름에서 'HaTA'·말머리·기호를 빼고 비교 (앞 14글자가 같으면 같은 상품으로 봄)
async function hataNameMatcher() {
  const norm = (s) => String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/\bhata\b/g, '').replace(/[^a-z0-9가-힣]/g, '');
  const [orders, prods] = await Promise.all([
    fetchAll(() => db.from('order_items').select('product_name').eq('brand', '하타').order('id')),
    fetchAll(() => db.from('products').select('product_name,brand').order('id')),
  ]);
  const names = new Set([...orders.map(r => r.product_name), ...prods.filter(p => normBrand(p.brand) === '하타').map(p => p.product_name)].map(norm).filter(n => n.length >= 8));
  const heads = new Set([...names].map(n => n.slice(0, 14)));
  return (name) => { const n = norm(name); return n.length >= 8 && (names.has(n) || heads.has(n.slice(0, 14))); };
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
      setBrand('');
      for (const file of files) {
        // 파일에 브랜드 칸이 없으면 파일 이름('핀카'·'하타')으로 채움 → 그래도 없을 때만 화면에서 고름
        const fileBrand = normBrand(file.name);
        (await readUploadFile(file, kinds)).forEach(s => {
          if (fileBrand) s.rows.forEach(r => { if (!r.brand) r.brand = fileBrand; });
          all.push({ ...s, file: file.name });
        });
      }
      // 그래도 브랜드가 빈 줄(무신사 리뷰처럼 상품명에 HaTA가 없는 경우): 올려 둔 하타 주문·상품 이름과 비슷하면 하타
      if (all.some(s => s.rows.some(r => !r.brand && r.product_name))) {
        setBusy('하타 상품인지 확인 중...');
        const isHata = await hataNameMatcher();
        all.forEach(s => s.rows.forEach(r => { if (!r.brand && isHata(r.product_name)) r.brand = '하타'; }));
      }
      setSheets(all);
    } catch (e) {
      toast('❌ 파일을 읽지 못했어요: ' + e.message, 'err');
    } finally { setBusy(''); }
  };

  const ready = sheets ? sheets.filter(s => s.format && s.rows.length) : [];
  const needsBrand = ready.some(s => s.rows.some(r => !r.brand));
  // 판매처 주문 파일(29CM·아임웹 등)은 요약 저장일 때만 (주문은 오클릭·사방넷 기준이라 그대로 올리면 두 번 셈)
  const legacyOrders = ready.some(s => s.format.kind === 'order' && s.format.legacy);
  const blockLegacy = legacyOrders && !summaryMode;

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
        let src = [];
        ready.filter(s => s.format.kind === kind).forEach(s => s.rows.forEach(r => { const b = r.brand || brand; if (b) src.push({ ...r, brand: b }); }));
        // 저장 전 보충 (예: 29CM 반품은 주문번호만 있어 올려 둔 주문에서 상품을 찾아 채움)
        if (cfg.prepare && src.length) { setBusy(`${KIND_LABEL[kind]} 정리 중...`); src = await cfg.prepare(src); }
        const rows = src.map(r => ({
          ...cfg.toRow(r), brand: r.brand, platform: r.platform,
          source_key: r.key ? String(r.key) : contentKey(r.when, (r.title || '') + r.content),
          ...(cfg.linkProducts === false ? {} : { product_id: match(r.product_name) }),
        }));
        if (!rows.length) continue;
        // 같은 파일 안의 중복 제거
        let unique = [...new Map(rows.map(r => [r.platform + '|' + r.source_key, r])).values()];
        // 이미 저장된 것과 같은 날·같은 판매처·같은 내용이면 건너뜀 (다른 형식의 파일로 같은 리뷰를 다시 올린 경우)
        let sameContent = 0, orderFilled = 0;
        if (cfg.dedupeByContent && unique.length) {
          setBusy(`${KIND_LABEL[kind]} 이미 있는지 확인 중...`);
          const dayOf = (iso) => (iso ? toISODate(new Date(iso)) : '');
          const norm = (s) => String(s || '').replace(/\s+/g, '').slice(0, 60);
          const days = unique.map(r => dayOf(r.written_at)).filter(Boolean).sort();
          if (days.length) {
            const existing = await fetchAll(() => db.from(cfg.table).select('id,platform,written_at,content,order_no')
              .gte('written_at', `${days[0]}T00:00:00+09:00`).lte('written_at', `${days[days.length - 1]}T23:59:59+09:00`).order('id'));
            const seen = new Map(existing.map(e => [`${e.platform}|${dayOf(e.written_at)}|${norm(e.content)}`, e]));
            const before = unique.length;
            const fill = [];   // 이미 있는 리뷰인데 주문번호가 비어 있으면 이번 파일의 주문번호로 채움
            unique = unique.filter(r => {
              const e = norm(r.content) && seen.get(`${r.platform}|${dayOf(r.written_at)}|${norm(r.content)}`);
              if (!e) return true;
              if (!e.order_no && r.order_no) { fill.push({ id: e.id, order_no: r.order_no }); e.order_no = r.order_no; }
              return false;
            });
            sameContent = before - unique.length;
            for (let i = 0; i < fill.length; i += 10) {
              setBusy(`이미 있는 리뷰에 주문번호 채우는 중... ${Math.min(i + 10, fill.length).toLocaleString()} / ${fill.length.toLocaleString()}`);
              const res = await Promise.all(fill.slice(i, i + 10).map(f => db.from(cfg.table).update({ order_no: f.order_no }).eq('id', f.id)));
              const bad = res.find(x => x.error);
              if (bad) throw new Error('주문번호 채우기: ' + bad.error.message);
            }
            orderFilled = fill.length;
          }
        }
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
        // 이미 있던 줄인데 상태가 바뀐 경우 새 상태로 (사방넷: 같은 주문 줄이 출고대기 → 취소완료 등으로 바뀜)
        let statusUpdated = 0;
        const recheck = cfg.updateStatusOf ? unique.filter(cfg.updateStatusOf) : [];
        for (let i = 0; i < recheck.length; i += 200) {
          setBusy(`바뀐 주문 상태 확인 중... ${Math.min(i + 200, recheck.length).toLocaleString()} / ${recheck.length.toLocaleString()}`);
          const part = recheck.slice(i, i + 200);
          const { data: cur, error } = await db.from(cfg.table).select('id,platform,source_key,status')
            .in('source_key', part.map(r => r.source_key));
          if (error) throw new Error('주문 상태 확인: ' + error.message);
          const now = new Map(part.map(r => [r.platform + '|' + r.source_key, r.status]));
          const changed = cur.filter(c => { const s = now.get(c.platform + '|' + c.source_key); return s && s !== c.status; });
          for (let j = 0; j < changed.length; j += 10) {
            const res = await Promise.all(changed.slice(j, j + 10).map(c => db.from(cfg.table).update({ status: now.get(c.platform + '|' + c.source_key) }).eq('id', c.id)));
            const bad = res.find(x => x.error);
            if (bad) throw new Error('주문 상태 바꾸기: ' + bad.error.message);
          }
          statusUpdated += changed.length;
        }
        let extra = null;
        if (cfg.afterInsert && newRows.length) { setBusy('후속 처리 중...'); extra = await cfg.afterInsert(newRows, app); }
        results.push({ kind, inserted, dup: rows.length - unique.length - sameContent, skipped: unique.length - inserted + sameContent, orderFilled, statusUpdated, extra });
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
        {/* 브랜드는 파일에 브랜드 칸이 없는 시트가 있을 때만 고름 (오클릭·사방넷·29CM 등은 파일에 브랜드가 있음) */}
        {sheets && needsBrand && (
          <div className="field">
            <label>브랜드 <span className="muted" style={{ fontWeight: 400 }}>(브랜드 칸이 없는 파일이 있어요)</span></label>
            <Segmented options={[{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }]} value={brand} onChange={setBrand} />
          </div>
        )}
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
          {blockLegacy && <div className="login-error" style={{ textAlign: 'left' }}>판매처 주문 파일(29CM·무신사 등)이 있어요. 7월부터 주문은 <b>핀카 = 오클릭, 하타 = 사방넷</b> 파일만 올려요 (그대로 올리면 두 번 세어져요). 지난 기간 요약용이면 위의 <b>요약으로만 저장</b>에 체크해 주세요.</div>}
          {needsBrand && !brand && <div className="login-error" style={{ textAlign: 'left' }}>브랜드가 없는 파일이 있어요. 위에서 브랜드를 골라주세요.</div>}
          <div className="form-actions">
            <button className="btn" onClick={() => setSheets(null)}>취소</button>
            <button className="btn btn-primary" disabled={!ready.length || (needsBrand && !brand) || blockLegacy} onClick={upload}>
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
              {r.orderFilled > 0 && <> (그중 {r.orderFilled.toLocaleString()}건은 비어 있던 주문번호를 채움)</>}
              {r.statusUpdated > 0 && <> · 상태가 바뀐 {r.statusUpdated.toLocaleString()}건은 새 상태로 바꿈 (예: 출고대기 → 취소완료)</>}
              {r.dup > 0 && <> · 파일 안 중복 {r.dup.toLocaleString()}건 제외</>}
              {r.extra && <div style={{ marginTop: 4 }}>{r.extra}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

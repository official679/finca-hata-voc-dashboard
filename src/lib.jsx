// 공통: Supabase 연결, 데이터 로딩, 공통 UI 부품
const { useState, useEffect, useMemo, useCallback, useContext, createContext, useRef } = React;

const SUPABASE_URL = 'https://hbudvjnqzejqbvkqfklz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oT83_czOzbwphv05dPVAiQ_5_Vby312';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PHOTO_BUCKET = 'voc-photos';

// VOC 사진은 긴 변 2500px · JPEG로 줄여서 올림 (저장 공간 절약, 불량 부위 확대해도 보일 만큼 선명)
// 이미 작거나, 줄여도 더 커지거나, 브라우저가 못 여는 형식(HEIC 등)이면 원본 그대로
const PHOTO_MAX_PX = 2500;
async function shrinkImage(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);   // 투명 PNG 배경
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file;
  }
}

// 후속 조치(상품개선·리오더 지정) 기능은 아직 쓰지 않아 모든 화면에서 숨김. 다시 쓰려면 true로
const SHOW_FOLLOWUP = false;

// 기준 코드 그룹 → voc_cases 컬럼 (기준 이름을 바꾸면 기존 VOC도 같이 바꿈)
const CODE_GROUPS = [
  { key: 'voc_type', label: 'VOC 구분', column: 'voc_type' },
  { key: 'reason', label: '사유 카테고리', column: 'reason_category' },
  ...(SHOW_FOLLOWUP ? [{ key: 'action', label: '후속 조치', column: 'action_required' }] : []),
  { key: 'status', label: '진행상황', column: 'status' },
  { key: 'consult_method', label: '문의 채널', column: 'consult_method' },
  { key: 'handling', label: '처리 구분', column: 'handling' },
  ...(SHOW_FOLLOWUP ? [{ key: 'department', label: '담당 부서', column: 'department' }] : []),
  { key: 'platform', label: '플랫폼', column: 'platform' },
  { key: 'handler', label: '처리자', column: 'handler' },
  { key: 'brand', label: '브랜드', column: 'brand' },
  { key: 'preorder_gift', label: '예약배송 사은품', table: 'none', column: 'gift' },   // "코드 단품) 상품명" 형식 · 앞 숫자 = 오클릭 바코드
  { key: 'daily_platform:핀카', label: '데일리 플랫폼(핀카)', table: 'cs_daily', column: 'platform', match: { brand: '핀카' } },
  { key: 'daily_platform:하타', label: '데일리 플랫폼(하타)', table: 'cs_daily', column: 'platform', match: { brand: '하타' } },
];

// VOC 브랜드 표기 → 상품 마스터 브랜드 표기
const PRODUCT_BRAND = { '핀카': 'FINCA', '하타': 'HaTA' };
// 한 브랜드씩 보는 화면용 선택 버튼
const BRAND_ONLY = [{ key: '핀카', label: '핀카' }, { key: '하타', label: '하타' }];

// 브랜드 과실 여부 (리포트·후속 조치 보드 집계 기준)
// 품질 계열 VOC 구분은 브랜드 과실로 집계 (예전 '(반품)브랜드과실' 표기도 포함)
const FAULT_TYPES = ['품질', '세탁·이염', '내구성'];
const isFault = (vocType) => FAULT_TYPES.includes(vocType) || (vocType || '').includes('브랜드과실');

// Supabase는 한 번에 최대 1000행만 돌려주므로 나눠서 전부 가져옴
async function fetchAll(buildQuery) {
  const pageSize = 1000;
  let rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < pageSize) return rows;
  }
}

// 기간을 정해서 필요한 줄만 불러오기 (리뷰·게시판처럼 계속 쌓이는 데이터가 많아져도 화면이 느려지지 않게)
// since가 없으면 전체. 결과는 최신순
function useSince(table, columns, since, dateCol = 'written_at') {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchAll(() => { let q = db.from(table).select(columns).order('id'); if (since) q = q.gte(dateCol, since); return q; })
      .then(r => { if (alive) setRows(r.sort((a, b) => String(b[dateCol] || '').localeCompare(String(a[dateCol] || '')))); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [table, columns, since, dateCol]);
  return [rows, setRows];
}
// n개월 전 1일 (YYYY-MM-DD)
const monthsAgo = (n) => { const d = new Date(); return toISODate(new Date(d.getFullYear(), d.getMonth() - n, 1)); };

// ---------- 날짜 ----------
const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISODate(new Date());

// 팝업 바깥(회색 배경)을 눌렀을 때만 닫기: 팝업 안에서 글자를 드래그하다 바깥에서 놓으면 닫히던 문제 방지 (2026-10-06)
const overlayClose = (onClose) => ({
  onMouseDown: (e) => { e.currentTarget.dataset.down = e.target === e.currentTarget ? '1' : ''; },
  onClick: (e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.down === '1') onClose(); },
});
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// 월요일 시작 주
const weekStart = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
const fmtMD = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const fmtDate = (s) => (s ? s.slice(2).replace(/-/g, '.') : '');

function periodRange(period) {
  const now = new Date();
  const ws = weekStart(now);
  switch (period) {
    case 'thisWeek': return [toISODate(ws), toISODate(now)];
    case 'lastWeek': return [toISODate(addDays(ws, -7)), toISODate(addDays(ws, -1))];
    case 'thisMonth': return [toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), toISODate(now)];
    case 'lastMonth': return [toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toISODate(new Date(now.getFullYear(), now.getMonth(), 0))];
    default: return ['2000-01-01', '2999-12-31'];
  }
}
const PERIODS = [
  { key: 'thisWeek', label: '이번 주' },
  { key: 'lastWeek', label: '지난 주' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
  { key: 'all', label: '전체' },
];

function countBy(rows, fn) {
  const m = new Map();
  rows.forEach(r => { const k = fn(r) || '(미입력)'; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// ---------- 앱 전역 데이터 ----------
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

function useAppData(session) {
  const [products, setProducts] = useState([]);
  const [codes, setCodes] = useState([]);
  const [cases, setCases] = useState([]);
  const [daily, setDaily] = useState(null);   // CS 데일리는 필요한 화면에서만 불러옴
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadCodes = useCallback(async () => {
    const { data, error } = await db.from('code_items').select('*').order('group_key').order('sort_order').order('id');
    if (error) throw error;
    setCodes(data);
  }, []);

  const loadCases = useCallback(async () => {
    const rows = await fetchAll(() => db.from('voc_cases').select('*').order('received_date', { ascending: false }).order('id', { ascending: false }));
    setCases(rows);
  }, []);

  const loadProducts = useCallback(async () => {
    setProducts(await fetchAll(() => db.from('products').select('id,product_name,brand,category,size_gender,line_type').order('id')));
  }, []);

  const loadDaily = useCallback(async () => {
    const rows = await fetchAll(() => db.from('cs_daily').select('*').order('report_date').order('id'));
    setDaily(rows);
  }, []);

  // 토큰 갱신 때마다 다시 불러오지 않도록 사용자 id 기준
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    (async () => {
      // 로그인 직후 'JWT issued at future'(서버끼리 시계가 1~2초 어긋남)는 잠깐 기다리면 풀림 → 3번까지 다시 시도
      for (let attempt = 1; ; attempt++) {
        try {
          const [prods] = await Promise.all([
            fetchAll(() => db.from('products').select('id,product_name,brand,category,size_gender,line_type').order('id')),
            loadCodes(),
            loadCases(),
          ]);
          setProducts(prods);
          setLoadError('');
          break;
        } catch (e) {
          const msg = e.message || String(e);
          if (/JWT/i.test(msg) && attempt < 3) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
          setLoadError(msg);
          break;
        }
      }
      setReady(true);
    })();
  }, [userId, loadCodes, loadCases]);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const codeOptions = useCallback((group, includeInactive = false) =>
    codes.filter(c => c.group_key === group && (includeInactive || c.active)).map(c => c.label), [codes]);

  return { products, productById, loadProducts, codes, codeOptions, cases, setCases, daily, setDaily, loadDaily, loadCodes, loadCases, ready, loadError };
}

// 상품 카테고리 (상품 마스터 기준). 상품이 연결 안 된 건은 '(미분류)'
const NO_CATEGORY = '(미분류)';
const categoryOf = (productId, productById) => (productId && productById.get(productId)?.category) || NO_CATEGORY;
const subCategoryOf = (productId, productById) => (productId && productById.get(productId)?.size_gender) || '-';
// VOC는 상품 마스터에 없으면 직접 고른 대분류·중분류(category·sub_category)를 씀
const caseCategory = (c, productById) => (c.product_id && productById.get(c.product_id)?.category) || c.category || NO_CATEGORY;
const caseSubCategory = (c, productById) => (c.product_id && productById.get(c.product_id)?.size_gender) || c.sub_category || '-';
// 추가분류 (오클릭 '추가분류': 앵커 / 레귤러 등) — 상품 마스터와 연결된 VOC만
const caseLineType = (c, productById) => (c.product_id && productById.get(c.product_id)?.line_type) || '';
// 추가분류 뜻 (VOC 볼 때: 앵커 = 브랜드 대표라 우선 대응 · 캐리오버 = 재생산·품질 개선 근거)
const LINE_TYPE_INFO = {
  '앵커': { cls: 'chip-blue', desc: '브랜드를 대표하는 핵심 상품 · VOC 한 건도 브랜드 이미지에 직결 → 우선 대응' },
  '레귤러': { cls: 'chip-green', desc: '일반 운영 상품 (상시·시즌 일반 상품)' },
  '캐리오버': { cls: 'chip-amber', desc: '이전 시즌에서 이어지는 상품 · VOC는 재생산·품질 개선 근거' },
};
const LineTypeChip = ({ type }) => (type
  ? <span className={`chip ${(LINE_TYPE_INFO[type] || {}).cls || ''}`} title={(LINE_TYPE_INFO[type] || {}).desc || type}>{type}</span>
  : <span className="muted">-</span>);
const categoryOptions = (products) => [...[...new Set(products.map(p => p.category).filter(c => c && c !== 'null'))].sort(), NO_CATEGORY];

const caseProductName = (c, productById) => (c.product_id && productById.get(c.product_id)?.product_name) || c.product_name || '(상품 미입력)';

// ---------- 알림 ----------
const ToastContext = createContext(() => {});
const useToast = () => useContext(ToastContext);

function ToastHost({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((text, kind = 'ok') => setToast({ text, kind, at: Date.now() }), []);
  useEffect(() => {
    if (!toast || toast.kind !== 'ok') return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>{toast.text}</div>}
    </ToastContext.Provider>
  );
}

// ---------- 공통 UI ----------
function PageHeader({ title, desc, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="filters">{children}</div>}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(o => (
        <button key={o.key} className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

function Select({ value, onChange, options, placeholder, className = 'input' }) {
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => typeof o === 'string'
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Kpi({ label, value, sub, alert, onClick }) {
  // onClick이 있으면 눌러서 해당 목록으로 이동 (메인 '오늘 챙길 것'과 같은 모양)
  return (
    <div className={`kpi${alert ? ' alert' : ''}${onClick ? ' todo-kpi' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

// wide: 상품명처럼 긴 이름은 이름 칸을 넓히고 두 줄까지 · onPick: 이름을 누르면 실행
function Bars({ items, max, color, wide, onPick, empty }) {
  if (!items.length) return <div className="empty">{empty || '데이터가 없습니다'}</div>;
  const top = max || Math.max(...items.map(i => i.count));
  return (
    <div className={`bars${wide ? ' bars-wide' : ''}`}>
      {items.map(i => (
        <div className="bar-row" key={i.label} title={`${i.label}: ${i.count}건`}>
          {onPick ? <button className="bar-label btn-link" onClick={() => onPick(i.label)}>{i.label}</button> : <span className="bar-label">{i.label}</span>}
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(i.count / top) * 100}%`, background: color }} /></div>
          <span className="bar-value">{i.count}</span>
        </div>
      ))}
    </div>
  );
}

const STATUS_CHIP = { '접수': 'chip-blue', '확인중': 'chip-amber', '처리완료': 'chip-green', '보상완료': 'chip-green' };
const StatusChip = ({ status }) => <span className={`chip ${STATUS_CHIP[status] || ''}`}>{status || '-'}</span>;

// 목록을 10개씩 나눠 보여주고 페이지를 넘기는 부품. resetKey가 바뀌면 1페이지로
function Paged({ items, render, size = 10, resetKey, empty }) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const cur = Math.min(page, pages);
  if (!items.length) return <div className="empty">{empty || '해당하는 항목이 없어요'}</div>;
  return (
    <>
      {items.slice((cur - 1) * size, cur * size).map(render)}
      <Pager page={cur} pages={pages} onChange={setPage} />
    </>
  );
}

// 검색: 띄어쓴 단어가 모두 들어 있으면 찾음 (순서·띄어쓰기 상관없음). 예) '블랙 차렵' → '블랙 어글리도트 차렵이불'
function matchQuery(q, ...fields) {
  const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const hay = fields.flat().map(f => String(f ?? '').toLowerCase()).join(' ');
  const hayNS = hay.replace(/\s+/g, '');
  return toks.every(t => hay.includes(t) || hayNS.includes(t));
}

// 한 페이지에 볼 개수 (목록마다 이 PC에 기억)
const PAGE_SIZES = [15, 50, 100];
function usePageSize(key, def = 15) {
  const [size, setSize] = useState(() => { try { return Number(localStorage.getItem('pageSize:' + key)) || def; } catch { return def; } });
  const set = (n) => { setSize(n); try { localStorage.setItem('pageSize:' + key, String(n)); } catch {} };
  return [size, set];
}

// 페이지 번호 버튼 (현재 페이지 주변 번호만 보여줌) · size/onSize를 주면 '15개씩 · 50개씩 · 100개씩' 선택도 같이
function Pager({ page, pages, onChange, size, onSize }) {
  const sizeSel = onSize ? (
    <select className="input pager-size" value={size} onChange={e => { onSize(Number(e.target.value)); onChange(1); }}>
      {PAGE_SIZES.map(n => <option key={n} value={n}>{n}개씩 보기</option>)}
    </select>
  ) : null;
  if (pages <= 1) return sizeSel ? <div className="pager">{sizeSel}</div> : null;
  const nums = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <div className="pager">
      <button className="btn btn-sm" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ 이전</button>
      {nums.map((n, i) => (
        <React.Fragment key={n}>
          {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
          <button className={`btn btn-sm${n === page ? ' btn-primary' : ''}`} onClick={() => onChange(n)}>{n}</button>
        </React.Fragment>
      ))}
      <button className="btn btn-sm" disabled={page === pages} onClick={() => onChange(page + 1)}>다음 ›</button>
      {sizeSel}
    </div>
  );
}

function ComingSoon({ icon, title, desc, items }) {
  return (
    <div className="card soon">
      <div className="soon-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{desc}</p>
      {items && <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}

// 공통: Supabase 연결, 데이터 로딩, 공통 UI 부품
const { useState, useEffect, useMemo, useCallback, useContext, createContext, useRef } = React;

const SUPABASE_URL = 'https://hbudvjnqzejqbvkqfklz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_oT83_czOzbwphv05dPVAiQ_5_Vby312';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const PHOTO_BUCKET = 'voc-photos';

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

  const loadDaily = useCallback(async () => {
    const rows = await fetchAll(() => db.from('cs_daily').select('*').order('report_date').order('id'));
    setDaily(rows);
  }, []);

  // 토큰 갱신 때마다 다시 불러오지 않도록 사용자 id 기준
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const [prods] = await Promise.all([
          fetchAll(() => db.from('products').select('id,product_name,brand,category,size_gender').order('id')),
          loadCodes(),
          loadCases(),
        ]);
        setProducts(prods);
      } catch (e) {
        setLoadError(e.message || String(e));
      } finally {
        setReady(true);
      }
    })();
  }, [userId, loadCodes, loadCases]);

  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const codeOptions = useCallback((group, includeInactive = false) =>
    codes.filter(c => c.group_key === group && (includeInactive || c.active)).map(c => c.label), [codes]);

  return { products, productById, codes, codeOptions, cases, setCases, daily, setDaily, loadDaily, loadCodes, loadCases, ready, loadError };
}

// 상품 카테고리 (상품 마스터 기준). 상품이 연결 안 된 건은 '(미분류)'
const NO_CATEGORY = '(미분류)';
const categoryOf = (productId, productById) => (productId && productById.get(productId)?.category) || NO_CATEGORY;
const subCategoryOf = (productId, productById) => (productId && productById.get(productId)?.size_gender) || '-';
// VOC는 상품 마스터에 없으면 직접 고른 대분류·중분류(category·sub_category)를 씀
const caseCategory = (c, productById) => (c.product_id && productById.get(c.product_id)?.category) || c.category || NO_CATEGORY;
const caseSubCategory = (c, productById) => (c.product_id && productById.get(c.product_id)?.size_gender) || c.sub_category || '-';
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

function Kpi({ label, value, sub, alert }) {
  return (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function Bars({ items, max, color }) {
  if (!items.length) return <div className="empty">데이터가 없습니다</div>;
  const top = max || Math.max(...items.map(i => i.count));
  return (
    <div className="bars">
      {items.map(i => (
        <div className="bar-row" key={i.label} title={`${i.label}: ${i.count}건`}>
          <span className="bar-label">{i.label}</span>
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
  // 현재 페이지 주변 번호만 보여줌
  const nums = [...new Set([1, cur - 2, cur - 1, cur, cur + 1, cur + 2, pages])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  return (
    <>
      {items.slice((cur - 1) * size, cur * size).map(render)}
      {pages > 1 && (
        <div className="pager">
          <button className="btn btn-sm" disabled={cur === 1} onClick={() => setPage(cur - 1)}>‹ 이전</button>
          {nums.map((n, i) => (
            <React.Fragment key={n}>
              {i > 0 && n - nums[i - 1] > 1 && <span className="muted">…</span>}
              <button className={`btn btn-sm${n === cur ? ' btn-primary' : ''}`} onClick={() => setPage(n)}>{n}</button>
            </React.Fragment>
          ))}
          <button className="btn btn-sm" disabled={cur === pages} onClick={() => setPage(cur + 1)}>다음 ›</button>
        </div>
      )}
    </>
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

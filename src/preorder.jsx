// 예약배송 관리: 예약상품 일정 + 오클릭 미출고 파일 → 지연 단계·안내 대상 자동 계산
// (구글시트 '예약배송 자동정리' 스크립트 v1.7의 계산 방식을 그대로 옮김)

const PREORDER_GIFT_CODES = ['103306'];   // 저재고 판단에서 빼는 사은품 코드 (기준 관리 > 예약배송 사은품 목록의 코드도 함께 뺌)
// 기준 관리의 사은품 목록("101088 단품) 상품명")에서 앞 숫자 = 오클릭 바코드
const giftCodesFrom = (labels) => [...PREORDER_GIFT_CODES, ...labels.map(l => (String(l).match(/^\s*(\d{5,})/) || [])[1]).filter(Boolean)];
const PREORDER_LOW_STOCK = [0, 10];       // 가용재고가 이 범위면 저재고 (분리배송 검토)
const PREORDER_SHIP_SAFETY = 0.3;         // 오늘 파일 줄 수가 이전 대비 이 비율보다 적으면 출고완 처리 전에 확인

// 20260903 / 2026-09-03 / 엑셀 날짜 → 'YYYY-MM-DD'
const ymd = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const m = String(v).trim().match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const w = parseWhen(v);
  return w ? w.key.slice(0, 10) : null;
};
const intOr = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };
const sellerLabel = (s) => String(s || '').replace(/^\s*\d+\.\s*/, '').trim() || '-';
const maxDate = (ds) => ds.filter(Boolean).sort().pop() || null;

// ---------- 파일 형식 ----------
const PREORDER_FORMATS = [
  { kind: 'lines', label: '오클릭 예약주문 (미출고)', headers: ['주문번호', '판매처', '판매처주문번호', '입력일', '주문자', '바코드', '품명', '수량', '가용재고'] },
  { kind: 'products', label: '예약상품리스트 (일정)', headers: ['단품코드', '상품명', '최초 입고예정', '최초 출고일 공지'] },
  { kind: 'notices', label: '예약 지연안내리스트 (안내 기록)', headers: ['바코드', '주문번호', '1차 안내', '1차 안내일자', '출고여부'] },
];

async function readPreorderFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, codepage: 65001, raw: /\.csv$/i.test(file.name) });
  const found = [];
  wb.SheetNames.forEach(name => {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    for (let h = 0; h < Math.min(5, grid.length); h++) {
      // 오클릭 파일에 따라 '바코드' 대신 '품번'·'상품코드'로 나옴 → 같은 칸으로 봄
      const header = grid[h].map(c => String(c).trim()).map(c => (c === '품번' || c === '상품코드' ? '바코드' : c));
      const format = PREORDER_FORMATS.find(f => f.headers.every(x => header.includes(x)));
      if (!format) continue;
      const rows = grid.slice(h + 1).filter(r => r.some(c => String(c).trim() !== ''));
      // 같은 이름 칸이 두 번 나오면(지연안내리스트의 2차 안내 등) 앞의 것을 씀
      const get = (r, k) => { const i = header.indexOf(k); return i >= 0 ? r[i] : ''; };
      found.push({ file: file.name, sheet: name, format, rows, get });
      break;
    }
  });
  return found;
}

// 오클릭 파일 → 주문 품목 (주문번호|바코드|사이즈 기준으로 합침)
function toPreorderLines({ rows, get }) {
  const orderDate = new Map(), orderSellerNo = new Map();
  rows.forEach(r => {
    const o = str(get(r, '주문번호')); if (!o) return;
    const sn = str(get(r, '판매처주문번호'));
    if (sn && !orderSellerNo.has(o)) orderSellerNo.set(o, sn);
    const m = String(sn || '').match(/(20\d{2})(\d{2})(\d{2})/);
    if (m && !orderDate.has(o)) orderDate.set(o, `${m[1]}-${m[2]}-${m[3]}`);
  });
  const out = new Map();
  rows.forEach(r => {
    const order_no = str(get(r, '주문번호')); if (!order_no) return;
    const barcode = str(get(r, '바코드')) || '';
    const size = str(get(r, '사이즈')) || '';
    const line_key = `${order_no}|${barcode}|${size}`;
    const qty = intOr(get(r, '수량')) || 1;
    if (out.has(line_key)) { out.get(line_key).qty += qty; return; }
    const input_date = ymd(get(r, '입력일'));
    out.set(line_key, {
      line_key, order_no, seller: str(get(r, '판매처')), seller_order_no: orderSellerNo.get(order_no) || null,
      input_date, purchase_date: orderDate.get(order_no) || input_date, orderer: str(get(r, '주문자')),
      barcode, product_name: str(get(r, '품명')), size: size || null, qty,
      stock: intOr(get(r, '재고')), avail: intOr(get(r, '가용재고')), unshipped: intOr(get(r, '미출고')),
    });
  });
  return [...out.values()];
}

function toPreorderProducts({ rows, get }) {
  const m = new Map();
  rows.forEach(r => {
    const code = str(get(r, '단품코드')); if (!code) return;
    m.set(code, {
      code, product_name: str(get(r, '상품명')), option_text: str(get(r, '옵션')),
      first_in: ymd(get(r, '최초 입고예정')), first_out: ymd(get(r, '최초 출고일 공지')),
      change1_notice: ymd(get(r, '1차 일정 변경 공지일')), change1_in: ymd(get(r, '1차 변경 입고일')), change1_out: ymd(get(r, '1차 변경 출고안내일')),
      change2_notice: ymd(get(r, '2차 일정 변경 공지일')), change2_in: ymd(get(r, '2차 변경 입고일')), change2_out: ymd(get(r, '2차 변경 출고안내일')),
      actual_in: ymd(get(r, '실제입고일')), note: str(get(r, '비고')), status: /종료/.test(String(get(r, '예판 상태'))) ? '종료' : '진행',
    });
  });
  return [...m.values()];
}

function toPreorderNotices({ rows, get }) {
  return rows.map(r => ({
    order_ref: str(get(r, '주문번호')), barcode: str(get(r, '바코드')),
    notice1_method: str(get(r, '1차 안내')), notice1_date: ymd(get(r, '1차 안내일자')),
    notice2_method: str(get(r, '2차 안내')), notice2_date: ymd(get(r, '2차 안내일자')),
    split: str(get(r, '배송구분')), gift: str(get(r, '사은품')), memo: str(get(r, '비고')),
  })).filter(n => n.order_ref && n.barcode);
}

// ---------- 지연 단계 계산 (스크립트 computeStage와 같음) ----------
// 구매일이 n차 변경 공지일보다 뒤면, 고객은 이미 n차 변경 일정을 보고 산 것 → 그 이후 변경 횟수만큼 지연
function preorderStage(line, prod) {
  if (!prod || prod.status === '종료' || !prod.first_out) return { stage: '', need: 0, seen: null, current: null };
  const pd = line.purchase_date || '';
  const { first_out: s0, change1_out: s1, change2_out: s2, change1_notice: f1, change2_notice: f2 } = prod;
  const k = s2 && f2 && pd > f2 ? 2 : s1 && f1 && pd > f1 ? 1 : 0;
  const last = s2 ? 2 : s1 ? 1 : 0;
  const seen = [s0, s1, s2][k], current = [s0, s1, s2][last];
  if ((s1 && !f1) || (s2 && !f2)) return { stage: '공지일 확인', need: 0, seen, current };
  // 일정이 바뀌었어도 출고일이 늦어지지 않았으면 고객 입장에선 지연이 아님
  if (seen && current && current <= seen) return { stage: '정상', need: 0, seen, current };
  const sameDay = !!((s1 && f1 && pd === f1) || (s2 && f2 && pd === f2));
  return { stage: ['정상', '1차 지연', '2차 지연'][last - k], need: last - k, sameDay, seen, current };
}

function enrichPreorder(lines, productByCode, giftCodes = PREORDER_GIFT_CODES) {
  const rows = lines.map(l => {
    const prod = productByCode.get(l.barcode);
    const s = preorderStage(l, prod);
    const done = (l.notice1_date ? 1 : 0) + (l.notice2_date ? 1 : 0);
    const isGift = giftCodes.includes(l.barcode);
    const low = l.avail !== null && l.avail >= PREORDER_LOW_STOCK[0] && l.avail <= PREORDER_LOW_STOCK[1] && !isGift;
    return { ...l, prod, ...s, done, low, isGift, pending: l.status === '출고대기' && s.need > done };
  });
  const orders = new Map();
  rows.forEach(r => {
    if (!orders.has(r.order_no)) orders.set(r.order_no, { order_no: r.order_no, lines: [] });
    orders.get(r.order_no).lines.push(r);
  });
  const rank = { '2차 지연': 3, '1차 지연': 2, '공지일 확인': 1, '정상': 0, '': -1 };
  return [...orders.values()].map(o => {
    const ls = o.lines, first = ls[0];
    const pre = ls.filter(l => l.prod);
    const worst = pre.reduce((a, l) => (rank[l.stage] > rank[a] ? l.stage : a), '');
    return {
      ...o, seller: first.seller, seller_order_no: ls.map(l => l.seller_order_no).find(Boolean) || null,
      purchase_date: first.purchase_date, orderer: first.orderer,
      status: ls.every(l => l.status === '출고완') ? '출고완' : ls.every(l => l.status === '취소') ? '취소' : '출고대기',
      stage: worst, pending: ls.some(l => l.pending), low: ls.some(l => l.low), mixed: ls.some(l => !l.prod),
      final_out: maxDate(pre.map(l => l.current)), split: ls.map(l => l.split).find(Boolean) || '',
      preLines: pre, done: Math.max(0, ...pre.map(l => l.done)),
      shipped_on: maxDate(ls.map(l => l.shipped_on)),
    };
  }).sort((a, b) => (rank[b.stage] - rank[a.stage]) || String(a.purchase_date || '').localeCompare(String(b.purchase_date || '')));
}

const STAGE_CHIP = { '정상': 'chip-green', '1차 지연': 'chip-amber', '2차 지연': 'chip-red', '공지일 확인': 'chip-blue' };
const StageChip = ({ stage, sameDay }) => (stage ? <span className={`chip ${STAGE_CHIP[stage] || ''}`} title={sameDay ? '공지 당일 주문 — 주문 시각 확인 필요' : ''}>{stage}{sameDay ? ' *' : ''}</span> : <span className="muted">-</span>);

// ---------- 안내 문자 (예약배송 대응기준 시트) ----------
const KAKAO_CHAT = '[핀카 1:1 채팅]\n카카오톡 @핀카\n▶ \'상담원 연결\'을 클릭해 주셔야 문의 내용이 상담원에게 전달됩니다.\nhttp://pf.kakao.com/_fhris/chat';
const fmtKDate = (d) => (d ? `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : '(변경 출고 예정일)');
const PREORDER_SMS = {
  first: (name, date) => `안녕하세요, 핀카입니다.\n\n먼저 핀카의 예약 상품을 주문해 주시고 기다려주셨음에도 입고 일정이 지연되어 안내드립니다.\n\n▶ 상품명: ${name}\n▶ 변경 출고 예정일: ${fmtKDate(date)}\n\n※ 안내드린 출고 예정일보다 상품이 빠르게 입고될 경우, 확인 즉시 신속하게 출고해 드리겠습니다.\n\n배송 지연으로 불편을 겪으신 고객님께 죄송한 마음을 담아 사은품을 함께 배송해 드릴 예정입니다.\n상품이 입고되는 대로 최대한 빠르게 출고할 수 있도록 최선을 다하겠습니다.\n\n예약 상품 외 다른 상품을 함께 주문하신 경우, 상품 분리 배송을 희망하시면 아래 핀카 1:1 채팅으로 말씀해 주시면 확인 후 처리 도와드리겠습니다.\n\n${KAKAO_CHAT}\n\n배송 지연으로 불편과 심려를 끼쳐드린 점 다시 한번 진심으로 사과드립니다.\n\n*본 문자는 발신 전용으로, 회신이 불가합니다.`,
  second: (name, date) => `안녕하세요, 핀카입니다.\n\n예약 상품을 구매해 주시고 오랜 시간 기다려주셨음에도 추가 지연 안내를 드리게 되어 진심으로 죄송합니다.\n\n▶ 상품명: ${name}\n▶ 출고 예정일: ${fmtKDate(date)}\n\n※ 안내드린 출고 예정일보다 상품이 빠르게 입고될 경우, 확인 즉시 신속하게 출고해 드리겠습니다.\n\n해당 상품의 입고 일정이 추가로 지연되어 부득이하게 재안내드립니다.\n\n오랜 시간 기다려주신 고객님께 죄송한 마음을 담아 추가 사은품을 상품과 함께 배송해 드릴 예정입니다.\n상품이 입고되는 대로 최대한 빠르게 출고할 수 있도록 끝까지 꼼꼼하게 확인하겠습니다.\n\n${KAKAO_CHAT}\n\n다시 한번 배송 지연으로 불편을 드린 점 진심으로 사과드립니다.\n\n*본 문자는 발신 전용으로, 회신이 불가합니다.`,
  split: (name) => `안녕하세요, 고객님. 핀카입니다.\n\n고객님께 연락드렸으나 부재중이셔서 문자로 안내드립니다.\n\n예약 상품 외 주문 상품 중 재고가 소량 남아 있는 상품이 있어 안내드립니다.\n\n합배송으로 진행할 경우 출고 전 재고가 소진되어 해당 상품이 취소될 가능성이 있어, \n\n상품을 안전하게 받아보실 수 있도록 예약 상품과 그 외 주문 상품을 분리하여 배송해 드리고자 합니다.\n\n▶ 예약 배송 상품\n상품명: ${name}\n\n위 예약 상품을 제외한 다른 주문 상품은 내일 오전 중 분리 배송될 예정입니다.\n\n혹시 분리 배송을 원하지 않으시거나 변경을 원하시는 사항이 있으실 경우, \n\n꼭 오늘 중으로 문의글 또는 1:1 채팅으로 남겨주세요.\n\n감사합니다.\n\n${KAKAO_CHAT}\n\n* 본 메시지는 발신 전용으로, 회신이 불가합니다.`,
};

// ---------- 데이터 ----------
function usePreorder() {
  const [state, setState] = useState({ products: null, lines: null, uploads: null });
  const load = useCallback(async () => {
    const since = toISODate(addDays(new Date(), -60));
    const [products, open, cancelled, shipped, uploads] = await Promise.all([
      fetchAll(() => db.from('preorder_products').select('*').order('id')),
      fetchAll(() => db.from('preorder_lines').select('*').eq('status', '출고대기').order('id')),
      fetchAll(() => db.from('preorder_lines').select('*').eq('status', '취소').order('id')),
      fetchAll(() => db.from('preorder_lines').select('*').eq('status', '출고완').gte('shipped_on', since).order('id')),
      db.from('preorder_uploads').select('*').order('id', { ascending: false }).limit(10).then(r => r.data || []),
    ]);
    setState({ products, lines: [...open, ...cancelled, ...shipped], uploads });
  }, []);
  useEffect(() => { load().catch(e => setState(s => ({ ...s, error: e.message || String(e) }))); }, [load]);
  return [state, load];
}

// 메인 요약용: 지금 안내가 필요한 예약배송 주문 수 (출고대기 주문만 불러옴)
function usePreorderPending() {
  const { codeOptions } = useApp();
  const giftKey = codeOptions ? codeOptions('preorder_gift', true).join('\n') : '';
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchAll(() => db.from('preorder_products').select('*').order('id')),
      fetchAll(() => db.from('preorder_lines').select('*').eq('status', '출고대기').order('id')),
    ]).then(([products, lines]) => {
      if (!alive) return;
      const orders = enrichPreorder(lines, new Map(products.map(p => [p.code, p])), giftCodesFrom(giftKey.split('\n')));
      setState({ pending: orders.filter(o => o.pending).length, open: orders.length });
    }).catch(() => alive && setState({ error: true }));
    return () => { alive = false; };
  }, [giftKey]);
  return state;
}

async function upsertChunks(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw error;
  }
}

// ---------- 화면 ----------
function PreorderPage() {
  const [{ products, lines, uploads, error }, reload] = usePreorder();
  const { codeOptions } = useApp();
  const giftOptions = codeOptions ? codeOptions('preorder_gift') : [];
  const giftKey = codeOptions ? codeOptions('preorder_gift', true).join('\n') : '';
  const giftCodes = useMemo(() => giftCodesFrom(giftKey.split('\n')), [giftKey]);
  const [tab, setTab] = useState('todo');
  const [openOrder, setOpenOrder] = useState(null);
  const [editProduct, setEditProduct] = useState(null);

  const productByCode = useMemo(() => new Map((products || []).map(p => [p.code, p])), [products]);
  const orders = useMemo(() => (lines ? enrichPreorder(lines, productByCode, giftCodes) : []), [lines, productByCode, giftCodes]);

  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>예약배송 데이터를 불러오지 못했어요: {error}<div className="hint">DB 설정 SQL(08_preorder_schema.sql)을 실행했는지 확인해 주세요.</div></div>;
  if (!products || !lines) return <div className="loading-screen">예약배송 불러오는 중...</div>;

  const open = orders.filter(o => o.status === '출고대기');
  const pending = open.filter(o => o.pending);
  const needNotice = products.filter(p => p.status !== '종료' && ((p.change1_out && !p.change1_notice) || (p.change2_out && !p.change2_notice)));
  const last = uploads && uploads[0];
  const current = orders.find(o => o.order_no === openOrder);

  return (
    <>
      <PageHeader title="예약배송 관리" desc="예약상품 일정 + 오클릭 미출고 파일로 지연 단계·안내 대상을 자동 계산해요. 파일에서 빠진 주문은 출고완으로 바뀌어요." />
      <div className="grid grid-kpi">
        <Kpi label="출고 대기 주문" value={open.length.toLocaleString()} sub={`예약상품 ${products.filter(p => p.status !== '종료').length}개 진행 중`} />
        <Kpi label="안내 필요 주문" value={pending.length.toLocaleString()} alert={pending.length > 0} sub="지연됐는데 아직 안내 안 한 주문" />
        <Kpi label="저재고 포함 주문" value={open.filter(o => o.low).length.toLocaleString()} sub={`가용재고 ${PREORDER_LOW_STOCK[0]}~${PREORDER_LOW_STOCK[1]} · 분리배송 검토`} />
        <Kpi label="마지막 파일 반영" value={last ? fmtDate(last.snapshot_date) : '-'} sub={last ? `${last.line_count}줄 · 출고완 ${(last.shipped_orders || []).length}건` : '아직 올린 파일이 없어요'} alert={!last || last.snapshot_date < today()} />
      </div>
      {needNotice.length > 0 && (
        <div className="card" style={{ marginBottom: 16, background: 'var(--warn-soft)', border: 'none' }}>
          ⚠️ <b>공지일 확인</b>: 변경 출고일은 있는데 변경 공지일이 비어 있는 상품이 {needNotice.length}개 있어요 ({needNotice.slice(0, 3).map(p => p.product_name || p.code).join(', ')}{needNotice.length > 3 ? ' 외' : ''}).
          공지일을 넣어야 어떤 주문이 지연인지 계산돼요. → <button className="btn-link" onClick={() => setTab('products')}>예약상품 일정</button>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <Segmented options={[
          { key: 'todo', label: `📞 안내 대상 ${pending.length}` },
          { key: 'orders', label: '📋 전체 예약주문' },
          { key: 'products', label: `🗓️ 예약상품 일정 ${products.filter(p => p.status !== '종료').length}` },
          { key: 'upload', label: '📤 파일 올리기' },
          { key: 'guide', label: '📖 대응기준' },
        ]} value={tab} onChange={setTab} />
      </div>

      {tab === 'todo' && <PreorderAllOrders key="todo" orders={pending} onOpen={setOpenOrder} reload={reload} todo />}
      {tab === 'orders' && <PreorderAllOrders key="orders" orders={orders} onOpen={setOpenOrder} reload={reload} />}
      {tab === 'products' && <PreorderProducts products={products} lines={lines} productByCode={productByCode} onEdit={setEditProduct} reload={reload} />}
      {tab === 'upload' && <PreorderUpload lines={lines} products={products} uploads={uploads} reload={reload} />}
      {tab === 'guide' && <PreorderGuide />}

      {current && <PreorderOrderPanel order={current} onClose={() => setOpenOrder(null)} reload={reload} giftOptions={giftOptions} />}
      {editProduct && <PreorderProductPanel product={editProduct} onClose={() => setEditProduct(null)} reload={reload} />}
    </>
  );
}

function PreorderOrderTable({ orders, onOpen, empty, todo, selected, setSelected }) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [orders.length]);
  const [SIZE, setSize] = usePageSize('preorder');
  const pages = Math.max(1, Math.ceil(orders.length / SIZE)), cur = Math.min(page, pages);
  if (!orders.length) return <div className="card empty">{empty}</div>;
  const shown = orders.slice((cur - 1) * SIZE, cur * SIZE);
  const toggle = (no) => setSelected(prev => { const n = new Set(prev); n.has(no) ? n.delete(no) : n.add(no); return n; });
  const pageAll = shown.every(o => selected.has(o.order_no));
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrap">
        <table className="table table-wide">
          <thead><tr>
            {setSelected && <th style={{ width: 36 }}><input type="checkbox" checked={pageAll} title="이 페이지 전체 선택" onChange={() => setSelected(prev => { const n = new Set(prev); shown.forEach(o => (pageAll ? n.delete(o.order_no) : n.add(o.order_no))); return n; })} /></th>}
            <th>구매일</th><th>판매처</th><th>판매처주문번호</th><th>주문자</th><th>예약상품</th><th>단계</th><th>주문 당시 안내</th><th>현재 출고예정</th><th>주문 최종 출고</th><th>안내</th><th>배송구분</th><th>저재고</th>{!todo && <th>상태</th>}</tr></thead>
          <tbody>
            {shown.map(o => {
              const l = o.preLines.find(x => x.stage === o.stage) || o.preLines[0] || o.lines[0];
              return (
                <tr key={o.order_no} className={`clickable${selected && selected.has(o.order_no) ? ' row-selected' : ''}`} onClick={() => onOpen(o.order_no)}>
                  {setSelected && <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(o.order_no)} onChange={() => toggle(o.order_no)} /></td>}
                  <td>{fmtDate(o.purchase_date)}</td>
                  <td>{sellerLabel(o.seller)}</td>
                  <td>{o.seller_order_no || o.order_no}</td>
                  <td>{o.orderer || '-'}</td>
                  <td style={{ whiteSpace: 'normal', minWidth: 320, maxWidth: 440 }}>
                    {[...o.preLines, ...o.lines.filter(x => !x.prod)].map(x => (
                      <div key={x.id || x.line_key} className="preorder-line" style={x.prod && x.stage ? { fontWeight: 700 } : { color: 'var(--muted)' }}>
                        {x.product_name}{x.size && x.size !== '0' ? ` (${x.size})` : ''}{x.qty > 1 ? ` ×${x.qty}` : ''}
                        {x.prod
                          ? (!x.stage ? <span className="muted"> · {x.prod.status === '종료' ? '예판 종료' : '일정 없음'}</span> : x.stage !== o.stage ? <span className="muted"> · {x.stage}</span> : null)
                          : <span> · {x.isGift ? '🎁 사은품' : '일반'}</span>}
                        {x.low && <span className="chip chip-amber" style={{ marginLeft: 4, fontSize: 11 }}>재고 {x.avail}</span>}
                      </div>
                    ))}
                  </td>
                  <td><StageChip stage={o.stage} sameDay={l && l.sameDay} /></td>
                  <td>{l && l.seen ? fmtDate(l.seen) : '-'}</td>
                  <td>{l && l.current ? fmtDate(l.current) : '-'}</td>
                  <td><b>{o.final_out ? fmtDate(o.final_out) : '-'}</b></td>
                  <td>{[o.lines.find(x => x.notice1_date), o.lines.find(x => x.notice2_date)].map((x, i) => x ? <span key={i} className="chip chip-green" style={{ marginRight: 4 }}>{i + 1}차 {x[`notice${i + 1}_method`] || ''} {fmtDate(x[`notice${i + 1}_date`]).slice(3)}</span> : null)}{!o.lines.some(x => x.notice1_date) && <span className="muted">-</span>}</td>
                  <td>{o.split || (o.mixed ? <span className="muted">일반상품 함께</span> : '-')}</td>
                  <td>{o.low ? <span className="chip chip-amber">저재고</span> : ''}</td>
                  {!todo && <td>{o.status === '출고완' ? <span className="chip chip-green">출고완 {fmtDate(o.shipped_on).slice(3)}</span> : o.status === '취소' ? <span className="chip">취소</span> : '출고대기'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '0 16px 16px' }}><Pager page={cur} pages={pages} onChange={setPage} size={SIZE} onSize={setSize} /></div>
    </div>
  );
}

// 주문 목록 + 조회(상태·단계·출고예정일·예약상품·검색) + 선택한 주문 일괄 처리
function PreorderAllOrders({ orders, onOpen, reload, todo }) {
  const toast = useToast();
  const [status, setStatus] = useState(todo ? '' : '출고대기');
  const [stage, setStage] = useState('');
  const [product, setProduct] = useState('');
  const [outFrom, setOutFrom] = useState('');
  const [outTo, setOutTo] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [method, setMethod] = useState('문자');
  const [busy, setBusy] = useState(false);

  // 예약상품 이름 목록 (이 목록에 있는 주문들 기준)
  const productNames = useMemo(() => [...new Set(orders.flatMap(o => o.preLines.map(l => l.product_name)).filter(Boolean))].sort(), [orders]);
  const rows = orders.filter(o => (!status || o.status === status) && (!stage || o.stage === stage) &&
    (!product || o.preLines.some(l => l.product_name === product)) &&
    (!outFrom || (o.final_out && o.final_out >= outFrom)) && (!outTo || (o.final_out && o.final_out <= outTo)) &&
    (!q.trim() || [o.order_no, o.seller_order_no, o.orderer, ...o.lines.map(l => l.product_name), ...o.lines.map(l => l.barcode)].some(v => String(v || '').toLowerCase().includes(q.trim().toLowerCase()))));
  const filterKey = [status, stage, product, outFrom, outTo, q].join('|');
  useEffect(() => { setSelected(new Set()); }, [filterKey]);
  const picked = rows.filter(o => selected.has(o.order_no));
  const hasFilter = !!(stage || product || outFrom || outTo || q || (todo ? status : status !== '출고대기'));

  const run = async (label, fn) => {
    if (!picked.length) return;
    if (!confirm(`선택한 주문 ${picked.length}건을 '${label}' 처리할까요?`)) return;
    setBusy(true);
    try { const n = await fn(); toast(`✅ ${picked.length}건 ${label}${n !== undefined ? ` (${n}줄)` : ''}`); setSelected(new Set()); await reload(); }
    catch (e) { toast('❌ 처리 실패: ' + (e.message || e), 'err'); }
    finally { setBusy(false); }
  };
  const updateIds = async (ids, patch) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from('preorder_lines').update(patch).in('id', ids.slice(i, i + 200));
      if (error) throw error;
    }
  };
  // 안내 완료: 지연된 예약상품 줄에 안내 기록 (1차가 비었으면 1차, 아니면 2차 · 지연 횟수만큼 채움)
  const markNotice = () => run(`${method} 안내 완료`, async () => {
    const d = today(), n1 = [], n2 = [];
    picked.forEach(o => o.lines.forEach(l => {
      if (!l.prod || !(l.need > 0) || l.status !== '출고대기') return;
      if (!l.notice1_date) { n1.push(l.id); if (l.need > 1 && !l.notice2_date) n2.push(l.id); }
      else if (!l.notice2_date && l.need > 1) n2.push(l.id);
    }));
    await updateIds(n1, { notice1_method: method, notice1_date: d });
    await updateIds(n2, { notice2_method: method, notice2_date: d });
    return new Set([...n1, ...n2]).size;
  });
  const setStatusAll = (to) => run(to === '출고완' ? '출고완' : to === '취소' ? '취소' : '출고대기로 되돌리기', async () => {
    const ids = picked.flatMap(o => o.lines.map(l => l.id));
    await updateIds(ids, { status: to, shipped_on: to === '출고완' ? today() : null });
    return ids.length;
  });

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="filters">
          {!todo && <Select value={status} onChange={setStatus} options={['출고대기', '출고완', '취소']} placeholder="상태 전체" />}
          <Select value={stage} onChange={setStage} options={['정상', '1차 지연', '2차 지연', '공지일 확인']} placeholder="단계 전체" />
          <Select value={product} onChange={setProduct} options={productNames} placeholder="예약상품 전체" />
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>출고예정일</span>
          <input className="input" type="date" value={outFrom} onChange={e => setOutFrom(e.target.value)} title="주문 최종 출고예정일 (부터)" />
          <span className="muted">~</span>
          <input className="input" type="date" value={outTo} onChange={e => setOutTo(e.target.value)} title="주문 최종 출고예정일 (까지)" />
          <input className="input" style={{ minWidth: 200 }} value={q} onChange={e => setQ(e.target.value)} placeholder="주문번호·주문자·상품명·바코드" />
          {hasFilter && <button className="btn-link" onClick={() => { setStatus(todo ? '' : '출고대기'); setStage(''); setProduct(''); setOutFrom(''); setOutTo(''); setQ(''); }}>초기화</button>}
          <span className="muted">{rows.length.toLocaleString()}건{todo ? '' : ' · 출고완은 최근 60일'}</span>
        </div>
      </div>
      <div className={`card bulk-bar${picked.length ? ' on' : ''}`}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <input type="checkbox" checked={rows.length > 0 && picked.length === rows.length} onChange={() => setSelected(picked.length === rows.length ? new Set() : new Set(rows.map(o => o.order_no)))} />
          {picked.length ? `${picked.length}건 선택됨` : `조회된 ${rows.length}건 전체 선택`}
        </label>
        <span className="bulk-sep" />
        <select className="input" style={{ width: 'auto' }} value={method} onChange={e => setMethod(e.target.value)}><option>문자</option><option>유선</option></select>
        <button className="btn btn-primary btn-sm" disabled={!picked.length || busy} onClick={markNotice} title="지연된 예약상품에 오늘 날짜로 안내 기록 (1차·2차는 자동)">{method === '문자' ? '💬' : '📞'} 안내 완료</button>
        <span className="bulk-sep" />
        <button className="btn btn-sm" disabled={!picked.length || busy} onClick={() => setStatusAll('출고완')}>📦 출고완</button>
        <button className="btn btn-sm" disabled={!picked.length || busy} onClick={() => setStatusAll('출고대기')}>↩ 출고대기로</button>
        <button className="btn btn-sm btn-danger" disabled={!picked.length || busy} onClick={() => setStatusAll('취소')}>취소 처리</button>
        {picked.length > 0 && <button className="btn-link" onClick={() => setSelected(new Set())}>선택 해제</button>}
      </div>
      <PreorderOrderTable orders={rows} onOpen={onOpen} todo={todo} selected={selected} setSelected={setSelected}
        empty={todo && !hasFilter ? '지금 안내할 주문이 없어요 🎉' : '조건에 맞는 주문이 없어요'} />
    </>
  );
}

// 사은품: 기준 관리 목록에서 고르기 (목록에 없는 기존 값은 그대로 보이고, '직접 입력'도 가능)
function GiftPicker({ value, onChange, options }) {
  const [typing, setTyping] = useState(false);
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const opts = clean && !options.includes(value) ? [...options, value] : options;
  if (typing) return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input style={{ flex: 1 }} value={value} onChange={e => onChange(e.target.value)} placeholder="사은품 직접 입력" autoFocus />
      <button type="button" className="btn btn-sm" onClick={() => setTyping(false)}>목록</button>
    </div>
  );
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <select style={{ flex: 1, minWidth: 0 }} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">없음</option>
        {opts.map(g => <option key={g} value={g}>{String(g).replace(/\s+/g, ' ')}{options.includes(g) ? '' : ' (기존 기록)'}</option>)}
      </select>
      <button type="button" className="btn btn-sm" onClick={() => setTyping(true)}>직접 입력</button>
    </div>
  );
}

function PreorderOrderPanel({ order, onClose, reload, giftOptions = [] }) {
  const toast = useToast();
  const [ls, setLs] = useState(() => order.lines.map(l => ({ ...l })));
  const [split, setSplit] = useState(order.split || '');
  const [saving, setSaving] = useState(false);
  const setLine = (i, k) => (v) => setLs(prev => prev.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  // 안내 완료: 지연된 예약상품 줄에 다음 차수 안내를 오늘 날짜로 기록
  const markNotice = (method) => setLs(prev => prev.map(l => {
    const e = order.lines.find(x => x.id === l.id);
    if (!e || !e.pending) return l;
    return !l.notice1_date ? { ...l, notice1_method: method, notice1_date: today() } : !l.notice2_date ? { ...l, notice2_method: method, notice2_date: today() } : l;
  }));

  const save = async () => {
    setSaving(true);
    try {
      for (const l of ls) {
        const { error } = await db.from('preorder_lines').update({
          split: split || null, status: l.status, shipped_on: l.status === '출고완' ? (l.shipped_on || today()) : null,
          notice1_method: l.notice1_method || null, notice1_date: l.notice1_date || null,
          notice2_method: l.notice2_method || null, notice2_date: l.notice2_date || null,
          gift: l.gift || null, memo: l.memo || null,
        }).eq('id', l.id);
        if (error) throw error;
      }
      toast('✅ 저장했어요');
      await reload();
      onClose();
    } catch (e) { toast('❌ 저장 실패: ' + (e.message || e), 'err'); } finally { setSaving(false); }
  };

  const delayed = order.preLines.filter(l => l.need > 0);
  const smsName = (delayed.length ? delayed : order.preLines).map(l => l.product_name).join(', ') || order.lines[0].product_name;
  const smsDate = order.final_out;
  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast(`📋 ${label} 문자를 복사했어요`); } catch { toast('❌ 복사하지 못했어요', 'err'); }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{order.orderer || '-'} · {order.seller_order_no || order.order_no}</h2>
          <button className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="card">
          <div className="muted" style={{ marginBottom: 12 }}>{sellerLabel(order.seller)} · 구매일 {fmtDate(order.purchase_date)} · 오클릭 {order.order_no} · 주문 최종 출고예정 <b>{order.final_out ? fmtDate(order.final_out) : '-'}</b></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={() => markNotice('유선')} disabled={!order.pending}>📞 유선 안내 완료</button>
            <button className="btn btn-primary" onClick={() => markNotice('문자')} disabled={!order.pending}>💬 문자 안내 완료</button>
            <button className="btn" onClick={() => copy(PREORDER_SMS.first(smsName, smsDate), '1차 지연')}>📋 1차 지연 문자</button>
            <button className="btn" onClick={() => copy(PREORDER_SMS.second(smsName, smsDate), '2차 지연')}>📋 2차 지연 문자</button>
            {order.low && <button className="btn" onClick={() => copy(PREORDER_SMS.split(smsName), '분리배송')}>📋 재고 소량·분리배송 문자</button>}
          </div>
          <div className="field" style={{ maxWidth: 240, marginBottom: 14 }}>
            <label>배송구분 (주문 전체)</label>
            <Select className="" value={split} onChange={setSplit} options={['합배송', '분리배송']} placeholder="선택 안 함" />
          </div>
          {ls.map((l, i) => {
            const e = order.lines[i];
            return (
              <div key={l.id} className="card" style={{ marginBottom: 10, background: '#FAFBFC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <b>{l.product_name}{l.size && l.size !== '0' ? ` (${l.size})` : ''} × {l.qty}</b>
                  <span>{e.prod ? <><StageChip stage={e.stage} sameDay={e.sameDay} /> <span className="muted">안내 {fmtDate(e.seen)} → 현재 {fmtDate(e.current)}</span></> : <span className="muted">일반상품</span>}{e.low && <span className="chip chip-amber" style={{ marginLeft: 6 }}>가용재고 {l.avail}</span>}</span>
                </div>
                {e.prod && (
                  <div className="form-grid">
                    <div className="field"><label>1차 안내</label><Select className="" value={l.notice1_method || ''} onChange={setLine(i, 'notice1_method')} options={['유선', '문자']} placeholder="-" /></div>
                    <div className="field"><label>1차 안내일</label><input type="date" value={l.notice1_date || ''} onChange={ev => setLine(i, 'notice1_date')(ev.target.value)} /></div>
                    <div className="field"><label>2차 안내</label><Select className="" value={l.notice2_method || ''} onChange={setLine(i, 'notice2_method')} options={['유선', '문자']} placeholder="-" /></div>
                    <div className="field"><label>2차 안내일</label><input type="date" value={l.notice2_date || ''} onChange={ev => setLine(i, 'notice2_date')(ev.target.value)} /></div>
                    <div className="field" style={{ gridColumn: 'span 2' }}><label>사은품</label>
                      <GiftPicker value={l.gift || ''} onChange={setLine(i, 'gift')} options={giftOptions} />
                    </div>
                  </div>
                )}
                <div className="form-grid">
                  <div className="field"><label>상태</label><Select className="" value={l.status} onChange={setLine(i, 'status')} options={['출고대기', '출고완', '취소']} /></div>
                  <div className="field" style={{ gridColumn: 'span 2' }}><label>메모</label><input value={l.memo || ''} onChange={ev => setLine(i, 'memo')(ev.target.value)} placeholder="배송문의 접수, 특정일 수령 필요 등" /></div>
                </div>
              </div>
            );
          })}
          <div className="form-actions">
            <button className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreorderProducts({ products, lines, productByCode, onEdit, reload }) {
  const toast = useToast();
  const [showDone, setShowDone] = useState(false);
  const counts = useMemo(() => {
    const m = new Map();
    lines.filter(l => l.status === '출고대기').forEach(l => {
      const p = productByCode.get(l.barcode); if (!p) return;
      const s = preorderStage(l, p).stage;
      const e = m.get(p.code) || { total: 0, '1차 지연': 0, '2차 지연': 0 };
      e.total += l.qty || 1; if (e[s] !== undefined) e[s] += l.qty || 1;
      m.set(p.code, e);
    });
    return m;
  }, [lines, productByCode]);
  // 입고 완료 상품: 기다리는 주문이 없으면 종료해도 됨 · 있으면 '입고됐는데 미출고'로 확인 필요
  const waitingOf = (p) => (counts.get(p.code) || {}).total || 0;
  const readyToClose = products.filter(p => p.status !== '종료' && p.actual_in && !waitingOf(p));
  const closeAll = async () => {
    if (!confirm(`입고가 끝났고 기다리는 주문이 없는 상품 ${readyToClose.length}개를 '종료'로 바꿀까요?\n(종료된 상품은 목록에서 숨겨지고, '종료된 상품도 보기'로 다시 볼 수 있어요)`)) return;
    const { error } = await db.from('preorder_products').update({ status: '종료' }).in('id', readyToClose.map(p => p.id));
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    toast(`✅ ${readyToClose.length}개 종료 처리했어요`);
    reload();
  };
  // 확인이 필요한 것(입고됐는데 미출고)을 위로
  const rank = (p) => (p.status === '종료' ? 3 : p.actual_in && waitingOf(p) ? 0 : p.actual_in ? 2 : 1);
  const rows = products.filter(p => showDone || p.status !== '종료').sort((a, b) => rank(a) - rank(b));
  const d = (v) => (v ? fmtDate(v) : '');
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '16px 20px', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => onEdit({ status: '진행' })}>+ 예약상품 추가</button>
        {readyToClose.length > 0 && <button className="btn" onClick={closeAll} title="실제 입고일이 있고 기다리는 주문이 없는 상품">✅ 입고 끝난 상품 {readyToClose.length}개 종료 처리</button>}
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> 종료된 상품도 보기</label>
        <span className="muted" style={{ marginLeft: 'auto' }}>행을 누르면 일정을 고칠 수 있어요 · 수량 = 출고대기 기준</span>
      </div>
      <div className="table-wrap">
        <table className="table table-wide">
          <thead><tr><th>단품코드</th><th>상품명</th><th>옵션</th><th>최초 입고</th><th>최초 출고</th><th title="고객 안내 시작한 날">1차 공지일</th><th>1차 입고</th><th>1차 출고</th><th title="다시 안내 시작한 날">2차 공지일</th><th>2차 입고</th><th>2차 출고</th><th>실제 입고</th><th className="num">대기 수량</th><th className="num">1차 지연</th><th className="num">2차 지연</th><th>상태</th></tr></thead>
          <tbody>
            {rows.map(p => {
              const c = counts.get(p.code) || {};
              const warn = (p.change1_out && !p.change1_notice) || (p.change2_out && !p.change2_notice);
              return (
                <tr key={p.id} className="clickable" onClick={() => onEdit(p)} style={{ opacity: p.status === '종료' ? 0.55 : 1 }}>
                  <td>{p.code}</td><td className="ellipsis" style={{ maxWidth: 260 }} title={p.product_name}>{p.product_name}</td><td>{p.option_text || ''}</td>
                  <td>{d(p.first_in)}</td><td>{d(p.first_out)}</td>
                  <td style={warn && p.change1_out && !p.change1_notice ? { background: 'var(--warn-soft)' } : null}>{d(p.change1_notice) || (p.change1_out ? '⚠️ 비어있음' : '')}</td><td>{d(p.change1_in)}</td><td>{d(p.change1_out)}</td>
                  <td style={warn && p.change2_out && !p.change2_notice ? { background: 'var(--warn-soft)' } : null}>{d(p.change2_notice) || (p.change2_out ? '⚠️ 비어있음' : '')}</td><td>{d(p.change2_in)}</td><td>{d(p.change2_out)}</td>
                  <td>{d(p.actual_in)}</td>
                  <td className="num">{c.total || ''}</td><td className="num">{c['1차 지연'] || ''}</td><td className="num">{c['2차 지연'] || ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.status === '종료' ? <span className="chip">종료</span>
                    : p.actual_in && c.total ? <span className="chip chip-amber" title="입고됐는데 아직 출고 안 된 주문이 있어요">입고됨 · 미출고 {c.total}</span>
                    : p.actual_in ? <span className="chip chip-green" title="기다리는 주문이 없어요. 종료 처리해도 돼요">입고 완료 · 종료 가능</span>
                    : <span className="chip chip-blue">진행</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="empty">예약상품이 없어요. 추가하거나 '파일 올리기'에서 예약상품리스트를 올려주세요.</div>}
      </div>
    </div>
  );
}

// [칸, 이름, 설명] — 일정이 바뀔 때마다 '공지일(안내 시작한 날) → 입고일 → 출고일' 순서로 한 줄씩 채움
const PRODUCT_DATE_FIELDS = [
  ['first_in', '최초 입고예정', '처음 잡혔던 입고 예정일'],
  ['first_out', '최초 출고일 공지', '상품페이지에 처음 안내한 출고일 (일반상품이면 원래 출고일)'],
  ['change1_notice', '1차 공지일', '일정이 처음 바뀌어서 고객 안내를 시작한 날'],
  ['change1_in', '1차 변경 입고일', '바뀐 입고 예정일'],
  ['change1_out', '1차 변경 출고일', '바뀐 출고 예정일 (고객에게 안내한 날짜)'],
  ['change2_notice', '2차 공지일', '일정이 또 바뀌어서 다시 안내를 시작한 날'],
  ['change2_in', '2차 변경 입고일', '다시 바뀐 입고 예정일'],
  ['change2_out', '2차 변경 출고일', '다시 바뀐 출고 예정일'],
  ['actual_in', '실제 입고일', '실제로 들어온 날 (다 나가면 예판 상태를 종료로)'],
];

// 일정 입력: ① 처음 일정 → ② 1차로 밀림 → ③ 또 밀림 → ④ 입고 완료 (단계별로, 필요한 단계만 펼쳐서)
function ScheduleSteps({ f, set }) {
  const [show2, setShow2] = useState(!!(f.change2_notice || f.change2_in || f.change2_out));
  const [show1, setShow1] = useState(!!(f.change1_notice || f.change1_in || f.change1_out) || show2);
  const date = (k, label, help) => (
    <div className="field"><label>{label}</label><input type="date" value={f[k] || ''} onChange={e => set(k)(e.target.value)} />{help && <div className="hint">{help}</div>}</div>
  );
  const clear = (keys, hide) => { keys.forEach(k => set(k)('')); hide(false); };
  return (
    <div className="sched">
      <div className="sched-step">
        <div className="sched-title"><span className="sched-no">1</span>처음 일정 <small>상품페이지에 처음 안내한 일정</small></div>
        <div className="form-grid">
          {date('first_in', '입고 예정일')}
          {date('first_out', '출고 예정일', '일반상품이 재고 부족으로 밀린 거면 원래 출고일(보통 주문 당일)')}
        </div>
      </div>

      {show1 ? (
        <div className="sched-step delayed">
          <div className="sched-title"><span className="sched-no">2</span>일정이 밀렸어요 (1차)
            <button type="button" className="btn-link" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => clear(['change1_notice', 'change1_in', 'change1_out', 'change2_notice', 'change2_in', 'change2_out'], (v) => { setShow1(v); setShow2(v); })}>지우기</button></div>
          <div className="form-grid">
            {date('change1_notice', '고객 안내 시작한 날', '이날보다 먼저 산 고객 = 지연 안내 대상')}
            {date('change1_in', '바뀐 입고 예정일')}
            {date('change1_out', '바뀐 출고 예정일', '고객에게 안내한 새 출고일')}
          </div>
        </div>
      ) : <button type="button" className="btn sched-add" onClick={() => setShow1(true)}>＋ 일정이 밀렸어요 (1차 변경 입력)</button>}

      {show1 && (show2 ? (
        <div className="sched-step delayed">
          <div className="sched-title"><span className="sched-no">3</span>또 밀렸어요 (2차)
            <button type="button" className="btn-link" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => clear(['change2_notice', 'change2_in', 'change2_out'], setShow2)}>지우기</button></div>
          <div className="form-grid">
            {date('change2_notice', '다시 안내 시작한 날')}
            {date('change2_in', '다시 바뀐 입고 예정일')}
            {date('change2_out', '다시 바뀐 출고 예정일')}
          </div>
        </div>
      ) : <button type="button" className="btn sched-add" onClick={() => setShow2(true)}>＋ 또 밀렸어요 (2차 변경 입력)</button>)}

      <div className="sched-step">
        <div className="sched-title"><span className="sched-no">✓</span>입고 완료</div>
        <div className="form-grid">
          {date('actual_in', '실제 입고일', '다 출고되면 위쪽 예판 상태를 “종료”로 바꿔주세요')}
        </div>
      </div>
    </div>
  );
}

// 입력한 날짜로 어떻게 계산되는지 문장으로
function ScheduleSummary({ f }) {
  const md = (d) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : '?');
  const lines = [];
  if (!f.first_out) lines.push('처음 출고 예정일을 넣어주세요.');
  else if (!f.change1_out && !f.change1_notice) lines.push(`지금은 ${md(f.first_out)} 출고 예정 그대로예요. 지연 안내 대상 없음.`);
  else {
    if (!f.change1_notice) lines.push('⚠️ 1차 "고객 안내 시작한 날"이 비어 있어서 누가 지연인지 계산할 수 없어요.');
    else lines.push(`${md(f.change1_notice)} 전에 산 고객 → 1차 지연 (${md(f.first_out)} → ${md(f.change1_out)} 출고)`);
    if (f.change2_out || f.change2_notice) {
      if (!f.change2_notice) lines.push('⚠️ 2차 "다시 안내 시작한 날"이 비어 있어요.');
      else {
        lines.push(`${md(f.change1_notice)} 전에 산 고객 → 2차 지연까지 (${md(f.first_out)} → ${md(f.change2_out)})`);
        lines.push(`${md(f.change1_notice)} ~ ${md(f.change2_notice)} 사이에 산 고객 → 1차 지연 (${md(f.change1_out)} → ${md(f.change2_out)})`);
        lines.push(`${md(f.change2_notice)} 이후에 산 고객 → 정상 (${md(f.change2_out)} 출고를 보고 삼)`);
      }
    } else if (f.change1_notice) lines.push(`${md(f.change1_notice)} 이후에 산 고객 → 정상 (${md(f.change1_out)} 출고를 보고 삼)`);
  }
  return (
    <div className="card" style={{ background: 'var(--accent-soft)', border: 'none', marginTop: 12, lineHeight: 1.8 }}>
      <b>이렇게 계산돼요</b>
      {lines.map((l, i) => <div key={i}>· {l}</div>)}
      <div className="muted" style={{ fontSize: 12 }}>안내 시작한 날 당일에 산 고객은 목록에 * 표시 (주문 시각 확인 필요)</div>
    </div>
  );
}

function PreorderProductPanel({ product, onClose, reload }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ code: '', product_name: '', option_text: '', note: '', status: '진행', ...Object.fromEntries(PRODUCT_DATE_FIELDS.map(([k]) => [k, ''])), ...Object.fromEntries(Object.entries(product).map(([k, v]) => [k, v ?? ''])) }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (!f.code.trim()) { toast('❌ 단품코드를 넣어주세요', 'err'); return; }
    setSaving(true);
    const row = { code: f.code.trim(), product_name: str(f.product_name), option_text: str(f.option_text), note: str(f.note), status: f.status, ...Object.fromEntries(PRODUCT_DATE_FIELDS.map(([k]) => [k, f[k] || null])) };
    const { error } = product.id ? await db.from('preorder_products').update(row).eq('id', product.id) : await db.from('preorder_products').insert(row);
    setSaving(false);
    if (error) { toast('❌ 저장 실패: ' + (error.message.includes('duplicate') ? '이미 있는 단품코드예요' : error.message), 'err'); return; }
    toast('✅ 일정을 저장했어요 · 지연 단계가 다시 계산돼요');
    await reload();
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head"><h2>{product.id ? '예약상품 일정 수정' : '예약상품 추가'}</h2><button className="btn btn-sm" onClick={onClose}>닫기</button></div>
        <form className="card" onSubmit={save}>
          <div className="form-grid">
            <div className="field"><label>단품코드 (바코드)<span className="req"> *</span></label><input value={f.code} onChange={e => set('code')(e.target.value)} /></div>
            <div className="field" style={{ gridColumn: 'span 2' }}><label>상품명</label><input value={f.product_name} onChange={e => set('product_name')(e.target.value)} /></div>
            <div className="field"><label>옵션</label><input value={f.option_text} onChange={e => set('option_text')(e.target.value)} /></div>
            <div className="field"><label>예판 상태</label><Select className="" value={f.status} onChange={set('status')} options={['진행', '종료']} /></div>
          </div>
          <div className="form-section">일정 <small className="muted" style={{ fontWeight: 400 }}>일이 생긴 순서대로 위에서부터 채워요</small></div>
          <ScheduleSteps f={f} set={set} />
          <ScheduleSummary f={f} />
          <div className="field" style={{ marginTop: 12 }}><label>비고</label><input value={f.note} onChange={e => set('note')(e.target.value)} /></div>
          <div className="form-actions">
            {product.id && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={async () => {
              if (!confirm('이 예약상품을 삭제할까요? (주문 기록은 남아요)')) return;
              const { error } = await db.from('preorder_products').delete().eq('id', product.id);
              if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
              toast('✅ 삭제했어요'); await reload(); onClose();
            }}>삭제</button>}
            <button type="button" className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- 파일 올리기 ----------
function PreorderUpload({ lines, products, uploads, reload }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [found, setFound] = useState(null);
  const [snapshotDate, setSnapshotDate] = useState(today());
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  const pick = async (files) => {
    setResult(null); setBusy('파일 읽는 중...');
    try {
      const all = [];
      for (const file of files) all.push(...await readPreorderFile(file));
      setFound(all);
      if (!all.length) toast('❌ 알아볼 수 있는 시트가 없어요. 아래 형식 안내를 확인해 주세요.', 'err');
    } catch (e) { toast('❌ 파일을 읽지 못했어요: ' + e.message, 'err'); } finally { setBusy(''); }
  };

  const allLineSheets = (found || []).filter(s => s.format.kind === 'lines');
  // 예약주문 시트가 여러 장(구글시트 전체를 받은 파일)이면 오늘 것으로 쓸 시트를 직접 고름
  const [linePick, setLinePick] = useState('');
  useEffect(() => { setLinePick(''); }, [found]);
  const lineSheets = allLineSheets.length === 1 ? allLineSheets : allLineSheets.filter(s => `${s.file}|${s.sheet}` === linePick);
  const productSheets = (found || []).filter(s => s.format.kind === 'products');
  const noticeSheets = (found || []).filter(s => s.format.kind === 'notices');

  const apply = async () => {
    const msgs = [];
    try {
      // 1) 예약상품 일정
      if (productSheets.length) {
        setBusy('예약상품 일정 저장 중...');
        const ps = productSheets.flatMap(toPreorderProducts);
        await upsertChunks('preorder_products', ps, 'code');
        msgs.push(`🗓️ 예약상품 ${ps.length}개 일정 저장`);
      }
      // 2) 오클릭 미출고 파일 (하루치 한 장만)
      let current = lines;
      if (lineSheets.length === 1) {
        setBusy('예약주문 반영 중...');
        const fileLines = toPreorderLines(lineSheets[0]);
        const ex = new Map(lines.map(l => [l.line_key, l]));
        const splitByOrder = new Map();
        lines.forEach(l => { if (l.split && !splitByOrder.has(l.order_no)) splitByOrder.set(l.order_no, l.split); });
        const rows = fileLines.map(l => {
          const e = ex.get(l.line_key);
          return {
            ...l, last_seen: snapshotDate, first_seen: e ? e.first_seen : snapshotDate,
            status: e ? (e.status === '출고완' ? '출고대기' : e.status) : '출고대기',
            shipped_on: e && e.status !== '출고완' ? e.shipped_on : null,
            split: e ? e.split : (splitByOrder.get(l.order_no) || null),
          };
        });
        // 파일에서 빠진 주문 = 출고완 (원본을 덜 붙였을 수 있어 확인)
        const fileOrders = new Set(fileLines.map(l => l.order_no));
        const openLines = lines.filter(l => l.status === '출고대기');
        const gone = [...new Set(openLines.filter(l => !fileOrders.has(l.order_no)).map(l => l.order_no))];
        const fileSellers = new Set(fileLines.map(l => l.seller));
        const missingSellers = [...new Set(openLines.map(l => l.seller).filter(s => s && !fileSellers.has(s)))];
        let doShip = gone.length > 0;
        if (doShip && missingSellers.length) doShip = confirm(`이전에 있던 판매처가 이번 파일에 한 건도 없어요: ${missingSellers.map(sellerLabel).join(', ')}\n실제로 전부 출고된 게 맞으면 [확인], 원본을 다시 확인하려면 [취소]\n(취소해도 주문 내용은 반영돼요. 출고완 처리만 건너뜀)`);
        if (doShip && openLines.length && fileLines.length < openLines.length * PREORDER_SHIP_SAFETY) doShip = confirm(`이번 파일 줄 수(${fileLines.length})가 이전(${openLines.length})보다 너무 적어요.\n원본을 덜 복사했다면 주문이 잘못 출고완 처리될 수 있어요. 그래도 출고완 처리할까요?`);
        await upsertChunks('preorder_lines', rows, 'line_key');
        if (doShip) {
          for (let i = 0; i < gone.length; i += 200) {
            const { error } = await db.from('preorder_lines').update({ status: '출고완', shipped_on: snapshotDate }).in('order_no', gone.slice(i, i + 200)).eq('status', '출고대기');
            if (error) throw error;
          }
        }
        const newCount = rows.filter(r => !ex.has(r.line_key)).length;
        await db.from('preorder_uploads').insert({ snapshot_date: snapshotDate, file_name: lineSheets[0].file, line_count: fileLines.length, order_count: fileOrders.size, new_count: newCount, shipped_orders: doShip ? gone : [], note: doShip || !gone.length ? null : '출고완 처리 건너뜀' });
        msgs.push(`📦 예약주문 ${fileLines.length}줄 (주문 ${fileOrders.size}건) 반영 · 새로 들어온 줄 ${newCount}`);
        msgs.push(gone.length ? (doShip ? `✅ 파일에서 빠진 주문 ${gone.length}건 → 출고완` : `⏸️ 파일에서 빠진 주문 ${gone.length}건은 출고완 처리 안 함`) : '출고완으로 바뀐 주문 없음');
        current = null;
      } else if (allLineSheets.length > 1) {
        msgs.push(`⏭️ 예약주문 시트 ${allLineSheets.length}장 중 오늘 것을 고르지 않아서 주문은 반영하지 않았어요.`);
      }
      // 3) 지연안내리스트 → 안내 기록 채우기 (비어 있는 칸만)
      if (noticeSheets.length) {
        setBusy('안내 기록 옮기는 중...');
        const all = current || await fetchAll(() => db.from('preorder_lines').select('*').order('id'));
        const notices = noticeSheets.flatMap(toPreorderNotices);
        const byRef = new Map();
        all.forEach(l => [l.seller_order_no, l.order_no].filter(Boolean).forEach(ref => { const k = `${ref}|${l.barcode}`; if (!byRef.has(k)) byRef.set(k, []); byRef.get(k).push(l); }));
        let matched = 0, skipped = 0;
        for (const n of notices) {
          const targets = byRef.get(`${n.order_ref}|${n.barcode}`);
          if (!targets) { skipped++; continue; }
          matched++;
          for (const l of targets) {
            const patch = {};
            ['notice1_method', 'notice1_date', 'notice2_method', 'notice2_date', 'gift', 'memo'].forEach(k => { if (!l[k] && n[k]) patch[k] = n[k]; });
            if (!l.split && /합배송|분리배송/.test(n.split || '')) patch.split = n.split.includes('분리') ? '분리배송' : '합배송';
            if (Object.keys(patch).length) { const { error } = await db.from('preorder_lines').update(patch).eq('id', l.id); if (error) throw error; }
          }
        }
        msgs.push(`📞 안내 기록 ${matched}건 옮김${skipped ? ` · 대시보드에 없는 주문(이미 출고 등) ${skipped}건은 건너뜀` : ''}`);
      }
      setResult(msgs); setFound(null);
      await reload();
    } catch (e) {
      toast('❌ 저장 실패: ' + (e.message || e), 'err');
    } finally { setBusy(''); }
  };

  const undo = async (u) => {
    if (!confirm(`${fmtDate(u.snapshot_date)} 파일로 출고완 처리된 주문 ${u.shipped_orders.length}건을 다시 '출고대기'로 돌릴까요?`)) return;
    for (let i = 0; i < u.shipped_orders.length; i += 200) {
      const { error } = await db.from('preorder_lines').update({ status: '출고대기', shipped_on: null }).in('order_no', u.shipped_orders.slice(i, i + 200)).eq('status', '출고완').eq('shipped_on', u.snapshot_date);
      if (error) { toast('❌ 되돌리기 실패: ' + error.message, 'err'); return; }
    }
    await db.from('preorder_uploads').update({ shipped_orders: [], note: '출고완 되돌림' }).eq('id', u.id);
    toast('✅ 되돌렸어요'); await reload();
  };

  return (
    <>
      <div className="card">
        <div className="card-title">파일 올리기 <small>매일: 오클릭 미출고(예약주문) 엑셀 · 처음 한 번: 구글시트의 예약상품리스트·지연안내리스트</small></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field"><label>파일 기준일 (오클릭에서 받은 날)</label><input type="date" value={snapshotDate} onChange={e => setSnapshotDate(e.target.value)} /></div>
          <div className="field"><label>파일</label>
            <button className="btn btn-primary" onClick={() => inputRef.current.click()} disabled={!!busy}>📂 파일 선택 (엑셀·CSV)</button>
            <input ref={inputRef} type="file" multiple accept=".xlsx,.xls,.csv" hidden onChange={e => { pick([...e.target.files]); e.target.value = ''; }} />
          </div>
        </div>
        <ul className="hint" style={{ marginTop: 12, lineHeight: 1.8, paddingLeft: 18 }}>
          <li><b>오클릭 예약주문</b>: 첫 줄에 {PREORDER_FORMATS[0].headers.join(' · ')} 칸이 있는 파일 (구글시트 A~L열에 붙여넣던 원본). 올릴 때마다 <b>파일에 없는 주문은 출고완</b>으로 바뀌어요.</li>
          <li><b>예약상품리스트</b>: {PREORDER_FORMATS[1].headers.join(' · ')} … 칸. 같은 단품코드는 새 내용으로 덮어써요.</li>
          <li><b>예약 지연안내리스트</b>: 기존 안내 기록(1차·2차 안내, 사은품, 배송구분)을 옮겨와요. 대시보드에 이미 적힌 칸은 건드리지 않아요.</li>
          <li>구글시트 전체를 엑셀로 받아 올리면 예약상품·지연안내 시트만 쓰고, 날짜별 예약주문 시트는 여러 장이라 건너뛰어요.</li>
        </ul>
        {busy && <div className="empty">{busy}</div>}
        {found && found.length > 0 && !busy && (
          <div style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>파일 · 시트</th><th>알아본 형식</th><th className="num">줄 수</th></tr></thead>
              <tbody>{found.map((s, i) => {
                const skip = s.format.kind === 'lines' && allLineSheets.length > 1 && `${s.file}|${s.sheet}` !== linePick;
                return <tr key={i} style={skip ? { opacity: 0.45 } : null}><td>{s.file} · {s.sheet}</td><td>{s.format.label}{skip ? ' (사용 안 함)' : ''}</td><td className="num">{s.rows.length.toLocaleString()}</td></tr>;
              })}</tbody>
            </table>
            {allLineSheets.length > 1 && (
              <div className="field" style={{ marginTop: 12, maxWidth: 520 }}>
                <label>예약주문 시트가 {allLineSheets.length}장 있어요. 오늘 주문으로 쓸 시트를 골라주세요 (보통 가장 최근 날짜)</label>
                <Select className="" value={linePick} onChange={setLinePick} options={allLineSheets.map(s => ({ value: `${s.file}|${s.sheet}`, label: `${s.sheet} · ${s.rows.length}줄` }))} placeholder="주문은 반영하지 않음" />
              </div>
            )}
            {noticeSheets.length > 0 && !lineSheets.length && !lines.length && <div className="hint" style={{ color: 'var(--danger)' }}>⚠️ 아직 대시보드에 예약주문이 없어서 안내 기록을 붙일 곳이 없어요. 위에서 오늘 주문 시트를 고르거나, 오클릭 파일을 같이 선택해 주세요.</div>}
            <div className="form-actions">
              <button className="btn" onClick={() => setFound(null)}>취소</button>
              <button className="btn btn-primary" onClick={apply}>저장하기</button>
            </div>
          </div>
        )}
        {result && <div className="card" style={{ marginTop: 12, background: 'var(--accent-soft)', border: 'none', lineHeight: 1.8 }}>{result.map((m, i) => <div key={i}>{m}</div>)}</div>}
      </div>
      <div className="card">
        <div className="card-title">최근 반영 기록 <small>출고완 처리가 잘못됐으면 되돌릴 수 있어요</small></div>
        {!uploads || !uploads.length ? <div className="empty">아직 기록이 없어요</div> : (
          <table className="table">
            <thead><tr><th>기준일</th><th>파일</th><th className="num">줄</th><th className="num">주문</th><th className="num">새 줄</th><th className="num">출고완</th><th>메모</th><th></th></tr></thead>
            <tbody>{uploads.map(u => (
              <tr key={u.id}>
                <td>{fmtDate(u.snapshot_date)}</td><td className="ellipsis" style={{ maxWidth: 220 }}>{u.file_name}</td>
                <td className="num">{u.line_count}</td><td className="num">{u.order_count}</td><td className="num">{u.new_count}</td>
                <td className="num" title={(u.shipped_orders || []).join(', ')}>{(u.shipped_orders || []).length}</td><td>{u.note || ''}</td>
                <td>{(u.shipped_orders || []).length > 0 && <button className="btn btn-sm" onClick={() => undo(u)}>출고완 되돌리기</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}

// ---------- 대응기준 ----------
const PREORDER_RULES = [
  ['정상 출고', '상품페이지에 고지된 출고 예정 기한 내 출고 가능', '예정대로 출고 진행', '별도 안내 없음'],
  ['1차 지연', '고지된 출고 예정 기한 초과 / 변경 출고일 및 영향 주문 확인', '안내 대상 추출 → 구매리스트 출고예정일 업데이트 → 유선 안내 · 필요 시 분리배송·합배송 선택 안내 · 사은품은 시즌별 CX 운영 기준', '유선 선제 안내 → 미연결 시 1차 지연 문자 (안내 건수가 많으면 문자)'],
  ['출고일 미확정', '입고 또는 출고 가능일이 확정되지 않은 경우', '담당부서 일정 재확인 → 영향 주문 별도 관리', '지연 사실 우선 안내 후, 일정 확정 시 재안내'],
  ['재지연', '1차 안내 후 출고 일정이 다시 변경된 경우', '대상 주문 재확인 → 우선 처리 · 기존 배송문의·특정 사용일 주문 우선 확인 · 추가 사은품은 시즌별 기준', '유선 재안내 → 미연결 시 2차 지연 문자'],
  ['입고수량 부족', '입고수량이 주문수량보다 부족한 경우', '입고수량·주문수 확인 → 미출고 대상 추출 → 재입고 일정 확인', '미출고 대상 고객에게 변경 일정 선제 안내'],
  ['미출고 발생', '예정일이 지났으나 일부 주문이 출고되지 않은 경우', '미출고 원인 및 출고 가능일 확인 → 대상 주문 별도 관리', '출고 가능일 확인 후 선제 안내'],
  ['발주 누락', '예약배송 주문의 발주 여부가 확인되지 않는 경우', '발주 여부 확인 → 누락 시 즉시 발주 → 출고 가능일 확인', '지연 발생 시 대상 고객 개별 안내'],
  ['합배송 이슈', '일반상품+예약상품 또는 출고일이 다른 예약상품이 함께 주문된 경우', '확정된 합배송·분리배송 기준 적용', '필요 시 분리배송 가능 여부 및 출고 일정 안내'],
  ['우선 확인 대상', '같은 주문으로 배송 문의가 이미 접수된 경우 / 여행·휴가·선물 등 특정일 수령이 필요한 경우', '일반 대상보다 우선 확인', '개별(유선) 안내 권장'],
  ['사은품', '사은품 적용이 필요한 경우', '품목·수량은 시즌별 CX팀 운영 기준에 따라 적용', '확정된 내용만 고지'],
  ['29CM', '제품에 예약배송이 세팅되어 있으면 배송기한 자동 연장 / 세팅이 없으면', '고객에게 예약 배송 안내 문자 전송 및 출고지연 등록', ''],
];

function PreorderGuide() {
  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: '18px 20px 4px' }}>예약배송 대응기준</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>구분</th><th>적용 조건</th><th>내부 처리</th><th>고객 안내</th></tr></thead>
            <tbody>{PREORDER_RULES.map(r => <tr key={r[0]}><td style={{ whiteSpace: 'nowrap' }}><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <div className="card-title">지연 단계는 이렇게 계산돼요</div>
        <ul style={{ lineHeight: 1.9, paddingLeft: 18 }}>
          <li><b>구매일</b> = 판매처주문번호 안의 날짜 (없으면 오클릭 입력일)</li>
          <li>구매일이 <b>n차 변경 공지일보다 뒤</b>면 그 고객은 바뀐 일정을 보고 산 것 → 그 뒤에 또 바뀐 횟수만큼만 지연이에요.</li>
          <li>예) 1차 공지 전에 산 고객: 1차 변경 → <b>1차 지연</b>, 2차 변경까지 → <b>2차 지연</b> · 1차 공지 후에 산 고객: 2차 변경 → <b>1차 지연</b></li>
          <li>구매일이 공지일과 같은 날이면 단계 옆에 <b>*</b> 표시 (공지 전·후 주문인지 시각 확인 필요)</li>
          <li><b>안내 필요</b> = 지연 횟수보다 안내 기록(1차·2차 안내일)이 적은 주문. 주문을 눌러 📞/💬 안내 완료를 누르면 목록에서 빠져요.</li>
          <li><b>주문 최종 출고예정일</b> = 같은 주문 안 예약상품 중 가장 늦은 출고일 · 가용재고 {PREORDER_LOW_STOCK[0]}~{PREORDER_LOW_STOCK[1]}이면 <b>저재고</b> (기준 관리 &gt; 예약배송 사은품 목록의 상품은 제외 · 주문 상품 목록에 🎁 사은품으로 표시)</li>
          <li>예판 상태가 <b>종료</b>인 상품은 일정 계산에서 빠져요 (입고 완료).</li>
        </ul>
      </div>
    </>
  );
}

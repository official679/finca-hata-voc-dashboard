// 주문(판매) 업로드 · 상품명으로 대분류 자동 판단

// 상반기 VOC 리포트와 같은 MD 그룹. 위에서부터 먼저 맞는 것 (매트리스는 베딩, 주방매트는 러그처럼 순서 중요)
const MD_GROUPS = [
  ['키친', /커트러리|머그|컵|그릇|접시|키친|행주|수저|포크|나이프|식기|플레이트|트레이|오덴세|젓가락|티스푼|코스터|볼(?![가-힣])/],
  ['바스', /타월|타올|수건|목욕|바스|towel/i],
  ['러그', /러그|발매트|주방매트|카페트|현관매트|매트(?![가-힣])/],
  ['웨어', /파자마|잠옷|셋업|팬츠|쇼츠|티셔츠|원피스|가운|로브|홈웨어|반바지|레깅스|비키니|수영복|모노키니|양말|삭스|슬리브|셔츠|스커트|자켓|후드|맨투맨|bikini|monokini|swim|shirt|shorts|pants|skirt|breaker|jacket|hoodie|dress|leggings|knit|top(?![a-z])/i],
  // 하타 상품명은 영어 (HaTA Signature Eco Bag 등)
  ['잡화', /가방|에코백|보냉백|토트|숄더|백팩|파우치|우산|양산|머플러|스카프|장갑|모자|볼캡|버킷|키링|다이어리|스크런치|헤어|슬리퍼|bag|pouch|cap(?![a-z])|hat(?![a-z])|keyring|sandal|slipper|scarf|hairband/i],
  ['홈데코', /티슈|쿠션|커튼|방석|베개솜|솜(?![가-힣])|충전재|포스터|테이블보|식탁보|앞치마/],
  ['베딩', /이불|베개|매트리스|패드|차렵|침구|블랭킷|담요|스프레드|베딩|배딩|토퍼/],
];
const SET_RE = /세트|SET|\+|구성|1\+1|\d\s*P(?![a-z])|\d\s*종|^MRT/i;

// 상품명으로 먼저, 안 되면 옵션명으로 (마리테처럼 고객이 구성하는 상품은 옵션에 실제 상품이 있음)
function classifyItem(name, option) {
  const find = (t) => (MD_GROUPS.find(([, re]) => re.test(t || '')) || [null])[0];
  const isCodeName = /^MRT\d+/i.test(String(name || '').trim());
  const category = (!isCodeName && find(name)) || find(option) || find(name) || null;
  return { category, is_set: SET_RE.test(String(name || '')) || /\+/.test(String(option || '')) };
}

const num1 = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 1; };

// 주문 파일 형식 (개인정보 칸은 읽지 않음)
// 주문은 오클릭(핀카)·사방넷(하타)만 (2026-10-12 판매처 주문 형식 삭제: 상반기 넣을 때만 썼고, 다시 올리면 두 번 세어짐)

// 오클릭 판매처명 → 플랫폼 ('2. 29CM(하타)' → 29CM). 시딩·샘플·B2B·오프라인은 이름 그대로 (CS 데일리에는 안 들어감)
function oclickPlatform(name) {
  const s = String(name || '').replace(/^\s*\d+\.\s*/, '').replace(/\((하타|핀카)\)\s*$/i, '').trim();
  return normPlatform(s) || '기타';
}
// 오클릭 날짜: 판매처주문번호 안의 날짜(= 고객 주문일), 없으면 오클릭 입력일
function oclickWhen(r) {
  const m = String(r['판매처주문번호'] || '').match(/(20\d{2})(\d{2})(\d{2})/);
  const byNo = m ? parseWhen(`${m[1]}-${m[2]}-${m[3]}`) : null;
  return byNo || parseWhen(String(r['입력일'] || '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'));
}

FILE_FORMATS.push(
  // 오클릭 주문 (모든 판매처·핀카·하타가 한 파일) · 한 줄 = 바코드 1종 (세트는 구성품으로 나뉨)
  // 주문건은 판매처보조번호(= 판매처의 품목 번호)로 다시 묶어서 셈 (2026-09-30 사용자 결정: 모든 판매처 '상품 수'로 통일)
  { kind: 'order', label: '오클릭 주문', numberDupKeys: true,
    headers: ['주문번호', '주문구분', '브랜드', '품명', '바코드', '주문수량', '판매처명', '판매처주문번호', '판매처보조번호', '입력일'],
    // 하타 줄은 건너뜀: 하타 주문은 사방넷 파일로 올림 (오클릭에는 등록만 하고 처리는 사방넷)
    map: (r) => ({ key: r['주문번호'] && normBrand(r['브랜드']) !== '하타' ? 'OC' + hashText(`${r['주문번호']}|${r['판매처보조번호']}|${r['바코드']}|${r['주문구분']}|${r['교환']}`) : '',
      brand: normBrand(r['브랜드']), platform: oclickPlatform(r['판매처명']),
      order_no: r['판매처주문번호'] || r['주문번호'], item_no: r['판매처보조번호'], barcode: r['바코드'],
      status: r['주문구분'], claim_status: r['교환'], product_name: r['품명'],
      option_text: [r['색상'], r['사이즈']].map(v => String(v || '').trim()).filter(Boolean).join(' / '),
      qty: num1(String(r['주문수량'] || '').replace('-', '')), when: oclickWhen(r) }) },
  // 사방넷 주문 (하타 전용: 사방넷에 브랜드 칸이 없어 하타로 저장) · 한 줄 = 상품 1개
  // 반품·교환이 생기면 '…회수…' 줄이 원래 줄과 별도로 생기고, 교환 재발송은 '교환발송…' 줄 → 주문건에서 제외
  { kind: 'order', label: '사방넷 주문 (하타)',
    headers: ['주문상태', '주문일자', '쇼핑몰', '쇼핑몰주문번호', '사방넷주문번호', '상품코드', '상품명', 'EA'],
    map: (r) => ({ key: r['사방넷주문번호'] ? 'SB' + r['사방넷주문번호'] : '', brand: '하타', platform: normPlatform(r['쇼핑몰']),
      order_no: r['쇼핑몰주문번호'], item_no: r['사방넷주문번호'], barcode: r['상품코드'],
      status: r['주문상태'], claim_status: /회수/.test(r['주문상태'] || '') ? '회수' : /교환발송/.test(r['주문상태'] || '') ? '교환발송' : '',
      product_name: r['상품명'], qty: num1(r['EA']),
      when: parseWhen(String(r['주문일자'] || '').replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3')) }) },
);

// 데이터 업로드 화면에서 쓰는 주문 저장 설정 (고객 정보 칸은 저장하지 않음, 상품 마스터 연결 없음)
// 출고전 취소인 줄: 사방넷(하타)은 '취소완료'만 (하타는 취소 요청 후 거부가 많음, 2026-10-02), 그 밖엔 상태에 '취소'
const isCancelRow = (r) => String(r.source_key || '').startsWith('SB') ? /취소완료/.test(r.status || '') : /취소/.test(r.status || '');
// 취소를 처음 확인한 데이터 날짜 = 올린 날의 전날 (CS 데일리는 전일 데이터). 늦게 확인된 취소도 지난 보고를 바꾸지 않고 그날 보고에 들어감
// 8일보다 오래된 주문(지난 기간을 한꺼번에 다시 올릴 때)은 주문 날짜 그대로 → 오늘 보고에 몰리지 않게
function cancelSeenDate(orderDate) {
  const y = toISODate(addDays(new Date(), -1));
  if (!orderDate) return y;
  if (orderDate > y) return orderDate;
  return orderDate >= toISODate(addDays(new Date(), -9)) ? y : orderDate;
}

const ORDER_UPLOAD = {
  table: 'order_items',
  linkProducts: false,
  // 사방넷은 취소·반품이 같은 줄의 주문상태로 바뀜 → 다시 올리면 상태를 새로 (오클릭은 취소가 별도 줄이라 필요 없음)
  updateStatusOf: (r) => String(r.source_key || '').startsWith('SB'),
  // 상태가 바뀌어 처음으로 취소가 된 줄은 확인한 날도 같이 기록
  statusPatch: (row, cur) => ({ status: row.status,
    ...(isCancelRow(row) && !isCancelRow(cur) && !cur.cancel_seen_date ? { cancel_seen_date: cancelSeenDate(cur.order_date) } : {}) }),
  toRow: (r) => {
    const order_date = r.when ? r.when.key.slice(0, 10) : null;
    return {
      order_no: str(r.order_no), status: str(r.status), claim_status: str(r.claim_status),
      item_no: str(r.item_no), barcode: str(r.barcode),
      product_name: str(r.product_name), option_text: str(r.option_text), qty: r.qty,
      ordered_at: r.when ? r.when.iso : null, order_date,
      cancel_reason: str(r.cancel_reason), return_reason: str(r.return_reason),
      ...classifyItem(r.product_name, r.option_text),
    };
  },
  // 새로 저장하는 취소 줄에 확인한 날 기록 (source_key가 붙은 뒤라 사방넷인지 알 수 있음). 품목 번호 없는 줄은 제외
  finishRow: (row) => (row.item_no && isCancelRow(row) ? { ...row, cancel_seen_date: cancelSeenDate(row.order_date) } : row),
};

// 리뷰·게시판·주문을 한 곳에서 올리는 화면 (파일마다 종류를 알아서 구분)
function DataUploadPage() {
  const [counts, setCounts] = useState({});
  const [version, setVersion] = useState(0);
  useEffect(() => {
    Promise.all(['review_items', 'board_items', 'order_items', 'return_items'].map(t => db.from(t).select('id', { count: 'exact', head: true }).then(({ count }) => [t, count])))
      .then(rs => setCounts(Object.fromEntries(rs)));
  }, [version]);
  const n = (t) => (counts[t] === undefined ? '...' : (counts[t] || 0).toLocaleString());
  return (
    <>
      <PageHeader title="데이터 업로드" desc={`지금까지 저장: 리뷰 ${n('review_items')}건 · 게시판 문의 ${n('board_items')}건 · 주문 품목 ${n('order_items')}줄 · 반품·교환 ${n('return_items')}건`} />
      <UploadPanel
        configs={{ review: REVIEW_UPLOAD, board: BOARD_UPLOAD, order: ORDER_UPLOAD, return: RETURN_UPLOAD }}
        guide={<UploadGuide kinds={['review', 'board', 'order', 'return']} />}
        onDone={() => setVersion(v => v + 1)}
      />
      <ProductMasterUpload />
      <BackupCard />
      <OrderCategorySummary key={version} />
    </>
  );
}

// ---------- 백업: 주요 표를 엑셀 한 파일(표마다 시트)로 받기 · 마지막 백업일은 code_items('backup_log')에 기록 ----------
const BACKUP_TABLES = [
  ['voc_cases', 'VOC'], ['cs_daily', 'CS데일리'], ['report_notes', '월간메모'], ['review_items', '리뷰'], ['board_items', '게시판'],
  ['order_items', '주문'], ['order_monthly', '주문요약'], ['return_items', '반품교환'], ['preorder_products', '예약상품'], ['preorder_lines', '예약주문'], ['preorder_uploads', '예약업로드기록'],
  ['meetings', '회의록'], ['meeting_items', '논의사항'], ['tasks', '업무'], ['task_comments', '업무댓글'],
  ['manuals', '업무매뉴얼'], ['cx_guides', '응대주의사항'], ['code_items', '기준목록'], ['products', '상품마스터'],
];
const lastBackupOf = (codes) => ((codes || []).find(c => c.group_key === 'backup_log') || {}).label || '';

// 엑셀 백업: 표마다 시트 하나 (엑셀 한 칸은 32,767자까지 · 목록·객체는 글자로)
async function buildBackupWorkbook(setBusy) {
  const wb = XLSX.utils.book_new();
  const counts = [], data = {};
  for (const [table, sheet] of BACKUP_TABLES) {
    setBusy(`${sheet} 받는 중...`);
    let rows = [];
    try { rows = await fetchAll(() => db.from(table).select('*').order('id')); } catch { continue; }   // 없는 표는 건너뜀
    data[table] = rows;
    const clean = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : String(v).length > 32000 ? String(v).slice(0, 32000) : v])));
    XLSX.utils.book_append_sheet(wb, clean.length ? XLSX.utils.json_to_sheet(clean) : XLSX.utils.aoa_to_sheet([['(비어 있음)']]), sheet);
    counts.push(`${sheet} ${rows.length}`);
  }
  return { wb, counts, data };
}

// ── 🗂 백업 받기 = zip 하나 (2026-10-14 사용자 요청으로 전체 내보내기·엑셀만·보관용·리포트용 4개를 하나로) ──
//   ① CX보관용자료.xlsx = 사람이 보는 한글 칸 엑셀 (구글시트·AI용, 고객 이름 없음) — 대시보드를 안 쓰게 돼도 예전 자료를 보게
//   ② 복구용_원본.xlsx = DB 표 그대로 (대시보드를 다시 살릴 때)
//   ③ VOC사진/월/V번호_상품_사유/1.jpg (사진은 한 벌, 순서 = voc_cases.photos 순서) · 매뉴얼첨부/
//   주문은 원본 대신 월·판매처·상품별 요약 (6월까지 = order_monthly, 7월부터 = order_items를 CS 데일리와 같은 방식으로 셈)
//   반기 VOC 리포트도 이 zip의 VOC 시트를 기간으로 걸러서 씀 (리포트용 버튼은 뺌)
const safeName = (s, max = 40) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const kstDate = (s) => (s ? toISODate(new Date(s)) : '');
const vocPhotoFolder = (c, productById) => `${String(c.received_date || '').slice(0, 7) || '날짜없음'}/V${c.id}_${safeName(caseProductName(c, productById), 40)}_${safeName(c.reason_category || c.voc_type || '사유없음', 20)}`;
const ARCHIVE_README = `CX 대시보드 백업

1) CX보관용자료_날짜.xlsx  ← 사람이 보는 자료 (대부분 이것만 보면 돼요)
   구글 드라이브에 올리면 구글시트로 열려요. 시트마다 한 종류의 자료예요.
   · VOC : 한 줄 = VOC 한 건. '사진 폴더' 칸의 이름으로 VOC사진 폴더를 찾으면 사진이 있어요.
          반기 VOC 리포트 = 이 시트를 접수일로 걸러서 쓰면 돼요.
   · 리뷰 · 게시판 : 고객이 쓴 글 그대로. AI(ChatGPT·Claude 등)에 시트를 올리고 "이번 달 불만 정리해 줘"처럼 물어보면 돼요.
   · CS데일리 : 보고일마다 판매처별 숫자 (데이터 날짜 = 보고일 전날, 월요일은 금~일).
   · 주문요약 : 월·브랜드·판매처·상품별 주문(상품 수)·출고전 취소.
   · 반품교환 · 회의록 · 회의논의사항
2) 복구용_원본_날짜.xlsx  ← 대시보드를 다시 살릴 때 쓰는 DB 원본 (칸 이름이 영어예요. 평소엔 안 봐도 돼요)
3) VOC사진/월/V번호_상품_사유/  ← VOC 사진 (VOC 시트의 VOC번호와 같아요)

복구용 원본에는 고객 이름이 들어 있어요. 회사 드라이브(또는 NAS) 비공개 폴더에만 보관하세요.
숫자 기준은 노션 CX본부 '숫자 규칙 한 장'을 보세요.`;

async function archiveOrderSummary(setBusy) {
  setBusy('주문 요약 만드는 중...');
  const [monthly, items] = await Promise.all([
    fetchAll(() => db.from('order_monthly').select('ym,brand,platform,product_name,category,lines,cancels').lte('ym', ORDER_SUMMARY_UNTIL).order('id')),
    fetchAll(() => db.from('order_items').select('brand,platform,source_key,order_date,status,claim_status,order_no,item_no,product_name,category').gte('order_date', toISODate(new Date(Number(ORDER_SUMMARY_UNTIL.slice(0, 4)), Number(ORDER_SUMMARY_UNTIL.slice(5)), 1))).order('id')),
  ]);
  const map = new Map();
  const bump = (ym, r, field, n = 1) => {
    const k = [ym, r.brand, r.platform, r.product_name].join('|');
    if (!map.has(k)) map.set(k, { '월': ym, '브랜드': r.brand, '판매처': r.platform || '', '상품명': r.product_name || '', '대분류': r.category || '', '주문(상품 수)': 0, '출고전 취소': 0 });
    map.get(k)[field] += n;
  };
  monthly.forEach(r => { bump(r.ym, r, '주문(상품 수)', r.lines || 0); bump(r.ym, r, '출고전 취소', r.cancels || 0); });
  const seenOrder = new Set(), seenCancel = new Set();
  items.forEach(r => {
    if (r.claim_status && /교환|회수/.test(r.claim_status)) return;
    const ym = String(r.order_date).slice(0, 7), cancelled = isCancelRow(r);
    if (!r.item_no) { bump(ym, r, '주문(상품 수)'); if (cancelled) bump(ym, r, '출고전 취소'); return; }
    const item = `${r.platform}|${r.order_no}|${r.item_no}`;
    if (cancelled && !seenCancel.has(item)) { seenCancel.add(item); bump(ym, r, '출고전 취소'); }
    if ((!cancelled || r.status !== '취소') && !/분실/.test(r.status || '') && !seenOrder.has(item)) { seenOrder.add(item); bump(ym, r, '주문(상품 수)'); }
  });
  return [...map.values()].sort((a, b) => a['월'].localeCompare(b['월']) || a['브랜드'].localeCompare(b['브랜드']) || a['판매처'].localeCompare(b['판매처']) || b['주문(상품 수)'] - a['주문(상품 수)']);
}

async function buildArchiveWorkbook(cases, productById, setBusy) {
  const wb = XLSX.utils.book_new();
  const counts = [];
  const cut = (v) => (v === null || v === undefined ? '' : String(v).length > 32000 ? String(v).slice(0, 32000) : v);
  const addSheet = (name, rows) => {
    const clean = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, cut(v)])));
    XLSX.utils.book_append_sheet(wb, clean.length ? XLSX.utils.json_to_sheet(clean) : XLSX.utils.aoa_to_sheet([['(비어 있음)']]), name);
    counts.push(`${name} ${rows.length}`);
  };
  const byDate = (a, b) => String(a).localeCompare(String(b));

  setBusy('VOC 정리 중...');
  addSheet('VOC', [...cases].sort((a, b) => byDate(a.received_date, b.received_date) || a.id - b.id).map(c => ({
    'VOC번호': c.id, '접수일': c.received_date, '브랜드': c.brand, '판매처': c.platform || '', '문의 채널': c.consult_method || '', '주문번호': c.order_no || '',
    '상품명': caseProductName(c, productById), '대분류': caseCategory(c, productById), '중분류': caseSubCategory(c, productById), '추가분류': caseLineType(c, productById),
    'VOC 구분': c.voc_type || '', '과실': isFault(c.voc_type) ? 'O' : '', '사유': c.reason_category || '', '상세 사유': c.reason_detail || '',
    '진행상황': c.status || '', '처리 구분': c.handling || '', '담당 부서': c.department || '', '후속 조치': c.action_required || '', '완료일': c.completed_at || '',
    '처리 기록': logNote(initialLog(c)), '처리자': c.handler || '', '사진 수': (c.photos || []).length, '사진 폴더': (c.photos || []).length ? `VOC사진/${vocPhotoFolder(c, productById)}` : '',
  })));

  setBusy('리뷰 받는 중...');
  const reviews = await fetchAll(() => db.from('review_items').select('brand,platform,product_name,option_text,rating,content,written_at,check_status,voc_case_id').order('id'));
  addSheet('리뷰', reviews.map(r => ({ '작성일': kstDate(r.written_at), '브랜드': r.brand, '판매처': r.platform || '', '상품명': r.product_name || '', '옵션': r.option_text || '',
    '별점': r.rating ?? '', '체크': r.check_status || '', '내용': r.content || '', 'VOC번호': r.voc_case_id || '' })).sort((a, b) => byDate(a['작성일'], b['작성일'])));

  setBusy('게시판 받는 중...');
  const boards = await fetchAll(() => db.from('board_items').select('brand,platform,product_name,option_text,title,content,written_at,inquiry_type').order('id'));
  addSheet('게시판', boards.filter(r => r.inquiry_type !== ANSWER_TYPE && !isStaffAnswer(r.content)).map(r => ({
    '작성일': kstDate(r.written_at), '브랜드': r.brand, '판매처': r.platform || '', '상품명': r.product_name || '', '옵션': r.option_text || '',
    '문의 유형': r.inquiry_type || '', '상품문의 세부': r.inquiry_type === '상품문의' ? productQSubtype(`${r.title || ''} ${r.content || ''}`) : '',
    '제목': r.title || '', '내용': r.content || '' })).sort((a, b) => byDate(a['작성일'], b['작성일'])));

  setBusy('CS 데일리 받는 중...');
  const daily = await fetchAll(() => db.from('cs_daily').select('*').order('report_date').order('id'));
  const labels = [...PLATFORM_FIELDS, ...BRAND_FIELDS].flatMap(s => s.fields.map(([k, l]) => [k, `${s.section.replace(/ \(.*\)$/, '')} · ${l}`]));
  addSheet('CS데일리', daily.map(r => {
    const [from, to] = dataRangeOf(r.report_date);
    const row = { '보고일': r.report_date, '데이터 날짜': from === to ? from : `${from}~${to}`, '브랜드': r.brand, '판매처': r.platform || '' };
    labels.forEach(([k, l]) => { row[l] = r[k] ?? ''; });
    return row;
  }));

  addSheet('주문요약', await archiveOrderSummary(setBusy));

  setBusy('반품·교환 받는 중...');
  const returns = await fetchAll(() => db.from('return_items').select('brand,platform,kind,order_no,product_name,option_text,qty,reason_raw,reason_detail,reason_group,is_fault,claim_status,order_date,claim_date').order('id'));
  addSheet('반품교환', returns.map(r => ({ '접수일': r.claim_date || '', '주문일': r.order_date || '', '브랜드': r.brand, '판매처': r.platform || '', '구분': r.kind || '', '주문번호': r.order_no || '',
    '상품명': r.product_name || '', '옵션': r.option_text || '', '수량': r.qty ?? '', '사유 묶음': r.reason_group || '', '과실': r.is_fault ? 'O' : '', '사유': r.reason_raw || '', '상세 사유': r.reason_detail || '', '처리 상태': r.claim_status || '' }))
    .sort((a, b) => byDate(a['접수일'] || a['주문일'], b['접수일'] || b['주문일'])));

  setBusy('회의록 받는 중...');
  const [meetings, items] = await Promise.all([
    fetchAll(() => db.from('meetings').select('*').order('meeting_date')),
    fetchAll(() => db.from('meeting_items').select('*').order('id')),
  ]);
  const meetingDate = new Map(meetings.map(m => [m.id, m.meeting_date]));
  addSheet('회의록', meetings.map(m => ({ '회의일': m.meeting_date, '제목': m.title || '', '종류': m.kind || '', '참석자': Array.isArray(m.attendees) ? m.attendees.join(', ') : (m.attendees || ''), '상태': m.status || '', '내용': m.body || '' })));
  addSheet('회의논의사항', items.map(i => ({ '처음 나온 회의': meetingDate.get(i.meeting_id) || '', '논의사항': i.title || '', '내용': i.detail || '', '담당': i.owner || '', '상태': i.status || '', '결과': i.result || '', '완료일': i.done_at || '' })));
  return { wb, counts };
}

// 저장소 파일을 4개씩 동시에 받아 zip 폴더에 넣음 (파일이 있을 때만 폴더를 만듦). 못 받은 파일은 목록으로 돌려줌
async function addStorageFiles(zip, folderName, bucket, items, setBusy, label) {
  const failed = [];
  if (!items.length) return failed;   // 받을 파일이 없으면 빈 폴더를 만들지 않음
  const folder = zip.folder(folderName);
  let done = 0;
  for (let i = 0; i < items.length; i += 4) {
    await Promise.all(items.slice(i, i + 4).map(async ({ path, name }) => {
      const { data, error } = await db.storage.from(bucket).download(path);
      if (error || !data) failed.push(path); else folder.file(name, data, { binary: true });
      done++;
    }));
    setBusy(`${label} ${done}/${items.length} 받는 중...`);
  }
  return failed;
}

async function downloadZip(zip, fileName, setBusy) {
  setBusy('zip 파일 만드는 중...');
  // 사진은 이미 압축된 파일이라 다시 압축하지 않음 (빠르고 메모리 덜 씀)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return blob.size;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)}MB`;

function BackupCard() {
  const { codes, loadCodes, productById, cases } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const last = lastBackupOf(codes);

  const markBackup = async () => {
    const item = (codes || []).find(c => c.group_key === 'backup_log');
    if (item) await db.from('code_items').update({ label: today() }).eq('id', item.id);
    else await db.from('code_items').insert({ group_key: 'backup_log', label: today(), sort_order: 1 });
    await loadCodes();
  };

  // 백업 zip 하나 = 보관용 엑셀(사람용) + 복구용 원본 엑셀 + VOC별 사진 폴더 + 매뉴얼 첨부 + 읽어주세요
  const runBackup = async () => {
    try {
      const { wb: raw, counts, data } = await buildBackupWorkbook(setBusy);
      const vocs = data.voc_cases || cases || [];
      const { wb: arch } = await buildArchiveWorkbook(vocs, productById, setBusy);
      setBusy('엑셀 파일 만드는 중...');
      const zip = new JSZip();
      zip.file('읽어주세요.txt', ARCHIVE_README.replace(/\n/g, '\r\n'));
      zip.file(`CX보관용자료_${today()}.xlsx`, XLSX.write(arch, { bookType: 'xlsx', type: 'array' }));
      zip.file(`복구용_원본_${today()}.xlsx`, XLSX.write(raw, { bookType: 'xlsx', type: 'array' }));
      const ext = (path) => (String(path).match(/\.([a-z0-9]{2,5})$/i) || [, 'jpg'])[1].toLowerCase();
      const photos = vocs.flatMap(c => (c.photos || []).map((path, i) => ({ path, name: `${vocPhotoFolder(c, productById)}/${i + 1}.${ext(path)}` })));
      const failedPhotos = await addStorageFiles(zip, 'VOC사진', PHOTO_BUCKET, photos, setBusy, 'VOC 사진');
      const files = (data.manuals || []).flatMap(m => (m.attachments || []).map((a, i) => ({ path: a.path, name: `${m.id}_${safeName(m.title, 30)}_${i + 1}_${safeName(a.name, 60)}` })));
      const failed = [...failedPhotos, ...await addStorageFiles(zip, '매뉴얼첨부', 'manual-files', files, setBusy, '매뉴얼 첨부')];
      if (failed.length) zip.file('받지_못한_파일.txt', failed.join('\r\n'));
      const size = await downloadZip(zip, `CX백업_${today()}.zip`, setBusy);
      await markBackup();
      toast(`✅ 백업 완료 (${mb(size)}) · 표 ${counts.length}개 · 사진 ${photos.length - failedPhotos.length}장${failed.length ? ` · 못 받은 파일 ${failed.length}개(zip 안 목록 참고)` : ''} · 회사 드라이브 비공개 폴더에 올려 주세요`);
    } catch (e) { toast('❌ 백업 실패: ' + (e.message || e), 'err'); } finally { setBusy(''); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">📦 백업 받기 <small>한 달에 한 번 · 마지막 백업 {last ? fmtDate(last) : '없음'}</small></div>
      {busy && <div className="hint" style={{ marginBottom: 10, color: 'var(--accent)', fontWeight: 600 }}>⏳ {busy} (창을 닫지 마세요)</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={runBackup} disabled={!!busy}>🗂 백업 받기 (zip)</button>
        <span className="hint">zip 하나에 <b>사람이 보는 엑셀</b>(한글 칸 · VOC·리뷰·게시판·CS 데일리·주문 요약·반품교환·회의록, 구글시트·AI에 바로) + <b>복구용 원본 엑셀</b> + <b>VOC별 사진 폴더</b>가 들어 있어요. 반기 VOC 리포트도 이 엑셀의 VOC 시트를 기간으로 걸러 쓰면 돼요. 사진이 많으면 몇 분 걸려요. <b>고객 이름이 들어 있어서 회사 드라이브 비공개 폴더에만</b> 보관하세요 (GitHub·메신저 X).</span>
      </div>
    </div>
  );
}

// 상품 마스터 (오클릭 카테고리 파일): 새 상품 추가 + 대분류(복종)·중분류(성별)가 바뀐 상품만 고침. 지우지는 않음
const PRODUCT_FILE_HEADERS = ['품명', '브랜드', '복종', '성별'];
function ProductMasterUpload() {
  const { products, loadProducts } = useApp();
  const toast = useToast();
  const ref = useRef(null);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState('');

  const pick = async (file) => {
    setBusy('파일 읽는 중...'); setPlan(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      let rows = null;
      for (const name of wb.SheetNames) {
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
        const h = grid.slice(0, 5).findIndex(r => PRODUCT_FILE_HEADERS.every(k => r.map(c => String(c).trim()).includes(k)));
        if (h < 0) continue;
        const head = grid[h].map(c => String(c).trim()), col = (k) => head.indexOf(k);
        rows = grid.slice(h + 1).map(r => ({ product_name: str(r[col('품명')]), brand: str(r[col('브랜드')]), category: str(r[col('복종')]), size_gender: str(r[col('성별')]), line_type: col('추가분류') >= 0 ? str(r[col('추가분류')]) : null }))
          .filter(r => r.product_name && r.brand);
        break;
      }
      if (!rows) { toast('❌ 품명·브랜드·복종·성별 칸이 있는 오클릭 카테고리 파일이 아니에요', 'err'); return; }
      const key = (p) => `${p.brand}|${String(p.product_name).trim()}`;
      const existing = new Map(products.map(p => [key(p), p]));
      const seen = new Set(), adds = [], changes = [];
      rows.forEach(r => {
        const k = key(r);
        if (seen.has(k)) return;
        seen.add(k);
        const e = existing.get(k);
        if (!e) adds.push(r);
        else if ((r.category && r.category !== e.category) || (r.size_gender && r.size_gender !== e.size_gender) || (r.line_type && r.line_type !== e.line_type)) {
          changes.push({ id: e.id, name: e.product_name, brand: e.brand, from: `${e.category || '-'} · ${e.size_gender || '-'} · ${e.line_type || '-'}`,
            category: r.category || e.category, size_gender: r.size_gender || e.size_gender, line_type: r.line_type || e.line_type || null });
        }
      });
      setPlan({ file: file.name, total: seen.size, adds, changes });
    } catch (e) { toast('❌ 파일을 읽지 못했어요: ' + e.message, 'err'); } finally { setBusy(''); }
  };

  const apply = async () => {
    setBusy('저장 중...');
    try {
      // products.id는 자동 번호가 아님(처음 넣을 때 번호를 직접 붙임) → 지금 가장 큰 번호 다음부터 붙여서 추가
      if (plan.adds.length) {
        const { data: top, error: e1 } = await db.from('products').select('id').order('id', { ascending: false }).limit(1);
        if (e1) throw e1;
        let next = Number((top && top[0] && top[0].id) || 0) + 1;
        const withIds = plan.adds.map(a => ({ id: next++, ...a }));
        for (let i = 0; i < withIds.length; i += 500) {
          setBusy(`새 상품 추가 중... ${Math.min(i + 500, withIds.length)}/${withIds.length}`);
          const { error } = await db.from('products').insert(withIds.slice(i, i + 500));
          if (error) throw error;
        }
      }
      // 바뀐 상품: 같은 분류로 바뀌는 것끼리 묶어서 한 번에 (처음 추가분류를 채울 때 수천 개라서)
      const groups = new Map();
      plan.changes.forEach(c => {
        const k = JSON.stringify([c.category, c.size_gender, c.line_type]);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(c.id);
      });
      let done = 0;
      for (const [k, ids] of groups) {
        const [category, size_gender, line_type] = JSON.parse(k);
        for (let i = 0; i < ids.length; i += 200) {
          const { error } = await db.from('products').update({ category, size_gender, line_type }).in('id', ids.slice(i, i + 200));
          if (error) throw error;
        }
        done += ids.length;
        setBusy(`분류 고치는 중... ${done}/${plan.changes.length}`);
      }
      await loadProducts();
      toast(`✅ 새 상품 ${plan.adds.length}개 추가 · 분류 바뀐 상품 ${plan.changes.length}개 고침`);
      setPlan(null);
    } catch (e) { toast('❌ 저장 실패: ' + (e.message || e), 'err'); } finally { setBusy(''); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">🏷️ 상품 마스터 올리기 <small>오클릭 카테고리 파일 · 지금 {products.length.toLocaleString()}개</small></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => ref.current.click()} disabled={!!busy}>📂 상품 파일 선택</button>
        <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { if (e.target.files[0]) pick(e.target.files[0]); e.target.value = ''; }} />
        <TemplateButton name="상품마스터" headers={['품번', '품명', '브랜드', '복종', '성별', '추가분류']} />
        <span className="hint">첫 줄에 품명 · 브랜드 · 복종(=대분류) · 성별(=중분류) 칸이 있는 파일. 새 상품만 추가하고, 이미 있는 상품은 분류가 바뀐 것만 고쳐요 (지우지는 않아요)</span>
      </div>
      {busy && <div className="empty">{busy}</div>}
      {plan && !busy && (
        <div style={{ marginTop: 12 }}>
          <div className="card" style={{ background: 'var(--accent-soft)', border: 'none', lineHeight: 1.8 }}>
            <b>{plan.file}</b> · 상품 {plan.total.toLocaleString()}개 확인<br />
            ➕ 새 상품 <b>{plan.adds.length.toLocaleString()}개</b> 추가 · ✏️ 대분류·중분류·추가분류 바뀐 상품 <b>{plan.changes.length.toLocaleString()}개</b> 고침 · 나머지는 이미 있어서 그대로
          </div>
          {plan.adds.length > 0 && <div className="hint" style={{ marginTop: 8 }}>새 상품 예: {plan.adds.slice(0, 8).map(a => `${a.product_name} (${a.category || '-'} · ${a.size_gender || '-'})`).join(' / ')}{plan.adds.length > 8 ? ' …' : ''}</div>}
          {plan.changes.length > 0 && <div className="hint" style={{ marginTop: 4 }}>분류 변경 예: {plan.changes.slice(0, 5).map(c => `${c.name}: ${c.from} → ${c.category} · ${c.size_gender} · ${c.line_type || '-'}`).join(' / ')}{plan.changes.length > 5 ? ' …' : ''}</div>}
          <div className="form-actions">
            <button className="btn" onClick={() => setPlan(null)}>취소</button>
            <button className="btn btn-primary" onClick={apply} disabled={!plan.adds.length && !plan.changes.length}>저장하기</button>
          </div>
        </div>
      )}
    </div>
  );
}

// 주문 자동 분류 확인용: 최근 6개월 대분류별 주문 라인 수
function OrderCategorySummary() {
  const [summary] = useSince('order_items', 'brand,platform,order_date,category,qty,is_set,status', monthsAgo(5), 'order_date');
  const months = summary ? [...new Set(summary.map(r => (r.order_date || '').slice(0, 7)).filter(Boolean))].sort() : [];
  const cats = [...MD_GROUPS.map(g => g[0]), null];
  const cancelled = (r) => /취소/.test(r.status || '');
  return (
    <>
      {summary && summary.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>최근 6개월 대분류별 주문 라인 수 <small>취소 제외 · 주문 자동 분류 확인용</small></div>
          <div className="table-wrap">
            <table className="table report-table">
              <thead><tr><th>대분류</th>{months.map(m => <th key={m} className="num">{Number(m.slice(5))}월</th>)}<th className="num">세트 비중</th></tr></thead>
              <tbody>
                {cats.map(c => {
                  const rs = summary.filter(r => r.category === c && !cancelled(r));
                  if (!rs.length) return null;
                  return (
                    <tr key={c || 'none'}>
                      <td>{c || <span className="muted">(분류 못 함)</span>}</td>
                      {months.map(m => <td key={m} className="num">{rs.filter(r => (r.order_date || '').startsWith(m)).length.toLocaleString()}</td>)}
                      <td className="num">{pct(rs.filter(r => r.is_set).length, rs.length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

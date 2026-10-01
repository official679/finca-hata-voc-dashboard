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
// 순서 중요: 무신사(클레임상태 칸 있음)를 먼저 확인해야 29CM로 잘못 알아보지 않음
// legacy = 판매처 주문 파일: 7월부터 주문은 오클릭(핀카)·사방넷(하타)만 → 지난 기간 요약 저장할 때만 쓸 수 있음 (두 번 세기 방지)

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
FILE_FORMATS.push(
  { kind: 'order', legacy: true, label: '무신사 주문', headers: ['주문일시', '주문번호', '주문일련번호', '주문상태', '상품명', '옵션', '수량'],
    map: (r) => ({ key: r['주문일련번호'], platform: '무신사',
      order_no: r['주문번호'], status: r['주문상태'], claim_status: r['클레임상태'], product_name: r['상품명'], option_text: r['옵션'], qty: num1(r['수량']), when: parseWhen(r['주문일시']) }) },
  // 하타 상반기 파일처럼 주문일련번호가 없는 무신사 파일
  { kind: 'order', legacy: true, label: '무신사 주문 (일련번호 없음)', headers: ['주문일시', '주문번호', '주문상태', '클레임상태', '상품번호', '상품명', '옵션', '수량'],
    map: (r) => ({ key: r['주문번호'] ? hashText(`${r['주문번호']}|${r['상품번호']}|${r['옵션']}`) : '', platform: '무신사',
      order_no: r['주문번호'], status: r['주문상태'], claim_status: r['클레임상태'], product_name: r['상품명'], option_text: r['옵션'], qty: num1(r['수량']), when: parseWhen(r['주문일시']) }) },
  // 옵션코드 칸은 없어도 됨 (하타 29CM 파일)
  { kind: 'order', legacy: true, label: '29CM 주문', headers: ['주문번호', '주문상태', '상품번호', '상품명', '옵션', '수량', '주문일시'],
    map: (r) => ({ key: r['주문번호'] ? hashText(`${r['주문번호']}|${r['상품번호']}|${r['옵션코드'] || ''}|${r['옵션']}`) : '', brand: normBrand(r['브랜드']), platform: '29CM',
      order_no: r['주문번호'], status: r['주문상태'], product_name: r['상품명'], option_text: r['옵션'], qty: num1(r['수량']), when: parseWhen(r['주문일시']) }) },
  { kind: 'order', legacy: true, label: '아임웹 주문', headers: ['주문번호', '주문상태', '주문섹션품목번호', '구매수량', '상품명', '주문일'],
    map: (r) => ({ key: r['주문섹션품목번호'], brand: normBrand(r['판매채널']), platform: '아임웹',
      order_no: r['주문번호'], status: r['주문상태'], product_name: r['상품명'], option_text: r['옵션명'], qty: num1(r['구매수량']), when: parseWhen(r['주문일']),
      cancel_reason: [r['취소사유'], r['취소상세사유']].filter(Boolean).join(' / '), return_reason: [r['반품사유'], r['반품 상세사유']].filter(Boolean).join(' / ') }) },
  // 하타 상반기 파일처럼 품목번호·주문상태 대신 섹션상태만 있는 아임웹 파일
  { kind: 'order', legacy: true, label: '아임웹 주문 (품목번호 없음)', headers: ['판매채널', '주문번호', '구매수량', '상품명', '주문일', '섹션상태'],
    map: (r) => ({ key: r['주문번호'] ? hashText(`${r['주문번호']}|${r['상품명']}|${r['옵션명']}`) : '', brand: normBrand(r['판매채널']), platform: '아임웹',
      order_no: r['주문번호'], status: r['섹션상태'], product_name: r['상품명'], option_text: r['옵션명'], qty: num1(r['구매수량']), when: parseWhen(r['주문일']),
      cancel_reason: [r['취소사유'], r['취소상세사유']].filter(Boolean).join(' / '), return_reason: [r['반품사유'], r['반품 상세사유']].filter(Boolean).join(' / ') }) },
  { kind: 'order', legacy: true, label: '카페24 주문', headers: ['주문번호', '품목별 주문번호', '주문상품명', '수량', '발주일'],
    map: (r) => ({ key: r['품목별 주문번호'], platform: '카페24',
      order_no: r['주문번호'], product_name: r['주문상품명'],
      option_text: String(r['주문상품명(옵션포함)'] || '').replace(String(r['주문상품명'] || ''), '').replace(/^\(|\)$/g, '').trim(),
      // 발주일이 비어 있으면(발주 전 취소 등) 주문번호 앞 날짜(20260101-…)로
      qty: num1(r['수량']), when: parseWhen(r['발주일']) || parseWhen(String(r['주문번호'] || '').replace(/^(\d{4})(\d{2})(\d{2})-.*$/, '$1-$2-$3')) }) },
);

// 데이터 업로드 화면에서 쓰는 주문 저장 설정 (고객 정보 칸은 저장하지 않음, 상품 마스터 연결 없음)
const ORDER_UPLOAD = {
  table: 'order_items',
  linkProducts: false,
  toRow: (r) => ({
    order_no: str(r.order_no), status: str(r.status), claim_status: str(r.claim_status),
    item_no: str(r.item_no), barcode: str(r.barcode),
    product_name: str(r.product_name), option_text: str(r.option_text), qty: r.qty,
    ordered_at: r.when ? r.when.iso : null, order_date: r.when ? r.when.key.slice(0, 10) : null,
    cancel_reason: str(r.cancel_reason), return_reason: str(r.return_reason),
    ...classifyItem(r.product_name, r.option_text),
  }),
};

// 지난 주문(상반기 등)은 한 줄씩이 아니라 월·브랜드·판매처·상품별 개수로 묶어서 저장 (order_monthly, 15 SQL)
function summarizeOrders(rows) {
  const map = new Map();
  rows.forEach(r => {
    if (!r.when || !r.brand) return;
    const ym = r.when.key.slice(0, 7);
    const name = str(r.product_name) || '(상품명 없음)';
    const k = [ym, r.brand, r.platform, name].join('|');
    if (!map.has(k)) map.set(k, { ym, brand: r.brand, platform: r.platform, product_name: name, ...classifyItem(r.product_name, r.option_text), lines: 0, qty: 0, cancels: 0, returns: 0, exchanges: 0 });
    const s = map.get(k);
    const st = `${r.status || ''} ${r.claim_status || ''}`;
    s.lines++; s.qty += r.qty || 1;
    if (/취소/.test(st)) s.cancels++;
    if (/반품/.test(st)) s.returns++;
    if (/교환/.test(st)) s.exchanges++;
  });
  return [...map.values()];
}

// 요약 저장 결과 확인: 월·브랜드별 합계
function OrderMonthlySummary() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    fetchAll(() => db.from('order_monthly').select('ym,brand,lines,cancels,returns,exchanges').order('id'))
      .then(setRows).catch(() => setRows([]));
  }, []);
  if (!rows || !rows.length) return null;
  const groups = countBy(rows, r => `${r.ym}|${r.brand}`).map(g => g.label).sort();
  const sum = (key, f) => rows.filter(r => `${r.ym}|${r.brand}` === key).reduce((a, r) => a + r[f], 0);
  return (
    <div className="card" style={{ marginTop: 16, padding: 0 }}>
      <div className="card-title" style={{ padding: '18px 20px 4px' }}>요약으로 저장한 지난 주문 <small>월·상품별로 묶어 저장 · 상·하반기 비교용</small></div>
      <div className="table-wrap">
        <table className="table report-table">
          <thead><tr><th>월</th><th>브랜드</th><th className="num">주문 품목</th><th className="num">취소</th><th className="num">반품</th><th className="num">교환</th><th className="num">상품 수</th></tr></thead>
          <tbody>
            {groups.map(g => {
              const [ym, b] = g.split('|');
              return (
                <tr key={g}>
                  <td>{ym}</td><td>{b}</td>
                  <td className="num">{sum(g, 'lines').toLocaleString()}</td>
                  <td className="num">{sum(g, 'cancels').toLocaleString()}</td>
                  <td className="num">{sum(g, 'returns').toLocaleString()}</td>
                  <td className="num">{sum(g, 'exchanges').toLocaleString()}</td>
                  <td className="num">{new Set(rows.filter(r => `${r.ym}|${r.brand}` === g).map(r => r.product_name)).size.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 업로드 기록: 최근 7일 동안 언제 무엇을 올렸는지 (저장된 시각 created_at 기준) · 양이 많아서 버튼을 눌렀을 때만 불러옴
const HISTORY_SOURCES = [
  { table: 'order_items', label: '주문', unit: '줄', dateCol: 'order_date' },
  { table: 'review_items', label: '리뷰', unit: '건', dateCol: 'written_at' },
  { table: 'board_items', label: '게시판', unit: '건', dateCol: 'written_at' },
  { table: 'return_items', label: '반품·교환', unit: '건', dateCol: 'order_date' },
];
function UploadHistory() {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    const since = `${toISODate(addDays(new Date(), -6))}T00:00:00+09:00`;
    const out = [];
    for (const s of HISTORY_SOURCES) {
      const data = await fetchAll(() => db.from(s.table).select(`created_at,brand,platform,${s.dateCol}`).gte('created_at', since).order('id')).catch(() => []);
      data.forEach(r => out.push({ src: s, day: toISODate(new Date(r.created_at)), brand: r.brand, platform: r.platform, dataDay: String(r[s.dateCol] || '').slice(0, 10) }));
    }
    setRows(out); setLoading(false);
  };
  const days = rows ? [...new Set(rows.map(r => r.day))].sort().reverse() : [];
  const cell = (day, s) => {
    const rs = rows.filter(r => r.day === day && r.src === s);
    if (!rs.length) return <span className="muted">-</span>;
    const groups = countBy(rs, r => `${r.brand} ${r.platform}`);
    const dd = rs.map(r => r.dataDay).filter(Boolean).sort();
    return (
      <div>
        <b>{rs.length.toLocaleString()}{s.unit}</b>
        <div className="hint" style={{ margin: 0 }}>{groups.map(g => `${g.label} ${g.count.toLocaleString()}`).join(' · ')}</div>
        {dd.length > 0 && <div className="hint" style={{ margin: 0 }}>데이터 {fmtDate(dd[0]).slice(3)}~{fmtDate(dd[dd.length - 1]).slice(3)}</div>}
      </div>
    );
  };
  return (
    <div className="card" style={{ maxWidth: 960, marginTop: 16, padding: rows ? 0 : 20 }}>
      <div className="card-title" style={rows ? { padding: '18px 20px 4px' } : null}>
        📋 업로드 기록 <small>최근 7일 · 올린 날짜별로 무엇이 몇 건 저장됐는지 (중복으로 건너뛴 건 제외)</small>
        {!rows && <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={load} disabled={loading}>{loading ? '불러오는 중...' : '기록 보기'}</button>}
      </div>
      {rows && (days.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>올린 날</th>{HISTORY_SOURCES.map(s => <th key={s.table}>{s.label}</th>)}</tr></thead>
            <tbody>{days.map(day => (
              <tr key={day}><td style={{ whiteSpace: 'nowrap' }}><b>{fmtDate(day)}</b> ({'일월화수목금토'[parseDate(day).getDay()]})</td>
                {HISTORY_SOURCES.map(s => <td key={s.table}>{cell(day, s)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty">최근 7일 동안 올린 데이터가 없어요</div>)}
    </div>
  );
}

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
      <UploadHistory key={'h' + version} />
      <ProductMasterUpload />
      <BackupCard />
      <OrderCategorySummary key={version} />
      <OrderMonthlySummary key={'m' + version} />
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

function BackupCard() {
  const { codes, loadCodes } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const last = lastBackupOf(codes);
  const run = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const counts = [];
      for (const [table, sheet] of BACKUP_TABLES) {
        setBusy(`${sheet} 받는 중...`);
        let rows = [];
        try { rows = await fetchAll(() => db.from(table).select('*').order('id')); } catch { continue; }   // 없는 표는 건너뜀
        // 엑셀 한 칸은 32,767자까지 · 목록·객체는 글자로
        const clean = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 32000) : String(v).length > 32000 ? String(v).slice(0, 32000) : v])));
        XLSX.utils.book_append_sheet(wb, clean.length ? XLSX.utils.json_to_sheet(clean) : XLSX.utils.aoa_to_sheet([['(비어 있음)']]), sheet);
        counts.push(`${sheet} ${rows.length}`);
      }
      setBusy('파일 만드는 중...');
      XLSX.writeFile(wb, `CX대시보드_백업_${today()}.xlsx`);
      const item = (codes || []).find(c => c.group_key === 'backup_log');
      if (item) await db.from('code_items').update({ label: today() }).eq('id', item.id);
      else await db.from('code_items').insert({ group_key: 'backup_log', label: today(), sort_order: 1 });
      await loadCodes();
      toast(`✅ 백업 파일을 받았어요 (${counts.length}개 표) · 회사 드라이브 비공개 폴더에 보관해 주세요`);
    } catch (e) { toast('❌ 백업 실패: ' + (e.message || e), 'err'); } finally { setBusy(''); }
  };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">📦 백업 받기 <small>한 달에 한 번 · 마지막 백업 {last ? fmtDate(last) : '없음'}</small></div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={run} disabled={!!busy}>{busy || '📦 전체 백업 받기 (엑셀)'}</button>
        <span className="hint">VOC·CS 데일리·리뷰·게시판·주문·예약배송·회의록·업무·매뉴얼·기준 목록을 엑셀 한 파일로 받아요. <b>고객 이름이 들어 있어서 회사 드라이브 비공개 폴더에만</b> 보관하세요 (GitHub·메신저 X). 사진은 포함되지 않아요.</span>
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

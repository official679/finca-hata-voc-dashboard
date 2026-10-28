// 해피톡 상담 업로드 · 해피톡 분석 (2026-10-27)
// 해피톡엔 상담 이력 엑셀이 없음 → Aside가 '어제 종료 상담'을 읽어 표로 만들고, 그 표를 붙여넣거나 CSV로 올림
// 저장하는 것 = 상담 시각·브랜드·주문번호·유형·상품·고객이 원한 것·우리 안내·개선 힌트 (고객 이름·연락처·주소는 저장 안 함)

const HT_TYPES = ['교환·반품', '불량·오배송', '취소·변경', '배송', '상품문의', '재입고', '기타'];
// Aside가 적은 유형(해피톡 대분류 '주문취소/변경' 등)을 우리 유형으로 맞춤
const HT_TYPE_RULES = [
  ['불량·오배송', /불량|하자|파손|오배송|누락/],
  ['교환·반품', /교환|반품|환불|회수/],
  ['취소·변경', /취소|변경/],
  ['재입고', /재입고|입고\s*문의/],
  ['배송', /배송|출고|송장/],
  ['상품문의', /상품|사이즈|색상|소재|세탁/],
];
const htType = (raw) => (HT_TYPE_RULES.find(([, re]) => re.test(raw || '')) || ['기타'])[0];
const htProduct = (v) => { const s = String(v ?? '').replace(/\(?\s*상품명\s*언급\s*없음\s*\)?/g, '').trim(); return s || null; };

FILE_FORMATS.push({ kind: 'happytalk', label: '해피톡 상담 (Aside 정리)', headers: ['상담일시', '고객이 원한 것'],
  template: ['상담일시', '브랜드', '주문번호', '유형', '상품', '고객이 원한 것', '우리 안내·처리 결과', '개선 힌트'],
  map: (r) => {
    const when = parseWhen(r['상담일시']);
    const content = String(r['고객이 원한 것'] ?? '').trim();
    return { key: when ? 'HT' + hashText(`${when.key}|${normBrand(r['브랜드'])}|${content.replace(/\s+/g, '').slice(0, 80)}`) : '',
      brand: normBrand(r['브랜드']), platform: '해피톡', when, order_no: str(r['주문번호']), ht_type: htType(r['유형']),
      product_name: htProduct(r['상품'] ?? r['상품명']), content, answer: str(r['우리 안내·처리 결과'] ?? r['우리 안내']), hint: str(r['개선 힌트']) };
  } });
KIND_LABEL.happytalk = '해피톡 상담';
KIND_GUIDE.happytalk = { icon: '🎧', title: '해피톡 상담', does: 'Aside가 읽은 상담 표 · 유형·상품·개선 힌트 · 고객 이름·연락처는 저장 안 함 · 해피톡 분석 화면에서 표를 바로 붙여넣어도 돼요' };

const HAPPYTALK_UPLOAD = {
  table: 'happytalk_items',
  toRow: (r) => ({ written_at: r.when ? r.when.iso : null, order_no: r.order_no, ht_type: r.ht_type, product_name: r.product_name,
    content: str(r.content), answer: r.answer, hint: r.hint }),
};

// CS 데일리 해피톡 칸 채우기 (2026-10-28 사용자 결정)
//   · 봇만 응대한 상담(우리 안내가 '[봇]'으로 시작)은 안 셈, 진행 중이라도 상담원이 받은 건 셈
//   · ONLY 접수 = 고객 메시지 없이 접수만 된 상담 · VOC 상담 = 불량·오배송 (교환/반품 칸에도 같이 들어감, 총 상담엔 안 더함)
const HT_DAILY_FIELD = { '배송': 'ht_delivery', '교환·반품': 'ht_return', '불량·오배송': 'ht_return', '취소·변경': 'ht_cancel', '상품문의': 'ht_product', '재입고': 'ht_product', '기타': 'ht_etc' };
const isHtBot = (r) => /^\s*\[봇\]/.test(r.answer || '');
const isHtOnly = (r) => !String(r.content || '').trim() || /메시지\s*(없이|없음)|접수만/.test(r.content);
function htDailyCounts(rows) {
  const v = { ht_only: 0, ht_delivery: 0, ht_return: 0, ht_cancel: 0, ht_product: 0, ht_etc: 0, ht_voc: 0 };
  const counted = rows.filter(r => !isHtBot(r));
  counted.forEach(r => {
    if (isHtOnly(r)) { v.ht_only++; return; }
    v[HT_DAILY_FIELD[r.ht_type] || 'ht_etc']++;
    if (r.ht_type === '불량·오배송') v.ht_voc++;
  });
  return { values: v, counted: counted.length, bots: rows.length - counted.length };
}

// Aside에 맡길 말 (기간 = 전날, 월요일 = 금~일 · 29CM 반품·Q&A와 같은 규칙)
function htAsideRange() {
  const now = new Date();
  const end = addDays(now, -1);
  const start = now.getDay() === 1 ? addDays(now, -3) : end;
  return [toISODate(start), toISODate(end)];
}
function htAsidePrompt() {
  const [s, e] = htAsideRange();
  const when = s === e ? s : `${s} ~ ${e}`;
  return `핀카·하타 CX팀장이에요. 해피톡(counselor.happytalk.io)에서 ${when} 종료된 상담을 읽어서 표로 정리해 주세요.
- 메뉴: 데이터 → 운영 내역 → 상담 내역(/manager/main/room_lists), 조회기간 ${when}. '채팅' 화면(진행 중 상담)은 열지 마세요.
- 종료된 상담만, 상담방을 하나씩 열어 읽기만 하세요. 메시지 보내기·종료·저장·다운로드 버튼은 누르지 마세요. 알림 권한 창은 '허용 안함'.
- 고객 이름·연락처·주소·이메일은 적지 마세요.
- 결과는 아래 칸 순서의 탭으로 나눈 표 하나로 (첫 줄 = 칸 이름):
상담일시	브랜드	주문번호	유형	상품	고객이 원한 것	우리 안내·처리 결과	개선 힌트
- 상담일시 = YYYY-MM-DD HH:mm, 브랜드 = 핀카/하타, 유형 = 배송·교환·반품·불량·오배송·취소·변경·상품문의·재입고·기타 중 하나
- 개선 힌트 = 상세페이지·검수·안내 문구 등 우리가 고치면 같은 문의가 줄어들 점 (없으면 비움)`;
}

// 붙여넣은 표(탭 또는 쉼표) → 업로드와 같은 줄 모양
function parseHtPaste(text) {
  const lines = String(text || '').replace(/^```\w*|```$/gm, '').split(/\r?\n/).filter(l => l.trim());
  const at = lines.findIndex(l => l.includes('상담일시'));
  if (at < 0) return [];
  const split = (l) => (l.includes('\t') ? l.split('\t') : l.split(','));
  const header = split(lines[at]).map(h => h.trim());
  const fmt = FILE_FORMATS.find(f => f.kind === 'happytalk');
  return lines.slice(at + 1).map(l => { const c = split(l); return fmt.map(Object.fromEntries(header.map((h, i) => [h, (c[i] ?? '').trim()]))); })
    .filter(r => r.key);
}

function HappytalkPage() {
  const { products, productById } = useApp();
  const toast = useToast();
  const [brand, setBrand] = useState('핀카');
  const [period, setPeriod] = useState('7d');
  const [from, to] = reviewPeriodStart(period);
  const [rows, setRows] = useSince('happytalk_items', 'id,brand,written_at,order_no,ht_type,product_name,product_id,content,answer,hint', period === 'all' ? null : `${from}T00:00:00+09:00`);
  const [type, setType] = useState('');
  const [product, setProduct] = useState('');
  const [onlyHint, setOnlyHint] = useState(false);
  const [q, setQ] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);

  const pasted = useMemo(() => parseHtPaste(paste), [paste]);
  const nameOf = (r) => { const full = (r.product_id && productById.get(r.product_id)?.product_name) || r.product_name; return full ? coreName(full) : ''; };

  const savePaste = async () => {
    setBusy(true);
    try {
      const match = productMatcher(products);
      const list = [...new Map(pasted.map(r => [r.key, r])).values()].map(r => ({ ...HAPPYTALK_UPLOAD.toRow(r), brand: r.brand || brand, platform: '해피톡', source_key: r.key, product_id: match(r.product_name) }));
      const { data, error } = await db.from('happytalk_items').upsert(list, { onConflict: 'platform,source_key', ignoreDuplicates: true }).select('id,brand,written_at,order_no,ht_type,product_name,product_id,content,answer,hint');
      if (error) throw error;
      setRows(prev => [...data, ...(prev || [])].sort((a, b) => String(b.written_at || '').localeCompare(String(a.written_at || ''))));
      toast(`✅ 새로 저장 ${data.length}건${list.length - data.length ? ` · 이미 있던 ${list.length - data.length}건은 건너뜀` : ''}`);
      setPaste(''); setPasteOpen(false);
    } catch (e) {
      toast('❌ 저장 실패: ' + (e.message || e), 'err');
    } finally { setBusy(false); }
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(htAsidePrompt()); toast('📋 Aside에 붙여넣을 요청문을 복사했어요'); } catch { toast('❌ 복사하지 못했어요', 'err'); }
  };
  const setHtType = async (id, t) => {
    const { error } = await db.from('happytalk_items').update({ ht_type: t }).eq('id', id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ht_type: t } : r));
    toast('✅ 유형을 바꿨어요');
  };

  const pasteCard = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">
        <span>🎧 상담 표 넣기 <small>① 요청문 복사 → Aside에 붙여넣기 → ② Aside가 만든 표를 아래에 붙여넣기 → ③ 저장</small></span>
        <span className="filters">
          <button className="btn btn-sm" onClick={copyPrompt}>📋 ① Aside 요청문 복사</button>
          {!pasteOpen && <button className="btn btn-sm btn-primary" onClick={() => setPasteOpen(true)}>＋ ② 표 붙여넣기</button>}
        </span>
      </div>
      {pasteOpen && <>
        <textarea className="input" rows={6} style={{ width: '100%', fontFamily: 'inherit' }} value={paste} onChange={e => setPaste(e.target.value)}
          placeholder={'Aside가 만든 표를 그대로 붙여넣으세요 (첫 줄: 상담일시 · 브랜드 · 주문번호 · 유형 · 상품 · 고객이 원한 것 · 우리 안내·처리 결과 · 개선 힌트)'} />
        <div className="form-actions" style={{ marginTop: 8 }}>
          <span className="muted" style={{ marginRight: 'auto' }}>{paste.trim() ? (pasted.length ? `${pasted.length}건 읽음 · 같은 상담을 다시 넣어도 중복 저장 안 돼요` : "첫 줄에 '상담일시'·'고객이 원한 것' 칸이 있어야 해요") : 'CSV 파일은 데이터 업로드에서 올려도 돼요'}</span>
          <button className="btn" onClick={() => { setPaste(''); setPasteOpen(false); }}>취소</button>
          <button className="btn btn-primary" disabled={!pasted.length || busy} onClick={savePaste}>{busy ? '저장 중...' : `③ ${pasted.length}건 저장`}</button>
        </div>
      </>}
    </div>
  );

  if (!rows) return <div className="loading-screen">해피톡 상담 불러오는 중...</div>;

  const scoped = rows.filter(r => r.brand === brand && r.written_at && toISODate(new Date(r.written_at)) <= to);
  const types = HT_TYPES.map(t => ({ label: t, count: scoped.filter(r => (r.ht_type || '기타') === t).length })).filter(t => t.count).sort((a, b) => b.count - a.count);
  const byProduct = [...scoped.reduce((m, r) => { const n = nameOf(r); if (n) m.set(n, (m.get(n) || 0) + 1); return m; }, new Map())].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const hints = scoped.filter(r => r.hint);
  const days = new Set(scoped.map(r => toISODate(new Date(r.written_at)))).size;
  const list = scoped.filter(r => (!type || (r.ht_type || '기타') === type) && (!product || nameOf(r) === product) && (!onlyHint || r.hint) &&
    matchQuery(q.trim().toLowerCase(), r.product_name, r.order_no, r.content, r.answer, r.hint));

  return (
    <>
      <PageHeader title="해피톡 분석" desc={`${from === '2000-01-01' ? '전체 기간' : `${fmtDate(from)} ~`} · 상담 시각 기준 · 종료된 상담만`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
        <Segmented options={REVIEW_LIST_PERIODS} value={period} onChange={setPeriod} />
      </PageHeader>

      {pasteCard}

      {!scoped.length ? <div className="card empty">이 기간에 넣은 {brand} 해피톡 상담이 없어요. 위 ①~③으로 넣어 주세요.</div> : <>
        <div className="grid grid-kpi">
          <Kpi label="상담" value={scoped.length.toLocaleString()} sub={`건 · ${days}일치`} />
          {types.slice(0, 2).map(t => <Kpi key={t.label} label={`${t.label}`} value={t.count.toLocaleString()} sub={`전체의 ${pct(t.count, scoped.length)}`} onClick={() => { setType(t.label); setProduct(''); }} />)}
          <Kpi label="💡 개선 힌트" value={hints.length.toLocaleString()} sub="건 · 누르면 힌트만" alert={hints.length > 0} onClick={() => { setOnlyHint(true); setType(''); setProduct(''); }} />
        </div>

        <div className="grid grid-2w">
          <div className="card">
            <div className="card-title">상담 유형 <small>누르면 해당 상담을 볼 수 있어요</small></div>
            <ThemeBars items={types} total={scoped.length} color="var(--accent)" onPick={t => { setType(t); setProduct(''); }} />
          </div>
          <div className="card">
            <div className="card-title">상담이 많은 상품 <small>상품을 말한 상담만 · 누르면 상담 보기</small></div>
            <ThemeBars items={byProduct.map(([label, count]) => ({ label, count }))} total={scoped.length} color="#7C9CF0" onPick={n => { setProduct(n); setType(''); }} />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">
            <span>상담 목록 <small>{list.length.toLocaleString()}건{product ? ` · ${product}` : ''} · 유형이 틀리면 바로 바꿀 수 있어요</small></span>
            <span className="filters">
              <Select value={type} onChange={setType} options={HT_TYPES} placeholder="유형 전체" />
              <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}><input type="checkbox" checked={onlyHint} onChange={e => setOnlyHint(e.target.checked)} /> 💡 개선 힌트 있는 것만</label>
              <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="상품·주문번호·내용 검색" />
              {(type || product || onlyHint || q) && <button className="btn-link" onClick={() => { setType(''); setProduct(''); setOnlyHint(false); setQ(''); }}>초기화</button>}
            </span>
          </div>
          <Paged items={list} resetKey={`${type}|${product}|${onlyHint}|${q}|${brand}|${period}`} empty="해당하는 상담이 없어요" render={r => (
            <div className="review-card" key={r.id}>
              <div className="review-head">
                <Select value={r.ht_type || '기타'} onChange={t => setHtType(r.id, t)} options={HT_TYPES} />
                <span className="muted">{fmtDate(toISODate(new Date(r.written_at)))} {new Date(r.written_at).toTimeString().slice(0, 5)}</span>
                {nameOf(r) && <span className="review-product" title={r.product_name || ''}>{nameOf(r)}</span>}
                {r.order_no && <span className="chip">주문 {r.order_no}</span>}
              </div>
              <div className="review-body"><b>고객 · </b>{r.content || <span className="muted">(내용 없음)</span>}</div>
              {r.answer && <div className="review-body" style={{ marginTop: 4 }}><b>안내 · </b>{r.answer}</div>}
              {r.hint && <div className="review-body" style={{ marginTop: 6, background: 'var(--warn-soft)', padding: '6px 10px', borderRadius: 6 }}>💡 {r.hint}</div>}
            </div>
          )} />
        </div>
      </>}
    </>
  );
}

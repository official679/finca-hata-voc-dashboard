// VOC 접수 폼 · VOC 목록

function usePhotoUrls(paths) {
  const [urls, setUrls] = useState({});
  const key = (paths || []).join('|');
  useEffect(() => {
    if (!paths || !paths.length) { setUrls({}); return; }
    let alive = true;
    db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (!alive || !data) return;
      setUrls(Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])));
    });
    return () => { alive = false; };
  }, [key]);
  return urls;
}

function Lightbox({ src, onClose }) {
  if (!src) return null;
  return <div className="lightbox" onClick={onClose}><img src={src} alt="" /></div>;
}

const MAX_PHOTOS = 5;

function PhotoPicker({ existing, onRemoveExisting, files, onAddFiles, onRemoveFile }) {
  const urls = usePhotoUrls(existing);
  const [zoom, setZoom] = useState(null);
  const inputRef = useRef(null);
  const total = existing.length + files.length;
  return (
    <div>
      <div className="photos">
        {existing.map(p => (
          <div className="photo" key={p}>
            {urls[p] && <img src={urls[p]} alt="" onClick={() => setZoom(urls[p])} />}
            <button type="button" className="remove" onClick={() => onRemoveExisting(p)}>×</button>
          </div>
        ))}
        {files.map((f, i) => (
          <div className="photo" key={f.preview}>
            <img src={f.preview} alt="" onClick={() => setZoom(f.preview)} />
            <button type="button" className="remove" onClick={() => onRemoveFile(i)}>×</button>
          </div>
        ))}
        {total < MAX_PHOTOS && (
          <div className="photo-add" onClick={() => inputRef.current.click()}>
            <span style={{ fontSize: 22 }}>＋</span>사진 추가
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={e => {
        const picked = [...e.target.files].slice(0, MAX_PHOTOS - total);
        onAddFiles(picked.map(file => Object.assign(file, { preview: URL.createObjectURL(file) })));
        e.target.value = '';
      }} />
      <div className="hint">최대 {MAX_PHOTOS}장 · 사진을 누르면 크게 볼 수 있어요</div>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

// 상품명 검색: 단어 일부만 넣어도 (띄어 써도) 목록에서 찾아 고르기
function ProductSearchInput({ value, onChange, products }) {
  const [open, setOpen] = useState(false);
  const hits = value.trim() ? products.filter(p => matchQuery(value, p.product_name)).slice(0, 12) : [];
  const exact = products.some(p => p.product_name === value.trim());
  return (
    <div style={{ position: 'relative' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="상품명 단어 일부를 입력하고 목록에서 선택 (예: 블랙 차렵)" autoComplete="off" />
      {open && !exact && hits.length > 0 && (
        <div className="product-suggest">
          {hits.map(p => (
            <button type="button" key={p.id} onMouseDown={e => e.preventDefault()} onClick={() => { onChange(p.product_name); setOpen(false); }}>
              {p.product_name}<span className="muted"> · {p.category || '-'} · {p.size_gender || '-'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyCase = () => ({
  received_date: today(), brand: '핀카', handler: '', platform: '', order_no: '', orderer: '', receiver: '',
  product_name: '', voc_type: '', consult_method: '', status: '접수', reason_category: '', reason_detail: '',
  note: '', action_required: '', photos: [], handling: '', department: '', completed_at: '', category: '', sub_category: '',
});

function VocForm({ initial, onSaved, onCancel }) {
  const { products, productById, codeOptions, setCases } = useApp();
  const toast = useToast();
  const [form, setForm] = useState(() => {
    if (!initial) return emptyCase();
    const f = { ...emptyCase(), ...initial };
    Object.keys(f).forEach(k => { if (f[k] === null) f[k] = ''; });
    f.product_name = caseProductName(initial, productById);
    if (f.product_name === '(상품 미입력)') f.product_name = '';
    return f;
  });
  const [keptPhotos, setKeptPhotos] = useState(initial?.photos || []);
  const [newFiles, setNewFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }));
  const onInput = (k) => (e) => set(k)(e.target.value);

  const brandProducts = useMemo(
    () => products.filter(p => p.brand === PRODUCT_BRAND[form.brand]),
    [products, form.brand]);
  const matchedProduct = brandProducts.find(p => p.product_name === form.product_name.trim());

  const allCategories = useMemo(() => categoryOptions(products).filter(c => c !== NO_CATEGORY), [products]);
  const subCategories = useMemo(() => [...new Set(products.filter(p => p.category === form.category).map(p => p.size_gender).filter(v => v && v !== 'null'))].sort(), [products, form.category]);

  const withCurrent = (opts, current) => (current && !opts.includes(current) ? [...opts, current] : opts);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const uploaded = [];
      for (const file of newFiles) {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${form.received_date.slice(0, 7)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await db.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type });
        if (error) throw new Error('사진 업로드 실패: ' + error.message);
        uploaded.push(path);
      }

      const row = {
        received_date: form.received_date,
        brand: form.brand,
        handler: form.handler || null,
        platform: form.platform || null,
        order_no: form.order_no.trim() || null,
        orderer: form.orderer.trim() || null,
        receiver: form.receiver.trim() || null,
        product_id: matchedProduct ? matchedProduct.id : null,
        product_name: form.product_name.trim() || null,
        voc_type: form.voc_type || null,
        consult_method: form.consult_method || null,
        status: form.status || '접수',
        reason_category: form.reason_category || null,
        reason_detail: form.reason_detail.trim() || null,
        note: form.note.trim() || null,
        action_required: form.action_required || null,
        handling: form.handling || null,
        department: form.department || null,
        completed_at: form.completed_at || null,
        // 상품 마스터에 없는 상품만 직접 고른 분류 저장 (마스터와 연결되면 마스터 분류 사용)
        ...(matchedProduct || !(form.category || initial?.category) ? {} : { category: form.category || null, sub_category: form.category ? (form.sub_category || null) : null }),
        // 후속 조치가 바뀌면 다시 '진행 중'으로
        action_done: !!(initial && initial.action_done && (initial.action_required || '') === form.action_required),
        photos: [...keptPhotos, ...uploaded],
      };

      const query = initial
        ? db.from('voc_cases').update(row).eq('id', initial.id)
        : db.from('voc_cases').insert(row);
      const { data, error } = await query.select().single();
      if (error) throw error;

      const removed = (initial?.photos || []).filter(p => !keptPhotos.includes(p));
      if (removed.length) await db.storage.from(PHOTO_BUCKET).remove(removed);

      setCases(prev => initial ? prev.map(c => c.id === data.id ? data : c) : [data, ...prev]);
      toast(initial ? '✅ VOC 수정 완료' : '✅ VOC 접수 완료');
      newFiles.forEach(f => URL.revokeObjectURL(f.preview));
      if (onSaved) onSaved(data);
      if (!initial) { setForm(prev => ({ ...emptyCase(), received_date: prev.received_date, brand: prev.brand, handler: prev.handler })); setKeptPhotos([]); setNewFiles([]); }
    } catch (err) {
      toast('❌ 저장 실패: ' + (err.message || err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('이 VOC를 삭제할까요? 되돌릴 수 없어요.')) return;
    const { error } = await db.from('voc_cases').delete().eq('id', initial.id);
    if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
    if (initial.photos?.length) await db.storage.from(PHOTO_BUCKET).remove(initial.photos);
    setCases(prev => prev.filter(c => c.id !== initial.id));
    toast('✅ 삭제 완료');
    if (onSaved) onSaved(null);
  };

  const field = (label, control, required) => (
    <div className="field"><label>{label}{required && <span className="req"> *</span>}</label>{control}</div>
  );

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-section">기본 정보</div>
      <div className="form-grid">
        {field('접수일', <input type="date" value={form.received_date} onChange={onInput('received_date')} required />, true)}
        {field('브랜드', <Select className="" value={form.brand} onChange={set('brand')} options={withCurrent(codeOptions('brand'), form.brand)} />, true)}
        {field('처리자', <Select className="" value={form.handler} onChange={set('handler')} options={withCurrent(codeOptions('handler'), form.handler)} placeholder="선택" />)}
        {field('구매 플랫폼', <Select className="" value={form.platform} onChange={set('platform')} options={withCurrent(codeOptions('platform'), form.platform)} placeholder="선택" />)}
        {field('주문번호', <input value={form.order_no} onChange={onInput('order_no')} />)}
        {field('주문자', <input value={form.orderer} onChange={onInput('orderer')} />)}
      </div>

      <div className="form-section">상품 · 내용</div>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>상품명</label>
          <ProductSearchInput value={form.product_name} onChange={set('product_name')} products={brandProducts} />
          <div className="hint">
            {form.product_name.trim() === '' ? `${form.brand} 상품 ${brandProducts.length.toLocaleString()}개에서 검색돼요`
              : matchedProduct ? `✓ 상품 마스터와 연결됨 (대분류 ${matchedProduct.category || '-'} · 중분류 ${matchedProduct.size_gender || '-'})`
              : '상품 마스터에 없는 이름이에요. 아래에서 대분류·중분류를 직접 골라 주세요.'}
          </div>
        </div>
        {!matchedProduct && form.product_name.trim() !== '' && <>
          {field('대분류 (직접 선택)', <Select className="" value={form.category} onChange={v => setForm(prev => ({ ...prev, category: v, sub_category: '' }))} options={withCurrent(allCategories, form.category)} placeholder="선택" />)}
          {field('중분류 (직접 선택)', <Select className="" value={form.sub_category} onChange={set('sub_category')} options={withCurrent(subCategories, form.sub_category)} placeholder={form.category ? '선택' : '대분류 먼저'} />)}
        </>}
        {field('VOC 구분', <Select className="" value={form.voc_type} onChange={set('voc_type')} options={withCurrent(codeOptions('voc_type'), form.voc_type)} placeholder="선택" />)}
        {field('문의 채널', <Select className="" value={form.consult_method} onChange={set('consult_method')} options={withCurrent(codeOptions('consult_method'), form.consult_method)} placeholder="선택" />)}
        {field('처리 구분', <Select className="" value={form.handling} onChange={set('handling')} options={withCurrent(codeOptions('handling'), form.handling)} placeholder="선택" />)}
        {field('사유 카테고리', <Select className="" value={form.reason_category} onChange={set('reason_category')} options={withCurrent(codeOptions('reason'), form.reason_category)} placeholder="선택" />)}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>상세 사유 (고객 문의 내용)</label>
          <textarea value={form.reason_detail} onChange={onInput('reason_detail')} rows="3" />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>사진</label>
          <PhotoPicker
            existing={keptPhotos}
            onRemoveExisting={p => setKeptPhotos(prev => prev.filter(x => x !== p))}
            files={newFiles}
            onAddFiles={fs => setNewFiles(prev => [...prev, ...fs])}
            onRemoveFile={i => setNewFiles(prev => prev.filter((_, j) => j !== i))}
          />
        </div>
      </div>

      <div className="form-section">처리</div>
      <div className="form-grid">
        {field('진행상황', <Select className="" value={form.status} onChange={set('status')} options={withCurrent(codeOptions('status'), form.status)} />)}
        {SHOW_FOLLOWUP && field('담당 부서', <Select className="" value={form.department} onChange={set('department')} options={withCurrent(codeOptions('department'), form.department)} placeholder="선택" />)}
        {field('완료일', <input type="date" value={form.completed_at} onChange={onInput('completed_at')} />)}
        {SHOW_FOLLOWUP && field('후속 조치', <Select className="" value={form.action_required} onChange={set('action_required')} options={withCurrent(codeOptions('action'), form.action_required)} placeholder="없음" />)}
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>처리 메모</label>
          <textarea value={form.note} onChange={onInput('note')} rows="2" placeholder="회수 송장, 처리 결과 등" />
        </div>
      </div>

      <div className="form-actions">
        {initial && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={handleDelete}>삭제</button>}
        {onCancel && <button type="button" className="btn" onClick={onCancel}>취소</button>}
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : initial ? '수정 저장' : 'VOC 접수'}</button>
      </div>
    </form>
  );
}

function VocEntryPage() {
  return (
    <>
      <PageHeader title="VOC 접수" desc="브랜드 과실 교환·반품, 강성 고객, 재입고 문의 등 개별 VOC를 접수해요." />
      <div className="card" style={{ maxWidth: 960 }}><VocForm /></div>
    </>
  );
}

function VocEditPanel({ vocCase, onClose }) {
  if (!vocCase) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>VOC 상세 · 수정</h2>
          <button className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="card"><VocForm initial={vocCase} onSaved={onClose} onCancel={onClose} /></div>
      </div>
    </div>
  );
}

function downloadCsv(filename, header, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function VocListPage({ initialFilter }) {
  const { cases, codeOptions, productById, products } = useApp();
  const [f, setF] = useState({ from: '', to: '', brand: '', platform: '', voc_type: '', status: '', reason: '', action: '', category: '', q: '', ...initialFilter });
  const [editing, setEditing] = useState(null);
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));

  const rows = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return cases.filter(c =>
      (!f.from || c.received_date >= f.from) && (!f.to || c.received_date <= f.to) &&
      (!f.brand || c.brand === f.brand) && (!f.platform || c.platform === f.platform) &&
      (!f.voc_type || c.voc_type === f.voc_type) && (!f.status || c.status === f.status) &&
      (!f.reason || c.reason_category === f.reason) && (!f.category || caseCategory(c, productById) === f.category) &&
      (!f.action || (f.action === '__any' ? !!c.action_required : c.action_required === f.action)) &&
      matchQuery(q, caseProductName(c, productById), c.order_no, c.orderer, c.receiver, c.reason_detail, c.note, c.voc_type, c.reason_category));
  }, [cases, f, productById]);

  const exportCsv = () => downloadCsv(`VOC목록_${today()}.csv`,
    ['접수일', '브랜드', '처리자', '플랫폼', '주문번호', '주문자', '수령자', '상품명', '대분류', '중분류', 'VOC구분', '처리구분', '문의채널', '진행상황', '담당부서', '완료일', '사유카테고리', '상세사유', '처리메모', '후속조치', '사진수'],
    rows.map(c => [c.received_date, c.brand, c.handler, c.platform, c.order_no, c.orderer, c.receiver, caseProductName(c, productById),
      caseCategory(c, productById), caseSubCategory(c, productById), c.voc_type, c.handling, c.consult_method, c.status, c.department, c.completed_at, c.reason_category, c.reason_detail, c.note, c.action_required, (c.photos || []).length]));

  const hasFilter = Object.values(f).some(Boolean);

  // (미분류) VOC: 상품명으로 상품 마스터를 다시 찾아 연결 (리뷰에서 온 것 등)
  const toast = useToast();
  const { setCases } = useApp();
  const [relinking, setRelinking] = useState(false);
  const unlinked = cases.filter(c => !c.product_id && !c.category && c.product_name);
  const relink = async () => {
    setRelinking(true);
    let n = 0;
    const updated = new Map();
    for (const c of unlinked) {
      const pid = findReviewProductId(c.product_name, c.brand, products);
      if (!pid) continue;
      const { error } = await db.from('voc_cases').update({ product_id: pid }).eq('id', c.id);
      if (!error) { n++; updated.set(c.id, pid); }
    }
    setCases(prev => prev.map(c => (updated.has(c.id) ? { ...c, product_id: updated.get(c.id) } : c)));
    setRelinking(false);
    toast(n ? `✅ ${n}건 상품을 찾아 대분류·중분류를 채웠어요${unlinked.length - n ? ` · 못 찾은 ${unlinked.length - n}건은 VOC를 눌러 직접 골라주세요` : ''}` : '상품 마스터에서 찾은 상품이 없어요. VOC를 눌러 대분류·중분류를 직접 골라주세요');
  };

  // 15건씩 페이지로 (필터를 바꾸면 1페이지로)
  const [PAGE_SIZE, setPageSize] = usePageSize('voc');
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [f]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const cur = Math.min(page, pages);

  return (
    <>
      <PageHeader title="VOC 목록" desc={`전체 ${cases.length.toLocaleString()}건 중 ${rows.length.toLocaleString()}건`}>
        {unlinked.length > 0 && <button className="btn" onClick={relink} disabled={relinking} title="상품명으로 상품 마스터를 다시 찾아서 대분류·중분류를 채워요">{relinking ? '찾는 중...' : `🔗 미분류 ${unlinked.length}건 상품 다시 찾기`}</button>}
        <button className="btn" onClick={exportCsv}>⬇ 엑셀(CSV) 다운로드</button>
      </PageHeader>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters">
          <input className="input" type="date" value={f.from} onChange={e => set('from')(e.target.value)} title="시작일" />
          <span className="muted">~</span>
          <input className="input" type="date" value={f.to} onChange={e => set('to')(e.target.value)} title="종료일" />
          <Select value={f.brand} onChange={set('brand')} options={codeOptions('brand', true)} placeholder="브랜드 전체" />
          <Select value={f.platform} onChange={set('platform')} options={codeOptions('platform', true)} placeholder="플랫폼 전체" />
          <Select value={f.voc_type} onChange={set('voc_type')} options={codeOptions('voc_type', true)} placeholder="VOC 구분 전체" />
          <Select value={f.category} onChange={set('category')} options={categoryOptions(products)} placeholder="대분류 전체" />
          <Select value={f.reason} onChange={set('reason')} options={codeOptions('reason', true)} placeholder="사유 전체" />
          <Select value={f.status} onChange={set('status')} options={codeOptions('status', true)} placeholder="진행상황 전체" />
          {SHOW_FOLLOWUP && <Select value={f.action} onChange={set('action')} options={[{ value: '__any', label: '후속 조치 지정된 건' }, ...codeOptions('action', true)]} placeholder="후속 조치 전체" />}
          <input className="input" style={{ minWidth: 200 }} value={f.q} onChange={e => set('q')(e.target.value)} placeholder="상품명·주문번호·고객명·내용 검색" />
          {hasFilter && <button className="btn-link" onClick={() => setF({ from: '', to: '', brand: '', platform: '', voc_type: '', status: '', reason: '', action: '', category: '', q: '' })}>필터 초기화</button>}
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table table-wide">
            <thead>
              <tr><th>접수일</th><th>브랜드</th><th>플랫폼</th><th>주문번호</th><th>고객명</th><th>대분류</th><th>중분류</th><th>상품명</th><th>사유</th><th>진행</th>{SHOW_FOLLOWUP && <th>후속 조치</th>}<th>처리자</th><th>📷</th></tr>
            </thead>
            <tbody>
              {rows.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE).map(c => (
                <tr key={c.id} className="clickable" onClick={() => setEditing(c)}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.received_date)}</td>
                  <td>{c.brand}</td>
                  <td>{c.platform || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.order_no || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.orderer || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{caseCategory(c, productById)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{caseSubCategory(c, productById)}</td>
                  <td className="ellipsis" title={caseProductName(c, productById)}>{c.consult_method === '리뷰' && <span className="chip chip-amber" style={{ marginRight: 6 }} title={c.note || '리뷰에서 등록'}>⭐ 리뷰</span>}{caseProductName(c, productById)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.reason_category || '-'}</td>
                  <td><StatusChip status={c.status} /></td>
                  {SHOW_FOLLOWUP && <td>{c.action_required ? <span className="chip chip-red">{c.action_required}</span> : <span className="muted">-</span>}</td>}
                  <td style={{ whiteSpace: 'nowrap' }}>{c.handler || '-'}</td>
                  <td className="num">{(c.photos || []).length || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">조건에 맞는 VOC가 없어요</div>}
        </div>
        <div style={{ padding: '0 16px 16px' }}><Pager page={cur} pages={pages} onChange={setPage} size={PAGE_SIZE} onSize={setPageSize} /></div>
      </div>
      <VocEditPanel vocCase={editing} onClose={() => setEditing(null)} />
    </>
  );
}

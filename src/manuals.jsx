// 업무 매뉴얼 게시판

const MANUAL_BUCKET = 'manual-files';

// 본문의 URL을 누를 수 있는 링크로
function Linkify({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
  return parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a>
    : <React.Fragment key={i}>{p}</React.Fragment>);
}

function useSignedUrls(bucket, paths) {
  const [urls, setUrls] = useState({});
  const key = paths.join('|');
  useEffect(() => {
    if (!paths.length) { setUrls({}); return; }
    let alive = true;
    db.storage.from(bucket).createSignedUrls(paths, 3600).then(({ data }) => {
      if (alive && data) setUrls(Object.fromEntries(data.filter(d => d.signedUrl).map(d => [d.path, d.signedUrl])));
    });
    return () => { alive = false; };
  }, [bucket, key]);
  return urls;
}

const isImage = (a) => (a.type || '').startsWith('image/');

function Attachments({ items }) {
  const urls = useSignedUrls(MANUAL_BUCKET, items.map(a => a.path));
  const [zoom, setZoom] = useState(null);
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="photos">
        {items.filter(isImage).map(a => (
          <div className="photo" key={a.path} style={{ width: 140, height: 100 }}>
            {urls[a.path] && <img src={urls[a.path]} alt={a.name} onClick={() => setZoom(urls[a.path])} />}
          </div>
        ))}
      </div>
      {items.filter(a => !isImage(a)).map(a => (
        <div key={a.path} style={{ marginTop: 6 }}>
          📎 {urls[a.path] ? <a href={urls[a.path]} target="_blank" rel="noopener noreferrer" download={a.name}>{a.name}</a> : a.name}
        </div>
      ))}
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function ManualEditor({ initial, categories, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ category: '', title: '', body: '', pinned: false, ...initial });
  const [kept, setKept] = useState(initial?.attachments || []);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    if (!form.title.trim()) { toast('❌ 제목을 입력해주세요', 'err'); return; }
    setSaving(true);
    try {
      const added = [];
      for (const f of files) {
        // 저장소 경로는 영문만 가능해서 원래 파일 이름은 따로 보관
        const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await db.storage.from(MANUAL_BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (error) throw new Error(`'${f.name}' 업로드 실패: ${error.message}`);
        added.push({ path, name: f.name, type: f.type });
      }
      const { data: s } = await db.auth.getSession();
      const row = {
        category: form.category.trim() || null, title: form.title.trim(), body: form.body, pinned: form.pinned,
        attachments: [...kept, ...added], updated_at: new Date().toISOString(),
        ...(initial?.id ? {} : { author: s.session?.user.email }),
      };
      const { error } = initial?.id
        ? await db.from('manuals').update(row).eq('id', initial.id)
        : await db.from('manuals').insert(row);
      if (error) throw error;
      const removed = (initial?.attachments || []).filter(a => !kept.some(k => k.path === a.path)).map(a => a.path);
      if (removed.length) await db.storage.from(MANUAL_BUCKET).remove(removed);
      toast('✅ 저장했어요');
      onSaved();
    } catch (e) {
      toast('❌ ' + (e.message || e), 'err');
    } finally { setSaving(false); }
  };

  return (
    <div className="overlay" {...overlayClose(onClose)}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head">
          <h2>{initial?.id ? '매뉴얼 수정' : '새 매뉴얼'}</h2>
          <button className="btn btn-sm" onClick={onClose}>닫기</button>
        </div>
        <div className="card">
          <div className="form-grid">
            <div className="field">
              <label>분류</label>
              <input list="manual-categories" value={form.category || ''} onChange={set('category')} placeholder="예: 게시판 응대, 교환/반품, 시스템 사용법" />
              <datalist id="manual-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!form.pinned} onChange={set('pinned')} style={{ width: 'auto' }} /> 📌 맨 위에 고정
              </label>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>제목 <span className="req">*</span></label>
              <input value={form.title} onChange={set('title')} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>내용</label>
              <textarea rows="14" value={form.body || ''} onChange={set('body')} placeholder={'순서, 주의할 점, 참고 링크 등을 적어주세요.\n**중요한 글자**는 별표 두 개로 감싸면 굵게(형광펜) 보여요.\n## 로 시작하면 소제목, - 로 시작하면 목록, > 로 시작하면 노란 주의 상자.\n링크(https://...)는 자동으로 누를 수 있게 바뀌어요.'} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>첨부 (이미지·파일)</label>
              {kept.map(a => (
                <div key={a.path} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  📎 {a.name} <button className="btn-link" onClick={() => setKept(kept.filter(k => k.path !== a.path))}>삭제</button>
                </div>
              ))}
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  🆕 {f.name} <button className="btn-link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>빼기</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={() => inputRef.current.click()}>＋ 파일 추가</button>
              <input ref={inputRef} type="file" multiple hidden onChange={e => { setFiles([...files, ...e.target.files]); e.target.value = ''; }} />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '저장 중...' : '저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManualsPage() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data, error } = await db.from('manuals').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false });
    if (error) { toast('❌ ' + error.message, 'err'); setItems([]); } else setItems(data);
  };
  useEffect(() => { load(); }, []);

  const remove = async (m) => {
    if (!confirm(`'${m.title}'을(를) 삭제할까요?`)) return;
    const { error } = await db.from('manuals').delete().eq('id', m.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    if (m.attachments?.length) await db.storage.from(MANUAL_BUCKET).remove(m.attachments.map(a => a.path));
    toast('삭제했어요');
    load();
  };

  if (!items) return <div className="loading-screen">불러오는 중...</div>;
  const categories = [...new Set(items.map(m => m.category).filter(Boolean))].sort();
  const query = q.trim().toLowerCase();
  const list = items.filter(m => (!category || m.category === category) && matchQuery(query, m.title, m.body, m.category));

  return (
    <>
      <PageHeader title="업무 매뉴얼" desc="CS 업무 순서, 시스템 사용법, 자주 쓰는 답변 등을 모아 두는 곳이에요.">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="제목·내용 검색" />
        <button className="btn btn-primary" onClick={() => setEditing({})}>＋ 새 매뉴얼</button>
      </PageHeader>

      {categories.length > 0 && (
        <div className="filters" style={{ marginBottom: 14 }}>
          <button className={`chip${!category ? ' chip-blue' : ''}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => setCategory('')}>전체 {items.length}</button>
          {categories.map(c => (
            <button key={c} className={`chip${category === c ? ' chip-blue' : ''}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => setCategory(c)}>
              {c} {items.filter(m => m.category === c).length}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card empty">{items.length ? '검색 결과가 없어요' : '아직 매뉴얼이 없어요. 오른쪽 위 "새 매뉴얼"로 첫 글을 써보세요.'}</div>
      ) : list.map(m => {
        const open = openId === m.id;
        return (
          <div className="card manual-card" key={m.id}>
            <div className="manual-head" onClick={() => setOpenId(open ? null : m.id)}>
              <span>{m.pinned && '📌 '}{m.category && <span className="chip chip-blue" style={{ marginRight: 8 }}>{m.category}</span>}<b>{m.title}</b></span>
              <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {m.attachments?.length ? `📎${m.attachments.length} · ` : ''}{fmtDate(m.updated_at.slice(0, 10))} {open ? '▲' : '▼'}
              </span>
            </div>
            {open && (
              <>
                {/* 본문은 마크다운: **굵게**, ## 제목, - 목록, 주소는 자동 링크 (예전 글은 줄바꿈 그대로 보임) */}
                <div className="manual-body manual-md"><MarkdownView text={m.body} /></div>
                <Attachments items={m.attachments || []} />
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>{m.author ? `작성 ${m.author}` : ''}</span>
                  <button className="btn btn-sm" onClick={() => setEditing(m)}>수정</button>
                  <button className="btn btn-sm btn-danger" onClick={() => remove(m)}>삭제</button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {editing && <ManualEditor initial={editing} categories={categories} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

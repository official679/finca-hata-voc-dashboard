// CX 미팅 로그: 회의록 게시판 + 논의사항 (완료될 때까지 다음 회의에 자동으로 따라감)

const MEETING_KINDS = ['CX 회의', 'PJ 회의'];

// 회의 내용은 마크다운 (- 목록, ### 제목, **굵게**, 표). 노션에서 가져온 표(HTML)도 그대로 보임
function MarkdownView({ text }) {
  const html = useMemo(() => {
    const src = String(text || '').replace(/<empty-block\s*\/>/g, '').replace(/\\([~\-*_>#|])/g, '$1');
    try { return DOMPurify.sanitize(marked.parse(src, { breaks: true })); } catch { return ''; }
  }, [text]);
  if (!String(text || '').trim()) return <div className="muted">내용이 없어요</div>;
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------- 주간 CX 리포트 초안 (CS 데일리 숫자로) ----------
// 회의일 기준 지난주 (데이터 월~일 = 보고일 화~월) vs 그 전주
function meetingWeeks(meetingDate) {
  const t = addDays(parseDate(meetingDate), -6);
  while (t.getDay() !== 2) t.setDate(t.getDate() - 1);
  const mk = (s) => ({ from: toISODate(s), to: toISODate(addDays(s, 6)), label: `${fmtMD(addDays(s, -1))}~${fmtMD(addDays(s, 5))}` });
  return { cur: mk(t), prev: mk(addDays(t, -7)) };
}

function weeklyReportDraft(daily, meetingDate) {
  const { cur, prev } = meetingWeeks(meetingDate);
  const sum = (brand, w) => sumRows(daily.filter(r => r.brand === brand && r.report_date >= w.from && r.report_date <= w.to));
  const S = { 핀카: [sum('핀카', prev), sum('핀카', cur)], 하타: [sum('하타', prev), sum('하타', cur)] };
  const n = (v) => v.toLocaleString();
  const rate = (a, b) => (b ? a / b * 100 : null);
  const count = (f) => (b) => { const [p, c] = S[b].map(f); const d = c - p; return [`${n(p)}건 → ${n(c)}건`, `**${d >= 0 ? '+' : ''}${n(d)}건${p ? ` (${d >= 0 ? '+' : ''}${(d / p * 100).toFixed(1)}%)` : ''}**`]; };
  const ratio = (fa, fb) => (b) => { const [p, c] = S[b].map(s => rate(fa(s), fb(s))); const f = (v) => (v === null ? '-' : `${v.toFixed(1)}%`); return [`${f(p)} → ${f(c)}`, p === null || c === null ? '-' : `**${c - p >= 0 ? '+' : ''}${(c - p).toFixed(1)}%p**`]; };
  const phone = (b) => { const [p, c] = S[b]; if (!(p.call_in + p.call_out + c.call_in + c.call_out)) return ['-', '-']; return [`인입 ${p.call_in}건 → ${c.call_in}건<br>발신 ${p.call_out}건 → ${c.call_out}건`, `인입 ${c.call_in - p.call_in >= 0 ? '+' : ''}${c.call_in - p.call_in}건<br>발신 ${c.call_out - p.call_out >= 0 ? '+' : ''}${c.call_out - p.call_out}건`]; };
  const rows = [
    ['총 주문', count(s => s.orders)],
    ['출고전 취소율', ratio(s => s.cancels, s => s.orders)],
    ['반품·교환율', ratio(returnsExchanges, s => s.orders)],
    ['고객 문의 인입 (게시판+해피톡+전화)', count(s => s.board_total + s.ht_total + s.call_in)],
    ['전화 상담', phone],
    ['작성 리뷰', count(s => s.reviews_total)],
    ['부정 리뷰', count(s => s.reviews_negative)],
  ];
  const table = ['| 항목 | 핀카 전주 → 금주 | 핀카 증감 | 하타 전주 → 금주 | 하타 증감 |', '| --- | --- | --- | --- | --- |',
    ...rows.map(([label, f]) => `| ${label} | ${[...f('핀카'), ...f('하타')].join(' | ')} |`)].join('\n');
  return `### 1. 주간 CX 리포트\n- **분석 기간: ${cur.label}**\n- **전주 대비 (${prev.label} → ${cur.label})**\n\n${table}\n\n- **주간 요약**\n  - \n\n### 2. 리뷰 / VOC\n- 핀카: \n- 하타: \n\n### 3. 논의사항\n- 아래 '논의사항'에 하나씩 추가하면 완료될 때까지 다음 회의에 자동으로 따라가요\n`;
}

// ---------- 데이터 ----------
function useMeetings() {
  const [state, setState] = useState({ meetings: null, items: null });
  const load = useCallback(async () => {
    const [meetings, items] = await Promise.all([
      fetchAll(() => db.from('meetings').select('id,meeting_date,title,kind,attendees,status,notion_url,created_at').order('id')),
      fetchAll(() => db.from('meeting_items').select('*').order('id')),
    ]);
    setState({ meetings: meetings.sort((a, b) => (b.meeting_date || '').localeCompare(a.meeting_date || '') || b.id - a.id), items });
  }, []);
  useEffect(() => { load().catch(e => setState(s => ({ ...s, error: e.message || String(e) }))); }, [load]);
  return [state, load];
}

// 이 회의에서 볼 논의사항: 이 회의에서 나온 것 + 이전 회의에서 나와 이 회의 날짜까지 안 끝난 것
function itemsForMeeting(meeting, meetings, items) {
  const dateOf = new Map(meetings.map(m => [m.id, m.meeting_date]));
  const own = items.filter(i => i.meeting_id === meeting.id);
  const carried = items.filter(i => {
    if (i.meeting_id === meeting.id) return false;
    const origin = dateOf.get(i.meeting_id) || '';
    return origin < meeting.meeting_date && (i.status !== '완료' || (i.done_at || '') >= meeting.meeting_date);
  });
  return { own, carried, originDate: (i) => dateOf.get(i.meeting_id) };
}

// ---------- 화면 ----------
function MeetingsPage() {
  const [{ meetings, items, error }, reload] = useMeetings();
  const [view, setView] = useState(null);   // { id } 보기 · { edit: meeting|{} } 쓰기
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>미팅 로그를 불러오지 못했어요: {error}<div className="hint">DB 설정 SQL(09_meetings_schema.sql)을 실행했는지 확인해 주세요.</div></div>;
  if (!meetings) return <div className="loading-screen">미팅 로그 불러오는 중...</div>;

  if (view && view.edit) return <MeetingForm meeting={view.edit} onDone={async (id) => { await reload(); setView(id ? { id } : null); }} />;
  if (view && view.id) {
    const m = meetings.find(x => x.id === view.id);
    if (m) return <MeetingDetail meeting={m} meetings={meetings} items={items} reload={reload} onBack={() => setView(null)} onEdit={(full) => setView({ edit: full })} />;
  }

  const openItems = items.filter(i => i.status !== '완료');
  const rows = meetings.filter(m => (!kind || m.kind === kind) && (!q.trim() || m.title.toLowerCase().includes(q.trim().toLowerCase())));
  const SIZE = 15, pages = Math.max(1, Math.ceil(rows.length / SIZE)), cur = Math.min(page, pages);
  const counts = (m) => { const own = items.filter(i => i.meeting_id === m.id); return own.length ? `${own.filter(i => i.status === '완료').length}/${own.length}` : ''; };
  const dateOf = new Map(meetings.map(m => [m.id, m]));

  return (
    <>
      <PageHeader title="CX 미팅 로그" desc={`회의록 ${meetings.length}건 · 논의사항은 완료될 때까지 다음 회의에 자동으로 따라가요`}>
        <button className="btn btn-primary" onClick={() => setView({ edit: {} })}>+ 새 회의록</button>
      </PageHeader>

      {openItems.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">⏳ 진행 중인 논의사항 <small>{openItems.length}건 · 체크하면 완료</small></div>
          {openItems.map(i => (
            <MeetingItemRow key={i.id} item={i} reload={reload} origin={dateOf.get(i.meeting_id)} onOpenOrigin={() => setView({ id: i.meeting_id })} />
          ))}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Select value={kind} onChange={v => { setKind(v); setPage(1); }} options={MEETING_KINDS} placeholder="회의 종류 전체" />
          <input className="input" style={{ minWidth: 220 }} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="회의 제목 검색" />
        </div>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>날짜</th><th>회의 제목</th><th>종류</th><th>참석자</th><th>논의사항 완료</th><th>상태</th></tr></thead>
            <tbody>
              {rows.slice((cur - 1) * SIZE, cur * SIZE).map(m => (
                <tr key={m.id} className="clickable" onClick={() => setView({ id: m.id })}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.meeting_date)}</td>
                  <td><b>{m.title}</b></td>
                  <td><span className={`chip ${m.kind === 'PJ 회의' ? 'chip-amber' : 'chip-blue'}`}>{m.kind}</span></td>
                  <td className="ellipsis" style={{ maxWidth: 220 }}>{m.attendees || '-'}</td>
                  <td>{counts(m)}</td>
                  <td>{m.status === '완료' ? <span className="chip chip-green">완료</span> : <span className="chip chip-red">진행중</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">회의록이 없어요. '+ 새 회의록'으로 써보세요.</div>}
        </div>
        <div style={{ padding: '0 16px 16px' }}><Pager page={cur} pages={pages} onChange={setPage} /></div>
      </div>
    </>
  );
}

function MeetingItemRow({ item, reload, origin, onOpenOrigin, carried }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: item.title, detail: item.detail || '', owner: item.owner || '' });
  const done = item.status === '완료';
  const toggle = async () => {
    const { error } = await db.from('meeting_items').update(done ? { status: '진행중', done_at: null } : { status: '완료', done_at: today() }).eq('id', item.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    reload();
  };
  const save = async () => {
    if (!f.title.trim()) return;
    const { error } = await db.from('meeting_items').update({ title: f.title.trim(), detail: str(f.detail), owner: str(f.owner) }).eq('id', item.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setEditing(false); reload();
  };
  const remove = async () => {
    if (!confirm(`논의사항 "${item.title}"을(를) 삭제할까요?`)) return;
    const { error } = await db.from('meeting_items').delete().eq('id', item.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    reload();
  };
  if (editing) return (
    <div className="meeting-item">
      <div style={{ flex: 1, display: 'grid', gap: 6 }}>
        <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="논의사항" />
        <textarea className="input" rows="3" value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} placeholder="진행 내용 · 결정 사항 (회의마다 이어서 적어요)" />
        <input className="input" style={{ maxWidth: 200 }} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="담당자" />
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm btn-primary" onClick={save}>저장</button>
          <button className="btn btn-sm" onClick={() => setEditing(false)}>취소</button>
          <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto' }} onClick={remove}>삭제</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className={`meeting-item${done ? ' done' : ''}`}>
      <input type="checkbox" checked={done} onChange={toggle} title={done ? '다시 진행중으로' : '완료로 체크'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="meeting-item-title">{item.title}
          {item.owner && <span className="chip" style={{ marginLeft: 6 }}>{item.owner}</span>}
          {carried && <span className="chip chip-amber" style={{ marginLeft: 6 }}>이전 회의에서 넘어옴</span>}
          {done && item.done_at && <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{fmtDate(item.done_at)} 완료</span>}
        </div>
        {item.detail && <div className="meeting-item-detail">{item.detail}</div>}
        {origin && <button className="btn-link" style={{ fontSize: 12 }} onClick={onOpenOrigin}>{fmtDate(origin.meeting_date)} {origin.title}</button>}
      </div>
      <button className="btn btn-sm" onClick={() => setEditing(true)}>수정</button>
    </div>
  );
}

function MeetingDetail({ meeting, meetings, items, reload, onBack, onEdit }) {
  const toast = useToast();
  const [full, setFull] = useState(null);
  const [newItem, setNewItem] = useState('');
  useEffect(() => {
    db.from('meetings').select('*').eq('id', meeting.id).single().then(({ data }) => setFull(data || meeting));
  }, [meeting.id]);
  const { own, carried } = itemsForMeeting(meeting, meetings, items);
  const dateOf = new Map(meetings.map(m => [m.id, m]));
  const addItem = async () => {
    if (!newItem.trim()) return;
    const { error } = await db.from('meeting_items').insert({ meeting_id: meeting.id, title: newItem.trim(), sort: own.length });
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    setNewItem(''); reload();
  };
  const idx = meetings.findIndex(m => m.id === meeting.id);
  return (
    <>
      <div style={{ marginBottom: 12 }}><button className="btn-link" onClick={onBack}>← 목록으로</button></div>
      <PageHeader title={meeting.title} desc={`${fmtDate(meeting.meeting_date)} · ${meeting.kind}${meeting.attendees ? ` · ${meeting.attendees}` : ''}`}>
        {meeting.status === '완료' ? <span className="chip chip-green">완료</span> : <span className="chip chip-red">진행중</span>}
        {full && <button className="btn" onClick={() => onEdit(full)}>✏️ 수정</button>}
      </PageHeader>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', alignItems: 'start' }}>
        <div className="card">{full ? <MarkdownView text={full.body} /> : <div className="empty">불러오는 중...</div>}
          {full && full.notion_url && <div className="hint" style={{ marginTop: 16 }}>노션에서 가져온 회의록 · <a href={full.notion_url} target="_blank" rel="noopener">노션 원본</a></div>}
        </div>
        <div className="card">
          <div className="card-title">논의사항 <small>체크하면 완료 · 안 끝나면 다음 회의로</small></div>
          {carried.length > 0 && <>
            <div className="form-section" style={{ marginTop: 0 }}>이전 회의에서 넘어온 것 {carried.length}</div>
            {carried.map(i => <MeetingItemRow key={i.id} item={i} reload={reload} carried origin={dateOf.get(i.meeting_id)} onOpenOrigin={() => {}} />)}
          </>}
          <div className="form-section" style={carried.length ? null : { marginTop: 0 }}>이번 회의 {own.length}</div>
          {own.map(i => <MeetingItemRow key={i.id} item={i} reload={reload} />)}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input className="input" style={{ flex: 1 }} value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addItem()} placeholder="논의사항 추가 (예: 전기패드 CS 운영 준비)" />
            <button className="btn btn-primary" onClick={addItem}>추가</button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        {idx < meetings.length - 1 ? <span className="muted">이전: {meetings[idx + 1].title}</span> : <span />}
        {idx > 0 ? <span className="muted">다음: {meetings[idx - 1].title}</span> : <span />}
      </div>
    </>
  );
}

function MeetingForm({ meeting, onDone }) {
  const toast = useToast();
  const daily = useDaily();
  const [f, setF] = useState(() => ({ meeting_date: today(), title: '', kind: 'CX 회의', attendees: '', status: '진행중', body: '', ...Object.fromEntries(Object.entries(meeting).map(([k, v]) => [k, v ?? ''])) }));
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));
  const isNew = !meeting.id;

  // 새 회의록: 날짜로 제목 제안 (예: 9월 5주차 VOC 회의)
  useEffect(() => {
    if (!isNew || f.title) return;
    const w = weekOf(toISODate(addDays(parseDate(f.meeting_date), 1)));
    if (w) set('title')(`${w.label} VOC 회의`);
  }, []);

  const insertReport = () => {
    if (!daily) { toast('CS 데일리 불러오는 중이에요. 잠시 후 다시 눌러주세요'); return; }
    setF(prev => ({ ...prev, body: weeklyReportDraft(daily, prev.meeting_date) + (prev.body ? '\n' + prev.body : '') }));
    toast('📊 주간 CX 리포트를 넣었어요 · 요약은 직접 적어주세요');
  };

  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) { toast('❌ 회의 제목을 넣어주세요', 'err'); return; }
    setSaving(true);
    const row = { meeting_date: f.meeting_date, title: f.title.trim(), kind: f.kind, attendees: str(f.attendees), status: f.status, body: f.body };
    const { data, error } = isNew ? await db.from('meetings').insert(row).select('id').single() : await db.from('meetings').update(row).eq('id', meeting.id).select('id').single();
    setSaving(false);
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    toast('✅ 회의록을 저장했어요');
    onDone(data.id);
  };
  const remove = async () => {
    if (!confirm('이 회의록을 삭제할까요? 이 회의에서 나온 논의사항도 같이 지워져요.')) return;
    const { error } = await db.from('meetings').delete().eq('id', meeting.id);
    if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
    toast('✅ 삭제했어요'); onDone(null);
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}><button className="btn-link" onClick={() => onDone(meeting.id || null)}>← 돌아가기</button></div>
      <PageHeader title={isNew ? '새 회의록' : '회의록 수정'} />
      <form className="card" onSubmit={save}>
        <div className="form-grid">
          <div className="field"><label>날짜</label><input type="date" value={f.meeting_date} onChange={e => set('meeting_date')(e.target.value)} required /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>회의 제목</label><input value={f.title} onChange={e => set('title')(e.target.value)} /></div>
          <div className="field"><label>회의 종류</label><Select className="" value={f.kind} onChange={set('kind')} options={MEETING_KINDS} /></div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label>참석자</label><input value={f.attendees} onChange={e => set('attendees')(e.target.value)} placeholder="예: 대표님, 진아, 슬기" /></div>
          <div className="field"><label>상태</label><Select className="" value={f.status} onChange={set('status')} options={['진행중', '완료']} /></div>
        </div>
        <div className="form-section" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          회의 내용
          <button type="button" className="btn btn-sm" onClick={insertReport}>📊 주간 CX 리포트 넣기</button>
          <Segmented options={[{ key: 'edit', label: '쓰기' }, { key: 'preview', label: '미리보기' }]} value={preview ? 'preview' : 'edit'} onChange={k => setPreview(k === 'preview')} />
        </div>
        {preview ? <div className="card" style={{ background: '#FAFBFC' }}><MarkdownView text={f.body} /></div>
          : <textarea className="input" style={{ width: '100%', minHeight: 420, fontFamily: 'inherit', lineHeight: 1.6 }} value={f.body} onChange={e => set('body')(e.target.value)}
            placeholder={'### 1. 주간 CX 리포트\n- 내용\n  - 들여쓰기는 스페이스 2칸\n\n**굵게** 는 별표 두 개로 감싸요\n\n위 [📊 주간 CX 리포트 넣기]를 누르면 CS 데일리 숫자로 표가 채워져요'} />}
        <div className="hint">- 로 시작하면 목록, ### 로 시작하면 제목, **글자** 는 굵게. 논의사항은 저장한 뒤 오른쪽 '논의사항'에 하나씩 추가하면 완료될 때까지 다음 회의에 따라가요.</div>
        <div className="form-actions">
          {!isNew && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>삭제</button>}
          <button type="button" className="btn" onClick={() => onDone(meeting.id || null)}>취소</button>
          <button className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      </form>
    </>
  );
}

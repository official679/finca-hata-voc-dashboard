// 업무 보드: 직원끼리 할 일 요청·진행 체크 (할 일 → 진행중 → 완료) + 댓글
// 로그인은 공용 계정이라 '나'는 이 PC에서 고른 이름(기억해 둠)

const TASK_STATUSES = ['할 일', '진행중', '완료'];
const TASK_COL = { '할 일': '#6B7280', '진행중': '#2563C9', '완료': '#2F9E6B' };
const TASK_ICON = { '할 일': '📝', '진행중': '⏳', '완료': '✅' };

function loadMe() { try { return localStorage.getItem('taskMe') || ''; } catch { return ''; } }
function saveMe(v) { try { localStorage.setItem('taskMe', v); } catch {} }

// 마감 상태: 지남 / 오늘 / 곧(2일 안)
function dueInfo(t) {
  if (!t.due_date || t.status === '완료') return null;
  const days = Math.round((parseDate(t.due_date) - parseDate(today())) / 86400000);
  if (days < 0) return { cls: 'chip-red', text: `마감 ${-days}일 지남` };
  if (days === 0) return { cls: 'chip-red', text: '오늘 마감' };
  if (days <= 2) return { cls: 'chip-amber', text: `D-${days}` };
  return { cls: '', text: `~${fmtDate(t.due_date).slice(3)}` };
}

function useTasks() {
  const [state, setState] = useState({ tasks: null, comments: null });
  const load = useCallback(async () => {
    const since = toISODate(addDays(new Date(), -30));
    const [open, done, comments] = await Promise.all([
      fetchAll(() => db.from('tasks').select('*').neq('status', '완료').order('id')),
      fetchAll(() => db.from('tasks').select('*').eq('status', '완료').gte('done_at', since).order('id')),
      fetchAll(() => db.from('task_comments').select('id,task_id,author,body,created_at').order('id')),
    ]);
    setState({ tasks: [...open, ...done], comments });
  }, []);
  useEffect(() => { load().catch(e => setState(s => ({ ...s, error: e.message || String(e) }))); }, [load]);
  return [state, load];
}

// 메인 요약용: 안 끝난 업무 · 마감 임박(2일 안)
function useTaskSummary() {
  const [s, setS] = useState(null);
  useEffect(() => {
    db.from('tasks').select('id,assignee,due_date,status').neq('status', '완료').then(({ data, error }) => {
      if (error || !data) { setS({ error: true }); return; }
      const soon = toISODate(addDays(new Date(), 2));
      setS({ open: data.length, due: data.filter(t => t.due_date && t.due_date <= soon).length, mine: loadMe() ? data.filter(t => t.assignee === loadMe()).length : null });
    });
  }, []);
  return s;
}

function TasksPage() {
  const { codeOptions } = useApp();
  const toast = useToast();
  const [{ tasks, comments, error }, reload] = useTasks();
  const [me, setMe] = useState(loadMe);
  const [who, setWho] = useState('');          // 담당자 필터 ('' 전체, '__me' 나)
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const people = codeOptions('handler');

  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>업무 보드를 불러오지 못했어요: {error}<div className="hint">DB 설정 SQL(13_tasks_schema.sql)을 실행했는지 확인해 주세요.</div></div>;
  if (!tasks) return <div className="loading-screen">업무 보드 불러오는 중...</div>;

  const target = who === '__me' ? me : who;
  const shown = tasks.filter(t => !target || t.assignee === target);
  const count = (id) => comments.filter(c => c.task_id === id).length;
  const move = async (t, status) => {
    const { error } = await db.from('tasks').update({ status, done_at: status === '완료' ? today() : null }).eq('id', t.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    reload();
  };
  const sortCol = (list) => [...list].sort((a, b) => (a.priority === '급함' ? 0 : 1) - (b.priority === '급함' ? 0 : 1) || String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || b.id - a.id);
  const current = tasks.find(t => t.id === openId);

  return (
    <>
      <PageHeader title="업무 보드" desc="직원끼리 할 일을 요청하고 진행 상황을 체크해요 · 완료는 최근 30일만 보여요">
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>나:
          <Select value={me} onChange={v => { setMe(v); saveMe(v); }} options={people} placeholder="이름 선택" />
        </label>
        <Segmented options={[{ key: '', label: '전체' }, ...(me ? [{ key: '__me', label: '내 업무' }] : []), ...people.filter(p => p !== me).map(p => ({ key: p, label: p }))]} value={who} onChange={setWho} />
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ 새 업무</button>
      </PageHeader>

      <div className="board">
        {TASK_STATUSES.map(s => {
          const list = sortCol(shown.filter(t => t.status === s));
          return (
            <div className="board-col" key={s} style={{ '--col': TASK_COL[s] }}>
              <div className="board-col-title">
                <span className="board-col-name">{TASK_ICON[s]} {s}</span>
                <span className="board-col-count">{list.length}</span>
              </div>
              {list.map(t => {
                const due = dueInfo(t), i = TASK_STATUSES.indexOf(s), n = count(t.id);
                const urgent = t.priority === '급함' && s !== '완료';
                const preview = String(t.body || '').split('\n').map(x => x.trim()).find(Boolean);
                return (
                  <div key={t.id} className={`board-card clickable${urgent ? ' urgent' : ''}${s === '완료' ? ' done' : ''}`} onClick={() => setOpenId(t.id)}>
                    {(urgent || due) && (
                      <div className="board-card-tags">
                        {urgent && <span className="chip chip-red">🔥 급함</span>}
                        {due && <span className={`chip ${due.cls}`}>📅 {due.text}</span>}
                      </div>
                    )}
                    <div className="board-card-title">{s === '완료' && '✓ '}{t.title}</div>
                    {preview && s !== '완료' && <div className="board-card-body">{preview}</div>}
                    <div className="board-card-people">
                      <span className="board-person" title="담당자"><span className="board-avatar">{(t.assignee || '?').slice(-2)}</span>{t.assignee || '담당자 없음'}</span>
                      {t.requester && t.requester !== t.assignee && <span className="muted">← {t.requester} 요청</span>}
                      {n > 0 && <span className="muted" style={{ marginLeft: 'auto' }}>💬 {n}</span>}
                    </div>
                    <div className="board-card-foot" onClick={e => e.stopPropagation()}>
                      <span className="muted">{s === '완료' && t.done_at ? `${fmtDate(t.done_at)} 완료` : ''}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        {i > 0 && <button className="btn btn-sm" title={`${TASK_STATUSES[i - 1]}(으)로 되돌리기`} onClick={() => move(t, TASK_STATUSES[i - 1])}>↩ {TASK_STATUSES[i - 1]}</button>}
                        {i < 2 && <button className="btn btn-sm btn-primary" onClick={() => move(t, TASK_STATUSES[i + 1])}>{i === 0 ? '▶ 시작' : '✓ 완료'}</button>}
                      </span>
                    </div>
                  </div>
                );
              })}
              {!list.length && <div className="board-empty">{s === '할 일' ? '할 일이 없어요 🙌' : s === '진행중' ? '진행 중인 업무가 없어요' : '최근 30일 완료가 없어요'}</div>}
            </div>
          );
        })}
      </div>

      {(creating || current) && <TaskPanel task={creating ? null : current} me={me} people={people} comments={current ? comments.filter(c => c.task_id === current.id) : []}
        onClose={() => { setCreating(false); setOpenId(null); }} reload={reload} onCreated={(id) => { setCreating(false); setOpenId(id); }} />}
    </>
  );
}

function TaskPanel({ task, me, people, comments, onClose, reload, onCreated }) {
  const toast = useToast();
  const [f, setF] = useState(() => ({ title: '', body: '', requester: me || '', assignee: '', due_date: '', priority: '보통', status: '할 일', ...Object.fromEntries(Object.entries(task || {}).map(([k, v]) => [k, v ?? ''])) }));
  const [comment, setComment] = useState('');
  const [author, setAuthor] = useState(me || '');
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF(prev => ({ ...prev, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!f.title.trim()) { toast('❌ 제목을 넣어주세요', 'err'); return; }
    setSaving(true);
    const row = { title: f.title.trim(), body: str(f.body), requester: str(f.requester), assignee: str(f.assignee), due_date: f.due_date || null, priority: f.priority, status: f.status, done_at: f.status === '완료' ? (task?.done_at || today()) : null };
    const { data, error } = task ? await db.from('tasks').update(row).eq('id', task.id).select('id').single() : await db.from('tasks').insert(row).select('id').single();
    setSaving(false);
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    toast(task ? '✅ 저장했어요' : '✅ 업무를 올렸어요');
    await reload();
    if (task) onClose(); else onCreated(data.id);
  };
  const remove = async () => {
    if (!confirm('이 업무를 삭제할까요? 댓글도 같이 지워져요.')) return;
    const { error } = await db.from('tasks').delete().eq('id', task.id);
    if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
    toast('✅ 삭제했어요'); await reload(); onClose();
  };
  const addComment = async () => {
    if (!comment.trim()) return;
    const { error } = await db.from('task_comments').insert({ task_id: task.id, author: author || null, body: comment.trim() });
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    if (author) saveMe(author);
    setComment(''); reload();
  };
  const delComment = async (c) => {
    if (!confirm('이 댓글을 삭제할까요?')) return;
    await db.from('task_comments').delete().eq('id', c.id); reload();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()}>
        <div className="panel-head"><h2>{task ? '업무' : '새 업무'}</h2><button className="btn btn-sm" onClick={onClose}>닫기</button></div>
        <form className="card" onSubmit={save}>
          <div className="field"><label>제목<span className="req"> *</span></label><input value={f.title} onChange={e => set('title')(e.target.value)} placeholder="예: 전기패드 CS 응대 매뉴얼 초안 작성" autoFocus={!task} /></div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field"><label>요청한 사람</label><Select className="" value={f.requester} onChange={set('requester')} options={people} placeholder="선택" /></div>
            <div className="field"><label>담당자</label><Select className="" value={f.assignee} onChange={set('assignee')} options={people} placeholder="선택" /></div>
            <div className="field"><label>마감일</label><input type="date" value={f.due_date || ''} onChange={e => set('due_date')(e.target.value)} /></div>
            <div className="field"><label>중요도</label><Select className="" value={f.priority} onChange={set('priority')} options={['보통', '급함']} /></div>
            <div className="field"><label>상태</label><Select className="" value={f.status} onChange={set('status')} options={TASK_STATUSES} /></div>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>내용</label><textarea rows="5" value={f.body} onChange={e => set('body')(e.target.value)} placeholder="요청 내용, 참고 링크, 확인할 것 등" /></div>
          <div className="form-actions">
            {task && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>삭제</button>}
            <button type="button" className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : task ? '저장' : '올리기'}</button>
          </div>
        </form>

        {task && (
          <div className="card">
            <div className="card-title">💬 댓글 <small>{comments.length}개</small></div>
            {comments.map(c => (
              <div key={c.id} className="task-comment">
                <div className="task-comment-head"><b>{c.author || '익명'}</b><span className="muted">{(() => { const d = new Date(c.created_at); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })()}</span>
                  <button className="btn-link" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => delComment(c)}>삭제</button></div>
                <div className="task-comment-body">{c.body}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'flex-start' }}>
              <Select className="input" value={author} onChange={setAuthor} options={people} placeholder="작성자" />
              <textarea className="input" rows="2" style={{ flex: 1 }} value={comment} onChange={e => setComment(e.target.value)} placeholder="진행 상황, 질문, 확인 요청 등" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment(); }} />
              <button className="btn btn-primary" onClick={addComment}>등록</button>
            </div>
            <div className="hint">Ctrl+Enter로도 등록돼요</div>
          </div>
        )}
      </div>
    </div>
  );
}

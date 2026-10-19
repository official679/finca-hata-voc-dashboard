// 🔧 개선 이슈 (2026-10-19, 26 SQL voc_issues + voc_cases.issue_id)
// VOC 여러 건에서 나온 "원인을 고쳐야 하는 일"(생산처 개선 요청, 바코드 전체 점검, 상세페이지 수정 등)을 부서별로 팔로업
// - 다른 팀도 같이 씀: 부서 버튼 + 한 줄 기록(바로 저장) · 담당 부서마다 '완료' 버튼 → 모든 부서가 완료하면 이슈 완료
// - 위치: VOC 목록 위쪽 탭 '🔧 개선 이슈' (#/voc-list?tab=issues · &dept=생산팀 · &issue=12)
// - VOC 상세 처리 칸에서 '새 이슈로 올리기' / '기존 이슈에 연결'

const ISSUE_STATUS_CHIP = { '요청': 'chip-amber', '진행중': 'chip-blue', '완료': 'chip-green' };
const issueStatusOf = (depts, log) => {
  const ds = depts || [];
  if (ds.length && ds.every(d => d.done)) return '완료';
  if (ds.some(d => d.done) || (log || []).length > 1) return '진행중';
  return '요청';
};
const daysSince = (d) => (d ? Math.max(0, Math.round((parseDate(today()) - parseDate(d)) / 86400000)) : null);

async function saveIssuePatch(issue, patch) {
  const next = { ...issue, ...patch };
  const status = issueStatusOf(next.depts, next.log);
  const row = { ...patch, status, done_at: status === '완료' ? (issue.done_at || today()) : null };
  const { data, error } = await db.from('voc_issues').update(row).eq('id', issue.id).select().single();
  if (error) throw error;
  return data;
}

function useIssues() {
  const [issues, setIssues] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await db.from('voc_issues').select('*').order('id', { ascending: false });
    setIssues(error ? [] : data);
  }, []);
  useEffect(() => { load(); }, [load]);
  return [issues, setIssues, load];
}

function IssueCard({ issue, onChange, onOpenVoc, highlight }) {
  const { cases, codeOptions, productById } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [addDept, setAddDept] = useState('');
  const vocs = cases.filter(c => c.issue_id === issue.id);
  const depts = issue.depts || [];
  const age = issue.status !== '완료' ? daysSince(issue.last_at || (issue.created_at || '').slice(0, 10)) : null;
  const save = async (patch, msg) => {
    setBusy(true);
    try { onChange(await saveIssuePatch(issue, patch)); if (msg) toast(msg); return true; }
    catch (e) { toast('❌ 저장 실패: ' + (e.message || e), 'err'); return false; }
    finally { setBusy(false); }
  };
  const toggleDone = (dept) => {
    const cur = depts.find(d => d.dept === dept);
    if (cur.done && !confirm(`${dept} 완료를 취소할까요?`)) return;
    const nextDepts = depts.map(d => (d.dept === dept ? { ...d, done: d.done ? null : today() } : d));
    const log = cur.done ? issue.log : [...(issue.log || []), { d: today(), dept, text: '✅ 완료' }];
    save({ depts: nextDepts, log, last_at: today() }, cur.done ? `${dept} 완료를 취소했어요` : `✅ ${dept} 완료`);
  };
  return (
    <div className="card issue-card" id={`issue-${issue.id}`} style={highlight ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-soft)' } : null}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`chip ${ISSUE_STATUS_CHIP[issue.status] || ''}`}>{issue.status}</span>
        {issue.kind && <span className="chip">{issue.kind}</span>}
        {issue.brand && <span className="muted" style={{ fontSize: 12 }}>{issue.brand}</span>}
        <b style={{ fontSize: 15 }}>{issue.title}</b>
        <span style={{ flex: 1 }} />
        {age !== null && <span className={age >= 7 ? 'chip chip-amber' : 'muted'} style={{ fontSize: 12 }} title="마지막 기록 뒤로 지난 날">⏰ {age}일째</span>}
        <button className="btn-link" style={{ fontSize: 12 }} onClick={() => { const t = prompt('이슈 제목', issue.title); if (t && t.trim() && t.trim() !== issue.title) save({ title: t.trim() }); }}>✏️ 제목</button>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
        <span className="muted" style={{ fontSize: 13 }}>담당 부서</span>
        {depts.map(d => (
          <button key={d.dept} className={`dept-opt${d.done ? ' on' : ''}`} disabled={busy} onClick={() => toggleDone(d.dept)}
            title={d.done ? `${fmtDate(d.done)} 완료 · 누르면 완료 취소` : '이 부서 일이 끝났으면 누르세요'}>
            {d.dept} {d.done ? `✓ ${fmtDate(d.done).slice(3)}` : '· 완료'}
          </button>
        ))}
        <select className="input" style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }} value={addDept} disabled={busy}
          onChange={e => { const v = e.target.value; setAddDept(''); if (v && !depts.some(d => d.dept === v)) save({ depts: [...depts, { dept: v, done: null }] }, `${v} 부서를 더했어요`); }}>
          <option value="">＋ 부서</option>
          {codeOptions('department').filter(o => !depts.some(d => d.dept === o)).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      {vocs.length > 0 && (
        <div style={{ fontSize: 13, marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="muted">연결 VOC {vocs.length}건</span>
          {vocs.map(c => (
            <button key={c.id} className="chip chip-blue" style={{ cursor: 'pointer', border: 0 }} onClick={() => onOpenVoc(c)} title={`${caseProductName(c, productById)} · ${c.reason_category || c.voc_type || ''}`}>
              #{c.id} {(caseProductName(c, productById) || '').slice(0, 14)}
            </button>
          ))}
        </div>
      )}
      <ProcessLog log={issue.log || []} options={codeOptions('department')} busy={busy}
        onAdd={entry => save({ log: [...(issue.log || []), entry], last_at: today() }, '✅ 기록 저장')}
        onRemove={i => (confirm('이 기록을 지울까요?') ? save({ log: (issue.log || []).filter((_, j) => j !== i) }) : false)} />
      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <button className="btn-link" style={{ fontSize: 12, color: 'var(--danger)' }} disabled={busy} onClick={async () => {
          if (!confirm('이 개선 이슈를 지울까요? 연결된 VOC는 그대로 남고 연결만 풀려요.')) return;
          const { error } = await db.from('voc_issues').delete().eq('id', issue.id);
          if (error) { toast('❌ ' + error.message, 'err'); return; }
          onChange(null, issue.id);
        }}>이슈 삭제</button>
      </div>
    </div>
  );
}

function IssueBoard({ brand, onOpenVoc }) {
  const { codeOptions, setCases } = useApp();
  const params = useMemo(() => new URLSearchParams(location.hash.split('?')[1] || ''), []);
  const [issues, setIssues] = useIssues();
  const [view, setView] = useState('open');
  const [dept, setDept] = useState(params.get('dept') || '');
  const focusId = params.get('issue');
  useEffect(() => { if (focusId && issues) setTimeout(() => document.getElementById(`issue-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }, [focusId, !!issues]);
  if (!issues) return <div className="card empty">개선 이슈 불러오는 중...</div>;
  const scoped = issues.filter(i => !brand || !i.brand || i.brand === brand);
  const open = scoped.filter(i => i.status !== '완료');
  // 부서별 칩 = 그 부서가 아직 완료 안 한 진행 중 이슈 수
  const deptCount = codeOptions('department').map(d => ({ d, n: open.filter(i => (i.depts || []).some(x => x.dept === d && !x.done)).length })).filter(x => x.n);
  const list = (view === 'open' ? open : scoped.filter(i => i.status === '완료'))
    .filter(i => !dept || (i.depts || []).some(x => x.dept === dept && (view !== 'open' || !x.done)))
    .sort((a, b) => (view === 'open' ? String(a.last_at || a.created_at).localeCompare(String(b.last_at || b.created_at)) : b.id - a.id));
  const onChange = (updated, removedId) => {
    if (removedId) { setIssues(prev => prev.filter(i => i.id !== removedId)); setCases(prev => prev.map(c => (c.issue_id === removedId ? { ...c, issue_id: null } : c))); return; }
    setIssues(prev => prev.map(i => (i.id === updated.id ? updated : i)));
  };
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filters">
          <Segmented options={[{ key: 'open', label: `진행 중 ${open.length}` }, { key: 'done', label: '완료' }]} value={view} onChange={setView} />
          <span className="muted" style={{ fontSize: 13 }}>부서별</span>
          <button className={`dept-opt${!dept ? ' on' : ''}`} onClick={() => setDept('')}>전체</button>
          {deptCount.map(x => <button key={x.d} className={`dept-opt${dept === x.d ? ' on' : ''}`} onClick={() => setDept(dept === x.d ? '' : x.d)}>{x.d} {x.n}</button>)}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>VOC 여러 건에서 나온 <b>원인을 고쳐야 하는 일</b>을 부서별로 챙겨요. 새 이슈는 <b>VOC 상세 → 처리 칸 → 🔧 개선 이슈</b>에서 올려요. 담당 부서는 자기 일이 끝나면 <b>부서 이름 버튼(· 완료)</b>을 눌러 주세요. 모든 부서가 완료하면 이슈가 완료돼요. 오래된 기록 순서로 보여요.</div>
      </div>
      {list.length === 0 && <div className="card empty">{view === 'open' ? '진행 중인 개선 이슈가 없어요 👍' : '완료된 이슈가 없어요'}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {list.map(i => <IssueCard key={i.id} issue={i} onChange={onChange} onOpenVoc={onOpenVoc} highlight={String(i.id) === focusId} />)}
      </div>
    </>
  );
}

// VOC 상세 처리 칸: 이 VOC를 개선 이슈로 올리거나 기존 이슈에 연결
function VocIssueLink({ vocCase, productName }) {
  const { setCases, codeOptions, cases } = useApp();
  vocCase = cases.find(c => c.id === vocCase.id) || vocCase;   // 연결·해제 뒤 최신 값
  const toast = useToast();
  const [mode, setMode] = useState('');   // '' | new | link
  const [issues, setIssues] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', kind: '', depts: [] });
  const linkedId = vocCase.issue_id;
  const [linked, setLinked] = useState(null);
  useEffect(() => {
    if (!linkedId) { setLinked(null); return; }
    db.from('voc_issues').select('id,title,status').eq('id', linkedId).single().then(({ data }) => setLinked(data || null));
  }, [linkedId]);
  const setIssue = async (id) => {
    const { data, error } = await db.from('voc_cases').update({ issue_id: id }).eq('id', vocCase.id).select().single();
    if (error) throw error;
    setCases(prev => prev.map(c => (c.id === data.id ? data : c)));
  };
  const openLink = async () => {
    setMode('link');
    const { data } = await db.from('voc_issues').select('id,title,brand,status').neq('status', '완료').order('id', { ascending: false });
    setIssues((data || []).filter(i => !i.brand || i.brand === vocCase.brand));
  };
  const create = async () => {
    if (!form.title.trim() || !form.depts.length) { toast('제목과 담당 부서를 골라 주세요', 'err'); return; }
    setBusy(true);
    try {
      const { data, error } = await db.from('voc_issues').insert({
        brand: vocCase.brand, title: form.title.trim(), kind: form.kind || null, status: '요청',
        depts: form.depts.map(d => ({ dept: d, done: null })), log: [{ d: today(), dept: 'CX', text: `VOC #${vocCase.id}에서 올림` }], last_at: today(),
      }).select().single();
      if (error) throw error;
      await setIssue(data.id);
      toast('🔧 개선 이슈를 만들었어요'); setMode('');
    } catch (e) { toast('❌ ' + (e.message || e), 'err'); } finally { setBusy(false); }
  };
  if (linkedId) {
    return (
      <div className="hint" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        🔧 <b>{linked ? linked.title : `개선 이슈 #${linkedId}`}</b>{linked && <span className={`chip ${ISSUE_STATUS_CHIP[linked.status] || ''}`}>{linked.status}</span>}
        <a href={`#/voc-list?tab=issues&issue=${linkedId}`}>이슈 보기 →</a>
        <button type="button" className="btn-link" onClick={async () => { if (!confirm('이 VOC를 개선 이슈에서 뺄까요?')) return; try { await setIssue(null); } catch (e) { toast('❌ ' + e.message, 'err'); } }}>연결 해제</button>
      </div>
    );
  }
  if (mode === 'new') {
    return (
      <div className="plog" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 240 }} autoFocus value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="예: 차렵이불 지퍼 불량 — 생산처 개선 요청" />
          <select className="input" style={{ width: 'auto' }} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
            <option value="">종류 선택</option>
            {codeOptions('issue_kind').map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="plog-depts" style={{ margin: '10px 0' }}>
          <span className="muted">담당 부서 (여러 개)</span>
          {codeOptions('department').map(d => <button type="button" key={d} className={`dept-opt${form.depts.includes(d) ? ' on' : ''}`}
            onClick={() => setForm(f => ({ ...f, depts: f.depts.includes(d) ? f.depts.filter(x => x !== d) : [...f.depts, d] }))}>{d}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={() => setMode('')}>취소</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={create}>{busy ? '만드는 중...' : '🔧 이슈 만들기'}</button>
        </div>
      </div>
    );
  }
  if (mode === 'link') {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!issues ? <span className="muted">불러오는 중...</span> : issues.length === 0 ? <span className="muted">진행 중인 이슈가 없어요</span> : (
          <select className="input" style={{ flex: 1, minWidth: 240 }} defaultValue="" onChange={async e => { const id = Number(e.target.value); if (!id) return; try { await setIssue(id); toast('🔗 개선 이슈에 연결했어요'); setMode(''); } catch (err) { toast('❌ ' + err.message, 'err'); } }}>
            <option value="">연결할 이슈 고르기</option>
            {issues.map(i => <option key={i.id} value={i.id}>{i.title} ({i.status})</option>)}
          </select>
        )}
        <button type="button" className="btn-link" onClick={() => setMode('')}>취소</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-sm" onClick={() => { setForm({ title: `${productName || '상품'} — ${vocCase.reason_category || vocCase.voc_type || ''}`.trim(), kind: '', depts: [] }); setMode('new'); }}>🔧 새 개선 이슈로 올리기</button>
      <button type="button" className="btn btn-sm" onClick={openLink}>🔗 기존 이슈에 연결</button>
      <span className="hint" style={{ margin: 0 }}>불량 개선 요청·바코드 점검처럼 원인을 고쳐야 할 때</span>
    </div>
  );
}

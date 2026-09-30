// 팀 캘린더: 우리 팀끼리 휴가·외근·미팅 공유 (team_events, 18 SQL) + CX 미팅 로그 회의는 자동 표시
// 회사 구글 캘린더와 따로, 대시보드 안에서만 씀. 알림은 없음

const EVENT_KINDS = [
  { kind: '휴가', icon: '🌴', color: '#E8792F' },
  { kind: '반차', icon: '🌗', color: '#D99A2B' },
  { kind: '외근', icon: '🚗', color: '#7C5CD6' },
  { kind: '미팅', icon: '💬', color: '#2563C9' },
  { kind: '교육', icon: '📚', color: '#0F9D8A' },
  { kind: '행사', icon: '🎉', color: '#D6457A' },
  { kind: '기타', icon: '📌', color: '#6B7280' },
];
// 업무 보드 마감은 직접 추가하는 종류가 아니라서 목록(EVENT_KINDS)에는 없고 표시용으로만
const TASK_KIND = { kind: '업무', icon: '⏰', color: '#374151' };
const kindInfo = (k) => (k === '업무' ? TASK_KIND : EVENT_KINDS.find(x => x.kind === k) || EVENT_KINDS[EVENT_KINDS.length - 1]);
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function eventLabel(e) {
  return `${e.person ? e.person + ' ' : ''}${e.title}${e.start_time ? ' ' + e.start_time : ''}`;
}

function CalendarPage() {
  const { codeOptions } = useApp();
  const people = codeOptions('handler');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [events, setEvents] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [error, setError] = useState('');
  const [who, setWho] = useState('');
  const [showMeetings, setShowMeetings] = useState(true);
  const [showTasks, setShowTasks] = useState(true);   // 업무 보드 마감일 (안 끝난 업무만)
  const [tasks, setTasks] = useState([]);
  const [editing, setEditing] = useState(null);   // { ...event } 또는 새 일정 { start_date }

  // 보이는 달력 범위 (앞뒤 주 포함)
  const gridStart = addDays(month, -month.getDay());
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay());
  const from = toISODate(gridStart), to = toISODate(gridEnd);

  const load = useCallback(async () => {
    try {
      const [ev, mt, tk] = await Promise.all([
        fetchAll(() => db.from('team_events').select('*').lte('start_date', to).gte('end_date', from).order('start_date').order('id')),
        fetchAll(() => db.from('meetings').select('id,meeting_date,title,kind').gte('meeting_date', from).lte('meeting_date', to).order('meeting_date')),
        fetchAll(() => db.from('tasks').select('id,title,assignee,due_date,status,priority').neq('status', '완료').gte('due_date', from).lte('due_date', to).order('id')),
      ]);
      setEvents(ev); setMeetings(mt); setTasks(tk); setError('');
    } catch (e) { setError(e.message || String(e)); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>팀 캘린더를 불러오지 못했어요: {error}<div className="hint">DB 설정 SQL(18_team_calendar.sql)을 실행했는지 확인해 주세요.</div></div>;

  const days = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(toISODate(d));
  const todayStr = today();
  const shown = (events || []).filter(e => !who || e.person === who || !e.person);
  const onDay = (day) => [
    ...shown.filter(e => e.start_date <= day && e.end_date >= day).map(e => ({ ...e, _type: 'event' })),
    ...(showMeetings && !who ? meetings.filter(m => m.meeting_date === day).map(m => ({ id: 'm' + m.id, meetingId: m.id, kind: '미팅', title: m.title, _type: 'meeting' })) : []),
    ...(showTasks ? tasks.filter(t => t.due_date === day && (!who || t.assignee === who)).map(t => ({ id: 't' + t.id, kind: '업무', person: t.assignee, title: `${t.priority === '급함' ? '🔥' : ''}${t.title} 마감`, _type: 'task' })) : []),
  ];
  const todayList = onDay(todayStr).filter(e => e._type === 'event');
  const away = todayList.filter(e => ['휴가', '반차', '외근'].includes(e.kind));
  const ym = `${month.getFullYear()}년 ${month.getMonth() + 1}월`;
  const shift = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <>
      <PageHeader title="📅 팀 캘린더" desc="우리 팀끼리 휴가·외근·미팅을 공유해요 · 날짜 칸을 누르면 일정 추가 · CX 미팅 로그 회의는 자동으로 보여요">
        <Segmented options={[{ key: '', label: '전체' }, ...people.map(p => ({ key: p, label: p }))]} value={who} onChange={setWho} />
        <button className="btn btn-primary" onClick={() => setEditing({ start_date: todayStr })}>+ 일정 추가</button>
      </PageHeader>

      <div className="cal-today">
        <b>오늘 ({fmtDate(todayStr).slice(3)} {WEEKDAYS[new Date().getDay()]})</b>
        {todayList.length ? todayList.map(e => (
          <button key={e.id} className="cal-chip" style={{ '--c': kindInfo(e.kind).color }} onClick={() => setEditing(e)}>{kindInfo(e.kind).icon} {e.kind} · {eventLabel(e)}</button>
        )) : <span className="muted">등록된 일정이 없어요</span>}
        {away.length > 0 && <span className="muted" style={{ marginLeft: 'auto' }}>자리 비움 {away.length}명</span>}
      </div>

      <div className="card cal-card">
        <div className="cal-head">
          <button className="btn btn-sm" onClick={() => shift(-1)}>◀</button>
          <h2>{ym}</h2>
          <button className="btn btn-sm" onClick={() => shift(1)}>▶</button>
          <button className="btn btn-sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>오늘</button>
          <label className="muted" style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={showTasks} onChange={e => setShowTasks(e.target.checked)} style={{ width: 'auto' }} /> 업무 마감 보기
          </label>
          <label className="muted" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={showMeetings} onChange={e => setShowMeetings(e.target.checked)} style={{ width: 'auto' }} /> CX 미팅 로그 보기
          </label>
        </div>
        <div className="cal-legend">{[...EVENT_KINDS, { ...TASK_KIND, kind: '업무 마감' }].map(k => <span key={k.kind}><i style={{ background: k.color }} />{k.icon} {k.kind}</span>)}</div>
        <div className="cal-grid">
          {WEEKDAYS.map((w, i) => <div key={w} className={`cal-wd${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`}>{w}</div>)}
          {days.map(day => {
            const d = parseDate(day), list = onDay(day), out = d.getMonth() !== month.getMonth();
            return (
              <div key={day} className={`cal-day${out ? ' out' : ''}${day === todayStr ? ' today' : ''}`} onClick={() => setEditing({ start_date: day })} title="눌러서 일정 추가">
                <div className={`cal-num${d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : ''}`}>{d.getDate()}</div>
                {list.slice(0, 4).map(e => (
                  <button key={e.id} className={`cal-chip${e._type === 'meeting' ? ' meeting' : ''}`} style={{ '--c': kindInfo(e.kind).color }}
                    onClick={ev => { ev.stopPropagation(); if (e._type === 'meeting') location.hash = `#/meetings/${e.meetingId}`; else if (e._type === 'task') location.hash = '#/tasks'; else setEditing(e); }}
                    title={e._type === 'meeting' ? `CX 미팅 로그: ${e.title}` : e._type === 'task' ? `업무 보드 마감: ${eventLabel(e)} (누르면 업무 보드로)` : `${e.kind} · ${eventLabel(e)}${e.memo ? '\n' + e.memo : ''}`}>
                    {kindInfo(e.kind).icon} {eventLabel(e)}
                  </button>
                ))}
                {list.length > 4 && <div className="cal-more">+{list.length - 4}개 더</div>}
              </div>
            );
          })}
        </div>
      </div>

      {editing && <EventPanel event={editing} people={people} onClose={() => setEditing(null)} reload={load} />}
    </>
  );
}

function EventPanel({ event, people, onClose, reload }) {
  const toast = useToast();
  const isNew = !event.id;
  const [f, setF] = useState(() => ({ kind: '휴가', title: '', person: '', start_date: event.start_date, end_date: event.end_date || event.start_date, start_time: '', memo: '',
    ...Object.fromEntries(Object.entries(event).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v ?? ''])) }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v, ...(k === 'start_date' && p.end_date < v ? { end_date: v } : {}) }));

  const save = async (e) => {
    e.preventDefault();
    const title = f.title.trim() || f.kind;   // 휴가처럼 제목이 없어도 종류로 저장
    if (!f.start_date) { toast('❌ 날짜를 골라주세요', 'err'); return; }
    if (f.end_date && f.end_date < f.start_date) { toast('❌ 끝나는 날이 시작일보다 빨라요', 'err'); return; }
    setSaving(true);
    const row = { kind: f.kind, title, person: f.person || null, start_date: f.start_date, end_date: f.end_date || f.start_date, start_time: f.start_time || null, memo: f.memo.trim() || null };
    const { error } = isNew ? await db.from('team_events').insert({ ...row, author: loadMe() || null }) : await db.from('team_events').update(row).eq('id', event.id);
    setSaving(false);
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    toast(isNew ? '✅ 일정을 올렸어요' : '✅ 저장했어요');
    await reload(); onClose();
  };
  const remove = async () => {
    if (!confirm('이 일정을 삭제할까요?')) return;
    const { error } = await db.from('team_events').delete().eq('id', event.id);
    if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return; }
    toast('✅ 삭제했어요'); await reload(); onClose();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="panel-head"><h2>{isNew ? '일정 추가' : '일정'}</h2><button className="btn btn-sm" onClick={onClose}>닫기</button></div>
        <form className="card" onSubmit={save}>
          <div className="field"><label>종류</label>
            <div className="cal-kinds">{EVENT_KINDS.map(k => (
              <button type="button" key={k.kind} className={`cal-kind${f.kind === k.kind ? ' on' : ''}`} style={{ '--c': k.color }} onClick={() => set('kind')(k.kind)}>{k.icon} {k.kind}</button>
            ))}</div>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field"><label>누구</label><Select className="" value={f.person} onChange={set('person')} options={people} placeholder="팀 전체" /></div>
            <div className="field"><label>제목 <span className="muted" style={{ fontWeight: 400 }}>(비우면 종류 이름)</span></label><input value={f.title} onChange={e => set('title')(e.target.value)} placeholder={f.kind === '미팅' ? '예: 바움스 전기패드 미팅' : f.kind === '외근' ? '예: CJ 물류센터 방문' : f.kind} /></div>
            <div className="field"><label>시작일</label><input type="date" value={f.start_date} onChange={e => set('start_date')(e.target.value)} /></div>
            <div className="field"><label>끝나는 날</label><input type="date" value={f.end_date} min={f.start_date} onChange={e => set('end_date')(e.target.value)} /></div>
            <div className="field"><label>시간 <span className="muted" style={{ fontWeight: 400 }}>(없으면 하루 종일)</span></label><input type="time" value={f.start_time} onChange={e => set('start_time')(e.target.value)} /></div>
          </div>
          <div className="field" style={{ marginTop: 12 }}><label>메모</label><textarea rows="3" value={f.memo} onChange={e => set('memo')(e.target.value)} placeholder="장소, 참석자, 대신 처리해 줄 사람 등" /></div>
          <div className="form-actions">
            {!isNew && <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>삭제</button>}
            <button type="button" className="btn" onClick={onClose}>취소</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? '저장 중...' : isNew ? '올리기' : '저장'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

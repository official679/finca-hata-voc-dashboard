// CX 미팅 로그: 회의록 게시판 + 논의사항 (완료될 때까지 다음 회의에 자동으로 따라감)

const MEETING_KINDS = ['CX 회의', 'PJ 회의'];

// 주간 리포트 표: '전주 → 금주' 한 칸을 전주 / 금주 두 칸으로 나누고, 위에 브랜드(핀카·하타) 묶음 제목을 붙임
// (저장된 글은 그대로 두고 보여줄 때만 바꿔서 예전 노션 회의록 표도 같이 적용됨)
function splitReportTables(html) {
  if (!html.includes('<table')) return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const el = (name, inner, attrs = {}) => { const e = doc.createElement(name); e.innerHTML = inner; Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
  doc.querySelectorAll('table').forEach(table => {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) return;
    const head = [...rows[0].children];
    const arrow = head.map((c, i) => i > 0 && /→/.test(c.textContent));
    if (!arrow.some(Boolean)) return;
    // 같은 브랜드 칸끼리 묶기 ('핀카 전주 → 금주', '핀카 증감' → 핀카)
    const brandOf = (t) => t.replace(/전주\s*→\s*금주|증감|전주|금주/g, '').trim() || ' ';
    const groups = [];
    head.forEach((c, i) => {
      if (i === 0) return;
      const b = brandOf(c.textContent), g = groups[groups.length - 1];
      if (g && g.brand === b) g.cols.push(i); else groups.push({ brand: b, cols: [i] });
    });
    // '인입 20건 → 9건<br>발신 38건 → 12건' → ['인입 20건<br>발신 38건', '인입 9건<br>발신 12건']
    const split = (cell) => {
      const L = [], R = [];
      String(cell ? cell.innerHTML : '').split(/<br\s*\/?>/i).forEach(line => {
        const [a, b] = line.split('→');
        if (b === undefined) { L.push(line); R.push(''); return; }
        const label = (a.replace(/<[^>]+>/g, '').match(/^\s*([^\d+\-.,]*)/) || ['', ''])[1].trim();
        L.push(a.trim()); R.push((label ? label + ' ' : '') + b.trim());
      });
      return [L.join('<br>'), R.join('<br>')];
    };
    const thead = doc.createElement('thead'), r1 = doc.createElement('tr'), r2 = doc.createElement('tr');
    r1.appendChild(el('th', head[0].innerHTML, { rowspan: 2 }));
    groups.forEach((g, gi) => {
      const subs = g.cols.flatMap(i => (arrow[i] ? ['전주', '금주'] : [head[i].textContent.replace(g.brand, '').trim() || head[i].textContent]));
      r1.appendChild(el('th', g.brand, { colspan: subs.length, class: `md-grp${gi ? ' md-split' : ''}` }));
      subs.forEach((s, si) => r2.appendChild(el('th', s, si === 0 && gi ? { class: 'md-split' } : {})));
    });
    thead.append(r1, r2);
    const tbody = doc.createElement('tbody');
    rows.slice(1).forEach(tr => {
      const cells = [...tr.children], nr = doc.createElement('tr');
      nr.appendChild(el('td', cells[0] ? cells[0].innerHTML : ''));
      groups.forEach((g, gi) => {
        let first = true;
        g.cols.forEach(i => {
          (arrow[i] ? split(cells[i]) : [cells[i] ? cells[i].innerHTML : '']).forEach(p => {
            nr.appendChild(el('td', p, first && gi ? { class: 'md-split' } : {}));
            first = false;
          });
        });
      });
      tbody.appendChild(nr);
    });
    table.innerHTML = '';
    table.append(thead, tbody);
    table.classList.add('md-week');
  });
  return doc.body.firstChild.innerHTML;
}


// 회의 내용은 마크다운 (- 목록, ### 제목, **굵게**, 표). 노션에서 가져온 표(HTML)도 그대로 보임
function MarkdownView({ text }) {
  const html = useMemo(() => {
    // '9/14~9/20'의 ~ 를 취소선으로 읽지 않도록 글자 그대로 표시
    const src = String(text || '').replace(/<empty-block\s*\/>/g, '').replace(/\\([~\-*_>#|])/g, '$1').replace(/~/g, '&#126;');
    try { return splitReportTables(DOMPurify.sanitize(marked.parse(src, { breaks: true }))); } catch { return ''; }
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

// 이 주에 들어간 보고일들의 실제 데이터 날짜 (연휴 보고가 주를 걸치면 분석 기간과 달라짐, 예: 10/2~4는 10/6 보고 = 다음 주)
function actualDataRange(daily, w) {
  const days = [...new Set(daily.filter(r => periodDate(r.report_date) >= w.from && periodDate(r.report_date) <= w.to).map(r => r.report_date))].sort();
  if (!days.length) return null;
  return [dataRangeOf(days[0])[0], dataRangeOf(days[days.length - 1])[1]];
}

// 리뷰·VOC 요약 (데이터 날짜 월~일 기준, CS 데일리와 달리 연휴 영향 없음)
async function weeklyReviewVocDraft(meetingDate, cases, productById, daily = []) {
  const { cur, prev } = meetingWeeks(meetingDate);
  // 표와 같은 기간: CS 데일리가 있으면 실제 데이터 날짜(연휴 포함, 예: 9/28~10/5), 없으면 그 주 월~일
  const range = (w) => actualDataRange(daily, w) || [toISODate(addDays(parseDate(w.from), -1)), toISODate(addDays(parseDate(w.to), -1))];
  const [cf, ct] = range(cur), [pf] = range(prev);
  const reviews = await fetchAll(() => db.from('review_items').select('brand,product_name,rating,content,written_at')
    .gte('written_at', `${pf}T00:00:00+09:00`).lt('written_at', `${toISODate(addDays(parseDate(ct), 1))}T00:00:00+09:00`).order('id'));
  const negMax = loadNegMax();
  const inWeek = (iso, f, t) => { const d = toISODate(new Date(iso)); return d >= f && d <= t; };
  const top = (list, n = 3) => { const m = {}; list.forEach(k => { if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} ${c}건`).join(', ') || '-'; };
  const short = (name) => coreName(name || '').slice(0, 30);
  return ['핀카', '하타'].map(brand => {
    const cr = reviews.filter(r => r.brand === brand && inWeek(r.written_at, cf, ct));
    const pr = reviews.filter(r => r.brand === brand && !inWeek(r.written_at, cf, ct));
    const neg = cr.filter(r => r.rating !== null && r.rating <= negMax);
    const pneg = pr.filter(r => r.rating !== null && r.rating <= negMax).length;
    const vocs = cases.filter(c => c.brand === brand && c.received_date >= cf && c.received_date <= ct);
    const fault = vocs.filter(c => isFault(c.voc_type));
    const vname = (c) => short((c.product_id && productById.get(c.product_id)?.product_name) || c.product_name);
    return `- **${brand}**\n` +
      `  - 리뷰 ${cr.length.toLocaleString()}건 · 부정(${negMax}점 이하) **${neg.length}건 (${cr.length ? (neg.length / cr.length * 100).toFixed(1) : 0}%)** · 전주 부정 ${pneg}건\n` +
      (neg.length ? `  - 부정 리뷰 불만: ${top(neg.flatMap(r => reviewThemes(r.content, true)))}\n  - 부정 리뷰 많은 상품: ${top(neg.map(r => short(r.product_name)))}\n` : '') +
      `  - VOC ${vocs.length}건 (과실 **${fault.length}건**)${vocs.length ? ` · 구분: ${top(vocs.map(c => c.voc_type))}` : ''}\n` +
      (fault.length ? `  - 과실 VOC 상품: ${top(fault.map(vname))}\n` : '') +
      `  - 의견: `;
  }).join('\n');
}

function weeklyReportDraft(daily, meetingDate, reviewVoc) {
  const { cur, prev } = meetingWeeks(meetingDate);
  const [ca, pa] = [actualDataRange(daily, cur), actualDataRange(daily, prev)];
  const labelOf = (r) => (r ? `${fmtMD(parseDate(r[0]))}~${fmtMD(parseDate(r[1]))}` : '-');
  const shifted = [[pa, prev, '전주'], [ca, cur, '금주']].filter(([a, w]) => a && labelOf(a) !== w.label)
    .map(([a, , name]) => `${name} ${labelOf(a)}`);
  const note = shifted.length ? `\n- ※ **연휴로 실제 데이터 기간: ${shifted.join(' · ')}** (연휴 보고는 데이터가 시작하는 주에 포함)` : '';
  const sum = (brand, w) => sumRows(daily.filter(r => r.brand === brand && periodDate(r.report_date) >= w.from && periodDate(r.report_date) <= w.to));
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
  // 제목 링크 = 대시보드 화면 (예전 회의록의 구글시트 링크 대신)
  return `### 1. [주간 CX 리포트](#/monthly)\n- **분석 기간: ${cur.label}**\n- **전주 대비 (${prev.label} → ${cur.label})**${note}\n\n${table}\n\n- **주간 요약**\n  - \n\n### 2. [리뷰](#/reviews) / [VOC](#/report) (${cur.label})\n${reviewVoc || '- 핀카: \n- 하타: '}\n\n### 3. 논의사항\n- 오른쪽 '논의사항'에 하나씩 추가하면 완료될 때까지 다음 회의에 자동으로 따라가요\n`;
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
// 주소로 화면 구분 (브라우저 뒤로가기가 자연스럽게 되도록): #/meetings · #/meetings/12 · #/meetings/12/edit · #/meetings/new
function meetingView() {
  const [, a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'new') return { edit: {} };
  if (a && /^\d+$/.test(a)) return b === 'edit' ? { editId: Number(a) } : { id: Number(a) };
  return null;
}
function goMeeting(v, replace) {
  const hash = !v ? '#/meetings' : v.edit ? '#/meetings/new' : v.editId ? `#/meetings/${v.editId}/edit` : `#/meetings/${v.id}`;
  if (replace) location.replace(hash); else location.hash = hash;
}

async function deleteMeeting(meeting, toast) {
  if (!confirm(`"${meeting.title}" 회의록을 삭제할까요?\n이 회의에서 나온 논의사항도 같이 지워지고, 되돌릴 수 없어요.`)) return false;
  const { error } = await db.from('meetings').delete().eq('id', meeting.id);
  if (error) { toast('❌ 삭제 실패: ' + error.message, 'err'); return false; }
  toast('✅ 삭제했어요');
  return true;
}

function MeetingsPage() {
  const [{ meetings, items, error }, reload] = useMeetings();
  const [view, setViewState] = useState(meetingView);
  useEffect(() => {
    const on = () => setViewState(meetingView());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const setView = (v) => goMeeting(v);
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [SIZE, setSize] = usePageSize('meetings');

  if (error) return <div className="card" style={{ color: 'var(--danger)' }}>미팅 로그를 불러오지 못했어요: {error}<div className="hint">DB 설정 SQL(09_meetings_schema.sql)을 실행했는지 확인해 주세요.</div></div>;
  if (!meetings) return <div className="loading-screen">미팅 로그 불러오는 중...</div>;

  const done = async (id) => { await reload(); goMeeting(id ? { id } : null, true); };
  if (view && view.edit) return <MeetingForm meeting={view.edit} onDone={done} />;
  if (view && view.editId) return <MeetingEditLoader id={view.editId} onDone={done} />;
  if (view && view.id) {
    const m = meetings.find(x => x.id === view.id);
    if (m) return <MeetingDetail meeting={m} meetings={meetings} items={items} reload={reload} onBack={() => setView(null)} onEdit={() => setView({ editId: m.id })} onDeleted={() => done(null)} />;
    return <><div className="card empty">회의록을 찾을 수 없어요 (삭제됐을 수 있어요)</div><button className="btn-link" onClick={() => setView(null)}>← 목록으로</button></>;
  }

  const openItems = items.filter(i => i.status !== '완료');
  const rows = meetings.filter(m => (!kind || m.kind === kind) && matchQuery(q, m.title, m.attendees));
  const pages = Math.max(1, Math.ceil(rows.length / SIZE)), cur = Math.min(page, pages);
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
            <MeetingItemRow key={i.id} item={i} reload={reload} compact origin={dateOf.get(i.meeting_id)} onOpenOrigin={() => setView({ id: i.meeting_id })} />
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
        <div style={{ padding: '0 16px 16px' }}><Pager page={cur} pages={pages} onChange={setPage} size={SIZE} onSize={setSize} /></div>
      </div>
    </>
  );
}

function MeetingItemRow({ item, reload, origin, onOpenOrigin, carried, compact }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ title: item.title, detail: item.detail || '', owner: item.owner || '', result: item.result || '' });
  const done = item.status === '완료';
  const toggle = async () => {
    const { error } = await db.from('meeting_items').update(done ? { status: '진행중', done_at: null } : { status: '완료', done_at: today() }).eq('id', item.id);
    if (error) { toast('❌ ' + error.message, 'err'); return; }
    reload();
  };
  const save = async () => {
    if (!f.title.trim()) return;
    const { error } = await db.from('meeting_items').update({ title: f.title.trim(), detail: str(f.detail), owner: str(f.owner), result: str(f.result) }).eq('id', item.id);
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
        <textarea className="input" rows="3" value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} placeholder="논의 내용 · 현황" />
        <textarea className="input" rows="3" value={f.result} onChange={e => setF({ ...f, result: e.target.value })} placeholder="✅ 결과 · 어떻게 처리하기로 했는지 (예: 기존 구매 고객 문자 안내, 잔여 재고 라벨 교체 후 판매 재개)" style={{ borderColor: 'var(--success)' }} />
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
        {item.detail && !compact && <div className="meeting-item-detail">{item.detail}</div>}
        {!compact && (item.result
          ? <div className="meeting-item-result"><b>✅ 결과</b> {item.result}</div>
          : <button className="btn-link" style={{ fontSize: 12, display: 'block' }} onClick={() => setEditing(true)}>+ 결과 적기</button>)}
        {origin && <button className="btn-link" style={{ fontSize: 12 }} onClick={onOpenOrigin}>{fmtDate(origin.meeting_date)} {origin.title}</button>}
      </div>
      <button className="btn btn-sm" onClick={() => setEditing(true)}>수정</button>
    </div>
  );
}

// 수정 화면을 주소로 바로 열었을 때: 본문까지 불러온 뒤 폼 표시
function MeetingEditLoader({ id, onDone }) {
  const [m, setM] = useState(null);
  useEffect(() => { db.from('meetings').select('*').eq('id', id).single().then(({ data }) => setM(data || false)); }, [id]);
  if (m === null) return <div className="loading-screen">불러오는 중...</div>;
  if (!m) return <div className="card empty">회의록을 찾을 수 없어요</div>;
  return <MeetingForm meeting={m} onDone={onDone} />;
}

function MeetingDetail({ meeting, meetings, items, reload, onBack, onEdit, onDeleted }) {
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
        <button className={`chip ${meeting.status === '완료' ? 'chip-green' : 'chip-red'}`} style={{ border: 'none', cursor: 'pointer' }}
          title={meeting.status === '완료' ? '누르면 진행중으로' : '누르면 완료로'}
          onClick={async () => {
            const { error } = await db.from('meetings').update({ status: meeting.status === '완료' ? '진행중' : '완료' }).eq('id', meeting.id);
            if (error) { toast('❌ ' + error.message, 'err'); return; }
            reload();
          }}>{meeting.status === '완료' ? '✓ 완료' : '진행중'} ⇄</button>
        <button className="btn" onClick={onEdit}>✏️ 수정</button>
        <button className="btn btn-danger" onClick={async () => { if (await deleteMeeting(meeting, toast)) onDeleted(); }}>🗑️ 삭제</button>
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
  const { cases, productById } = useApp();
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

  const insertReport = async () => {
    if (!daily) { toast('CS 데일리 불러오는 중이에요. 잠시 후 다시 눌러주세요'); return; }
    let rv = null;
    try { rv = await weeklyReviewVocDraft(f.meeting_date, cases, productById, daily); } catch (e) { toast('⚠️ 리뷰·VOC 요약은 못 넣었어요: ' + (e.message || e), 'err'); }
    setF(prev => ({ ...prev, body: weeklyReportDraft(daily, prev.meeting_date, rv) + (prev.body ? '\n' + prev.body : '') }));
    toast('📊 주간 CX 리포트·리뷰·VOC 요약을 넣었어요 · 요약·의견은 직접 적어주세요');
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
  const remove = async () => { if (await deleteMeeting(meeting, toast)) onDone(null); };

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

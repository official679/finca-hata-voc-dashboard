// 메인: 한눈에 보는 요약 대시보드

// 최근 n주 (데이터 월~일 = 보고일 화~월, 보고서와 같은 주 구분)
function recentWeeks(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
  return Array.from({ length: n }, (_, i) => {
    const s = addDays(d, -7 * (n - 1 - i));
    return { from: toISODate(s), to: toISODate(addDays(s, 6)), label: fmtMD(addDays(s, -1)) };
  });
}

// 값 목록을 세로 막대로 (라벨·값 표시)
function ColumnChart({ items, format = (v) => v, color = 'var(--accent)', highlightMax }) {
  const max = Math.max(0, ...items.map(i => i.value || 0)) || 1;
  const top = highlightMax ? Math.max(...items.map(i => i.value || 0)) : null;
  return (
    <div className="columns">
      {items.map(i => (
        <div className="column" key={i.label} title={`${i.label}: ${i.value === null ? '-' : format(i.value)}`}>
          <div className="column-value">{i.value === null ? '-' : format(i.value)}</div>
          <div className="column-bar" style={{ height: `${((i.value || 0) / max) * 100}%`, background: highlightMax && i.value === top && top > 0 ? 'var(--danger)' : color }} />
          <div className="column-label">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

// 요약·보고서용 가벼운 조회 (기본: 최근 13개월만)
function useLight(table, columns, since = monthsAgo(12)) {
  return useSince(table, columns, since)[0];
}

// 리뷰 목록에서 '체크필요'로 표시했는데 아직 VOC로 안 보낸 리뷰 수
function useReviewCheckCount(brand) {
  const [n, setN] = useState(null);
  useEffect(() => {
    db.from('review_items').select('id', { count: 'exact', head: true }).eq('brand', brand).eq('check_status', '체크필요').is('voc_case_id', null)
      .then(({ count, error }) => setN(error ? -1 : count || 0));
  }, [brand]);
  return n;
}

// 오늘(0시 이후) 그 브랜드로 올린 주문·리뷰·게시판 파일이 있는지 ('오늘 할 일' ① 파일 올리기)
function useTodayUploads(brand) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    setState(null);
    const since = `${today()}T00:00:00+09:00`;
    const has = (table) => db.from(table).select('id').eq('brand', brand).gte('created_at', since).limit(1).then(({ data }) => !!(data && data.length));
    Promise.all(['order_items', 'review_items', 'board_items'].map(has))
      .then(([orders, reviews, board]) => alive && setState({ orders, reviews, board }))
      .catch(() => alive && setState({ error: true }));
    return () => { alive = false; };
  }, [brand]);
  return state;
}

// 데일리 리포트 이미지를 복사·저장한 보고일 (이 PC 기준, dailyreport.jsx에서 기록)
const reportDoneDate = () => { try { return localStorage.getItem('dailyReportDone') || ''; } catch { return ''; } };

// 메인: ① 오늘 할 일(순서표) ② 이번 주 핵심 지표 ③ 주간 그래프 ④ 과실 사유·재입고 상품
function HomePage() {
  const { cases, productById, codes, viewMode } = useApp();
  const daily = useDaily();
  const board = useLight('board_items', 'brand,inquiry_type,written_at,product_name,product_id,option_text', toISODate(addDays(new Date(), -90)));
  const [brand, setBrand] = useState('핀카');
  const preorder = usePreorderPending();   // 예약배송은 브랜드 구분 없이 (지금은 핀카만 운영)
  const checkNeed = useReviewCheckCount(brand);
  const uploads = useTodayUploads(brand);
  // '오늘 할 일' 열기·접기 (PC별 기억). 접어 두면 다음 할 일 한 줄만
  const [todoOpen, setTodoOpen] = useState(() => { try { return localStorage.getItem('homeTodoOpen') !== '0'; } catch { return true; } });
  const toggleTodo = () => setTodoOpen(v => { try { localStorage.setItem('homeTodoOpen', v ? '0' : '1'); } catch {} return !v; });

  if (!daily || !board) return <div className="loading-screen">요약 불러오는 중...</div>;

  const byBrand = (rows) => rows.filter(r => !brand || r.brand === brand);
  const d = byBrand(daily).filter(r => r.platform !== BRAND_TOTAL);

  // 이번 달 (보고서와 같은 주차 기준) vs 지난달 '같은 기간' (월 중간에도 공정하게 비교)
  const now = new Date();
  // 핵심 지표 = 가장 최근 데이터가 있는 주 vs 전주 같은 기간 (2026-10-06 사용자 요청: 지난달 대비 → 전주 대비)
  const pdOf = (r) => periodDate(r.report_date);
  const latest = maxDate(d.map(pdOf)) || toISODate(now);
  const cw = weekOf(latest) || { label: '이번 주', from: latest, to: latest, ym: latest.slice(0, 7) };
  const ym = cw.ym;
  const curRows = d.filter(r => pdOf(r) >= cw.from && pdOf(r) <= latest);
  const s = sumRows(curRows);
  const span = (rows) => { const ds = [...new Set(rows.map(r => r.report_date))].sort(); return ds.length ? [dataRangeOf(ds[0])[0], dataRangeOf(ds[ds.length - 1])[1]] : null; };
  const cs = span(curRows);
  // 이번 주 데이터가 일요일까지 다 들어왔으면 전주 전체와, 아니면 전주의 같은 날까지와 비교
  const full = !!cs && cs[1] >= toISODate(addDays(parseDate(cw.to), -1));
  const elapsed = Math.round((parseDate(latest) - parseDate(cw.from)) / 86400000);
  const pFrom = toISODate(addDays(parseDate(cw.from), -7));
  const pTo = full ? toISODate(addDays(parseDate(cw.to), -7)) : toISODate(addDays(parseDate(pFrom), elapsed));
  const prevRows = d.filter(r => pdOf(r) >= pFrom && pdOf(r) <= pTo);
  const p = sumRows(prevRows);
  const ratio = (a, n) => (n ? a / n : null);
  const ps = span(prevRows);
  const md = (x) => fmtMD(parseDate(x));
  const vsLabel = full ? '전주' : '전주 같은 기간';
  const periodNote = cs ? `데이터 ${md(cs[0])}~${md(cs[1])} · ${vsLabel}(${ps ? `${md(ps[0])}~${md(ps[1])}` : '-'}) 대비` : '';

  // 주간 추이 (최근 5주)
  const weeks = recentWeeks(5).map(w => ({ ...w, s: sumRows(d.filter(r => periodDate(r.report_date) >= w.from && periodDate(r.report_date) <= w.to)) }));

  // VOC
  const c = byBrand(cases);
  const since30 = toISODate(addDays(now, -30));
  const faults30 = c.filter(x => isFault(x.voc_type) && x.received_date >= since30);
  const openCases = c.filter(x => x.status === '접수' || x.status === '확인중');

  // 재입고 문의 (최근 90일)
  const bd = byBrand(board).filter(r => r.written_at && isInquiry(r));
  const unlinkedRestock = bd.filter(r => r.inquiry_type === '재입고' && !r.product_id && !r.product_name).length;

  const link = (to, text = '자세히 →') => <a className="btn-link" href={`#/${to}`}>{text}</a>;
  // 오늘 할 일 = 아침 루틴 순서대로 (2026-10-12). 위에서부터 하나씩, 끝난 건 ✓
  //   ①~③은 보고일(평일·공휴일 아님)에만. 데일리 리포트는 핀카·하타를 한 장에 같이 만듦
  const todayISO = today();
  const reportDay = isReportDay(parseDate(todayISO));
  const savedToday = daily.some(r => r.report_date === todayISO && r.brand === brand);
  const mark = (ok) => (ok ? '✓' : '–');
  const n = (v) => (v === null || v === undefined ? null : v < 0 ? '-' : v);
  const steps = [
    { label: '파일 올리기', to: 'upload', skip: !reportDay,
      done: uploads && !uploads.error ? uploads.orders : null,
      sub: !uploads ? '확인 중...' : uploads.error ? '확인하지 못했어요' : `주문 ${mark(uploads.orders)} · 리뷰 ${mark(uploads.reviews)} · 게시판 ${mark(uploads.board)}` },
    { label: `CS 데일리 저장 (${brand})`, to: savedToday || !(uploads && uploads.orders) ? 'daily' : `daily?fill=${encodeURIComponent(brand)}`, skip: !reportDay,
      done: savedToday, sub: savedToday ? '저장했어요' : uploads && uploads.orders ? '누르면 바로 채워져요 → 확인 후 💾 저장' : '파일을 먼저 올려 주세요' },
    { label: '데일리 리포트 슬랙 보고', to: 'daily?report=1', skip: !reportDay,
      done: reportDoneDate() === todayISO, sub: '핀카·하타 한 장 · 📋 이미지 복사하면 ✓' },
    { label: '예약배송 안내', to: 'preorder', count: !preorder ? null : preorder.error ? '-' : preorder.pending,
      sub: preorder && !preorder.error ? `안내 필요 · 출고대기 ${preorder.open}건` : '예약배송 관리' },
    { label: '리뷰 체크필요', to: `review-list?period=all&check=${encodeURIComponent('체크필요')}&brand=${encodeURIComponent(brand)}`, count: n(checkNeed), sub: 'VOC로 안 보낸 것' },
    { label: '처리 대기 VOC', to: 'voc-list', count: openCases.length, sub: '접수·확인중' },
  ];
  // 한 달(30일)이 지나도록 백업을 안 받았으면 알림
  const lastBackup = lastBackupOf(codes);
  const backupDue = !lastBackup || lastBackup < toISODate(addDays(now, -30));
  if (backupDue) steps.push({ label: '데이터 백업', to: 'upload', done: false, sub: lastBackup ? `마지막 ${fmtDate(lastBackup)} · 한 달에 한 번` : '아직 한 번도 안 함' });
  // 건수가 있는 일은 0건이면 끝, 1건 이상이면 할 일
  steps.forEach(t => { if ('count' in t) t.done = t.count === null ? null : t.count === '-' ? null : t.count === 0; });
  const active = steps.filter(t => !t.skip);
  const doneCount = active.filter(t => t.done).length;
  const nextIdx = steps.findIndex(t => !t.skip && t.done === false);

  return (
    <>
      <PageHeader title="한눈에 보기" desc={`${Number(ym.slice(5))}월 현황 · 매일 입력·업로드한 데이터로 자동 계산돼요`}>
        <Segmented options={BRAND_FILTER} value={brand} onChange={setBrand} />
      </PageHeader>

      {/* 보기 모드(대표님·MD)에서는 팀 아침 루틴인 '오늘 할 일'을 숨김 */}
      {!viewMode && <>
      <div className={`todo-head${todoOpen ? ' open' : ''}`} onClick={toggleTodo} role="button" title={todoOpen ? '눌러서 접기' : '눌러서 펼치기'}>
        <span className="todo-title">✅ 오늘 할 일</span>
        <span className="todo-progress"><span className="todo-progress-bar" style={{ width: `${active.length ? (doneCount / active.length) * 100 : 0}%` }} /></span>
        <span className="todo-progress-text">{doneCount}/{active.length} 완료</span>
        {!reportDay && <span className="todo-sub">오늘은 보고 없는 날(주말·공휴일)</span>}
        <span className="todo-toggle">{todoOpen ? '접기 ▲' : '펼치기 ▼'}</span>
      </div>
      {todoOpen ? (
        <div className="todo-steps">
          {steps.map((t, i) => (
            <a key={t.label} href={`#/${t.to}`} className={`todo-step${t.skip ? ' skip' : t.done ? ' done' : ''}${i === nextIdx ? ' next' : ''}`}>
              <span className="todo-num">{t.done && !t.skip ? '✓' : i + 1}</span>
              <span className="todo-label">{t.label}{'count' in t && t.count !== null && <b className={t.count > 0 ? 'todo-count' : 'todo-zero'}> {typeof t.count === 'number' ? `${t.count.toLocaleString()}건` : t.count}</b>}</span>
              <span className="todo-sub">{t.skip ? '오늘은 안 해도 돼요' : t.sub}</span>
              <span className="todo-go">→</span>
            </a>
          ))}
        </div>
      ) : nextIdx >= 0 ? (
        <div className="todo-steps">
          <a href={`#/${steps[nextIdx].to}`} className="todo-step next">
            <span className="todo-num">{nextIdx + 1}</span>
            <span className="todo-label">다음: {steps[nextIdx].label}</span>
            <span className="todo-sub">{steps[nextIdx].sub}</span>
            <span className="todo-go">→</span>
          </a>
        </div>
      ) : <div className="todo-steps"><div className="todo-sub" style={{ padding: '4px 2px' }}>오늘 할 일을 모두 마쳤어요 ✓</div></div>}
      </>}

      <div className="detail-section">📊 {cw.label} 핵심 지표 <small className="muted" style={{ fontWeight: 400 }}>{periodNote}</small></div>
      <div className="grid grid-kpi">
        <Kpi label="주문건" value={s.orders.toLocaleString()} sub={<Delta cur={s.orders} prev={p.orders} higherIsGood count vs={vsLabel} />} />
        <Kpi label="반품·교환율" value={pct(returnsExchanges(s), s.orders)} sub={<Delta cur={ratio(returnsExchanges(s), s.orders)} prev={ratio(returnsExchanges(p), p.orders)} vs={vsLabel} />} />
        <Kpi label="과실률" value={pct(faults(s), s.orders)} sub={<Delta cur={ratio(faults(s), s.orders)} prev={ratio(faults(p), p.orders)} vs={vsLabel} />} />
        <Kpi label="부정 리뷰율" value={pct(s.reviews_negative, s.reviews_total)} sub={<Delta cur={ratio(s.reviews_negative, s.reviews_total)} prev={ratio(p.reviews_negative, p.reviews_total)} vs={vsLabel} />} />
      </div>

      <div className="grid home-bottom">
        <ComboChart title={`${brand} 주간 주문건 · 반품교환율 (최근 5주)`} color={BRAND_COLOR[brand]}
          items={weeks.map(w => ({ label: `${w.label}~`, bar: w.s.orders, line: ratio(returnsExchanges(w.s), w.s.orders) }))} />
        <div className="card">
          <div className="card-title">과실 VOC 사유 <small>최근 30일 · {faults30.length}건 {link('report')}</small></div>
          {/* 막대를 누르면 그 사유의 과실 VOC 목록으로 ((미입력) 포함) */}
          <Bars items={countBy(faults30, x => x.reason_category).slice(0, 6)} color="var(--danger)" empty="최근 30일 과실 VOC가 없어요"
            onPick={(label) => { location.hash = `#/voc-list?${new URLSearchParams({ brand, from: since30, fault: '1', reason: label }).toString()}`; }} />
        </div>
        <div className="card">
          <div className="card-title">재입고 문의 많은 상품 <small>최근 90일 · 리오더 검토{unlinkedRestock ? ` · 상품 못 찾은 ${unlinkedRestock}건 제외` : ''} {link('board')}</small></div>
          <Bars items={restockRanking(bd, productById).slice(0, 6).map(x => ({ label: x.name, count: x.count }))} color="var(--warn)" wide empty="최근 90일 재입고 문의가 없어요 (게시판 파일을 올리면 보여요)" />
        </div>
      </div>
    </>
  );
}

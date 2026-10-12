// 로그인 · 메뉴 · 화면 전환

// 메뉴 단순화 (2026-10-12 사용자 승인): 매일 쓰는 것만 위에, 비슷한 화면은 한 메뉴 + 위쪽 탭으로, 가끔 쓰는 건 '더보기'에 접어 둠.
// 화면 주소(#/report 등)는 그대로라 예전 링크·회의록 링크도 그대로 열림.
const HUBS = {
  preorder: { label: '예약배송 관리', icon: '📦', tabs: [['preorder', '📦 예약배송 관리'], ['hold-sheet', '📊 예약배송 상품 현황']] },
  analysis: { label: '분석', icon: '📊', tabs: [['report', '📉 VOC 현황'], ['returns', '↩️ 반품·교환'], ['reviews', '💬 리뷰'], ['board', '🔎 게시판']] },
  reports: { label: '보고 · 회의', icon: '📈', tabs: [['monthly', '📈 보고서 (주간·월간)'], ['meetings', '📒 CX 미팅 로그'], ['kpi', '🎯 KPI']] },
};
// 👀 보기 모드 (대표님·MD용, PC별 기억 localStorage 'viewMode', 2026-10-12): 입력·업로드·예약배송·기준 관리 메뉴를 숨기고
//   메인의 '오늘 할 일'(팀 아침 루틴)도 숨김. 보안 기능은 아님 — 주소로 들어가면 화면은 그대로 열림, 누구나 다시 끌 수 있음
const VIEW_HIDDEN = ['upload', 'daily', 'voc-new', 'preorder', 'codes', 'tasks'];
const readViewMode = () => { try { return localStorage.getItem('viewMode') === '1'; } catch { return false; } };
const hubOf = (route) => Object.keys(HUBS).find(h => HUBS[h].tabs.some(([k]) => k === route));
const NAV = [
  { group: '', items: [
    { key: 'home', label: '메인 요약', icon: '🏠' },
  ] },
  { group: '📅 매일 하는 일', items: [
    { key: 'upload', label: '데이터 업로드', icon: '📤' },
    { key: 'daily', label: 'CS 데일리', icon: '🗓️' },
    { key: 'voc-new', label: 'VOC 접수', icon: '📝' },
    { key: 'voc-list', label: 'VOC 목록', icon: '📋' },
    { key: 'review-list', label: '리뷰 목록', icon: '💬' },
    { key: 'preorder', hub: 'preorder' },
    // 예전 주소(#/upload-reviews 등)로 들어와도 데이터 업로드 화면으로 (메뉴에는 안 보임)
    { key: 'upload-reviews', label: '데이터 업로드', hidden: true },
    { key: 'upload-board', label: '데이터 업로드', hidden: true },
    { key: 'upload-orders', label: '데이터 업로드', hidden: true },
  ] },
  { group: '📊 분석 · 보고', items: [
    { key: 'report', hub: 'analysis' },
    { key: 'monthly', hub: 'reports' },
    // CX 응대 주의사항은 업무 매뉴얼의 '응대 주의사항' 분류로 합침 (2026-10-12), 예전 주소 #/guides도 매뉴얼로
    { key: 'manuals', label: '업무 매뉴얼', icon: '📚' },
    { key: 'guides', label: '업무 매뉴얼', hidden: true },
  ] },
  { group: '더보기', more: true, items: [
    { key: 'calendar', label: '팀 캘린더', icon: '📅' },
    // 업무 보드는 거의 안 써서 메뉴에서 숨김 (2026-10-12). 주소 #/tasks·캘린더 마감일 링크로는 열림
    { key: 'tasks', label: '업무 보드', icon: '📌', hidden: true },
    { key: 'plan', label: '전사플랜', icon: '🗓️' },
    // 다른 대시보드는 새 창으로만 연결 (그쪽은 수정하지 않음)
    { key: 'ext-1inahundred', label: '원인어헌드레드 대시보드', icon: '🔗', href: 'https://1inahundred.netlify.app/' },
    { key: 'codes', label: '기준 관리', icon: '🧩' },
  ] },
];
// 화면 주소 목록 = 메뉴 + 탭 안의 화면들
const ALL_NAV = [...NAV.flatMap(g => g.items).filter(n => !n.hub),
  ...Object.values(HUBS).flatMap(h => h.tabs.map(([key, label]) => ({ key, label: label.replace(/^\S+\s/, '') })))];

// 탭으로 묶인 화면 위에 보이는 탭 (마지막으로 본 탭은 이 PC에 기억 → 메뉴를 누르면 그 탭으로)
function HubTabs({ hub, route, go }) {
  return (
    <div className="hub-tabs">
      {HUBS[hub].tabs.map(([key, label]) => (
        <button key={key} className={`hub-tab${route === key ? ' active' : ''}`} onClick={() => go(key)}>{label}</button>
      ))}
    </div>
  );
}
const lastTab = (hub) => { try { const k = localStorage.getItem('hub:' + hub); return HUBS[hub].tabs.some(([t]) => t === k) ? k : HUBS[hub].tabs[0][0]; } catch { return HUBS[hub].tabs[0][0]; } };

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(error.message.includes('Invalid login') ? '이메일 또는 비밀번호가 맞지 않아요.' : error.message);
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>FINCA·HaTA CX 대시보드</h1>
        <p>등록된 직원 계정으로 로그인하세요</p>
        <div className="field"><label>이메일</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" /></div>
        <div className="field"><label>비밀번호</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? '로그인 중...' : '로그인'}</button>
        {error && <div className="login-error">{error}</div>}
      </form>
    </div>
  );
}


function currentRoute() {
  const key = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];   // #/meetings/12 · #/review-list?theme=.. 처럼 뒤에 붙은 건 화면 안에서 씀
  return ALL_NAV.some(n => n.key === key) ? key : 'home';
}

function Shell({ session }) {
  const data = useAppData(session);
  const [route, setRoute] = useState(currentRoute);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHash = () => { setRoute(currentRoute()); setMenuOpen(false); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (key) => { location.hash = `/${key}`; };
  const hub = hubOf(route);
  useEffect(() => { if (hub) try { localStorage.setItem('hub:' + hub, route); } catch {} }, [route]);
  // 더보기: 접어 두고, 그 안의 화면을 보고 있으면 펼침
  const [moreOpen, setMoreOpen] = useState(() => { try { return localStorage.getItem('navMore') === '1'; } catch { return false; } });
  const [viewMode, setViewMode] = useState(readViewMode);
  const toggleViewMode = () => setViewMode(v => { try { localStorage.setItem('viewMode', v ? '0' : '1'); } catch {} return !v; });
  const toggleMore = () => setMoreOpen(v => { try { localStorage.setItem('navMore', v ? '0' : '1'); } catch {} return !v; });

  let page;
  if (!data.ready) page = <div className="loading-screen">데이터 불러오는 중...</div>;
  else if (data.loadError) page = (
    <div className="card" style={{ color: 'var(--danger)' }}>
      데이터를 불러오지 못했어요: {data.loadError}
      <div className="hint">
        {/JWT/i.test(data.loadError)
          ? '로그인 정보 확인이 잠깐 어긋났어요. 새로고침하면 대부분 해결돼요. 계속되면 로그아웃 후 다시 로그인하거나, PC 시계가 맞는지 확인해 주세요.'
          : '잠시 후 새로고침해 보세요. 계속되면 인터넷 연결이나 DB 설정을 확인해 주세요.'}
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => location.reload()}>🔄 새로고침</button>
    </div>
  );
  else page = {
    home: <HomePage />,
    monthly: <ReportsPage />,
    report: <ReportPage go={go} />,
    daily: <DailyEntryPage />,
    preorder: <PreorderPage />,
    meetings: <MeetingsPage />,
    kpi: <KpiPage />,
    tasks: <TasksPage />,
    calendar: <CalendarPage />,
    plan: <PlanPage />,
    'hold-sheet': <HoldSheetPage />,
    returns: <ReturnsPage />,
    upload: <DataUploadPage />,
    'upload-reviews': <DataUploadPage />,
    reviews: <ReviewAnalysisPage />,
    'review-list': <ReviewListPage key={location.hash} />,
    'upload-board': <DataUploadPage />,
    'upload-orders': <DataUploadPage />,
    board: <BoardAnalysisPage />,
    'voc-new': <VocEntryPage />,
    'voc-list': <VocListPage />,
    codes: <CodesPage />,
    guides: <ManualsPage />,
    manuals: <ManualsPage />,
  }[route];


  return (
    <AppContext.Provider value={{ ...data, viewMode }}>
      <div className="mobile-bar">
        <button onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">☰</button>
        FINCA·HaTA CX
      </div>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <div className="layout">
        <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
          {/* 로고 = 새로고침 (배포 직후 최신 화면 받기). 입력 중이던 내용이 사라질 수 있어 한 번 묻고, 메인으로 이동 */}
          <a className="sidebar-brand" href="#/home" title="눌러서 새로고침 (최신 화면)"
            onClick={e => { e.preventDefault(); if (confirm('새로고침할까요?\n저장하지 않은 입력은 사라져요.')) { location.hash = '#/home'; location.reload(); } }}>
            FINCA·HaTA CX<small>CX 운영 대시보드 · 🔄 새로고침</small></a>
          {viewMode && <div className="view-mode-badge">👀 보기 모드 <small>입력 메뉴 숨김</small></div>}
          {NAV.map(g => {
            const items = g.items.filter(item => !item.hidden && !(viewMode && VIEW_HIDDEN.includes(item.key)));
            if (!items.length) return null;
            const title = viewMode && g.group === '📅 매일 하는 일' ? '📋 목록' : g.group;
            const open = !g.more || moreOpen || g.items.some(i => i.key === route);
            return (
            <div className="nav-group" key={g.group}>
              {g.more ? <button className="nav-group-title nav-more" onClick={toggleMore}>{open ? '▾' : '▸'} {g.group}</button>
                : title && <div className="nav-group-title">{title}</div>}
              {open && items.map(item => item.hub ? (
                <button key={item.key} className={`nav-item${hub === item.hub ? ' active' : ''}`} onClick={() => go(lastTab(item.hub))}>
                  <span>{HUBS[item.hub].icon}</span>{HUBS[item.hub].label}
                </button>
              ) : item.href ? (
                <a key={item.key} className="nav-item" href={item.href} target="_blank" rel="noopener noreferrer" title="새 창으로 열려요">
                  <span>{item.icon}</span>{item.label}<span style={{ marginLeft: 'auto', opacity: 0.6 }}>↗</span>
                </a>
              ) : (
                <button key={item.key} className={`nav-item${route === item.key ? ' active' : ''}`} onClick={() => go(item.key)}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            );
          })}
          <div className="sidebar-footer">
            <button className="view-mode-toggle" onClick={toggleViewMode} title="대표님·MD처럼 보기만 하는 분용 · 이 PC에 기억돼요">{viewMode ? '✏️ 보기 모드 끄기' : '👀 보기 모드 켜기'}</button>
            <div className="email">{session.user.email}</div>
            <button onClick={() => db.auth.signOut()}>로그아웃</button>
          </div>
        </aside>
        <main className="main">{hub && data.ready && !data.loadError && <HubTabs hub={hub} route={route} go={go} />}{page}</main>
      </div>
    </AppContext.Provider>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="loading-screen">불러오는 중...</div>;
  return <ToastHost>{session ? <Shell key={session.user.id} session={session} /> : <LoginPage />}</ToastHost>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

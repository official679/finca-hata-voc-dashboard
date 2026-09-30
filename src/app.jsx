// 로그인 · 메뉴 · 화면 전환

// 하는 일 기준으로 묶음: 매일 하는 일 → VOC·리뷰 → 보고·회의 → 팀 → 기준·매뉴얼
const NAV = [
  { group: '', items: [
    { key: 'home', label: '메인 요약', icon: '🏠' },
  ] },
  { group: '📅 매일 하는 일', items: [
    { key: 'upload', label: '데이터 업로드', icon: '📤' },
    { key: 'daily', label: 'CS 데일리', icon: '🗓️' },
    { key: 'voc-new', label: 'VOC 접수', icon: '📝' },
    { key: 'preorder', label: '예약배송 관리', icon: '📦' },
    { key: 'hold-sheet', label: '예약배송 상품 현황', icon: '📊' },
    // 예전 주소(#/upload-reviews 등)로 들어와도 데이터 업로드 화면으로 (메뉴에는 안 보임)
    { key: 'upload-reviews', label: '데이터 업로드', hidden: true },
    { key: 'upload-board', label: '데이터 업로드', hidden: true },
    { key: 'upload-orders', label: '데이터 업로드', hidden: true },
  ] },
  { group: '🔍 VOC · 리뷰', items: [
    { key: 'voc-list', label: 'VOC 목록', icon: '📋' },
    { key: 'report', label: 'VOC 현황', icon: '📉' },
    { key: 'returns', label: '반품·교환 분석', icon: '↩️' },
    { key: 'review-list', label: '리뷰 목록', icon: '💬' },
    { key: 'reviews', label: '리뷰 분석', icon: '📊' },
    { key: 'board', label: '게시판 분석', icon: '🔎' },
  ] },
  { group: '📊 보고 · 회의', items: [
    { key: 'monthly', label: '보고서 (주간·월간)', icon: '📈' },
    { key: 'kpi', label: 'KPI', icon: '🎯' },
    { key: 'meetings', label: 'CX 미팅 로그', icon: '📒' },
  ] },
  { group: '👥 팀', items: [
    { key: 'tasks', label: '업무 보드', icon: '📌' },
    { key: 'calendar', label: '팀 캘린더', icon: '📅' },
    { key: 'plan', label: '전사플랜', icon: '🗓️' },
    // 다른 대시보드는 새 창으로만 연결 (그쪽은 수정하지 않음)
    { key: 'ext-1inahundred', label: '원인어헌드레드 대시보드', icon: '🔗', href: 'https://1inahundred.netlify.app/' },
  ] },
  { group: '⚙️ 기준 · 매뉴얼', items: [
    { key: 'manuals', label: '업무 매뉴얼', icon: '📚' },
    { key: 'guides', label: 'CX 응대 주의사항', icon: '⚠️' },
    { key: 'codes', label: '기준 관리', icon: '🧩' },
  ] },
];
const ALL_NAV = NAV.flatMap(g => g.items);

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

const SOON_PAGES = {
};

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
  else if (SOON_PAGES[route]) page = <><PageHeader title={ALL_NAV.find(n => n.key === route).label} /><ComingSoon {...SOON_PAGES[route]} /></>;
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
    actions: <ActionsPage />,
    'voc-new': <VocEntryPage />,
    'voc-list': <VocListPage />,
    codes: <CodesPage />,
    guides: <GuidesPage />,
    manuals: <ManualsPage />,
  }[route];

  const pendingActions = data.cases.filter(c => c.action_required && !c.action_done).length;

  return (
    <AppContext.Provider value={data}>
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
          {NAV.map(g => (
            <div className="nav-group" key={g.group}>
              {g.group && <div className="nav-group-title">{g.group}</div>}
              {g.items.filter(item => !item.hidden).map(item => item.href ? (
                <a key={item.key} className="nav-item" href={item.href} target="_blank" rel="noopener noreferrer" title="새 창으로 열려요">
                  <span>{item.icon}</span>{item.label}<span style={{ marginLeft: 'auto', opacity: 0.6 }}>↗</span>
                </a>
              ) : (
                <button key={item.key} className={`nav-item${route === item.key ? ' active' : ''}`} onClick={() => go(item.key)}>
                  <span>{item.icon}</span>{item.label}
                  {item.soon && <span className="badge-soon">{item.soon}</span>}
                  {item.key === 'actions' && pendingActions > 0 && <span className="badge-soon" style={{ background: 'var(--accent)', color: '#fff' }}>{pendingActions}</span>}
                </button>
              ))}
            </div>
          ))}
          <div className="sidebar-footer">
            <div className="email">{session.user.email}</div>
            <button onClick={() => db.auth.signOut()}>로그아웃</button>
          </div>
        </aside>
        <main className="main">{page}</main>
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

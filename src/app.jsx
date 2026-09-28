// 로그인 · 메뉴 · 화면 전환

const NAV = [
  { group: '📊 한눈에 보기', items: [
    { key: 'home', label: '메인 요약', icon: '🏠' },
    { key: 'monthly', label: '보고서 (주간·월간)', icon: '📈' },
    { key: 'report', label: 'VOC 현황', icon: '📉' },
  ] },
  { group: '🔍 조회·분석', items: [
    { key: 'voc-list', label: 'VOC 목록', icon: '📋' },
    { key: 'reviews', label: '리뷰 분석', icon: '📊' },
    { key: 'board', label: '게시판 분석', icon: '🔎' },
  ] },
  { group: '✏️ 입력·업로드', items: [
    { key: 'daily', label: 'CS 데일리', icon: '🗓️' },
    { key: 'voc-new', label: 'VOC 접수', icon: '📝' },
    { key: 'upload-reviews', label: '리뷰 업로드', icon: '⭐' },
    { key: 'upload-board', label: '게시판 업로드', icon: '💬' },
  ] },
  { group: '⚙️ 기준·매뉴얼', items: [
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
  const key = location.hash.replace(/^#\/?/, '');
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
      <div className="hint">DB 설정 SQL(01_phase1_schema.sql)을 실행했는지 확인해 주세요.</div>
    </div>
  );
  else if (SOON_PAGES[route]) page = <><PageHeader title={ALL_NAV.find(n => n.key === route).label} /><ComingSoon {...SOON_PAGES[route]} /></>;
  else page = {
    home: <HomePage />,
    monthly: <ReportsPage />,
    report: <ReportPage go={go} />,
    daily: <DailyEntryPage />,
    'upload-reviews': <ReviewUploadPage />,
    reviews: <ReviewAnalysisPage />,
    'upload-board': <BoardUploadPage />,
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
          <a className="sidebar-brand" href="#/home" title="메인으로">FINCA·HaTA CX<small>VOC · 리뷰 · 게시판 관리</small></a>
          {NAV.map(g => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-title">{g.group}</div>
              {g.items.map(item => (
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

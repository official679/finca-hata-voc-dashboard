// 로그인 · 메뉴 · 화면 전환

const NAV = [
  { group: '📊 한눈에 보기', items: [
    { key: 'monthly', label: '월간 보고', icon: '📈' },
    { key: 'report', label: 'VOC 현황', icon: '📉' },
    { key: 'actions', label: '후속 조치 보드', icon: '🎯' },
  ] },
  { group: '✏️ 입력', items: [
    { key: 'daily', label: 'CS 데일리', icon: '🗓️' },
    { key: 'voc-new', label: 'VOC 접수', icon: '📝' },
  ] },
  { group: '📥 데이터 업로드', items: [
    { key: 'upload-reviews', label: '리뷰 업로드', icon: '⭐', soon: '준비중' },
    { key: 'upload-board', label: '게시판 업로드', icon: '💬', soon: '준비중' },
  ] },
  { group: '🔍 조회·분석', items: [
    { key: 'voc-list', label: 'VOC 목록', icon: '📋' },
    { key: 'reviews', label: '리뷰 분석', icon: '📊', soon: '준비중' },
    { key: 'board', label: '게시판 분석', icon: '🔎', soon: '준비중' },
  ] },
  { group: '⚙️ 기준 관리', items: [
    { key: 'codes', label: '기준 관리', icon: '🧩' },
    { key: 'guides', label: 'CX 응대 주의사항', icon: '⚠️' },
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
  'upload-reviews': { icon: '⭐', title: '리뷰 업로드는 곧 열려요', desc: '플랫폼에서 받은 리뷰 파일을 올리면 긍정·부정이 자동 분류돼요.', items: ['별점 기준 긍정·부정 분류', '상품 마스터 자동 연결', '기존 리뷰 약 8,500건 이관'] },
  'upload-board': { icon: '💬', title: '게시판 업로드는 곧 열려요', desc: '29CM·무신사·자사몰 게시판 파일을 그대로 올리면 문의 유형이 자동 분류돼요.', items: ['재입고 · 배송 · 교환/반품 · 사이즈/상품정보 등 자동 분류', '상반기 핀카 게시판 분석 결과: 재입고 문의가 전체의 약 29%', '재입고 문의 많은 상품 → 후속 조치 보드 리오더 검토로 연결'] },
  reviews: { icon: '📊', title: '리뷰 분석은 곧 열려요', desc: '긍정·부정 리뷰 비중, 많이 나온 코멘트 키워드, 상품별 평점을 보여줘요.' },
  board: { icon: '🔎', title: '게시판 분석은 곧 열려요', desc: '문의 유형 비중과 재입고 문의가 많은 상품 순위를 보여줘요.' },
};

function currentRoute() {
  const key = location.hash.replace(/^#\/?/, '');
  return ALL_NAV.some(n => n.key === key) ? key : 'monthly';
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
    monthly: <MonthlyReportPage />,
    report: <ReportPage go={go} />,
    daily: <DailyEntryPage />,
    actions: <ActionsPage />,
    'voc-new': <VocEntryPage />,
    'voc-list': <VocListPage />,
    codes: <CodesPage />,
    guides: <GuidesPage />,
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
          <div className="sidebar-brand">FINCA·HaTA CX<small>VOC · 리뷰 · 게시판 관리</small></div>
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

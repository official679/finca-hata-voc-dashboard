// 전사플랜: 그로스본부 통합시트의 '2026 전사플랜' 탭 하나만 대시보드 안에 띄움 (시트를 고치면 바로 반영)
// 시트 주소는 코드(공개 저장소)에 넣지 않고 DB(code_items, group 'embed_plan')에 저장. 보려면 시트 권한이 있는 구글 계정 로그인 필요

const PLAN_GROUP = 'embed_plan';

function parseSheetUrl(url) {
  const id = (String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  const gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return id ? { id, gid } : null;
}

function PlanPage() {
  const { codes, loadCodes } = useApp();
  const toast = useToast();
  const item = (codes || []).find(c => c.group_key === PLAN_GROUP);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const sheet = item ? parseSheetUrl(item.label) : null;

  const save = async () => {
    const s = parseSheetUrl(draft.trim());
    if (!s) { toast('❌ 구글 시트 주소가 아니에요. 전사플랜 탭을 연 상태의 주소를 복사해 주세요', 'err'); return; }
    const url = `https://docs.google.com/spreadsheets/d/${s.id}/edit?gid=${s.gid}#gid=${s.gid}`;
    const { error } = item
      ? await db.from('code_items').update({ label: url }).eq('id', item.id)
      : await db.from('code_items').insert({ group_key: PLAN_GROUP, label: url, sort_order: 1 });
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    await loadCodes();
    setEditing(false); setDraft('');
    toast('✅ 전사플랜 시트를 연결했어요');
  };

  if (!sheet || editing) return (
    <>
      <PageHeader title="전사플랜" desc="그로스본부 통합시트의 '2026 전사플랜' 탭을 대시보드에서 바로 봐요" />
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-title">시트 연결하기 <small>처음 한 번만</small></div>
        <ol style={{ lineHeight: 1.9, paddingLeft: 20, marginBottom: 12 }}>
          <li>구글 시트에서 <b>2026 전사플랜</b> 탭을 눌러 연 다음</li>
          <li>브라우저 주소창의 주소를 전체 복사해서 아래에 붙여넣고 <b>연결</b>을 눌러주세요</li>
        </ol>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" style={{ flex: 1 }} value={draft} onChange={e => setDraft(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..." />
          <button className="btn btn-primary" onClick={save}>연결</button>
          {editing && <button className="btn" onClick={() => setEditing(false)}>취소</button>}
        </div>
        <div className="hint" style={{ marginTop: 10 }}>주소는 로그인한 직원만 볼 수 있는 대시보드 DB에 저장돼요. 시트 내용을 복사해 오지 않아서, 시트를 고치면 여기에도 바로 반영돼요.</div>
      </div>
    </>
  );

  const view = `https://docs.google.com/spreadsheets/d/${sheet.id}/htmlview?gid=${sheet.gid}&single=true&widget=false&headers=false&chrome=false&rm=minimal`;
  const open = `https://docs.google.com/spreadsheets/d/${sheet.id}/edit?gid=${sheet.gid}#gid=${sheet.gid}`;
  return (
    <>
      <PageHeader title="전사플랜" desc="그로스본부 통합시트 · 2026 전사플랜 탭 (시트를 고치면 바로 반영돼요)">
        <a className="btn btn-primary" href={open} target="_blank" rel="noopener noreferrer">↗ 구글 시트에서 열기</a>
        <button className="btn" onClick={() => { setDraft(item.label); setEditing(true); }}>링크 바꾸기</button>
      </PageHeader>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <iframe title="2026 전사플랜" src={view} className="plan-frame" />
      </div>
      <div className="hint" style={{ marginTop: 8 }}>안 보이면: 이 시트 권한이 있는 구글 계정으로 로그인돼 있는지 확인하거나 <b>↗ 구글 시트에서 열기</b>를 눌러주세요.</div>
    </>
  );
}

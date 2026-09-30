// 구글 시트 탭 하나를 대시보드 안에 띄움 (시트를 고치면 바로 반영): 전사플랜 · 예약배송 상품 현황
// 시트 주소는 코드(공개 저장소)에 넣지 않고 DB(code_items, group 'embed_plan' 등)에 저장. 보려면 시트 권한이 있는 구글 계정 로그인 필요

const PLAN_GROUP = 'embed_plan';

function parseSheetUrl(url) {
  const id = (String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  const gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1] || '0';
  return id ? { id, gid } : null;
}

// group: code_items 그룹 · title/desc: 화면 제목 · tabName: 연결 안내에 쓰는 탭 이름 · zoomKey: 이 PC에 배율 기억
function SheetEmbedPage({ group, title, desc, tabName, zoomKey }) {
  const { codes, loadCodes } = useApp();
  const toast = useToast();
  const item = (codes || []).find(c => c.group_key === group);
  const [editing, setEditing] = useState(false);
  // 시트 확대·축소 (구글 시트 안 배율은 못 바꿔서 틀 전체를 줄이거나 키움) · 이 PC에 기억
  const [zoom, setZoomState] = useState(() => { try { return Number(localStorage.getItem(zoomKey)) || 1; } catch { return 1; } });
  const setZoom = (z) => { const v = Math.min(1.5, Math.max(0.5, Math.round(z * 10) / 10)); setZoomState(v); try { localStorage.setItem(zoomKey, String(v)); } catch {} };
  const [draft, setDraft] = useState('');
  const [reload, setReload] = useState(0);   // 🔄 새로고침: 시트 부분만 다시 불러옴
  const sheet = item ? parseSheetUrl(item.label) : null;

  const save = async () => {
    const s = parseSheetUrl(draft.trim());
    if (!s) { toast(`❌ 구글 시트 주소가 아니에요. ${tabName} 탭을 연 상태의 주소를 복사해 주세요`, 'err'); return; }
    const url = `https://docs.google.com/spreadsheets/d/${s.id}/edit?gid=${s.gid}#gid=${s.gid}`;
    const { error } = item
      ? await db.from('code_items').update({ label: url }).eq('id', item.id)
      : await db.from('code_items').insert({ group_key: group, label: url, sort_order: 1 });
    if (error) { toast('❌ 저장 실패: ' + error.message, 'err'); return; }
    await loadCodes();
    setEditing(false); setDraft('');
    toast(`✅ ${title} 시트를 연결했어요`);
  };

  if (!sheet || editing) return (
    <>
      <PageHeader title={title} desc={desc} />
      <div className="card" style={{ maxWidth: 720 }}>
        <div className="card-title">시트 연결하기 <small>처음 한 번만</small></div>
        <ol style={{ lineHeight: 1.9, paddingLeft: 20, marginBottom: 12 }}>
          <li>구글 시트에서 <b>{tabName}</b> 탭을 눌러 연 다음</li>
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

  const view = `https://docs.google.com/spreadsheets/d/${sheet.id}/htmlview?gid=${sheet.gid}&single=true&widget=false&headers=false&chrome=false&rm=minimal${reload ? `&_=${reload}` : ''}`;
  const open = `https://docs.google.com/spreadsheets/d/${sheet.id}/edit?gid=${sheet.gid}#gid=${sheet.gid}`;
  return (
    <>
      <PageHeader title={title} desc={desc}>
        <span className="zoom-ctl">
          <button className="btn btn-sm" onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= 0.5} title="작게">−</button>
          <button className="btn btn-sm" onClick={() => setZoom(1)} title="100%로">{Math.round(zoom * 100)}%</button>
          <button className="btn btn-sm" onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= 1.5} title="크게">+</button>
        </span>
        <button className="btn" onClick={() => setReload(Date.now())} title="시트 부분만 다시 불러와요">🔄 새로고침</button>
        <a className="btn btn-primary" href={open} target="_blank" rel="noopener noreferrer">↗ 구글 시트에서 열기</a>
        <button className="btn" onClick={() => { setDraft(item.label); setEditing(true); }}>링크 바꾸기</button>
      </PageHeader>
      <div className="card plan-box" style={{ padding: 0, overflow: 'hidden' }}>
        {/* 배율만큼 틀을 크게 만든 뒤 줄여서, 줄였을 때 더 많은 칸이 보이게 */}
        <iframe key={reload} title={title} src={view} className="plan-frame"
          style={{ width: `${100 / zoom}%`, height: `calc((100vh - 190px) / ${zoom})`, transform: `scale(${zoom})`, transformOrigin: '0 0' }} />
      </div>
      <div className="hint" style={{ marginTop: 8 }}>안 보이면: 이 시트 권한이 있는 구글 계정으로 로그인돼 있는지 확인하거나 <b>↗ 구글 시트에서 열기</b>를 눌러주세요. 수정은 구글 시트에서 해 주세요.</div>
    </>
  );
}

function PlanPage() {
  return <SheetEmbedPage group={PLAN_GROUP} title="전사플랜" tabName="2026 전사플랜" zoomKey="planZoom"
    desc="그로스본부 통합시트 · 2026 전사플랜 탭 (시트를 고치면 바로 반영돼요)" />;
}

// 예약배송 상품 현황 = 예약배송현황_발송 보류 건(FINCA&HaTA) 시트 (고객 정보가 있어 대시보드 DB로 옮기지 않고 시트를 그대로 보여줌)
function HoldSheetPage() {
  return <SheetEmbedPage group="embed_hold" title="예약배송 상품 현황" tabName="보고 싶은" zoomKey="holdZoom"
    desc="예약배송현황_발송 보류 건(FINCA&HaTA) 시트 (시트를 고치면 바로 반영돼요)" />;
}

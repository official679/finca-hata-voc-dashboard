// 기준 관리 (CX 응대 주의사항은 2026-10-12 업무 매뉴얼로 합침 · cx_guides 표는 백업용으로 남김)

function CodeGroupEditor({ group }) {
  const { codes, loadCodes, cases, setCases, daily, setDaily, loadDaily } = useApp();
  const toast = useToast();
  const items = codes.filter(c => c.group_key === group.key);
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');

  // 이 기준을 쓰는 데이터: VOC(기본) 또는 CS 데일리
  const table = group.table || 'voc_cases';
  useEffect(() => { if (table === 'cs_daily' && !daily) loadDaily(); }, [table, daily, loadDaily]);
  // table: 'none' = 목록만 관리 (예약배송 사은품처럼 이름을 바꿔도 지난 기록은 그대로 두는 것)
  const rows = table === 'cs_daily' ? (daily || []) : table === 'voc_cases' ? cases : [];
  const setRows = table === 'cs_daily' ? setDaily : table === 'voc_cases' ? setCases : () => {};
  const matches = (r) => Object.entries(group.match || {}).every(([k, v]) => r[k] === v);
  const usage = (label) => rows.filter(r => r[group.column] === label && matches(r)).length;

  const run = async (promise, okMsg) => {
    const { error } = await promise;
    if (error) { toast('❌ ' + error.message, 'err'); return false; }
    await loadCodes();
    if (okMsg) toast(okMsg);
    return true;
  };

  const add = async () => {
    const label = newLabel.trim();
    if (!label) return;
    if (items.some(i => i.label === label)) { toast('❌ 이미 있는 항목이에요', 'err'); return; }
    const maxOrder = Math.max(0, ...items.map(i => i.sort_order));
    if (await run(db.from('code_items').insert({ group_key: group.key, label, sort_order: maxOrder + 1 }), `✅ '${label}' 추가`)) setNewLabel('');
  };

  const rename = async (item) => {
    const label = editLabel.trim();
    if (!label || label === item.label) { setEditingId(null); return; }
    if (items.some(i => i.label === label)) { toast('❌ 이미 있는 항목이에요', 'err'); return; }
    const n = usage(item.label);
    if (n && !confirm(`'${item.label}'로 저장된 데이터 ${n}건도 '${label}'(으)로 함께 바뀌어요. 진행할까요?`)) return;
    if (!(await run(db.from('code_items').update({ label }).eq('id', item.id)))) return;
    if (n) {
      let q = db.from(table).update({ [group.column]: label }).eq(group.column, item.label);
      Object.entries(group.match || {}).forEach(([k, v]) => { q = q.eq(k, v); });
      const { error } = await q;
      if (error) { toast('❌ 기존 데이터 변경 실패: ' + error.message, 'err'); return; }
      setRows(prev => prev.map(r => r[group.column] === item.label && matches(r) ? { ...r, [group.column]: label } : r));
    }
    setEditingId(null);
    toast('✅ 이름을 바꿨어요');
  };

  const move = async (idx, dir) => {
    const a = items[idx], b = items[idx + dir];
    if (!b) return;
    // 순서 값이 같을 수 있으므로 위치 기준으로 다시 매김
    const reordered = [...items];
    reordered[idx] = b; reordered[idx + dir] = a;
    await run(Promise.all(reordered.map((it, i) => db.from('code_items').update({ sort_order: i + 1 }).eq('id', it.id)))
      .then(rs => rs.find(r => r.error) || { error: null }));
  };

  const remove = async (item) => {
    if (usage(item.label)) return;
    if (!confirm(`'${item.label}' 항목을 삭제할까요?`)) return;
    await run(db.from('code_items').delete().eq('id', item.id), '삭제했어요');
  };

  return (
    <div className="card">
      <div className="card-title">{group.label} <small>숨긴 항목은 새 입력 목록에만 안 보이고, 기존 데이터는 그대로예요</small></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th style={{ width: 70 }}>순서</th><th>항목</th><th className="num">{table === 'cs_daily' ? '사용 데일리' : '사용 VOC'}</th><th>상태</th><th /></tr></thead>
          <tbody>
            {items.map((it, i) => {
              const n = usage(it.label);
              return (
                <tr key={it.id}>
                  <td>
                    <button className="btn-link" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>{' '}
                    <button className="btn-link" disabled={i === items.length - 1} onClick={() => move(i, 1)}>▼</button>
                  </td>
                  <td>
                    {editingId === it.id ? (
                      <span style={{ display: 'flex', gap: 6 }}>
                        <input className="input" value={editLabel} autoFocus onChange={e => setEditLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') rename(it); if (e.key === 'Escape') setEditingId(null); }} />
                        <button className="btn btn-sm btn-primary" onClick={() => rename(it)}>저장</button>
                        <button className="btn btn-sm" onClick={() => setEditingId(null)}>취소</button>
                      </span>
                    ) : <span style={{ opacity: it.active ? 1 : 0.5 }}>{it.label}</span>}
                  </td>
                  <td className="num">{n}</td>
                  <td>{it.active ? <span className="chip chip-green">사용</span> : <span className="chip">숨김</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-sm" onClick={() => { setEditingId(it.id); setEditLabel(it.label); }}>이름 변경</button>{' '}
                    <button className="btn btn-sm" style={{ minWidth: 76 }} onClick={() => run(db.from('code_items').update({ active: !it.active }).eq('id', it.id))}>{it.active ? '숨기기' : '다시 사용'}</button>{' '}
                    <button className="btn btn-sm btn-danger" disabled={n > 0} title={n > 0 ? '사용 중인 항목은 삭제 대신 숨기기를 사용하세요' : ''} onClick={() => remove(it)}>삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <input className="input" style={{ maxWidth: 320 }} value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder={`새 ${group.label} 항목`} />
        <button className="btn btn-primary" onClick={add}>추가</button>
      </div>
    </div>
  );
}

function CodesPage() {
  const [groupKey, setGroupKey] = useState(CODE_GROUPS[0].key);
  const group = CODE_GROUPS.find(g => g.key === groupKey);
  return (
    <>
      <PageHeader title="기준 관리" desc="VOC 구분, 사유 카테고리 등 입력 목록을 코드 수정 없이 바꿀 수 있어요." />
      <div style={{ marginBottom: 16, overflowX: 'auto' }}>
        <Segmented options={CODE_GROUPS.map(g => ({ key: g.key, label: g.label }))} value={groupKey} onChange={setGroupKey} />
      </div>
      <CodeGroupEditor key={groupKey} group={group} />
    </>
  );
}

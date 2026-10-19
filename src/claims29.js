// 29CM 반품·교환 정리 버튼 (즐겨찾기 버튼으로 29CM 파트너 어드민 반품/교환 목록 화면에서 실행, 2026-10-19 사용자 요청)
// - 목록의 CS 접수번호를 하나씩 열어 상품명·옵션·수량·접수 내용을 모으고, 대시보드 '29CM 반품/교환 (데일리 정리)' 모양 CSV로 저장
// - 주문자·수령자·배송지·수거지(이름·연락처·주소)는 읽지 않음 · 철회 건은 건너뜀 · AI·서버를 거치지 않고 사용자 브라우저 안에서만 동작
// - 29CM이 화면을 바꾸면 칸 이름을 못 찾아 멈추고 알려 줌 → 이 파일을 고치면 됨 (대시보드 데이터 업로드 화면의 버튼이 이 파일을 읽어 만듦)
async function claims29Run(opts) {
  opts = opts || {};
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const kind = /exchange/.test(location.pathname) ? '교환' : /return/.test(location.pathname) ? '반품' : '';
  if (!/29cm\.co\.kr$/.test(location.hostname) || !kind) { alert('29CM 파트너 어드민의 [주문/배송 → 반품] 또는 [교환] 목록 화면에서 눌러 주세요.'); return null; }
  const table = document.querySelector('table');
  const heads = table ? [...table.querySelectorAll('thead th')].map((h) => norm(h.innerText)) : [];
  const ix = (n) => heads.indexOf(n);
  const need = ['CS 처리상태', 'CS 접수번호', '주문번호', kind + ' 사유', kind + ' 접수일', '브랜드'];
  const miss = need.filter((n) => ix(n) < 0);
  if (miss.length) { alert('29CM 화면에서 이 칸을 못 찾았어요: ' + miss.join(', ') + '\n(29CM 화면이 바뀐 것 같아요. 버튼을 고쳐야 해요)'); return null; }
  let rows = [...table.querySelectorAll(':scope > tbody > tr')].filter((r) => r.children.length === heads.length);
  if (opts.limit) rows = rows.slice(0, opts.limit);
  // 상세 패널은 누를 때마다 새로 열림 → CS 접수번호가 같은 패널을 찾아 읽고 닫음
  const findPanel = (cs) => {
    const th = [...document.querySelectorAll('th')].find((t) => norm(t.innerText) === 'CS 접수번호' && t.nextElementSibling && norm(t.nextElementSibling.innerText) === cs);
    if (!th) return null;
    let b = th; while (b && b.parentElement && b.parentElement !== document.body) b = b.parentElement;
    return b;
  };
  const thVal = (b, label) => { const th = [...b.querySelectorAll('th')].find((t) => norm(t.innerText) === label); return th && th.nextElementSibling ? norm(th.nextElementSibling.innerText) : ''; };
  const closePanel = (b) => {
    const title = [...b.querySelectorAll('span')].find((s) => s.children.length === 0 && /^주문(반품|교환) 상세정보$/.test(norm(s.innerText)));
    const btn = title && [...title.parentElement.children].find((c) => c.tagName === 'BUTTON' && !norm(c.innerText));
    if (btn) btn.click();
  };
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;background:#1D4FA3;color:#fff;padding:12px 16px;border-radius:10px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)';
  document.body.appendChild(toast);
  const out = []; let fail = 0, skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const cell = (n) => norm(r.children[ix(n)].innerText);
    const status = cell('CS 처리상태'), cs = cell('CS 접수번호');
    toast.textContent = `📋 29CM ${kind} 정리 중... ${i + 1} / ${rows.length}`;
    if (/철회/.test(status)) { skipped++; continue; }
    const base = { '처리상태': status, '주문번호': cell('주문번호'), [kind + '사유']: cell(kind + ' 사유').replace(/\s*첨부사진$/, ''),
      [kind + '접수일']: cell(kind + ' 접수일').replace(/\./g, '-'), '브랜드': cell('브랜드') };
    const c = r.children[ix('CS 접수번호')];
    const open = () => (c.querySelector('button,a') || c.querySelector('p') || c.firstElementChild || c).click();
    open();
    let b = null;
    for (let t = 0; t < 40 && !b; t++) { await sleep(150); b = findPanel(cs); if (t === 20 && !b) open(); }   // 3초 안에 안 열리면 한 번 더 누름
    if (!b) { fail++; out.push({ ...base, '상세사유': '', '상품명': '', '옵션': '', '수량': '', '상품순번': 1 }); continue; }
    await sleep(100);
    const pt = [...b.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((h) => norm(h.innerText) === '상품명'));
    const ph = pt ? [...pt.querySelectorAll('thead th')].map((h) => norm(h.innerText)) : [];
    const prods = pt ? [...pt.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((x) => norm(x.innerText))).filter((p) => p[ph.indexOf('상품명')]) : [];
    const detail = thVal(b, '접수 내용');
    if (!prods.length) out.push({ ...base, '상세사유': detail, '상품명': '', '옵션': '', '수량': '', '상품순번': 1 });
    prods.forEach((p, n) => {
      const opt = p[ph.indexOf('옵션명')] || '';
      out.push({ ...base, '상세사유': detail, '상품명': p[ph.indexOf('상품명')] || '', '옵션': opt === '-' ? '' : opt, '수량': p[ph.findIndex((h) => /수량$/.test(h))] || '', '상품순번': n + 1 });
    });
    closePanel(b);
    for (let t = 0; t < 15 && b.isConnected; t++) await sleep(100);   // 닫히는 중에 다음 줄을 누르면 안 열려서 기다림
    await sleep(200);
  }
  toast.remove();
  if (opts.dryRun) return { kind, rows: rows.length, out, fail, skipped };
  if (!out.length) { alert(`이 화면에 정리할 ${kind} 건이 없어요 (철회 ${skipped}건 제외).`); return null; }
  const cols = ['처리상태', '주문번호', kind + '사유', '상세사유', kind + '접수일', '브랜드', '상품명', '옵션', '수량', '상품순번'];
  const esc = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + [cols.join(','), ...out.map((o) => cols.map((k) => esc(o[k])).join(','))].join('\r\n');
  const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `29CM_${kind}_정리_${day}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  alert(`✅ 29CM ${kind} ${out.length}줄을 저장했어요 (철회 ${skipped}건 제외${fail ? `, 상세를 못 읽은 ${fail}건은 상품 칸이 비어 있어요` : ''}).\n대시보드 → 데이터 업로드에 그대로 올려 주세요.`);
  return { kind, count: out.length };
}

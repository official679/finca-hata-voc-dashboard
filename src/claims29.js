// 29CM 반품·교환 정리 버튼 (즐겨찾기 버튼으로 29CM 파트너 어드민 반품/교환 목록 화면에서 실행, 2026-10-19 사용자 요청)
// - 목록의 CS 접수번호를 하나씩 열어 상품명·옵션·수량·접수 내용을 모으고, 대시보드 '29CM 반품/교환 (데일리 정리)' 모양 CSV로 저장
// - 주문자·수령자·배송지·수거지(이름·연락처·주소)는 읽지 않음 · 철회 건은 건너뜀 · AI·서버를 거치지 않고 사용자 브라우저 안에서만 동작
// - 29CM이 화면을 바꾸면 칸 이름을 못 찾아 멈추고 알려 줌 → 이 파일을 고치면 됨 (대시보드 데이터 업로드 화면의 버튼이 이 파일을 읽어 만듦)
async function claims29Run(opts) {
  opts = opts || {};
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (/29cm\.co\.kr$/.test(location.hostname) && /\/product\/qna/.test(location.pathname)) return claims29Qna(opts);
  const kind = /exchange/.test(location.pathname) ? '교환' : /return/.test(location.pathname) ? '반품' : '';
  if (!/29cm\.co\.kr$/.test(location.hostname) || !kind) { alert('29CM 파트너 어드민의 [주문/배송 → 반품]·[교환] 또는 [문의/리뷰 → 상품 문의] 목록 화면에서 눌러 주세요.'); return null; }
  const table = document.querySelector('table');
  const heads = table ? [...table.querySelectorAll('thead th')].map((h) => norm(h.innerText)) : [];
  const ix = (n) => heads.indexOf(n);
  const need = ['CS 처리상태', 'CS 접수번호', '주문번호', kind + ' 사유', kind + ' 접수일', '브랜드'];
  const miss = need.filter((n) => ix(n) < 0);
  if (miss.length) { alert('29CM 화면에서 이 칸을 못 찾았어요: ' + miss.join(', ') + '\n(29CM 화면이 바뀐 것 같아요. 버튼을 고쳐야 해요)'); return null; }
  let rows = [...table.querySelectorAll(':scope > tbody > tr')].filter((r) => r.children.length === heads.length);
  if (opts.limit) rows = rows.slice(0, opts.limit);
  // 접수일 기준으로만 모음 (2026-10-19 사용자: 29CM 목록은 기본이 '주문일' 조회라서) · 기본 = 어제, 월요일이면 금~일
  if (!opts.dryRun) {
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const t0 = new Date(); const y = new Date(t0); y.setDate(t0.getDate() - 1);
    const f = new Date(t0); f.setDate(t0.getDate() - (t0.getDay() === 1 ? 3 : 1));
    const ans = prompt(`${kind} '접수일'이 이 기간인 건만 모아요. (예: ${ymd(f)}~${ymd(y)})\n그대로 [확인]을 누르면 아래 기간이에요.`, `${ymd(f)}~${ymd(y)}`);
    if (ans === null) return null;
    const m = String(ans).match(/(\d{4}-\d{2}-\d{2})\s*~?\s*(\d{4}-\d{2}-\d{2})?/);
    if (!m) { alert('기간을 2026-10-18~2026-10-18 처럼 적어 주세요.'); return null; }
    const from = m[1], to = m[2] || m[1];
    const all = rows.length;
    rows = rows.filter((r) => { const d = norm(r.children[ix(kind + ' 접수일')].innerText).replace(/\./g, '-').slice(0, 10); return d >= from && d <= to; });
    if (!rows.length) { alert(`이 화면 목록(${all}건) 중 접수일이 ${from}~${to}인 ${kind} 건이 없어요.\n29CM 조회 기간이 그 접수일을 포함하는지 확인해 주세요.`); return null; }
  }
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

// 29CM 상품 Q&A (2026-10-19): 목록에 상품·문의 내용·등록일시가 바로 있음 → 상세를 열지 않고 1쪽부터 마지막 쪽까지 넘기며 모음
//   고객명·고객 아이디·답변 처리자는 읽지 않음 · 저장 = '29CM 상품 Q&A (정리 버튼)' 모양 CSV (문의번호로 중복 저장 안 됨)
async function claims29Qna(opts) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qtable = () => [...document.querySelectorAll('table')].find((t) => [...t.querySelectorAll('thead th')].some((h) => norm(h.innerText) === '문의 내용'));
  let t = qtable();
  const heads = t ? [...t.querySelectorAll('thead th')].map((h) => norm(h.innerText)) : [];
  const ix = (n) => heads.indexOf(n);
  const miss = ['번호', '브랜드', '상품', '문의 내용', '등록일시'].filter((n) => ix(n) < 0);
  if (miss.length) { alert('29CM 상품 문의 화면에서 이 칸을 못 찾았어요: ' + miss.join(', ') + '\n(날짜를 넣고 [검색하기]를 먼저 눌러 주세요. 그래도 안 되면 29CM 화면이 바뀐 거예요)'); return null; }
  const rowsOf = () => [...qtable().querySelectorAll('tbody tr')].filter((r) => r.children.length === heads.length);
  const firstNo = () => { const r = rowsOf()[0]; return r ? norm(r.children[ix('번호')].innerText) : ''; };
  const waitChange = async (before) => { for (let i = 0; i < 40; i++) { await sleep(150); if (firstNo() && firstNo() !== before) return true; } return false; };
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:99999;background:#1D4FA3;color:#fff;padding:12px 16px;border-radius:10px;font:14px sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)';
  document.body.appendChild(toast);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // 기간 = 29CM에서 넣고 검색한 등록기간 (주소에 남음). 날짜 없이 검색하면 29CM이 오래된 글부터 끝없이 보여 줘서 멈춤 (2026-10-19)
  //   매일 기준 = 어제, 월요일이면 금~일 (반품·교환과 같은 규칙) → 날짜가 없으면 그 기간을 알려 줌
  const t0 = new Date(); const y = new Date(t0); y.setDate(t0.getDate() - 1);
  const f = new Date(t0); f.setDate(t0.getDate() - (t0.getDay() === 1 ? 3 : 1));
  const qs0 = new URLSearchParams(location.search);
  const sd = (qs0.get('startDate') || '').slice(0, 10), ed = (qs0.get('endDate') || '').slice(0, 10);
  if (!(opts && opts.dryRun) && (!sd || !ed)) {
    toast.remove();
    alert(`29CM 등록기간을 먼저 넣고 [검색하기]를 눌러 주세요.\n오늘 기준: ${ymd(f)} ~ ${ymd(y)}\n(날짜 없이 검색하면 오래된 글부터 끝없이 나와요)`);
    return null;
  }
  const cutoff = (opts && opts.range) ? opts.range.slice(0, 10) : sd, until = (opts && opts.range) ? opts.range.slice(-10) : ed;
  let stop = false;
  toast.style.cursor = 'pointer'; toast.title = '누르면 여기까지 모은 것만 저장해요';
  toast.onclick = () => { stop = true; };
  // 1쪽부터
  const p1 = [...document.querySelectorAll('li[title="1"]')].pop();
  if (p1 && !/active/.test(p1.className)) { const b = firstNo(); (p1.querySelector('a,button') || p1).click(); await waitChange(b); }
  const out = [], seen = new Set();
  for (let page = 1; page <= 50 && !stop; page++) {
    toast.textContent = `📋 29CM 상품 문의 정리 중... ${page}쪽 · ${out.length}건 (누르면 멈춤)`;
    let older = false;
    rowsOf().forEach((r) => {
      const no = norm(r.children[ix('번호')].innerText);
      const when = norm(r.children[ix('등록일시')].innerText);
      if (when.slice(0, 10) < cutoff) { older = true; return; }
      if (when.slice(0, 10) > until) return;   // 기간보다 새 글(오늘 글 등)은 건너뜀
      if (!no || seen.has(no)) return;
      seen.add(no);
      out.push({ '문의번호': no, '작성일': when, '브랜드': norm(r.children[ix('브랜드')].innerText),
        '상품명': norm(r.children[ix('상품')].innerText), '문의 내용': norm(r.children[ix('문의 내용')].innerText) });
    });
    if (older) break;   // 최신 글부터 나오므로 기간보다 오래된 글이 보이면 끝
    const next = [...document.querySelectorAll('li[title="Next Page"]')].pop();
    if (!next || next.getAttribute('aria-disabled') === 'true') break;
    const b = firstNo(); (next.querySelector('button,a') || next).click();
    if (!(await waitChange(b))) break;
  }
  toast.remove();
  if (opts && opts.dryRun) return { kind: 'Q&A', out };
  if (!out.length) { alert('이 조건에 상품 문의가 없어요.'); return null; }
  const cols = ['문의번호', '작성일', '브랜드', '상품명', '문의 내용'];
  const esc = (v) => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const csv = '﻿' + [cols.join(','), ...out.map((o) => cols.map((k) => esc(o[k])).join(','))].join('\r\n');
  const d = new Date(); const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `29CM_상품문의_정리_${day}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  alert(`✅ 29CM 상품 문의 ${out.length}건을 저장했어요.\n대시보드 → 데이터 업로드에 그대로 올려 주세요.`);
  return { kind: 'Q&A', count: out.length };
}

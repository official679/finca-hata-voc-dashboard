// 주문(판매) 업로드 · 상품명으로 대분류 자동 판단

// 상반기 VOC 리포트와 같은 MD 그룹. 위에서부터 먼저 맞는 것 (매트리스는 베딩, 주방매트는 러그처럼 순서 중요)
const MD_GROUPS = [
  ['키친', /커트러리|머그|컵|그릇|접시|키친|행주|수저|포크|나이프|식기|플레이트|트레이|오덴세|젓가락|티스푼|코스터|볼(?![가-힣])/],
  ['바스', /타월|타올|수건|목욕|바스/],
  ['러그', /러그|발매트|주방매트|카페트|현관매트|매트(?![가-힣])/],
  ['웨어', /파자마|잠옷|셋업|팬츠|쇼츠|티셔츠|원피스|가운|로브|홈웨어|반바지|레깅스|비키니|수영복|모노키니|양말|삭스|슬리브|셔츠|스커트|자켓|후드|맨투맨/],
  ['잡화', /가방|에코백|보냉백|토트|숄더|백팩|파우치|우산|양산|머플러|스카프|장갑|모자|볼캡|버킷|키링|다이어리|스크런치|헤어|슬리퍼/],
  ['홈데코', /티슈|쿠션|커튼|방석|베개솜|솜(?![가-힣])|충전재|포스터|테이블보|식탁보|앞치마/],
  ['베딩', /이불|베개|매트리스|패드|차렵|침구|블랭킷|담요|스프레드|베딩|배딩|토퍼/],
];
const SET_RE = /세트|SET|\+|구성|1\+1|\d\s*P(?![a-z])|\d\s*종|^MRT/i;

// 상품명으로 먼저, 안 되면 옵션명으로 (마리테처럼 고객이 구성하는 상품은 옵션에 실제 상품이 있음)
function classifyItem(name, option) {
  const find = (t) => (MD_GROUPS.find(([, re]) => re.test(t || '')) || [null])[0];
  const isCodeName = /^MRT\d+/i.test(String(name || '').trim());
  const category = (!isCodeName && find(name)) || find(option) || find(name) || null;
  return { category, is_set: SET_RE.test(String(name || '')) || /\+/.test(String(option || '')) };
}

const num1 = (v) => { const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 1; };

// 주문 파일 형식 (개인정보 칸은 읽지 않음)
FILE_FORMATS.push(
  { kind: 'order', label: '29CM 주문', headers: ['주문번호', '주문상태', '상품번호', '상품명', '옵션코드', '옵션', '수량', '주문일시'],
    map: (r) => ({ key: r['주문번호'] ? hashText(`${r['주문번호']}|${r['상품번호']}|${r['옵션코드']}|${r['옵션']}`) : '', brand: normBrand(r['브랜드']), platform: '29CM',
      order_no: r['주문번호'], status: r['주문상태'], product_name: r['상품명'], option_text: r['옵션'], qty: num1(r['수량']), when: parseWhen(r['주문일시']) }) },
  { kind: 'order', label: '아임웹 주문', headers: ['주문번호', '주문상태', '주문섹션품목번호', '구매수량', '상품명', '주문일'],
    map: (r) => ({ key: r['주문섹션품목번호'], brand: normBrand(r['판매채널']), platform: '아임웹',
      order_no: r['주문번호'], status: r['주문상태'], product_name: r['상품명'], option_text: r['옵션명'], qty: num1(r['구매수량']), when: parseWhen(r['주문일']),
      cancel_reason: [r['취소사유'], r['취소상세사유']].filter(Boolean).join(' / '), return_reason: [r['반품사유'], r['반품 상세사유']].filter(Boolean).join(' / ') }) },
  { kind: 'order', label: '카페24 주문', headers: ['주문번호', '품목별 주문번호', '주문상품명', '수량', '발주일'],
    map: (r) => ({ key: r['품목별 주문번호'], platform: '카페24',
      order_no: r['주문번호'], product_name: r['주문상품명'],
      option_text: String(r['주문상품명(옵션포함)'] || '').replace(String(r['주문상품명'] || ''), '').replace(/^\(|\)$/g, '').trim(),
      qty: num1(r['수량']), when: parseWhen(r['발주일']) }) },
  { kind: 'order', label: '무신사 주문', headers: ['주문일시', '주문번호', '주문일련번호', '주문상태', '상품명', '옵션', '수량'],
    map: (r) => ({ key: r['주문일련번호'], platform: '무신사',
      order_no: r['주문번호'], status: r['주문상태'], claim_status: r['클레임상태'], product_name: r['상품명'], option_text: r['옵션'], qty: num1(r['수량']), when: parseWhen(r['주문일시']) }) },
);

function OrderUploadPage() {
  const [count, setCount] = useState(null);
  const refresh = () => db.from('order_items').select('id', { count: 'exact', head: true }).then(({ count }) => setCount(count));
  useEffect(() => { refresh(); }, []);
  const [summary] = useSince('order_items', 'brand,platform,order_date,category,qty,is_set,status', monthsAgo(5), 'order_date');

  const months = summary ? [...new Set(summary.map(r => (r.order_date || '').slice(0, 7)).filter(Boolean))].sort() : [];
  const cats = [...MD_GROUPS.map(g => g[0]), null];
  const cancelled = (r) => /취소/.test(r.status || '');

  return (
    <>
      <PageHeader title="주문 업로드" desc={`플랫폼 주문 파일을 그대로 올리세요. 지금까지 저장된 주문 품목 ${count === null ? '...' : count.toLocaleString()}줄`} />
      <UploadPanel
        kind="order"
        table="order_items"
        itemLabel="주문 품목"
        linkProducts={false}
        guide="29CM · 아임웹 · 카페24 · 무신사 주문 파일을 알아봐요. 주문자·수령자·연락처 같은 고객 정보는 저장하지 않아요. 상품명(마리테처럼 코드면 옵션명)을 보고 대분류와 세트 여부를 자동으로 붙여요. 같은 주문을 다시 올려도 중복되지 않아요."
        toRow={(r) => ({
          order_no: str(r.order_no), status: str(r.status), claim_status: str(r.claim_status),
          product_name: str(r.product_name), option_text: str(r.option_text), qty: r.qty,
          ordered_at: r.when ? r.when.iso : null, order_date: r.when ? r.when.key.slice(0, 10) : null,
          cancel_reason: str(r.cancel_reason), return_reason: str(r.return_reason),
          ...classifyItem(r.product_name, r.option_text),
        })}
        onDone={refresh}
      />

      {summary && summary.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: 0 }}>
          <div className="card-title" style={{ padding: '18px 20px 4px' }}>최근 6개월 대분류별 주문 수량 <small>취소 제외 · 자동 분류 확인용</small></div>
          <div className="table-wrap">
            <table className="table report-table">
              <thead><tr><th>대분류</th>{months.map(m => <th key={m} className="num">{Number(m.slice(5))}월</th>)}<th className="num">세트 비중</th></tr></thead>
              <tbody>
                {cats.map(c => {
                  const rs = summary.filter(r => r.category === c && !cancelled(r));
                  if (!rs.length) return null;
                  return (
                    <tr key={c || 'none'}>
                      <td>{c || <span className="muted">(분류 못 함)</span>}</td>
                      {months.map(m => <td key={m} className="num">{rs.filter(r => (r.order_date || '').startsWith(m)).reduce((a, r) => a + (r.qty || 0), 0).toLocaleString()}</td>)}
                      <td className="num">{pct(rs.filter(r => r.is_set).length, rs.length)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

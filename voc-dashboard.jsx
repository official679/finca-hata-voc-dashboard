import React, { useState, useEffect } from 'react';
import './styles.css';

const VOCDashboard = () => {
  const [activeTab, setActiveTab] = useState('daily');
  const [vocEntries, setVocEntries] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Supabase 설정
  const SUPABASE_URL = 'https://kevibkvgledpcyqhlxtl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_tDSpF5YKm-oRqoLc7BqelQ_4YF_mRwS';

  // API 호출 함수
  const fetchData = async (table) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/${table}`,
        {
          headers: {
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching ${table}:`, error);
      setMessage(`❌ ${table} 데이터 로드 실패`);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const vocs = await fetchData('voc_entries');
      const revs = await fetchData('reviews');
      const prods = await fetchData('products');
      setVocEntries(vocs);
      setReviews(revs);
      setProducts(prods);
    };
    loadData();
  }, []);

  // 데일리 입력 폼
  const DailyForm = () => {
    const [formData, setFormData] = useState({
      brand: 'FINCA',
      date: new Date().toISOString().split('T')[0],
      platform: '29CM',
      voc_type: '(반품)브랜드과실',
      category_id: '',
      product_name: '',
      quantity: 1,
      notes: ''
    });

    const handleChange = (e) => {
      const { name, value } = e.target;
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    };

    const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      try {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/voc_entries`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData)
          }
        );
        if (response.ok) {
          setMessage('✅ VOC 입력 완료!');
          setFormData({
            brand: 'FINCA',
            date: new Date().toISOString().split('T')[0],
            platform: '29CM',
            voc_type: '(반품)브랜드과실',
            category_id: '',
            product_name: '',
            quantity: 1,
            notes: ''
          });
          // 데이터 새로고침
          const updatedVocs = await fetchData('voc_entries');
          setVocEntries(updatedVocs);
        }
      } catch (error) {
        setMessage('❌ 저장 실패: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="form-container">
        <h2>📝 데일리 VOC 입력</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div>
              <label>날짜</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label>브랜드</label>
              <select name="brand" value={formData.brand} onChange={handleChange}>
                <option>FINCA</option>
                <option>HaTA</option>
              </select>
            </div>
            <div>
              <label>플랫폼</label>
              <select name="platform" value={formData.platform} onChange={handleChange}>
                <option>29CM</option>
                <option>자사몰</option>
                <option>무신사</option>
                <option>W컨셉</option>
                <option>EQL</option>
              </select>
            </div>
            <div>
              <label>문의유형</label>
              <select name="voc_type" value={formData.voc_type} onChange={handleChange}>
                <option>(반품)브랜드과실</option>
                <option>(교환)브랜드과실</option>
                <option>기타</option>
              </select>
            </div>
            <div>
              <label>수량</label>
              <input
                type="number"
                name="quantity"
                value={formData.quantity}
                onChange={handleChange}
                min="1"
              />
            </div>
            <div>
              <label>상품명</label>
              <input
                type="text"
                name="product_name"
                value={formData.product_name}
                onChange={handleChange}
                placeholder="상품명 입력"
              />
            </div>
          </div>
          <div>
            <label>비고</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="추가 사항 입력"
              rows="3"
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '저장 중...' : '💾 저장'}
          </button>
        </form>
      </div>
    );
  };

  // 통계 대시보드
  const ReportTab = () => {
    const totalVocs = vocEntries.length;
    const totalReviews = reviews.length;
    const positiveReviews = reviews.filter(r => r.sentiment === 'positive').length;
    const negativeReviews = reviews.filter(r => r.sentiment === 'negative').length;

    const stats = [
      { label: '총 VOC 건수', value: totalVocs, icon: '📊' },
      { label: '긍정 리뷰', value: positiveReviews, icon: '👍' },
      { label: '부정 리뷰', value: negativeReviews, icon: '👎' },
      { label: '총 리뷰 수', value: totalReviews, icon: '⭐' }
    ];

    return (
      <div className="report-container">
        <h2>📈 주간/월간 리포트</h2>
        <div className="stats-grid">
          {stats.map((stat, idx) => (
            <div key={idx} className="stat-card">
              <div className="stat-icon">{stat.icon}</div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="chart-section">
          <h3>📉 브랜드별 VOC 현황</h3>
          <div className="voc-list">
            {vocEntries.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>브랜드</th>
                    <th>플랫폼</th>
                    <th>상품명</th>
                    <th>유형</th>
                    <th>수량</th>
                  </tr>
                </thead>
                <tbody>
                  {vocEntries.slice(-10).reverse().map((voc, idx) => (
                    <tr key={idx}>
                      <td>{new Date(voc.date).toLocaleDateString('ko-KR')}</td>
                      <td>{voc.brand}</td>
                      <td>{voc.platform}</td>
                      <td>{voc.product_name}</td>
                      <td>{voc.voc_type}</td>
                      <td>{voc.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>VOC 데이터가 없습니다</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // VOC 관리
  const VocTab = () => {
    return (
      <div className="voc-container">
        <h2>🎯 VOC 관리</h2>
        <div className="voc-filters">
          <select defaultValue="">
            <option value="">브랜드 선택</option>
            <option value="FINCA">FINCA</option>
            <option value="HaTA">HaTA</option>
          </select>
          <select defaultValue="">
            <option value="">플랫폼 선택</option>
            <option value="29CM">29CM</option>
            <option value="자사몰">자사몰</option>
            <option value="무신사">무신사</option>
          </select>
          <select defaultValue="">
            <option value="">상태 선택</option>
            <option value="접수">접수</option>
            <option value="처리중">처리중</option>
            <option value="완료">완료</option>
          </select>
        </div>

        <div className="voc-action-highlight">
          <div className="action-card">
            <h3>🎨 상품개선 필요</h3>
            <p className="action-count">
              {vocEntries.filter(v => v.action_required === '상품개선').length}건
            </p>
          </div>
          <div className="action-card">
            <h3>📦 재입고 필요</h3>
            <p className="action-count">
              {vocEntries.filter(v => v.action_required === '재입고').length}건
            </p>
          </div>
        </div>

        <div className="voc-list">
          {vocEntries.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>상품명</th>
                  <th>브랜드</th>
                  <th>카테고리</th>
                  <th>상태</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {vocEntries.map((voc, idx) => (
                  <tr key={idx} className={`status-${voc.status || 'pending'}`}>
                    <td>{new Date(voc.date).toLocaleDateString('ko-KR')}</td>
                    <td className="product-name">{voc.product_name}</td>
                    <td>{voc.brand}</td>
                    <td>{voc.voc_type}</td>
                    <td><span className="badge">{voc.status || '접수'}</span></td>
                    <td className="action-tag">{voc.action_required || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>VOC 데이터가 없습니다</p>
          )}
        </div>
      </div>
    );
  };

  // 재입고 문의
  const RestockTab = () => {
    return (
      <div className="restock-container">
        <h2>📦 재입고 문의</h2>
        <div className="restock-info">
          <p>📍 게시판에서 수집한 재입고 문의 내용을 관리합니다</p>
        </div>
        <div className="restock-grid">
          <div className="restock-card">
            <h3>상품 A</h3>
            <p>문의 건수: <strong>12건</strong></p>
            <p>상태: <span className="status-open">개발중</span></p>
          </div>
          <div className="restock-card">
            <h3>상품 B</h3>
            <p>문의 건수: <strong>8건</strong></p>
            <p>상태: <span className="status-completed">예정</span></p>
          </div>
          <div className="restock-card">
            <h3>상품 C</h3>
            <p>문의 건수: <strong>5건</strong></p>
            <p>상태: <span className="status-pending">검토중</span></p>
          </div>
        </div>
      </div>
    );
  };

  // 리뷰 분석
  const ReviewTab = () => {
    const positiveCount = reviews.filter(r => r.sentiment === 'positive').length;
    const negativeCount = reviews.filter(r => r.sentiment === 'negative').length;
    const totalCount = reviews.length;
    const positivePercent = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 0;
    const negativePercent = totalCount > 0 ? Math.round((negativeCount / totalCount) * 100) : 0;

    return (
      <div className="review-container">
        <h2>⭐ 리뷰 분석</h2>
        
        <div className="review-summary">
          <div className="sentiment-chart">
            <div className="sentiment-item positive">
              <div className="sentiment-bar" style={{ width: `${positivePercent}%` }}></div>
              <span>긍정: {positiveCount}건 ({positivePercent}%)</span>
            </div>
            <div className="sentiment-item negative">
              <div className="sentiment-bar" style={{ width: `${negativePercent}%` }}></div>
              <span>부정: {negativeCount}건 ({negativePercent}%)</span>
            </div>
          </div>
        </div>

        <div className="review-keywords">
          <h3>🔍 주요 코멘트 키워드</h3>
          <div className="keyword-cloud">
            <span className="keyword">품질 우수</span>
            <span className="keyword">배송 빠름</span>
            <span className="keyword">색상 이염</span>
            <span className="keyword">박음질 불량</span>
            <span className="keyword">디자인 만족</span>
            <span className="keyword">가격대비 좋음</span>
            <span className="keyword">물빠짐</span>
            <span className="keyword">사이즈 작음</span>
          </div>
        </div>

        <div className="review-list">
          <h3>📝 최근 리뷰</h3>
          {reviews.length > 0 ? (
            <div className="reviews-grid">
              {reviews.slice(-6).map((review, idx) => (
                <div key={idx} className={`review-card sentiment-${review.sentiment}`}>
                  <div className="review-header">
                    <span className={`sentiment-badge ${review.sentiment}`}>
                      {review.sentiment === 'positive' ? '👍' : '👎'}
                    </span>
                    <span className="review-rating">★{review.rating}/5</span>
                  </div>
                  <p className="review-product">{review.product_name}</p>
                  <p className="review-content">{review.content?.substring(0, 80)}...</p>
                  <p className="review-date">{new Date(review.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              ))}
            </div>
          ) : (
            <p>리뷰 데이터가 없습니다</p>
          )}
        </div>
      </div>
    );
  };

  // 전사 공개 뷰
  const PublicViewTab = () => {
    const totalVocs = vocEntries.length;
    const positiveReviews = reviews.filter(r => r.sentiment === 'positive').length;
    const negativeReviews = reviews.filter(r => r.sentiment === 'negative').length;
    const totalReviews = reviews.length;

    return (
      <div className="public-view">
        <h2>🌐 전사 공개 뷰</h2>
        <div className="public-banner">
          <p>👥 전사원이 조회 가능한 VOC 및 리뷰 분석 대시보드</p>
        </div>

        <div className="public-grid">
          <div className="public-card">
            <h3>📊 이번 주 VOC 현황</h3>
            <div className="big-number">{totalVocs}</div>
            <p>총 VOC 건수</p>
          </div>
          <div className="public-card">
            <h3>⭐ 고객 만족도</h3>
            <div className="big-number">{totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0}%</div>
            <p>긍정 리뷰 비율</p>
          </div>
          <div className="public-card">
            <h3>🎯 액션 아이템</h3>
            <div className="big-number">{vocEntries.filter(v => v.action_required).length}</div>
            <p>개선 필요 건수</p>
          </div>
        </div>

        <div className="public-insights">
          <h3>💡 주요 인사이트</h3>
          <ul>
            <li>🔴 긴급: 박음질 불량 {vocEntries.filter(v => v.voc_type?.includes('박음')).length}건</li>
            <li>🟡 주의: 이염/물빠짐 {vocEntries.filter(v => v.voc_type?.includes('이염')).length}건</li>
            <li>🟢 긍정: 디자인 만족도 {positiveReviews}건</li>
            <li>📈 이번 주 평가 평균: {reviews.length > 0 ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1) : 0}점</li>
          </ul>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>🎯 FINCA·HaTA VOC 대시보드</h1>
        <p>실시간 고객의 목소리(VOC) 및 리뷰 관리 시스템</p>
      </header>

      {message && (
        <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
          {message}
        </div>
      )}

      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >
            📝 데일리 입력
          </button>
          <button
            className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => setActiveTab('report')}
          >
            📈 리포트
          </button>
          <button
            className={`tab-btn ${activeTab === 'voc' ? 'active' : ''}`}
            onClick={() => setActiveTab('voc')}
          >
            🎯 VOC 관리
          </button>
          <button
            className={`tab-btn ${activeTab === 'restock' ? 'active' : ''}`}
            onClick={() => setActiveTab('restock')}
          >
            📦 재입고 문의
          </button>
          <button
            className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            ⭐ 리뷰 분석
          </button>
          <button
            className={`tab-btn ${activeTab === 'public' ? 'active' : ''}`}
            onClick={() => setActiveTab('public')}
          >
            🌐 공개 뷰
          </button>
        </div>
      </div>

      <div className="tab-content">
        {activeTab === 'daily' && <DailyForm />}
        {activeTab === 'report' && <ReportTab />}
        {activeTab === 'voc' && <VocTab />}
        {activeTab === 'restock' && <RestockTab />}
        {activeTab === 'review' && <ReviewTab />}
        {activeTab === 'public' && <PublicViewTab />}
      </div>

      {loading && <div className="loading">로딩 중...</div>}
    </div>
  );
};

export default VOCDashboard;

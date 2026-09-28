# 🎯 FINCA·HaTA VOC 대시보드

> 실시간 고객의 목소리(VOC) 및 리뷰 관리 시스템

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-INTERNAL-red.svg)
![Status](https://img.shields.io/badge/status-Active-green.svg)

## 📊 소개

FINCA·HaTA VOC 대시보드는 고객의 목소리를 체계적으로 수집, 관리, 분석하는 통합 플랫폼입니다.

**주요 기능**:
- 📝 **데일리 VOC 입력**: 날짜, 브랜드, 플랫폼, 상품명 등 실시간 기록
- 📈 **주간/월간/연간 리포트**: 자동 집계 및 통계 분석
- 🎯 **VOC 관리**: 필터링, 상태 추적, 액션 강조
- 📦 **재입고 문의 관리**: 게시판 URL, 요청 건수, 현황 조회
- ⭐ **리뷰 분석**: 긍정/부정 비율, 키워드 분석, 감정 분석
- 🌐 **전사 공개 뷰**: 전사원 조회용 공개 대시보드

---

## 🚀 빠른 시작

### 설치

```bash
# 1. 저장소 클론 (또는 파일 다운로드)
git clone https://github.com/YOUR_USERNAME/voc-dashboard.git
cd voc-dashboard

# 2. 의존성 설치
npm install

# 3. 로컬 개발 서버 시작
npm start
```

브라우저에서 `http://localhost:8080` 접속!

---

## 📁 프로젝트 구조

```
voc-dashboard/
│
├── index.html              # 메인 HTML (전체 앱 진입점)
├── styles.css              # CSS 스타일
├── voc-dashboard.jsx       # React 컴포넌트 (참고용)
│
├── package.json            # npm 의존성
├── netlify.toml            # Netlify 배포 설정
├── vercel.json             # Vercel 배포 설정 (선택)
│
├── README.md               # 이 파일
├── DEPLOYMENT_GUIDE.md     # 배포 가이드
└── CHANGELOG.md            # 변경 이력
```

---

## 🔐 설정된 Supabase

프로젝트는 이미 Supabase와 연동되어 있습니다:

| 항목 | 값 |
|------|-----|
| **Project URL** | `https://kevibkvgledpcyqhlxtl.supabase.co` |
| **Project ID** | `kevibkvgledpcyqhlxtl` |
| **API Key** | `sb_publishable_tDSpF5YKm-oRqoLc7BqelQ_4YF_mRwS` |
| **Region** | ap-northeast-1 (Tokyo) |
| **Database** | PostgreSQL |

### 테이블 구조

```
✅ products (3,246건)
- id, brand, product_name, category, size_gender, ...

✅ voc_entries
- id, date, brand, platform, product_name, voc_type, quantity, ...

✅ reviews
- id, product_name, sentiment, rating, content, created_at, ...

✅ reorder_requests
- id, product_name, quantity, board_url, status, ...

✅ daily_stats
- date, brand, total_vocs, positive_reviews, negative_reviews, ...

✅ voc_categories (17가지)
- 품질이슈 (12), 재입고/문의 (5)
```

---

## 🎨 탭 소개

### 1️⃣ 📝 데일리 입력
VOC를 실시간으로 기록합니다.

**필드**:
- 날짜 (기본값: 오늘)
- 브랜드 (FINCA/HaTA)
- 플랫폼 (29CM, 자사몰, 무신사, W컨셉, EQL)
- 문의유형
- 수량
- 상품명
- 비고

### 2️⃣ 📈 리포트
주간/월간/연간 통계를 자동으로 집계합니다.

**표시 항목**:
- 총 VOC 건수
- 긍정 리뷰 수
- 부정 리뷰 수
- 총 리뷰 수
- 최근 VOC 목록

### 3️⃣ 🎯 VOC 관리
VOC를 체계적으로 관리합니다.

**액션 강조**:
- 🎨 상품개선 필요
- 📦 재입고 필요

### 4️⃣ ⭐ 리뷰 분석
고객 리뷰의 감정 분석 및 트렌드 파악합니다.

**분석 항목**:
- 긍정/부정 비율
- 주요 키워드 클라우드
- 최근 리뷰 카드

### 5️⃣ 🌐 공개 뷰
전사원 대상 공개 대시보드입니다.

**표시 항목**:
- 이번 주 VOC 현황
- 고객 만족도
- 액션 아이템
- 주요 인사이트

---

## 🛠️ 기술 스택

| 계층 | 기술 |
|------|------|
| **프론트엔드** | React 18 (CDN 기반) |
| **스타일** | CSS 3 + Flexbox/Grid |
| **데이터베이스** | Supabase (PostgreSQL) |
| **차트** | Chart.js |
| **호스팅** | Netlify / Vercel |
| **빌드** | Static site (No build needed) |

---

## 📦 배포

### Netlify (추천) ⭐

**방법 1: Git 연동**

```bash
# GitHub에 푸시
git push origin main

# Netlify에서 자동 배포 (HTTPS)
```

**방법 2: CLI 배포**

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

### Vercel

**방법 1: Git 연동**

Vercel 대시보드에서 GitHub 저장소 선택 → 자동 배포

**방법 2: CLI 배포**

```bash
npm install -g vercel
vercel --prod
```

**배포 가이드**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) 참조

---

## 🔧 커스터마이징

### 색상 변경

`index.html`의 `<style>` 섹션에서:

```css
/* 기본 (보라색) */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 변경 예 (파란색) */
background: linear-gradient(135deg, #1890ff 0%, #0050b3 100%);
```

### 필드 추가

VOC 입력 폼에 새 필드 추가:

```jsx
<div>
  <label>새 필드명</label>
  <input
    type="text"
    name="field_name"
    value={formData.field_name}
    onChange={handleChange}
  />
</div>
```

### Supabase 테이블 수정

1. https://supabase.com/dashboard/ 접속
2. `voc_entries` 테이블 선택
3. 칼럼 추가/수정
4. 대시보드 코드 업데이트

---

## 📊 사용 통계

### VOC 분류 (17가지)

**품질이슈 (12)**:
- 박음질불량, 파손/구멍, 올나감, 이염/오염, 물빠짐, 녹슴불량, 지퍼불량, 스냅단추누락, 프린팅불량, 바코드오류, 매칭오류, 디자인/색상차이

**재입고/문의 (5)**:
- 재입고문의, 사이즈문의, 색상문의, 배송관련, 기타문의

### 플랫폼별 매출

| 플랫폼 | 지분 |
|--------|------|
| 29CM | 35% |
| 자사몰 | 25% |
| 무신사 | 20% |
| W컨셉 | 12% |
| EQL | 8% |

---

## 🐛 트러블슈팅

### 데이터가 안 로드됨

```bash
# 1. Supabase 테이블 생성 확인
# 2. API Key 확인
# 3. 브라우저 콘솔에서 네트워크 오류 확인 (F12)
```

### 배포 실패

**Netlify**:
```bash
netlify logs --tail
```

**Vercel**:
- 대시보드 → Deployments → 로그 확인

### CSS가 안 보임

- `styles.css` 파일 확인
- 경로가 맞는지 확인 (대소문자 구분)
- 캐시 초기화 (Ctrl+Shift+Del)

---

## 📅 로드맵

### 진행 중 (9월)
- [x] Supabase 셋업
- [x] 대시보드 UI 개발
- [x] React 컴포넌트 작성
- [ ] 배포 (10월 1일)

### 계획 (10월~)
- [ ] 이미지 업로드 기능
- [ ] PDF 리포트 생성
- [ ] 실시간 알림
- [ ] 사용자 인증
- [ ] 모바일 앱

---

## 📚 문서

- 📖 [배포 가이드](./DEPLOYMENT_GUIDE.md)
- 🔗 [Supabase 문서](https://supabase.com/docs)
- ⚛️ [React 문서](https://react.dev)
- 🚀 [Netlify 문서](https://docs.netlify.com)

---

## 👥 기여자

- **PM**: [담당자명]
- **개발**: Claude (AI Assistant)
- **디자인**: [디자이너명]
- **QA**: [테스터명]

---

## 📞 지원 및 문의

| 채널 | 연락처 |
|------|--------|
| **이메일** | [이메일] |
| **Slack** | #voc-dashboard |
| **GitHub Issues** | [저장소 URL]/issues |

---

## 📄 라이선스

내부 사용 전용 (미공개)

FINCA·HaTA 내부 시스템으로, 승인 없이 외부 공유 금지합니다.

---

## 🎉 감사의 말

이 대시보드는 다음 오픈소스 프로젝트를 활용합니다:

- [React](https://react.dev)
- [Chart.js](https://www.chartjs.org/)
- [Supabase](https://supabase.com)
- [Netlify](https://www.netlify.com/)

---

**마지막 업데이트**: 2026년 9월 28일
**배포 일정**: 2026년 10월 1일

---

## 체크리스트 ✅

### 배포 전 확인
- [ ] 로컬에서 정상 작동 확인
- [ ] Supabase 테이블 생성 확인
- [ ] API Key 유효성 확인
- [ ] 모든 파일 업로드
- [ ] 도메인 준비 (선택)

### 배포 후 확인
- [ ] 웹사이트 접속 확인
- [ ] 데이터 로드 확인
- [ ] VOC 입력 테스트
- [ ] 모바일 반응형 확인
- [ ] HTTPS 연결 확인
- [ ] 성능 측정 (Lighthouse)

### 유지보수
- [ ] 주간 성능 확인
- [ ] 월간 데이터 백업
- [ ] 분기별 기능 업데이트
- [ ] 반년별 보안 점검

---

궁금한 점이나 버그 리포트는 위의 지원 채널을 이용해주세요! 🚀

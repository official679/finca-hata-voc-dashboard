# 🚀 FINCA·HaTA VOC 대시보드 배포 가이드

## 📋 목차
1. [프로젝트 정보](#프로젝트-정보)
2. [필수 준비사항](#필수-준비사항)
3. [로컬 개발 환경 설정](#로컬-개발-환경-설정)
4. [Netlify 배포](#netlify-배포)
5. [Vercel 배포](#vercel-배포)
6. [트러블슈팅](#트러블슈팅)

---

## 프로젝트 정보

### 📊 VOC 대시보드 스택
- **프론트엔드**: React 18 (CDN 기반)
- **데이터베이스**: Supabase PostgreSQL
- **호스팅**: Netlify / Vercel (선택)
- **기타**: Chart.js (통계)

### 🔐 Supabase 설정 (이미 완료)
```
Project ID: kevibkvgledpcyqhlxtl
Project URL: https://kevibkvgledpcyqhlxtl.supabase.co
Publishable Key: sb_publishable_tDSpF5YKm-oRqoLc7BqelQ_4YF_mRwS
Region: ap-northeast-1 (Tokyo)
```

### 📁 프로젝트 구조
```
voc-dashboard/
├── index.html          # 메인 HTML 파일 (진입점)
├── styles.css          # CSS 스타일
├── voc-dashboard.jsx   # React 컴포넌트 (참고용)
├── package.json        # npm 패키지 설정
├── netlify.toml        # Netlify 설정
└── README.md           # 프로젝트 문서
```

---

## 필수 준비사항

### 필요한 도구
- **Git** (https://git-scm.com/)
- **Node.js 16+** (https://nodejs.org/)
- **npm** (Node.js와 함께 설치)
- **Netlify CLI** (선택사항): `npm install -g netlify-cli`
- **Vercel CLI** (선택사항): `npm install -g vercel`

### 계정 생성
1. **Netlify 계정**: https://app.netlify.com/signup
2. **Vercel 계정**: https://vercel.com/signup
3. **GitHub 계정** (권장): https://github.com/signup

---

## 로컬 개발 환경 설정

### 1️⃣ 프로젝트 다운로드

```bash
# 프로젝트 폴더 생성
mkdir voc-dashboard
cd voc-dashboard

# 파일들 복사
# - index.html
# - styles.css
# - voc-dashboard.jsx
# - package.json (아래 참고)
```

### 2️⃣ package.json 생성

```json
{
  "name": "voc-dashboard",
  "version": "1.0.0",
  "description": "FINCA·HaTA VOC 대시보드",
  "scripts": {
    "start": "http-server",
    "build": "echo 'Build complete'"
  },
  "dependencies": {},
  "devDependencies": {
    "http-server": "^14.1.1"
  }
}
```

### 3️⃣ 로컬 실행

```bash
# npm 의존성 설치
npm install

# 개발 서버 시작 (기본 http://localhost:8080)
npm start
```

브라우저에서 `http://localhost:8080` 접속!

---

## Netlify 배포 ⭐ (추천)

### 방법 1: Git으로 배포 (권장)

#### 1단계: GitHub에 저장소 생성
```bash
# GitHub에서 새 저장소 생성 (https://github.com/new)
# 저장소명: voc-dashboard

# 로컬에서
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/voc-dashboard.git
git push -u origin main
```

#### 2단계: Netlify에 연결
1. https://app.netlify.com 로그인
2. **"New site from Git"** 클릭
3. GitHub 계정 연결
4. `voc-dashboard` 저장소 선택
5. 설정:
   - **Build command**: `npm run build` (또는 비워두기)
   - **Publish directory**: `.` (root)
6. **Deploy** 클릭

#### 3단계: 자동 배포 설정 완료! ✅
- 모든 `main` 브랜치 푸시 시 자동 배포

---

### 방법 2: Netlify CLI로 배포 (수동)

```bash
# Netlify CLI 설치
npm install -g netlify-cli

# Netlify 로그인
netlify login

# 배포
netlify deploy --prod

# 대시보드 확인
netlify open
```

---

## Vercel 배포

### 방법 1: Git으로 배포

1. GitHub 저장소 생성 (위의 Netlify와 동일)
2. https://vercel.com/new 접속
3. GitHub 저장소 선택
4. 배포 설정:
   - **Framework Preset**: "Other"
   - **Build Command**: 비워두기
   - **Output Directory**: `.`
5. **Deploy** 클릭

### 방법 2: Vercel CLI로 배포

```bash
# Vercel CLI 설치
npm install -g vercel

# 배포
vercel --prod

# 대시보드 확인
vercel --inspect
```

---

## 배포 후 확인사항

### ✅ 체크리스트

- [ ] 대시보드 접속 확인
- [ ] 데이터 로드 확인
- [ ] VOC 입력 폼 작동 확인
- [ ] Supabase 연결 확인
- [ ] 모바일 반응형 확인
- [ ] 콘솔 에러 없음 확인

### 🔍 Supabase 연결 확인

브라우저 개발자 도구 (F12) → Console 탭에서:

```javascript
// 다음 명령으로 데이터 로드 테스트
const response = await fetch(
  'https://kevibkvgledpcyqhlxtl.supabase.co/rest/v1/voc_entries',
  {
    headers: {
      'Authorization': 'Bearer sb_publishable_tDSpF5YKm-oRqoLc7BqelQ_4YF_mRwS',
      'Content-Type': 'application/json',
    }
  }
);
const data = await response.json();
console.log(data);
```

---

## 커스터마이징

### 🎨 색상 변경

`index.html`의 `<style>` 섹션에서:

```css
/* 기본 색상 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* 변경 예시 (파란색) */
background: linear-gradient(135deg, #1890ff 0%, #0050b3 100%);
```

### 📝 텍스트 변경

`index.html`에서:
```html
<h1>🎯 FINCA·HaTA VOC 대시보드</h1>
<!-- 변경 예시 -->
<h1>🎯 우리의 VOC 관리 시스템</h1>
```

### 🗑️ 필드 추가/삭제

**VOC 입력 폼에 필드 추가:**

```jsx
<div>
  <label>담당자</label>
  <input
    type="text"
    name="manager"
    value={formData.manager}
    onChange={handleChange}
    placeholder="담당자명"
  />
</div>
```

---

## 트러블슈팅

### ❌ "데이터를 불러올 수 없습니다"

**원인**: Supabase 연결 실패

**해결**:
1. Supabase 테이블이 생성되었는지 확인
2. API Key 확인 (유효한지)
3. CORS 설정 확인
4. 브라우저 콘솔에서 네트워크 오류 확인

### ❌ "배포 실패"

**Netlify**:
```bash
# 빌드 로그 확인
netlify logs --tail
```

**Vercel**:
- 대시보드에서 배포 로그 확인
- Build 탭 클릭

### ❌ "CSS가 안 보여요"

**확인**:
1. `styles.css` 파일이 있는지 확인
2. `<link rel="stylesheet" href="styles.css">` 태그 확인
3. 파일 경로가 맞는지 확인 (대소문자 구분)

### ❌ "폼이 작동하지 않음"

**확인**:
1. Supabase REST API 활성화 확인
2. `voc_entries` 테이블이 있는지 확인
3. 브라우저 콘솔에서 POST 요청 오류 확인

---

## 유지보수

### 📊 정기적인 확인

**매주**:
- 대시보드 접속 확인
- VOC 데이터 입력 테스트
- 리포트 집계 확인

**매월**:
- Supabase 백업 확인
- 통계 분석 리포트 생성
- 배포 상태 모니터링

### 🔄 업데이트 방법

```bash
# 로컬 수정 후
git add .
git commit -m "Update dashboard"
git push origin main

# Netlify/Vercel에서 자동 배포됨
```

---

## 🎯 마이그레이션 (추후)

### React 전환 (선택사항)

현재 CDN 기반 React → NPM 기반으로 전환:

```bash
# Create React App 사용
npx create-react-app voc-dashboard
# voc-dashboard.jsx 파일을 App.jsx로 복사
npm start
```

### 추가 기능

- [ ] 이미지 업로드
- [ ] PDF 리포트 생성
- [ ] 실시간 알림
- [ ] 사용자 인증
- [ ] 다국어 지원

---

## 📞 지원

### 문제 해결
1. **Supabase 문서**: https://supabase.com/docs
2. **Netlify 문서**: https://docs.netlify.com
3. **React 문서**: https://react.dev

### 연락처
- 프로젝트 담당자: [담당자명]
- 이메일: [이메일]
- Slack: #voc-dashboard

---

## 라이선스

내부 사용 전용 (미공개)

---

**마지막 업데이트**: 2026년 9월 28일
**배포 예정일**: 2026년 10월 1일

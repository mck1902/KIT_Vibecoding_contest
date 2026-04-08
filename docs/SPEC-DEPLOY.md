# 배포 및 제출 구현 지시서 (SPEC-DEPLOY)

## 개요
- 프론트엔드: Vercel (무료)
- 백엔드: Render (무료)
- 비용: 0원
- GitHub: public 저장소 필수 (API Key 노출 주의)

---

## 1. GitHub 저장소 설정

### 1-1. 원격 저장소 생성
```bash
# GitHub에서 저장소 생성 후
cd kit-vibecoding-contest
git remote add origin https://github.com/[USERNAME]/kit-vibecoding-contest.git
```

### 1-2. .gitignore 확인 (이미 설정됨)
- node_modules/ ✅
- .env ✅
- frontend/dist/ ✅
- .DS_Store ✅

### 1-3. 커밋 및 푸시
```bash
git add .
git commit -m "Initial commit: EduWatch project setup"
git push -u origin main
```

### 1-4. API Key 노출 방지
- .env 파일은 절대 커밋하지 않음
- .env.example만 커밋 (실제 키 없이)
- 프론트엔드 환경변수는 VITE_ 접두사 사용 (Vite 규칙)
- 배포 플랫폼에서 환경변수를 별도 설정

---

## 2. 프론트엔드 배포 (Vercel)

### 2-1. Vercel 설정
1. vercel.com 가입 (GitHub 연동)
2. "New Project" → GitHub 저장소 선택
3. 설정:
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. 환경변수 추가:
   - `VITE_API_URL` = Render 백엔드 URL (백엔드 배포 후 설정)

### 2-2. vercel.json (frontend/ 폴더에 생성)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```
- React Router의 클라이언트 사이드 라우팅을 위해 필요
- 모든 경로를 index.html로 리다이렉트

### 2-3. 배포 확인
- 자동 배포: main 브랜치에 push하면 자동 빌드/배포
- URL 형식: https://[project-name].vercel.app
- HTTPS 자동 적용 (웹캠 접근에 필요)

---

## 3. 백엔드 배포 (Render)

### 3-1. Render 설정
1. render.com 가입 (GitHub 연동)
2. "New Web Service" → GitHub 저장소 선택
3. 설정:
   - Name: eduwatch-api
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
4. 환경변수 추가:
   - `PORT` = 10000 (Render 기본)
   - `NODE_ENV` = production
   - `FRONTEND_URL` = Vercel 프론트엔드 URL

### 3-2. CORS 설정 (backend/src/index.js에서)
```javascript
// 프로덕션에서는 FRONTEND_URL만 허용
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : 'http://localhost:5173'
};
app.use(cors(corsOptions));
```

### 3-3. Render 무료 플랜 주의사항
- 15분 비활동 시 슬립 모드 진입
- 첫 요청 시 깨어나는데 30~50초 소요
- 대응: 프론트엔드에서 앱 로딩 시 /api/health를 미리 호출하여 서버를 깨움
  ```javascript
  // App.jsx에서
  useEffect(() => {
    fetch(import.meta.env.VITE_API_URL + '/health').catch(() => {});
  }, []);
  ```
- 재배포 시 파일 시스템 초기화됨 → 세션 데이터 리셋
  - 데모용이므로 문제없음. 초기 샘플 데이터가 항상 로드됨

---

## 4. 배포 후 환경변수 교차 설정

배포 순서:
1. 백엔드 먼저 Render에 배포 → URL 획득 (예: https://eduwatch-api.onrender.com)
2. Vercel에 VITE_API_URL 환경변수 설정 → 프론트엔드 재배포
3. Render에 FRONTEND_URL 환경변수 설정 → 백엔드 재배포

```
Vercel 환경변수:
  VITE_API_URL = https://eduwatch-api.onrender.com/api

Render 환경변수:
  PORT = 10000
  NODE_ENV = production
  FRONTEND_URL = https://eduwatch.vercel.app
```

---

## 5. 공모전 제출 체크리스트

### 필수 제출물
1. ✅ GitHub 저장소 주소 (public 설정)
   - API Key 노출되지 않는지 최종 확인
   - .env 파일이 커밋되지 않았는지 확인
2. ✅ 배포된 라이브 URL (Vercel URL)
   - HTTPS 동작 확인
   - 웹캠 권한 요청 정상 작동 확인
   - 학생/학부모 양쪽 흐름 모두 테스트
3. 📝 AI 리포트 (첨부 양식에 작성 후 PDF)
   - 공모전에서 제공한 docx 양식 사용
4. 📝 개인정보 수집/이용 동의서 + 참가 각서 (서명 후 PDF)

### 최종 점검
- [ ] GitHub public 설정 확인
- [ ] .env 파일 미포함 확인 (git log --all --diff-filter=A -- '*.env')
- [ ] 라이브 URL 접속 테스트 (PC + 모바일)
- [ ] 웹캠 권한 요청 → 분석 → 리포트 전체 흐름 동작
- [ ] 학부모 대시보드 샘플 데이터 표시 확인
- [ ] Render 서버 슬립 후 재접속 시 정상 동작 확인
- [ ] README.md에 프로젝트 설명 + 실행 방법 명시

### 제출 마감
- **2026.04.13(월)** 까지 메일로 제출
- 커밋 기한 이후의 Commit은 부정행위로 간주 → 4/13 이전에 최종 커밋 완료

---

## 6. 구현 순서 (권장)

1. 프론트엔드/백엔드 개발 완료 후 진행
2. GitHub 원격 저장소 생성 + 코드 push
3. Render 백엔드 배포 → URL 획득
4. Vercel 프론트엔드 배포 → 환경변수 설정
5. 교차 환경변수 설정 + 재배포
6. 라이브 URL 전체 흐름 테스트
7. AI 리포트 작성 (별도 docx 양식)
8. 최종 제출

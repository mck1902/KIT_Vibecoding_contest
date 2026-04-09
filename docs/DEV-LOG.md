# EduWatch 개발 작업 내역

> 작성일: 2026-04-09 | 공모전 마감: 2026-04-13

---

## 프로젝트 현황 요약

| 항목 | 상태 |
|------|------|
| 프론트엔드 UI | ✅ 완료 (4페이지 + 공통 컴포넌트) |
| YouTube 강의 영상 연동 | ✅ 완료 (EBS 3개) |
| 백엔드 세션 API | ✅ 완료 (CRUD + 기록/이탈/종료) |
| Claude API 자막 분석 | ✅ 완료 |
| Claude RAG 맞춤형 리포트 | ✅ 완료 |
| 프론트-백엔드 실데이터 연결 | ✅ 완료 |
| TF.js 웹캠 연동 | ❌ 미구현 |
| 배포 (Vercel + Render) | ❌ 미구현 |

---

## 작업 내역 (날짜순)

### 2026-04-06 ~ 07 | Day 1–2: 기반 구축

- `focus_study/` 디렉터리에서 프로젝트 시작 (나중에 `KIT_Vibecoding_contest/`로 병합)
- React 19 + Vite + Express 초기 설정
- 4페이지 라우팅 구성 (Landing / Login / StudentDashboard / ParentDashboard)
- 기획 문서 작성 (`PLANNING.md`)
- AI Hub 데이터셋 및 모델 파이프라인 분석
- 아키텍처 설계 (온디바이스 AI 구조)
- MobileNet V3 모델 파일 TF.js 포맷 변환 완료  
  → `frontend/public/models/mobilenet/` (12.2MB, 3-shard)

---

### 2026-04-08 ~ 09 | Day 3–4: 핵심 UI + 백엔드 기반

#### 프론트엔드 구현

**공통 컴포넌트**
- `NavBar.jsx` — 로고, 네비게이션, 다크/라이트 테마 토글
- `Hero.jsx` — 랜딩 히어로 섹션 (CTA 버튼, 목업 이미지)
- `Features.jsx` — 4개 기능 소개 카드 (온디바이스 AI, RAG 리포트, 개인정보 보호, 데이터 코칭)
- `Footer.jsx` — 프로젝트 정보, 공모전 출처

**페이지**
- `Landing.jsx` — Hero + Features 조합 랜딩 페이지
- `Login.jsx` — 학생/학부모 역할 선택 화면
- `StudentDashboard.jsx` — 강의 시청 + 집중도 모니터링 화면
  - 강좌 카드 3개 (수강 목록)
  - YouTube IFrame API 연동 (실제 EBS 영상 재생)
  - 집중도 실시간 위젯 (conic-gradient 원형 미터)
  - Page Visibility API 탭 이탈 감지 + 경고 배너
  - 세션 타이머 + 프로그레스바
  - 모의 탭 이탈 버튼 (데모용)
- `ParentDashboard.jsx` — 학부모 리포트 대시보드
  - 요약 카드 3개 (학습시간, 평균 집중도, 탭 이탈 횟수)
  - Recharts `AreaChart` 집중도 추이 그래프
  - 규칙 기반 AI 코칭 카드
  - Claude RAG 맞춤형 분석 카드

**데이터**
- `frontend/src/data/lectures.json` — EBS 강좌 3개 (YouTube ID 포함)

```json
수학: P5l2heNKK_U  "[EBS] 고등예비과정 수학 I — 01강. 다항식의 연산"
영어: F229WLqJ0uo  "[EBS] 의진샘의 고등학교 영어 정복법 — 딩-기초편"
화학: DXkcmESt99Y  "[EBS] 개념완성 화학1 — 11강. 원자의 구조"
```

#### 백엔드 구현 (Express + MongoDB)

**서버 설정**
- `src/index.js` — Express, CORS, MongoDB Atlas 연결, 라우트 등록
- `src/config/db.js` — Mongoose 연결
- `.env` — PORT, MONGODB_URI, ANTHROPIC_API_KEY

**데이터 모델**
- `src/models/Session.js`
  - `records[]` — `{ timestamp, status(1~5), confidence }`
  - `departures[]` — `{ leaveTime, returnTime, duration }`

**세션 API (`/api/sessions`)**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/` | 세션 생성 (강의 시작) |
| PUT | `/:id/end` | 세션 종료 시각 기록 |
| POST | `/:id/records` | 집중도 분류 결과 저장 (3초 간격) |
| POST | `/:id/departures` | 탭 이탈 기록 |
| GET | `/:id/report` | 규칙 기반 리포트 반환 |
| GET | `/:id/rag-analysis` | Claude RAG 맞춤형 분석 반환 |
| GET | `/` | 세션 목록 조회 |
| GET | `/:id` | 세션 상세 조회 |

**강좌 API (`/api/lectures`)**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/` | 강좌 목록 조회 |
| POST | `/:id/analyze` | Claude API로 자막 분석 → segments 저장 |

**유틸리티**

- `src/utils/subtitleParser.js`  
  SRT 파일 파싱 → `[HH:MM] 텍스트` 형태로 변환 (Claude 입력용)

- `src/utils/claudeService.js`  
  - `analyzeLectureContent(subtitleText, title)` — 자막 → 구간별 주제/키워드 추출  
  - `generateRagReport(sessionData, segments, title)` — 집중도 타임라인 + 강좌 내용 → 맞춤형 분석 텍스트

- `src/utils/reportGenerator.js`  
  - `generateRuleBasedTips(sessionData)` — 탭 이탈, 집중도, 졸음 빈도 기반 코칭 팁 생성  
  - `buildChartData(records)` — records → 1분 단위 차트 데이터 변환

**자막 파일**
- `backend/data/subtitles/lec-001.srt` — 수학 (다항식의 연산, 6구간)
- `backend/data/subtitles/lec-002.srt` — 영어 (영어 공부법, 6구간)
- `backend/data/subtitles/lec-003.srt` — 화학 (원자의 구조, 6구간)

**강좌 메타데이터**
- `backend/data/lectures.json` — id, subject, title, youtubeId, analyzed, segments[]
  - `analyzed: false` 초기값, `/analyze` 호출 후 `true` + segments 채워짐
  - 한 번 분석되면 캐시 (재분석 불필요)

---

### 2026-04-09 | 프론트-백엔드 API 연동 + SessionReport 구현

#### 신규 파일

**`frontend/src/services/api.js`** (신규)
- 백엔드 API 호출 함수 전체 모음
- vite proxy (`/api` → `http://localhost:5000`) 활용, axios 미사용 (fetch 직접 사용)
- `sessionAPI`: `start / end / addRecords / addDeparture / getReport / getRagAnalysis / getById / getByStudent`
- `lectureAPI`: `getAll / analyze`
- `healthCheck`

**`frontend/src/pages/SessionReport.jsx`** (신규)
- 세션 종료 후 이동하는 학습 리포트 페이지 (`/student/report/:sessionId`)
- `GET /api/sessions/:id/report` — 규칙 기반 리포트 로딩
- `GET /api/sessions/:id/rag-analysis` — Claude RAG 분석 별도 로딩 (스피너 → 완료 시 텍스트)
- Recharts `AreaChart` — 1분 단위 집중도 타임라인
- 요약 카드 4개: 총 학습시간 / 평균 집중도 (색상) / 탭 이탈 횟수 / 분석 구간 수
- 규칙 기반 코칭 팁 목록
- RAG 오류 시 안내 메시지 (자막 미분석 구분)

**`frontend/src/pages/SessionReport.css`** (신규)
- 로딩 스피너, 요약 카드 4열, 2열 하단 그리드 (코칭 + RAG), 반응형

#### 수정된 파일

**`frontend/src/App.jsx`**
- `SessionReport` import 추가
- 라우트 추가: `<Route path="/student/report/:sessionId" element={<SessionReport />} />`

**`frontend/src/pages/StudentDashboard.jsx`**
- `handleEndSession` 수정:
  - `PUT /api/sessions/:id/end` 호출 후 `/student/report/:sessionId` 로 이동 (세션 ID 없으면 `/parent` 폴백)

#### 현재 세션 데이터 흐름 (확정)

```
강의 시작
  → POST /api/sessions           (studentId, lectureId, subject)
  → sessionIdRef.current 에 MongoDB _id 저장

세션 진행 중 (3초 간격)
  → POST /api/sessions/:id/records   [{ timestamp, status, confidence }]

탭 이탈 시
  → POST /api/sessions/:id/departures  { leaveTime, returnTime, duration(ms) }
  (실제 탭 전환 + 모의 탭 이탈 버튼 모두 동일 API 사용)

세션 종료
  → PUT /api/sessions/:id/end
  → navigate('/student/report/:sessionId')

리포트 페이지
  → GET /api/sessions/:id/report       (규칙 기반 통계 + 차트 데이터 + 코칭 팁)
  → GET /api/sessions/:id/rag-analysis (Claude RAG 맞춤형 분석 텍스트)
```

---

### 2026-04-09 | 프로젝트 병합

`focus_study/` 구현 내용 → `KIT_Vibecoding_contest/` 병합

**이식된 항목**
- `frontend/src/` 전체 (pages, components, data, api, assets)
- `backend/src/` 전체 (index.js → server.js 이름 변경)
- `backend/data/subtitles/` SRT 파일 3개

**설정 파일 업데이트**
- `frontend/vite.config.js` — API proxy 추가 (`/api` → `http://localhost:5000`)
- `frontend/package.json` — react-router-dom, recharts, react-icons 추가
- `backend/package.json` — mongoose, @anthropic-ai/sdk 추가, nodemon 유지
- `frontend/index.html` — 타이틀 `EduWatch — AI 학습태도 모니터링`으로 변경

---

## 현재 디렉터리 구조

```
KIT_Vibecoding_contest/
├── frontend/
│   ├── public/
│   │   └── models/mobilenet/        # TF.js 모델 (12.2MB)
│   └── src/
│       ├── App.jsx                  # 라우터 루트
│       ├── main.jsx
│       ├── index.css / App.css
│       ├── api/client.js            # fetch 래퍼
│       ├── data/lectures.json       # 강좌 + YouTube ID
│       ├── assets/
│       ├── services/
│       │   └── api.js                       ← 백엔드 API 호출 함수 전체
│       ├── pages/
│       │   ├── Landing.jsx + .css
│       │   ├── Login.jsx + .css
│       │   ├── StudentDashboard.jsx + .css   ← YouTube + 세션 API 연동
│       │   ├── SessionReport.jsx + .css      ← 세션 리포트 + RAG 표시 (신규)
│       │   └── ParentDashboard.jsx + .css    ← 하드코딩 (실데이터 연동 예정)
│       └── components/common/
│           ├── NavBar.jsx + .css
│           ├── Hero.jsx + .css
│           ├── Features.jsx + .css
│           └── Footer.jsx + .css
│
├── backend/
│   ├── .env                         # PORT, MONGODB_URI, ANTHROPIC_API_KEY
│   ├── .env.example
│   ├── data/
│   │   ├── lectures.json            # 강좌 메타 + Claude 분석 결과 캐시
│   │   └── subtitles/
│   │       ├── lec-001.srt          # 수학
│   │       ├── lec-002.srt          # 영어
│   │       └── lec-003.srt          # 화학
│   └── src/
│       ├── index.js                 # Express 서버
│       ├── config/db.js             # MongoDB 연결
│       ├── models/Session.js        # Mongoose 스키마
│       ├── controllers/
│       │   ├── sessionController.js # 세션 CRUD + 리포트 + RAG
│       │   └── lectureController.js # 강좌 조회 + 자막 분석
│       ├── routes/
│       │   ├── sessions.js
│       │   └── lectures.js
│       └── utils/
│           ├── subtitleParser.js    # SRT 파싱
│           ├── claudeService.js     # Claude API 연동
│           └── reportGenerator.js  # 규칙 기반 리포트 + 차트 데이터
│
├── docs/                            # 기획 및 개발 문서
│   ├── PLANNING.md
│   ├── EXPANSION.md
│   ├── SPEC-FRONTEND.md
│   ├── SPEC-BACKEND.md
│   ├── SPEC-AI.md
│   ├── SPEC-DEPLOY.md
│   └── DEV-LOG.md                  ← 이 파일
│
├── pretrained_model/
│   └── 1.모델소스코드/Mobilenet/Mobilenet.py
├── scripts/
│   ├── convert_model.py            # H5 → TF.js 변환 (완료)
│   └── verify_model.py             # 모델 검증
└── README.md
```

---

## 데이터 흐름

### 세션 흐름 (학생 → 서버 → 리포트) ✅ 연동 완료

```
학생 강의 시작
  → POST /api/sessions               (studentId, lectureId, subject)
  → sessionIdRef.current 에 MongoDB _id 저장

세션 진행 중 (3초 간격)
  → POST /api/sessions/:id/records   [{ timestamp, status(1~5), confidence }]

탭 이탈 시 (실제 탭 전환 + 모의 버튼 모두)
  → POST /api/sessions/:id/departures  { leaveTime, returnTime, duration(ms) }

세션 종료
  → PUT /api/sessions/:id/end
  → navigate('/student/report/:sessionId')

SessionReport 페이지
  → GET /api/sessions/:id/report       (규칙 기반 통계 + 차트 데이터 + 코칭 팁)
  → GET /api/sessions/:id/rag-analysis (Claude RAG 맞춤형 분석 텍스트)
```

### 리포트 흐름 (학부모 대시보드) — 하드코딩 상태 (연동 예정)

```
ParentDashboard 마운트
  → (미구현) GET /api/sessions?studentId=demo-student-001
  → 현재는 정적 샘플 데이터로 차트 / 코칭 카드 표시
```

### Claude API 자막 분석 흐름

```
POST /api/lectures/:id/analyze
  → SRT 파일 읽기 (subtitleParser.js)
  → Claude API 호출 (analyzeLectureContent)
  → segments JSON 추출
  → backend/data/lectures.json에 캐시 저장 (analyzed: true)
```

---

## 집중도 클래스 매핑

| status | 의미 | 집중도 환산 | 색상 |
|--------|------|------------|------|
| 1 | 집중 + 흥미로움 | 95% | #22c55e |
| 2 | 집중 + 차분함 | 80% | #3b82f6 |
| 3 | 집중하지 않음 + 차분함 | 55% | #f59e0b |
| 4 | 집중하지 않음 + 지루함 | 35% | #f97316 |
| 5 | 졸음 | 15% | #ef4444 |

---

## Claude API 사용 규칙

- 모델: `claude-sonnet-4-6`
- 자막 분석: 강좌 등록 시 1회, 결과 캐시 (재호출 없음)
- RAG 리포트: 세션 종료 시 1회
- API 키: `backend/.env` → `ANTHROPIC_API_KEY`

---

## 앞으로 해야 할 것

### 🔴 우선순위 높음

- [x] `services/api.js` 작성 — 백엔드 API 호출 함수 전체 ✅
- [x] `StudentDashboard` → 세션 시작/종료/기록/이탈 API 연동 ✅
- [x] `SessionReport.jsx` 신규 구현 (리포트 + RAG 결과 표시) ✅
- [ ] `ANTHROPIC_API_KEY` 설정 후 3개 강좌 자막 분석 실행
  ```bash
  curl -X POST http://localhost:5000/api/lectures/lec-001/analyze
  curl -X POST http://localhost:5000/api/lectures/lec-002/analyze
  curl -X POST http://localhost:5000/api/lectures/lec-003/analyze
  ```
- [ ] 전체 데모 흐름 E2E 테스트 (강의 시작 → 세션 종료 → 리포트 → RAG 확인)

### 🟡 있으면 좋음

- [ ] `ParentDashboard` 실데이터 연동 (`GET /api/sessions?studentId=demo-student-001`)
- [ ] TensorFlow.js 웹캠 연동 (`@tensorflow/tfjs`, `@tensorflow-models/face-landmarks-detection`)
- [ ] 실제 MobileNet V3 집중도 분류 (시뮬레이션 대체)
- [ ] 학부모 주간 리포트 API (`GET /api/students/:id/weekly`)

### 🟢 배포 (4/12)

- [ ] `backend/.env`에 `ANTHROPIC_API_KEY` 입력
- [ ] Vercel 배포 (프론트엔드)
- [ ] Render 배포 (백엔드, 환경변수 설정)
- [ ] GitHub public 전환
- [ ] README.md 최종 정리

---

## 실행 방법

```bash
# 백엔드
cd backend
npm install
# .env에 ANTHROPIC_API_KEY 입력 후
npm run dev        # http://localhost:5000

# 프론트엔드
cd frontend
npm install
npm run dev        # http://localhost:5173
```

---

## 기술 스택 (확정)

| 영역 | 기술 | 비고 |
|------|------|------|
| Frontend | React 19 + Vite | SPA |
| 라우팅 | React Router v7 | |
| 차트 | Recharts | AreaChart |
| 아이콘 | react-icons | |
| Backend | Node.js + Express 5 | |
| DB | MongoDB Atlas | Mongoose |
| 온디바이스 AI | TF.js 모델 파일 준비됨 | 코드 연동 미완 |
| 서버 AI | Claude API (claude-sonnet-4-6) | Anthropic SDK |
| 영상 | YouTube IFrame API | EBS 공식 채널 |
| 배포 FE | Vercel | 미완 |
| 배포 BE | Render | 미완 |

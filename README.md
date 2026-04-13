# EduWatch — AI 기반 온라인 학습 태도 모니터링 & 학부모 리포트 서비스

> 제1회 K.I.T. 바이브코딩 공모전 출품작 | 팀 투썸 지박령

## 목차

- [소개](#소개)
- [핵심 기능](#핵심-기능)
- [시스템 아키텍처](#시스템-아키텍처)
- [AI 모델](#ai-모델)
- [기술 스택](#기술-스택)
- [프로젝트 구조](#프로젝트-구조)
- [데이터 모델 (ERD)](#데이터-모델-erd)
- [API 명세](#api-명세)
- [프론트엔드 라우팅](#프론트엔드-라우팅)
- [주요 구현 상세](#주요-구현-상세)
- [실행 방법](#실행-방법)
- [배포](#배포)
- [테스트](#테스트)
- [라이선스](#라이선스)

---

## 소개

EduWatch는 인터넷 강의를 수강하는 학생의 학습 태도를 AI가 실시간으로 분석하고, 강좌 콘텐츠와 결합한 맞춤형 학습 리포트를 학부모에게 자동으로 제공하는 웹 서비스입니다.

**개인정보 보호 원칙**: 학생의 웹캠 영상은 브라우저 밖으로 전송되지 않습니다. TensorFlow.js로 브라우저 내에서 직접 추론하며, 서버에는 숫자로 된 집중도 분류 결과(1~5)만 전송됩니다.

---

## 핵심 기능

### 학생 측

- **실시간 집중도 모니터링**: 웹캠으로 학습자의 표정과 자세를 AI가 5단계로 분류 (1초 간격 추론)
- **온디바이스 AI**: BlazeFace 얼굴 감지 → MobileNet V3 Large 5클래스 분류를 브라우저에서 직접 실행
- **탭 이탈 감지**: Page Visibility API + Window blur/focus + Fullscreen API를 조합하여 강의 화면 이탈 횟수 및 시간 추적
- **영상 일시정지 추적**: YouTube 플레이어 상태 변화 감지로 일시정지 시점/시간 기록
- **세션 이어보기**: 브라우저 닫기/새로고침 시 세션을 일시중단하고, 재접속 시 이어보기 또는 처음부터 선택 가능
- **시간 이동(Seek) 방지**: 세션 중 YouTube 영상 건너뛰기를 감지하여 자동 복귀
- **학습 세션 리포트**: 세션 종료 후 집중도 타임라인 차트, 통계, AI 코칭 메시지 제공
- **AI 맞춤형 분석 (RAG)**: 집중도 데이터 + 강좌 자막 구간을 결합하여 "어떤 내용에서 집중도가 떨어졌는지" 분석
- **AI 복습 퀴즈**: 집중도가 낮았던 구간의 핵심 내용으로 객관식 3문제 자동 생성
- **에듀포인트 보상**: 목표 집중률 달성 + 완강 시 포인트 자동 지급, 누적 현황 표시

### 학부모 측

- **학습 대시보드**: 자녀의 세션별 집중도 추이 차트, 통계, AI 코칭 메시지 열람
- **자녀 연결**: 6자리 초대 코드 기반 학부모-자녀 계정 연결 (다자녀 지원)
- **RAG 분석 열람**: 강좌 내용과 교차한 AI 맞춤형 분석 리포트 확인
- **퀴즈 결과 확인**: 자녀의 복습 퀴즈 점수 및 오답 확인
- **에듀포인트 관리**: 목표 집중률, 세션당 보상, 주간 보너스 조건 설정 및 포인트 충전
- **완료/미완료 필터**: 완강 세션과 미완료 세션을 분류하여 조회

---

## 시스템 아키텍처

```
┌──────────────────────────────────────┐
│        학생 브라우저 (온디바이스 AI)     │
│                                      │
│  웹캠 캡처 (640x480)                   │
│    ↓                                 │
│  BlazeFace 얼굴 감지                   │
│    ↓                                 │
│  얼굴 영역 크롭 + 20% 마진 확장          │
│    ↓                                 │
│  224x224 리사이즈                      │
│    ↓                                 │
│  MobileNet V3 Large 5클래스 분류        │
│    ↓                                 │
│  focusProb 계산 (집중 클래스 확률 합)     │
│                                      │
│  + Page Visibility API 탭 이탈 감지     │
│  + YouTube IFrame API 영상 추적         │
│  + Fullscreen API 전체화면 감시          │
│                                      │
│  → 1초마다 record 생성                  │
│  → 3초마다 배치 전송 ─────────────────┐  │
└──────────────────────────────────────┘  │
                                         ↓
┌──────────────────────────────────────────┐
│              Express 백엔드              │
│                                          │
│  POST /api/sessions/:id/records          │
│  POST /api/sessions/:id/departures       │
│  POST /api/sessions/:id/pause-events     │
│    ↓                                     │
│  MongoDB (Session 컬렉션에 저장)           │
│    ↓                                     │
│  GET /api/sessions/:id/report            │
│    → 규칙 기반 리포트 (집계 + 코칭 팁)     │
│                                          │
│  GET /api/sessions/:id/rag-analysis      │
│    → OpenAI GPT-4o-mini RAG 분석         │
│    → MongoDB 캐시 (재호출 방지)            │
│                                          │
│  POST /api/sessions/:id/quiz             │
│    → 저집중 구간 추출                      │
│    → 해당 구간 자막 추출                   │
│    → GPT-4o-mini 퀴즈 생성               │
│                                          │
│  POST /api/lectures/:id/analyze          │
│    → SRT 자막 → GPT-4o-mini 구간 분석     │
│    → segments 캐시 저장                   │
└──────────────────────────────────────────┘
```

---

## AI 모델

### 온디바이스 분류 모델

| 항목 | 상세 |
|---|---|
| **데이터셋** | AI Hub "학습태도 및 성향관찰 데이터" (Apache 2.0) |
| **베이스 모델** | MobileNet V3 Large (ImageNet 사전학습) |
| **학습 방식** | 전이학습 — 1단계: 백본 프리즈 + FC 헤드 학습, 2단계: 전체 파인튜닝 |
| **학습 설정** | Adam (lr=1e-4), 배치 256, 에폭 300 (EarlyStopping patience=10) |
| **FC 헤드** | Dense(128) → BN → ReLU → Dropout(0.2) → Dense(32) → BN → ReLU → Dropout(0.2) → Dense(5, softmax) |
| **데이터 증강** | 좌우 반전, 밝기/대비/채도/색조 랜덤 변형 |
| **입력** | 224×224×3 RGB 이미지 (얼굴 영역 크롭) |
| **출력** | 5클래스 softmax 확률 |
| **변환** | H5 → TensorFlow.js Graph Model (model.json + 3개 shard, 약 12MB) |
| **실행 환경** | 브라우저 (TF.js WebGL 백엔드) |

### 5클래스 분류 체계

| Status | 클래스명 | 집중도 기본값 | 설명 |
|--------|---------|-------------|------|
| 1 | 집중 + 흥미 | 95% | 적극적으로 집중하며 관심을 보이는 상태 |
| 2 | 집중 + 차분 | 80% | 차분하게 집중하고 있는 상태 |
| 3 | 비집중 + 차분 | 55% | 차분하지만 집중하지 않는 상태 |
| 4 | 비집중 + 지루 | 35% | 지루해하며 집중하지 않는 상태 |
| 5 | 졸음 | 15% | 졸고 있는 상태 |

### 집중도 점수 산출 방식 (`focusProb`)

- **새 방식**: 집중 클래스(status 1, 2) 확률 합산 × 100 → 0~100% 스케일
  - 예: `probs[0]=0.6, probs[1]=0.25` → focusProb = 85
- **폴백 (기존 데이터)**: `STATUS_TO_FOCUS[status] × confidence + 50 × (1 - confidence)`
- 일시정지 기간의 레코드는 평균 집중도 계산에서 제외

### 얼굴 미감지 처리

- 얼굴 미감지 시 `noFaceCount` 증가
- 연속 5회(5초) 이상 미감지 → status 5 (졸음) 판정
- 5회 미만 → status 4 (지루함) 판정
- 서버 측에서 연속 5회 이상 status 5 구간을 "자리 이탈 추정"으로 분류하여 졸음 통계에서 제외

### 서버 AI (OpenAI GPT-4o-mini)

| 기능 | 엔드포인트 | 용도 |
|------|-----------|------|
| 자막 분석 | `POST /api/lectures/:id/analyze` | SRT 자막 → 구간별 주제/키워드 추출 (JSON 응답) |
| RAG 리포트 | `GET /api/sessions/:id/rag-analysis` | 15개 분석 지표 + 자막 구간 → 학부모용 5섹션 리포트 |
| 퀴즈 생성 | `POST /api/sessions/:id/quiz` | 저집중 구간 자막 → 객관식 3문제 자동 생성 |

모든 AI API 호출은 재시도 래퍼(`withRetry`)로 감싸며, 429 (Rate Limit) 시 지수 백오프 적용. 결과는 MongoDB에 캐시되어 동일 요청에 API 재호출 방지.

---

## 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| React | 19.2 | UI 프레임워크 |
| Vite | 8.0 | 빌드 도구 + 개발 서버 |
| React Router | 7.14 | SPA 라우팅 |
| Recharts | 3.8 | 집중도 타임라인 차트 |
| TensorFlow.js | 4.22 | 온디바이스 AI 추론 |
| BlazeFace | 0.1 | 실시간 얼굴 감지 |
| Tailwind CSS | 3.4 | 랜딩 페이지 스타일링 |
| Lucide React | 1.8 | 아이콘 |

### Backend
| 기술 | 버전 | 용도 |
|------|------|------|
| Express | 5.2 | HTTP 서버 프레임워크 |
| Mongoose | 9.4 | MongoDB ODM |
| OpenAI SDK | 6.34 | GPT-4o-mini API 클라이언트 |
| JSON Web Token | 9.0 | JWT 인증 |
| bcryptjs | 3.0 | 비밀번호 해싱 |
| Zod | 4.3 | 요청 유효성 검증 |
| express-rate-limit | 8.3 | API 속도 제한 |
| Nodemon | 3.1 | 개발 서버 자동 재시작 |

### 테스트
| 기술 | 버전 | 용도 |
|------|------|------|
| Jest | 30.3 | 테스트 프레임워크 |
| mongodb-memory-server | 11.0 | 인메모리 MongoDB (ReplSet, 트랜잭션 지원) |
| Supertest | 7.2 | HTTP 통합 테스트 |

### 배포
| 서비스 | 대상 |
|--------|------|
| Vercel | 프론트엔드 (SPA, rewrites 설정) |
| Render | 백엔드 (Node.js) |
| MongoDB Atlas | 데이터베이스 (test/dev 환경 분리) |

---

## 프로젝트 구조

```
kit-vibecoding-contest/
├── frontend/                          # React 프론트엔드
│   ├── index.html                     # Vite 진입점
│   ├── vite.config.js                 # Vite 설정 (프록시: /api → localhost:5001)
│   ├── vercel.json                    # Vercel SPA rewrites
│   ├── tailwind.config.js             # Tailwind CSS 설정
│   ├── postcss.config.js              # PostCSS 설정
│   ├── public/
│   │   └── models/mobilenet/          # TF.js 변환 모델 (model.json + shards)
│   └── src/
│       ├── main.jsx                   # React 진입점
│       ├── App.jsx                    # 라우터 + 테마 + 레이아웃
│       ├── index.css                  # 글로벌 스타일 (다크/라이트 테마)
│       ├── api/
│       │   └── client.js              # API 클라이언트 베이스
│       ├── assets/                    # 히어로 일러스트, 배너 이미지
│       ├── contexts/
│       │   └── AuthContext.jsx        # 인증 상태 관리 (JWT, 로그인/가입/로그아웃)
│       ├── services/
│       │   └── api.js                 # 백엔드 API 호출 함수 모음 (세션/인증/포인트/강좌)
│       ├── hooks/
│       │   ├── useWebcam.js           # 웹캠 스트림 관리 + 프레임 캡처
│       │   └── useAttentionAnalysis.js # TF.js 모델 로딩 + 추론 루프
│       ├── components/
│       │   ├── common/
│       │   │   ├── NavBar.jsx         # 상단 네비게이션 (다크모드 토글)
│       │   │   ├── Footer.jsx         # 하단 푸터
│       │   │   ├── Hero.jsx           # 히어로 섹션
│       │   │   ├── Features.jsx       # 기능 소개 섹션
│       │   │   └── ProtectedRoute.jsx # 인증 + 역할 가드
│       │   ├── point/
│       │   │   ├── PointBalance.jsx   # 포인트 잔액 + 충전 버튼
│       │   │   ├── PointHistory.jsx   # 최근 포인트 내역
│       │   │   └── WeeklyProgress.jsx # 주간 보너스 진행률
│       │   └── quiz/
│       │       └── QuizSection.jsx    # 퀴즈 생성/풀이/결과 UI
│       ├── pages/
│       │   ├── Landing.jsx            # 랜딩 페이지 (Tailwind, 히어로+카드)
│       │   ├── Login.jsx              # 로그인
│       │   ├── Register.jsx           # 회원가입 (역할 선택, 초대 코드)
│       │   ├── StudentDashboard.jsx   # 학생 대시보드 (YouTube + 웹캠 + AI)
│       │   ├── SessionReport.jsx      # 세션 리포트 (차트 + RAG + 퀴즈 + 포인트)
│       │   ├── ParentDashboard.jsx    # 학부모 대시보드 (리포트 열람 + 포인트)
│       │   ├── ParentPointSettings.jsx # 에듀포인트 설정 (목표/보상/충전)
│       │   ├── ProfileSettings.jsx    # 프로필 설정 (이름/비밀번호/연결 관리)
│       │   └── Features.jsx           # 기능 소개 페이지
│       └── data/
│           └── lectures.json          # 프론트엔드 강좌 목록 (YouTube ID 포함)
│
├── backend/                           # Express 백엔드
│   ├── .env                           # 환경변수 (Git 제외)
│   ├── package.json                   # 의존성 + 스크립트 (start/dev/test/seed)
│   ├── jest.config.js                 # Jest 설정
│   ├── data/
│   │   ├── lectures.json              # 강좌 메타데이터 (시드용)
│   │   └── subtitles/                 # SRT 자막 파일 (강좌별)
│   │       ├── lec-001.srt            # 조선무협
│   │       ├── lec-002.srt            # 인간젊어지기
│   │       └── lec-003.srt            # 유리투명
│   ├── scripts/
│   │   ├── seedLectures.js            # 강좌 + 자막 → MongoDB 시드
│   │   └── seedDemo.js                # 데모용 세션 데이터 생성 (심사위원용)
│   └── src/
│       ├── index.js                   # Express 서버 진입점 (CORS, 라우트 마운트)
│       ├── config/
│       │   └── db.js                  # MongoDB 연결 (DB_TARGET으로 test/dev 분리)
│       ├── middleware/
│       │   ├── auth.js                # JWT 인증 + 역할 검사 미들웨어
│       │   └── validate.js            # Zod 스키마 검증 미들웨어 (모든 요청 입력)
│       ├── models/
│       │   ├── Student.js             # 학생 모델 (email, studentId, gradeLevel, inviteCode)
│       │   ├── Parent.js              # 학부모 모델 (email, children[ObjectId])
│       │   ├── Session.js             # 세션 모델 (records, departures, pauseEvents 등)
│       │   ├── Lecture.js             # 강좌 모델 (subtitleText, segments, analyzed)
│       │   ├── EduPoint.js            # 에듀포인트 모델 (잔액, 설정, 소급 방지)
│       │   ├── PointHistory.js        # 포인트 내역 (earn/charge/weekly_bonus, 유니크 인덱스)
│       │   └── Quiz.js               # 퀴즈 모델 (문제, 결과, 세션당 1개 유니크)
│       ├── routes/
│       │   ├── auth.js                # 인증 라우트 (가입/로그인/연결/프로필 + Rate Limit)
│       │   ├── sessions.js            # 세션 라우트 (CRUD + 기록 + 리포트 + 퀴즈)
│       │   ├── lectures.js            # 강좌 라우트 (목록 + 자막 분석)
│       │   └── edupoint.js            # 포인트 라우트 (조회/설정/충전/내역)
│       ├── controllers/
│       │   ├── authController.js      # 인증 로직 (bcrypt, JWT, 초대 코드 연결)
│       │   ├── sessionController.js   # 세션 로직 (시작/종료/일시중단/리포트/RAG/포인트)
│       │   ├── lectureController.js   # 강좌 로직 (목록, AI 자막 분석)
│       │   ├── edupointController.js  # 포인트 로직 (설정/충전/내역, 소급 방지)
│       │   └── quizController.js      # 퀴즈 로직 (생성/조회/제출, 저집중 구간 추출)
│       ├── utils/
│       │   ├── aiService.js           # OpenAI GPT-4o-mini 클라이언트 (분석/RAG/퀴즈)
│       │   ├── reportGenerator.js     # 규칙 기반 리포트 (코칭 팁 + 차트 데이터)
│       │   ├── subtitleParser.js      # SRT 자막 파싱 (타임스탬프 포함 텍스트)
│       │   ├── constants.js           # STATUS_TO_FOCUS 매핑 + calcFocus 함수
│       │   └── weekUtils.js           # KST 기준 주간 범위 계산 (에듀포인트용)
│       └── tests/
│           ├── setup.js               # 테스트 환경 (인메모리 MongoDB ReplSet + 헬퍼)
│           ├── app.js                 # Express 앱 (테스트용)
│           ├── edupoint/              # 에듀포인트 테스트 (인가/충전/보상/설정/주간보너스)
│           ├── session/               # 세션 테스트 (완료 기준)
│           └── utils/                 # 유틸리티 테스트 (주간 범위)
│
├── pretrained_model/                  # AI 모델 원본
│   ├── 1.모델소스코드/
│   │   └── Mobilenet/
│   │       └── Mobilenet.py           # 학습 코드 (MobileNetV3 전이학습)
│   └── 2.AI학습모델파일/
│       └── Mobilenet_model/
│           └── Mobilenet_model.h5     # 학습된 모델 파일 (Git 제외, .gitignore)
│
├── scripts/
│   ├── convert_model.py               # H5 → TF.js 변환 스크립트
│   └── verify_model.py                # 모델 구조/학습 여부 검증 스크립트
│
├── docs/                              # 기획 및 설계 문서
│   ├── PLANNING.md                    # 상세 기획서
│   ├── EXPANSION.md                   # 확장 계획
│   ├── SPEC-FRONTEND.md               # 프론트엔드 명세
│   ├── SPEC-BACKEND.md                # 백엔드 명세
│   ├── SPEC-AI.md                     # AI 모델 명세
│   ├── SPEC-DEPLOY.md                 # 배포 명세
│   ├── erd.mermaid                    # ERD (Mermaid)
│   ├── PLAN-EDUPOINT.md               # 에듀포인트 설계
│   ├── PLAN-QUIZ.md                   # 퀴즈 기능 설계
│   ├── DEV-LOG.md                     # 개발 로그
│   ├── SECURITY-IMPROVEMENTS.md       # 보안 개선 사항
│   └── ...                            # 기타 기획/계획 문서
│
├── CLAUDE.md                          # Claude Code 가이드
├── .gitignore
└── README.md
```

---

## 데이터 모델 (ERD)

```mermaid
erDiagram
    Student {
        ObjectId _id PK
        String email UK
        String passwordHash
        String name
        String studentId UK
        String gradeLevel "middle | high"
        String inviteCode UK "6자리"
    }

    Parent {
        ObjectId _id PK
        String email UK
        String passwordHash
        String name
        ObjectId[] children FK
        String inviteCode UK "6자리"
    }

    Lecture {
        ObjectId _id PK
        String lectureId UK
        String title
        String subject
        String youtubeId
        Number durationSec
        String subtitleText
        Array segments "AI 분석 결과"
        Boolean analyzed
    }

    Session {
        ObjectId _id PK
        String studentId FK
        String lectureId FK
        String subject
        Date startTime
        Date endTime
        Array records "집중도 기록 (내장)"
        Array departures "탭 이탈 (내장)"
        Array pauseEvents "영상 일시정지 (내장)"
        Array sessionPauses "세션 이탈 (내장)"
        String ragAnalysis "AI 분석 캐시"
        Number focusRate
        Number completionRate
        Number lastVideoTime
        Number pointEarned
        Boolean pointAwarded
    }

    EduPoint {
        ObjectId _id PK
        ObjectId parentId FK
        String studentId FK
        Number balance
        Number studentEarned
        Object settings "목표/보상/주간보너스"
        Date settingsEffectiveFrom
        Object previousSettings "소급 방지용"
    }

    PointHistory {
        ObjectId _id PK
        String studentId FK
        ObjectId parentId FK
        String type "earn|charge|weekly_bonus|weekly_bonus_failed"
        Number amount
        String reason
        ObjectId sessionId FK
        Number parentBalanceAfter
        Number studentEarnedAfter
    }

    Quiz {
        ObjectId _id PK
        ObjectId sessionId FK UK
        String studentId
        String lectureId
        Array lowFocusSegments
        Array questions "4지선다 문제"
        Object results "답/점수/완료시각"
    }

    Parent ||--o{ Student : "children 배열"
    Student ||--o{ Session : "studentId"
    Lecture ||--o{ Session : "lectureId"
    Session ||--o| Quiz : "sessionId (1:1)"
    Parent ||--o{ EduPoint : "parentId"
    EduPoint ||--o{ PointHistory : "학부모-자녀 쌍"
    Session ||--o{ PointHistory : "sessionId"
```

---

## API 명세

### 인증 (`/api/auth`)

| Method | 경로 | 설명 | 인증 | Rate Limit |
|--------|------|------|------|-----------|
| `POST` | `/register` | 회원가입 (학생/학부모, 초대 코드 선택) | - | 10/시간 |
| `POST` | `/login` | 로그인 → JWT 발급 | - | 20/15분 |
| `GET` | `/me` | 토큰 검증 + 새 토큰 발급 | JWT | - |
| `PUT` | `/link` | 초대 코드로 상대방 연결 | JWT | 30/15분 |
| `DELETE` | `/link` | 연결 해제 (학생: 학부모, 학부모: 특정/전체 자녀) | JWT | - |
| `PATCH` | `/profile` | 이름/비밀번호 변경 | JWT | 30/15분 |
| `GET` | `/child` | 연결된 자녀 목록 (학부모 전용) | JWT | - |
| `GET` | `/parent` | 연결된 학부모 정보 (학생 전용) | JWT | - |

### 세션 (`/api/sessions`)

| Method | 경로 | 설명 | 인증 | 역할 |
|--------|------|------|------|------|
| `POST` | `/` | 세션 시작 (미종료 세션 있으면 반환) | JWT | 학생 |
| `GET` | `/` | 세션 목록 조회 (역할별 자동 필터) | JWT | 전체 |
| `GET` | `/:id` | 세션 상세 조회 | JWT | 전체 |
| `PUT` | `/:id/end` | 세션 종료 + 포인트 지급 | JWT | 학생 |
| `PUT` | `/:id/pause` | 세션 일시중단 (브라우저 닫기 시) | JWT | 학생 |
| `DELETE` | `/:id` | 미종료 세션 삭제 | JWT | 학생 |
| `POST` | `/:id/records` | 집중도 기록 배치 저장 | JWT | 학생 |
| `POST` | `/:id/departures` | 탭 이탈 기록 저장 | JWT | 학생 |
| `POST` | `/:id/pause-events` | 영상 일시정지 기록 저장 | JWT | 학생 |
| `GET` | `/:id/report` | 규칙 기반 리포트 | JWT | 전체 |
| `GET` | `/:id/rag-analysis` | AI RAG 맞춤형 분석 | JWT | 전체 |
| `POST` | `/:id/quiz` | 퀴즈 생성 | JWT | 학생 |
| `GET` | `/:id/quiz` | 퀴즈 조회 (미풀이 시 정답 제거) | JWT | 전체 |
| `PUT` | `/:id/quiz/submit` | 퀴즈 제출 + 채점 | JWT | 학생 |

### 강좌 (`/api/lectures`)

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| `GET` | `/` | 강좌 목록 조회 | JWT |
| `POST` | `/:id/analyze` | 자막 AI 분석 (캐시) | JWT |

### 에듀포인트 (`/api/edupoint`)

| Method | 경로 | 설명 | 인증 | 역할 |
|--------|------|------|------|------|
| `GET` | `/:studentId` | 포인트 설정 + 잔액 조회 | JWT | 전체 |
| `PUT` | `/:studentId/settings` | 포인트 설정 변경 (다음 주 적용) | JWT | 학부모 |
| `POST` | `/:studentId/charge` | 포인트 충전 (1000/5000/10000) | JWT | 학부모 |
| `GET` | `/:studentId/history` | 포인트 내역 조회 (페이지네이션) | JWT | 전체 |

---

## 프론트엔드 라우팅

| 경로 | 컴포넌트 | 인증 | 역할 | 설명 |
|------|---------|------|------|------|
| `/` | Landing | - | - | 랜딩 페이지 |
| `/features` | Features | - | - | 기능 소개 |
| `/login` | Login | - | - | 로그인 (이미 로그인 시 대시보드로 리다이렉트) |
| `/register` | Register | - | - | 회원가입 (역할 선택 + 초대 코드) |
| `/student` | StudentDashboard | JWT | student | 학생 대시보드 (YouTube + 웹캠 + AI) |
| `/student/report/:sessionId` | SessionReport | JWT | student | 세션 리포트 |
| `/parent` | ParentDashboard | JWT | parent | 학부모 대시보드 |
| `/parent/point-settings` | ParentPointSettings | JWT | parent | 에듀포인트 설정 |
| `/settings` | ProfileSettings | JWT | - | 프로필 설정 |

---

## 주요 구현 상세

### 1. 온디바이스 AI 추론 파이프라인

```
useWebcam.js                    useAttentionAnalysis.js
┌──────────────┐               ┌────────────────────────────────┐
│ getUserMedia  │               │ 1. loadModels()                │
│ 640x480 스트림 │ → captureFrame → │   - tf.ready() (WebGL)         │
│ videoRef      │               │   - blazeface.load()           │
│ canvasRef     │               │   - tf.loadGraphModel(MODEL_URL)│
└──────────────┘               │                                │
                               │ 2. analyzeFrame() (1초 간격)     │
                               │   - fromPixels(imageData)       │
                               │   - estimateFaces() (BlazeFace)  │
                               │   - 얼굴 크롭 + 20% 마진         │
                               │   - resizeBilinear(224,224)      │
                               │   - model.predict()             │
                               │   - argmax → status (1~5)       │
                               │   - probs[0]+probs[1] → focusProb│
                               └────────────────────────────────┘
```

### 2. 탭 이탈 감지 (3중 감지 시스템)

1. **Page Visibility API**: `document.visibilityState === 'hidden'` 감지 (탭 완전 전환)
2. **Window blur/focus**: `document.hasFocus()` 확인 (다른 창으로 포커스 이동, YouTube iframe 클릭은 제외)
3. **Fullscreen API + 리사이즈**: 전체화면 해제 감지 (`window.outerWidth/screen.availWidth` 비율 0.85 이하)

### 3. 에듀포인트 시스템

- **세션 보상**: 목표 집중률 달성 + completionRate ≥ 90% → 포인트 자동 지급
- **주간 보너스**: 주 N회 달성 시 추가 보너스 (KST 월요일 기준)
- **트랜잭션**: MongoDB `withTransaction`으로 원자적 처리 (잔액 차감 + 포인트 증가 + 이력 기록)
- **다중 방어 레이어**:
  - 방어 1: `PointHistory` 유니크 인덱스 (sessionId + type)
  - 방어 2: `Session.pointAwarded` 플래그 선점
  - 방어 3: 트랜잭션 진입 전 `PointHistory.exists()` fast-fail
  - 방어 4: Idempotency 가드 (이미 종료된 세션 재요청 시 기존 결과 반환)
- **소급 방지**: 설정 변경 시 `settingsEffectiveFrom`을 다음 주 월요일로 설정, 이번 주는 `previousSettings` 적용

### 4. RAG 리포트 분석 데이터 (15개 지표)

GPT-4o-mini에 전달되는 분석 데이터:

1. 총 학습 시간 (세션 이탈 시간 제외)
2. 상태별 분포 (5클래스 각각 횟수/비율)
3. AI 모델 평균 신뢰도 + 낮은 신뢰도 비율
4. 1분 단위 집중도 타임라인 (경과 시간 기준 + 영상 시간 기준)
5. 집중도 표준편차 + 안정성 라벨
6. 집중→비집중 전환 횟수
7. 세션 3등분 평균 (전반/중반/후반)
8. 졸음 분석 (얼굴 미감지 구간 제외한 순수 졸음)
9. 얼굴 미감지 구간 (자리 이탈 추정)
10. 탭 이탈 심각도 분류 (짧은/중간/긴)
11. 이탈-강의내용 교차 분석
12. 집중 회복 시간 (이탈 복귀 후 재집중까지)
13. 영상 일시정지 기록 (시점 + 지속시간)
14. 구간별 강의 내용 (주제 + 키워드)
15. 최고/최저 집중 구간 (1분 단위 top3/bottom3)

### 5. 퀴즈 생성 로직

1. 세션의 records에서 `videoTime` 존재 여부 확인
2. `videoTime` 있으면 영상 시간 기반 구간 매칭, 없으면 경과 시간 기반 폴백
3. 강좌 segments와 교차하여 각 구간 평균 집중도 계산
4. 집중도 < 60% 구간 우선 선별 (없으면 최하위 2개)
5. 해당 구간의 SRT 자막 텍스트 추출 (최대 2000자)
6. GPT-4o-mini로 객관식 4지선다 3문제 생성
7. 세션당 1개만 허용 (MongoDB 유니크 인덱스)
8. 미풀이 상태에서 조회 시 정답/해설 제거

### 6. 인증 시스템

- **JWT 기반**: HS256, 7일 만료, `Authorization: Bearer` 헤더
- **비밀번호**: bcrypt 10-round 해싱
- **초대 코드**: 6자리 영숫자 (혼동 문자 제외: I, L, O, 0, 1)
- **토큰 갱신**: `/api/auth/me` 호출 시 DB 최신 상태 기반 새 토큰 발급 (stale token 방지)
- **권한 검증**: 세션 접근 시 JWT의 `childStudentIds`를 신뢰하지 않고 DB에서 현재 `Parent.children` 직접 조회
- **입력 검증**: 모든 요청 body를 Zod 스키마로 검증 (타입 + 범위 + 형식)
- **Rate Limiting**: 회원가입(10/시간), 로그인(20/15분), 연결/프로필(30/15분)

### 7. 세션 이어보기

1. 브라우저 닫기/새로고침 시 `beforeunload` 이벤트 → `PUT /sessions/:id/pause` (keepalive fetch)
2. `sessionPauses` 배열에 `pausedAt` 기록
3. 재접속 시 같은 학생+강의의 미종료 세션 존재 확인 → 이어보기 모달 표시
4. 이어보기 선택 시 `lastVideoTime`부터 재생 재개, `resumedAt` + `duration` 기록
5. 총 학습시간 계산 시 `sessionPauses` 기간 제외

---

## 실행 방법

### 사전 요구사항

- Node.js 18+
- MongoDB Atlas 계정 (또는 로컬 MongoDB)
- OpenAI API Key

### Backend

```bash
cd backend
npm install

# 환경변수 설정
cat > .env << 'EOF'
PORT=5001
JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=your-openai-api-key
MONGODB_URI_TEST=mongodb+srv://...@cluster.mongodb.net/test
MONGODB_URI_DEV=mongodb+srv://...@cluster.mongodb.net/dev
DB_TARGET=dev
EOF

# 강좌 데이터 시드
node scripts/seedLectures.js

# 데모 데이터 시드 (선택)
node scripts/seedDemo.js

# 개발 서버 시작
npm run dev
```

### Frontend

```bash
cd frontend
npm install

# 배포 환경에서 백엔드 URL 설정 (선택)
# VITE_API_URL=https://your-backend.onrender.com

npm run dev    # 개발 서버 (포트 5173, /api → localhost:5001 프록시)
```

### AI 모델 변환 (선택)

```bash
cd scripts
pip install tensorflow tensorflowjs

# H5 → TF.js 변환
python convert_model.py

# 모델 검증
python verify_model.py
```

---

## 배포

### Frontend → Vercel

```bash
cd frontend
npm run build    # dist/ 생성
# Vercel 자동 감지 또는 vercel.json의 rewrites 설정 적용
```

환경변수: `VITE_API_URL` = 백엔드 Render URL

### Backend → Render

- Build: `npm install`
- Start: `npm start` (`node src/index.js`)
- 환경변수: `PORT`, `JWT_SECRET`, `OPENAI_API_KEY`, `MONGODB_URI_DEV`, `DB_TARGET`, `ALLOWED_ORIGINS`
- `trust proxy` 설정 적용 (`app.set('trust proxy', 1)`) — Render 프록시 환경에서 express-rate-limit 정상 동작

---

## 테스트

```bash
cd backend
npm test
```

### 테스트 구조

- **인메모리 MongoDB ReplSet**: 트랜잭션 테스트 지원 (MongoDB Memory Server)
- **에듀포인트 테스트**: 인가 검증, 충전, 포인트 보상, 설정 변경, 주간 보너스
- **세션 테스트**: 완료 기준 (completionRate)
- **유틸리티 테스트**: KST 주간 범위 계산

---

## 데모 계정

| 역할 | 이메일 | 비밀번호 |
|------|--------|---------|
| 학생 | student@demo.com | password123 |

---

## 라이선스

- AI 모델 학습 데이터: Apache License 2.0 (AI Hub)
- 프로젝트 코드: 공모전 출품작

## AI 협업

이 프로젝트는 AI와의 페어프로그래밍으로 개발되었습니다.
- **Claude Code**: 구현 계획 수립, 아키텍처 설계, 코드 작성
- **Codex**: 코드 리뷰 및 검증 (보안, 설계 결함 탐지)
- **OpenAI GPT-4o-mini**: 서버 AI (자막 분석, RAG 리포트, 퀴즈 생성)

기획, 설계, 구현 전 과정의 관련 문서는 `docs/` 폴더에서 확인할 수 있습니다.

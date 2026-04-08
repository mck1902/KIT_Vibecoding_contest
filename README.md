# EduWatch — AI 학습태도 모니터링 & 학부모 리포트 서비스

> 2026 KIT 바이브코딩 공모전 출품작

## 소개
EduWatch는 인터넷 강의를 수강하는 학생의 학습 태도를 AI가 실시간으로 분석하고,
강좌 콘텐츠와 결합한 맞춤형 학습 리포트를 학부모에게 자동으로 제공하는 웹 서비스입니다.

## 핵심 기능
- **실시간 집중도 모니터링**: 웹캠으로 학습자의 표정/자세를 AI가 5단계로 분류
- **온디바이스 AI**: 영상 데이터는 서버로 전송하지 않고, 브라우저에서 직접 분석 (개인정보 보호)
- **탭 이탈 감지**: Page Visibility API로 강의 화면 이탈 횟수 및 시간 추적
- **강좌 콘텐츠 분석**: 자막 기반으로 강의 내용을 구간별 주제로 자동 분류 (Claude API)
- **RAG 맞춤형 리포트**: 집중도 데이터 + 강좌 내용을 결합하여 "어떤 내용에서 집중도가 떨어졌는지" 분석
- **학부모 대시보드**: 일간/주간 리포트, 집중도 그래프, AI 학습 코칭 메시지

## AI 모델
- AI Hub "학습태도 및 성향관찰 데이터" 기반 (Apache 2.0)
- MobileNet V3 Large 전이학습 모델 (F1-score: 0.97)
- 5클래스 분류: 집중+흥미, 집중+차분, 비집중+차분, 비집중+지루, 졸음
- TensorFlow.js로 브라우저에서 실행 (온디바이스)

## 기술 스택
- **Frontend**: React (Vite) + Recharts + React Router
- **Backend**: Node.js (Express)
- **온디바이스 AI**: TensorFlow.js (얼굴 검출/랜드마크 + 집중도 분류)
- **서버 AI**: Claude API (강좌 콘텐츠 분석 + RAG 맞춤형 리포트)
- **배포**: Vercel (FE) + Render (BE)

## 프로젝트 구조
```
kit-vibecoding-contest/
├── frontend/           # React 프론트엔드
│   └── src/
│       ├── pages/      # 로그인, 학생 대시보드, 강의, 학부모 대시보드
│       ├── components/ # 위젯, 차트, 리포트 컴포넌트
│       └── hooks/      # 웹캠, AI 분석, 탭 이탈 감지, 세션 관리
├── backend/            # Express 백엔드
│   └── src/
│       ├── routes/     # 세션, 학생, 강좌 API
│       ├── utils/      # 자막 파싱, Claude API, 리포트 생성
│       └── data/       # JSON 저장소, 자막 파일
├── docs/               # 기획 문서
│   ├── PLANNING.md     # 상세 기획서
│   ├── EXPANSION.md    # 확장 계획 (에듀포인트, PG사 연동 등)
│   ├── SPEC-FRONTEND.md
│   ├── SPEC-BACKEND.md
│   ├── SPEC-AI.md
│   └── SPEC-DEPLOY.md
├── .gitignore
└── README.md
```

## 실행 방법

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
cp .env.example .env    # 환경변수 설정 (ANTHROPIC_API_KEY 포함)
npm install
npm run dev
```

## 아키텍처
```
[학생 브라우저 - 온디바이스 AI]              [서버]
 웹캠 → 얼굴 검출 → 랜드마크 → 분류
 탭 이탈 감지 (Page Visibility API)
 → 결과(숫자)만 전송 ──────────→  저장 & 집계
                                     ↓
                              [Claude API - RAG]
                              강좌 자막 분석 + 집중도 데이터
                                     ↓
                              맞춤형 리포트 생성
                                     ↓
                              학부모 대시보드 제공
```

## 라이선스
AI 모델: Apache License 2.0 (AI Hub)

## AI 협업
이 프로젝트는 Claude AI와의 페어프로그래밍으로 개발되었습니다.
기획, 아키텍처 설계, 코드 작성 전 과정에서 AI를 활용했으며,
관련 문서는 `docs/` 폴더에서 확인할 수 있습니다.

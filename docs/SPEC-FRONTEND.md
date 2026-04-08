# 프론트엔드 구현 지시서 (SPEC-FRONTEND)

## 개요
- 프레임워크: React (Vite) — 이미 초기화 완료
- 추가 설치 패키지: `react-router-dom`, `recharts`, `axios`
- 디자인: 심플한 모던 UI, 다크/라이트 지원 안함 (라이트만), 모바일 반응형
- 기존 boilerplate는 모두 비워둔 상태이므로, main.jsx부터 새로 작성

---

## 1. 프로젝트 구조

```
frontend/src/
├── main.jsx                  # React 앱 엔트리포인트 (BrowserRouter 감싸기)
├── App.jsx                   # 라우팅 정의
├── App.css                   # 글로벌 스타일
├── index.css                 # CSS reset / 기본 폰트
├── pages/
│   ├── LoginPage.jsx         # 로그인 (학생/학부모 선택)
│   ├── StudentDashboard.jsx  # 학생 - 강좌 목록
│   ├── LecturePage.jsx       # 학생 - 강의 시청 + 실시간 집중도
│   ├── SessionReport.jsx     # 학생 - 세션 종료 후 리포트
│   ├── ParentDashboard.jsx   # 학부모 - 메인 대시보드
│   └── ParentDetail.jsx      # 학부모 - 세션 상세 분석
├── components/
│   ├── Header.jsx            # 상단 네비게이션 바
│   ├── AttentionWidget.jsx   # 실시간 집중도 위젯 (강의 화면 우측 상단)
│   ├── AttentionTimeline.jsx # 세션 타임라인 차트 (Recharts AreaChart)
│   ├── DailyReport.jsx       # 일간 리포트 카드
│   ├── WeeklyChart.jsx       # 주간 집중도 추이 (Recharts LineChart)
│   ├── CoachingTips.jsx      # AI 코칭 메시지 카드 (규칙 기반)
│   ├── RagAnalysis.jsx       # RAG 맞춤형 분석 카드 (Claude API 생성)
│   ├── StatusBadge.jsx       # 집중 상태 뱃지 (5단계 색상 표시)
│   └── LectureCard.jsx       # 강좌 카드 (썸네일 + 제목 + 과목)
├── hooks/
│   ├── useWebcam.js          # 웹캠 접근 및 프레임 캡처 훅
│   ├── useAttentionAnalysis.js # TensorFlow.js 모델 로딩 및 추론 훅
│   ├── useTabVisibility.js   # 탭 이탈 감지 훅 (Page Visibility API)
│   └── useSessionData.js     # 세션 데이터 관리 (시작/종료/기록 저장)
├── services/
│   └── api.js                # axios 인스턴스 및 API 호출 함수 모음
├── data/
│   └── mockData.js           # 데모용 샘플 데이터 (학생, 세션, 리포트)
└── utils/
    └── attentionUtils.js     # 집중도 관련 유틸 (상태 라벨, 색상, 통계 계산)
```

---

## 2. 라우팅 (App.jsx)

```
/                → LoginPage
/student         → StudentDashboard (강좌 목록)
/student/lecture/:id  → LecturePage (강의 시청 + AI 분석)
/student/report/:sessionId → SessionReport (세션 리포트)
/parent          → ParentDashboard (자녀 학습 대시보드)
/parent/session/:sessionId → ParentDetail (세션 상세)
```

- 로그인은 간단하게 "학생으로 입장" / "학부모로 입장" 버튼 2개 (인증 구현 불필요, 데모용)
- Header에 현재 로그인 역할 표시 + 역할 전환 버튼

---

## 3. 페이지별 상세

### 3-1. LoginPage.jsx
- 서비스 로고 "EduWatch" + 간단한 소개 문구
- 2개 카드: "학생으로 입장" / "학부모로 입장"
- 클릭 시 각각 /student, /parent로 이동
- 스타일: 중앙 정렬, 깔끔한 카드 UI

### 3-2. StudentDashboard.jsx
- 상단: "안녕하세요, 김민수 님" 인사 메시지 + 오늘의 학습 요약 카드
- 본문: 수강 가능한 강좌 목록 (LectureCard 그리드)
- 샘플 강좌 3개:
  - "수학 - 미적분 기초" (30분)
  - "영어 - 문법 완성" (25분)
  - "과학 - 물리 역학" (20분)
- 강좌 클릭 → /student/lecture/:id로 이동

### 3-3. LecturePage.jsx (핵심 페이지)
- 레이아웃: 좌측 70% 영상 플레이어, 우측 30% 사이드 패널
- 영상 플레이어:
  - HTML5 <video> 태그로 샘플 영상 재생
  - 샘플 영상은 유튜브 iframe 또는 로컬 mp4 (공개 교육 영상 URL 사용)
- 사이드 패널:
  - 강좌 정보 (제목, 과목, 시간)
  - 실시간 집중도 위젯 (AttentionWidget)
  - "학습 시작" / "학습 종료" 버튼
- 동작 흐름:
  1. 페이지 진입 시 안내 메시지: "학습 시작을 누르면 카메라가 활성화됩니다"
  2. "학습 시작" 클릭 → 브라우저 카메라 권한 요청 (useWebcam 훅)
  3. 허용 시 → useAttentionAnalysis 훅으로 3초 간격 분석 시작
  4. AttentionWidget에 현재 상태 실시간 업데이트
  5. 탭 이탈 감지 (useTabVisibility): 학생이 다른 탭으로 전환하면 이탈 기록 + 위젯에 경고
  6. "학습 종료" 클릭 → 분석 중지, 세션 데이터(분석 기록 + 탭 이탈 기록) 서버 전송, /student/report/:sessionId로 이동

### 3-4. SessionReport.jsx
- 세션 요약: 총 학습 시간, 평균 집중률, 졸음 횟수, 탭 이탈 횟수/총 이탈 시간
- 집중도 타임라인 (AttentionTimeline): 시간축 X, 집중도 Y의 AreaChart
  - 5단계 상태를 색상으로 표시 (초록~빨강 그라데이션)
  - 타임라인 위에 강좌 구간별 주제 라벨 표시 (segments 데이터 활용)
- 구간별 통계: "가장 집중한 구간", "집중력이 떨어진 구간"
- AI 코칭 메시지 (CoachingTips): 규칙 기반 기본 팁
- RAG 맞춤형 분석 (RagAnalysis): Claude API가 생성한 강좌 내용 기반 상세 분석
  - "삼차방정식 풀이법 구간에서 집중도 하락" 같은 구체적 분석 표시
  - 로딩 상태 표시 (Claude API 응답 대기 시 스피너)

### 3-5. ParentDashboard.jsx
- 상단: 자녀 정보 카드 (이름, 학년, 프로필 이미지)
- 오늘의 학습 요약: 총 학습 시간, 평균 집중률, 수강 강좌 수, 탭 이탈 횟수
- 주간 집중도 추이 차트 (WeeklyChart): 최근 7일 LineChart
- 최근 학습 세션 목록: 날짜, 과목, 집중률, 졸음 횟수 → 클릭 시 상세
- AI 코칭 메시지: 주간 분석 기반 학습 조언 2~3개
- RAG 분석 요약: 최근 세션에서 집중도가 낮았던 강좌 내용 하이라이트

### 3-6. ParentDetail.jsx
- 특정 세션의 상세 분석 (SessionReport와 유사하지만 학부모 관점)
- 세션 타임라인 + 구간별 분석
- 다른 세션과 비교 차트 (선택사항)

---

## 4. 주요 컴포넌트 상세

### AttentionWidget.jsx
- props: { currentStatus, confidence, isActive }
- 현재 상태를 큰 아이콘 + 텍스트로 표시
- 5단계 상태별 색상:
  - 1 (집중+흥미): #22c55e 초록
  - 2 (집중+차분): #3b82f6 파랑
  - 3 (비집중+차분): #f59e0b 노랑
  - 4 (비집중+지루): #f97316 주황
  - 5 (졸음): #ef4444 빨강
- 하단에 실시간 집중률 % 표시 (최근 30개 기록의 평균)
- isActive=false일 때 "분석 대기 중" 표시

### AttentionTimeline.jsx
- props: { records } — [{ timestamp, status, confidence }] 배열
- Recharts AreaChart 사용
- X축: 시간 (mm:ss 포맷), Y축: 집중도 (1~5, 역전 표시 — 1이 위, 5가 아래)
- 영역 색상을 상태값에 따라 그라데이션 처리
- 툴팁: 호버 시 해당 시점의 상태 라벨 표시

### WeeklyChart.jsx
- props: { weeklyData } — [{ date, avgAttention, totalTime }] 배열
- Recharts LineChart
- X축: 요일, Y축: 평균 집중률(%)
- 보조 Y축 또는 Bar: 총 학습 시간

### CoachingTips.jsx
- props: { tips } — [string] 배열
- 카드 형태로 팁 나열
- 아이콘 + 메시지 형태 (💡 또는 적절한 이모지 대신 아이콘 컴포넌트)

---

## 5. Custom Hooks 상세

### useWebcam.js
```javascript
// 반환값:
{
  videoRef,      // <video> 요소에 연결할 ref
  isActive,      // 웹캠 활성 상태
  startCamera,   // 카메라 시작 (navigator.mediaDevices.getUserMedia)
  stopCamera,    // 카메라 중지
  captureFrame,  // 현재 프레임을 Canvas ImageData로 캡처
  error          // 에러 메시지 (권한 거부 등)
}
```
- getUserMedia 옵션: { video: { facingMode: 'user', width: 640, height: 480 } }
- 카메라 <video>는 화면에 직접 보여주지 않음 (hidden 또는 작은 미리보기)

### useAttentionAnalysis.js
```javascript
// 파라미터: { videoRef, interval: 3000, isActive }
// 반환값:
{
  currentStatus,   // 현재 분류 결과 (1~5)
  confidence,      // 신뢰도 (0~1)
  records,         // 누적 기록 배열 [{ timestamp, status, confidence }]
  isModelLoaded,   // 모델 로딩 완료 여부
  isAnalyzing      // 분석 진행 중 여부
}
```
- 모델 로딩: 앱 시작 시 TensorFlow.js 모델 비동기 로딩
- setInterval로 interval 간격마다 captureFrame → 모델 추론 → records에 push
- 모델이 아직 준비되지 않은 경우 (Phase 1): mockData에서 랜덤 결과 생성
  - 실제 모델 연동은 SPEC-AI.md 참조

### useTabVisibility.js
```javascript
// Page Visibility API를 사용한 탭 이탈 감지 훅
// 반환값:
{
  isTabVisible,      // 현재 탭이 보이는지 여부 (boolean)
  departures,        // 이탈 기록 배열 [{ leaveTime, returnTime, duration }]
  totalDepartureTime, // 총 이탈 시간 (초)
  departureCount     // 이탈 횟수
}
```
- document.addEventListener('visibilitychange') 사용
- 학생이 탭을 떠나면 leaveTime 기록, 돌아오면 returnTime + duration 계산
- 학습 시작~종료 사이의 이탈만 추적
- 웹캠 AI 분석과 조합: 탭 이탈 중에는 분석 결과를 자동으로 status=4(비집중)로 기록
- 세션 리포트에 "강의 화면 이탈 횟수: N회, 총 이탈 시간: M분" 데이터 제공

### useSessionData.js
```javascript
// 반환값:
{
  sessionId,
  startSession,    // 세션 시작 (서버 API 호출)
  endSession,      // 세션 종료 (records 전송 + 리포트 요청)
  sessionSummary   // 세션 요약 데이터
}
```

---

## 6. 데모용 샘플 데이터 (data/mockData.js)

```javascript
export const mockStudent = {
  id: 'student-1',
  name: '김민수',
  grade: '고등학교 2학년',
  parentId: 'parent-1'
};

export const mockParent = {
  id: 'parent-1',
  name: '김영희',
  studentIds: ['student-1']
};

export const mockLectures = [
  { id: 'lec-1', title: '미적분 기초', subject: '수학', duration: 30, thumbnail: '🔢' },
  { id: 'lec-2', title: '영문법 완성', subject: '영어', duration: 25, thumbnail: '📖' },
  { id: 'lec-3', title: '물리 역학', subject: '과학', duration: 20, thumbnail: '⚡' }
];

// 주간 데모 데이터 (학부모 대시보드용)
export const mockWeeklyData = [
  { date: '월', avgAttention: 78, totalTime: 90 },
  { date: '화', avgAttention: 82, totalTime: 120 },
  { date: '수', avgAttention: 65, totalTime: 60 },
  { date: '목', avgAttention: 88, totalTime: 105 },
  { date: '금', avgAttention: 71, totalTime: 80 },
  { date: '토', avgAttention: 90, totalTime: 150 },
  { date: '일', avgAttention: 0, totalTime: 0 }
];

// 세션 타임라인 데모 데이터 생성 함수
export function generateMockSessionRecords(durationMinutes) {
  // 3초 간격으로 (durationMinutes * 60 / 3)개의 레코드 생성
  // 시간에 따라 자연스러운 집중도 변화 패턴:
  // - 처음 5분: 집중 높음 (1~2)
  // - 10~20분: 약간 떨어짐 (2~3)
  // - 20~25분: 집중 저하 (3~4)
  // - 마지막: 졸음 가능 (4~5)
  // 랜덤 노이즈 추가하여 자연스럽게
}

// AI 코칭 메시지 샘플
export const mockCoachingTips = [
  '수학 과목에서 20분 이후 집중력이 급격히 떨어지는 패턴이 있습니다. 20분 단위로 짧은 휴식을 권장합니다.',
  '오후 3시~4시 시간대의 집중률이 가장 높습니다. 어려운 과목은 이 시간에 배치해보세요.',
  '이번 주 평균 집중률이 지난주 대비 5% 향상되었습니다. 꾸준한 학습 습관이 형성되고 있어요!'
];
```

---

## 7. API 호출 (services/api.js)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
});

export const sessionAPI = {
  start: (studentId, lectureId) => api.post('/sessions', { studentId, lectureId }),
  end: (sessionId, records, departures) => api.put(`/sessions/${sessionId}/end`, { records, departures }),
  getReport: (sessionId) => api.get(`/sessions/${sessionId}/report`),
  getRagAnalysis: (sessionId) => api.get(`/sessions/${sessionId}/rag-analysis`),
  getStudentSessions: (studentId) => api.get(`/students/${studentId}/sessions`),
  getWeeklyReport: (studentId) => api.get(`/students/${studentId}/weekly`)
};
```

---

## 8. 스타일 가이드

- 폰트: 시스템 폰트 스택 (-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
- 메인 컬러: #3b82f6 (파랑)
- 배경: #f8fafc (연한 회색)
- 카드 배경: #ffffff, border-radius: 12px, box-shadow: 0 1px 3px rgba(0,0,0,0.1)
- 반응형: max-width: 1200px 컨테이너, 모바일 768px 이하에서 1열 레이아웃
- CSS는 각 컴포넌트별 CSS 모듈 또는 App.css 하나에 통합 (Claude Code에서 편한 방식)

---

## 9. 구현 순서 (권장)

1. main.jsx + App.jsx + 라우팅 설정
2. LoginPage (간단한 진입점)
3. StudentDashboard + LectureCard (강좌 목록)
4. LecturePage + useWebcam + AttentionWidget (핵심 기능)
5. SessionReport + AttentionTimeline (세션 리포트)
6. ParentDashboard + WeeklyChart + CoachingTips (학부모)
7. mockData 연동으로 전체 데모 흐름 완성
8. 실제 API 연동 (백엔드 완성 후)

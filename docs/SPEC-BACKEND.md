# 백엔드 구현 지시서 (SPEC-BACKEND)

## 개요
- 런타임: Node.js (Express) — 이미 초기화 완료
- 설치된 패키지: express, cors, dotenv, nodemon
- 추가 설치 필요: `@anthropic-ai/sdk` (Claude API 연동)
- 기존 src/index.js와 .env.example은 비워둔 상태이므로, 새로 작성

---

## 1. 프로젝트 구조

```
backend/src/
├── index.js              # Express 앱 엔트리포인트
├── routes/
│   ├── sessions.js       # 학습 세션 API
│   ├── students.js       # 학생 정보 및 리포트 API
│   ├── lectures.js       # 강좌 관리 API (자막 분석 트리거)
│   └── health.js         # 헬스체크
├── data/
│   ├── students.json     # 학생 샘플 데이터
│   ├── sessions.json     # 세션 데이터 (런타임에 추가됨)
│   ├── lectures.json     # 강좌 데이터 (segments 포함)
│   └── subtitles/        # 자막 파일 (.srt/.vtt)
│       ├── lec-1.srt
│       ├── lec-2.srt
│       └── lec-3.srt
├── utils/
│   ├── fileStore.js      # JSON 파일 읽기/쓰기 유틸
│   ├── reportGenerator.js # 세션 데이터 → 리포트 변환 로직 (규칙 기반)
│   ├── subtitleParser.js  # SRT/VTT 자막 파일 파싱 유틸
│   └── claudeService.js   # Claude API 연동 (강좌 분석 + RAG 리포트)
└── .env.example          # 환경변수 예시
```

---

## 2. 엔트리포인트 (src/index.js)

```javascript
// 설정 사항:
// - dotenv 로드
// - express 앱 생성
// - cors() 미들웨어 (프론트엔드 localhost:5173 허용)
// - express.json() 미들웨어
// - 라우터 등록: /api/health, /api/sessions, /api/students
// - PORT: process.env.PORT || 5000
// - 에러 핸들링 미들웨어
```

---

## 3. API 엔드포인트 상세

### 3-1. 헬스체크 (routes/health.js)

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/health | 서버 상태 확인 |

응답:
```json
{ "status": "ok", "service": "EduWatch API", "timestamp": "2026-04-07T..." }
```

### 3-2. 세션 API (routes/sessions.js)

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/sessions | 새 학습 세션 시작 |
| PUT | /api/sessions/:id/end | 세션 종료 + 분석 기록 저장 |
| GET | /api/sessions/:id | 세션 상세 조회 |
| GET | /api/sessions/:id/report | 세션 리포트 조회 (규칙 기반) |
| GET | /api/sessions/:id/rag-analysis | RAG 맞춤형 분석 조회 (Claude API) |

#### POST /api/sessions — 세션 시작
요청:
```json
{
  "studentId": "student-1",
  "lectureId": "lec-1"
}
```
응답:
```json
{
  "sessionId": "sess-1712500000",
  "studentId": "student-1",
  "lectureId": "lec-1",
  "startTime": "2026-04-07T14:00:00.000Z",
  "status": "active"
}
```
- sessionId는 "sess-" + Date.now()로 생성
- sessions.json에 새 세션 추가

#### PUT /api/sessions/:id/end — 세션 종료
요청:
```json
{
  "records": [
    { "timestamp": "2026-04-07T14:00:03.000Z", "status": 1, "confidence": 0.92 },
    { "timestamp": "2026-04-07T14:00:06.000Z", "status": 1, "confidence": 0.88 },
    { "timestamp": "2026-04-07T14:00:09.000Z", "status": 2, "confidence": 0.95 }
  ],
  "departures": [
    { "leaveTime": "2026-04-07T14:12:30.000Z", "returnTime": "2026-04-07T14:13:15.000Z", "duration": 45 }
  ]
}
```
응답:
```json
{
  "sessionId": "sess-1712500000",
  "endTime": "2026-04-07T14:30:00.000Z",
  "status": "completed",
  "summary": {
    "totalDuration": 1800,
    "totalRecords": 600,
    "avgAttention": 82.5,
    "sleepCount": 3,
    "departureCount": 2,
    "totalDepartureTime": 78,
    "statusDistribution": {
      "1": 180, "2": 240, "3": 100, "4": 60, "5": 20
    }
  }
}
```
- records 배열을 세션에 저장
- reportGenerator.js로 summary 자동 생성
- sessions.json 업데이트

#### GET /api/sessions/:id/report — 세션 리포트
응답:
```json
{
  "sessionId": "sess-1712500000",
  "student": { "name": "김민수", "grade": "고2" },
  "lecture": { "title": "미적분 기초", "subject": "수학" },
  "startTime": "...",
  "endTime": "...",
  "summary": { ... },
  "timeline": [
    { "timeSlot": "00:00-05:00", "avgStatus": 1.3, "label": "집중" },
    { "timeSlot": "05:00-10:00", "avgStatus": 2.1, "label": "집중" },
    { "timeSlot": "10:00-15:00", "avgStatus": 3.5, "label": "비집중" }
  ],
  "tips": [
    "수업 시작 10분까지 높은 집중력을 유지했습니다.",
    "15분 이후 집중력이 떨어지기 시작했습니다. 짧은 휴식을 권장합니다.",
    "총 3회 졸음이 감지되었습니다."
  ]
}
```

### 3-3. 학생 API (routes/students.js)

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/students/:id | 학생 정보 조회 |
| GET | /api/students/:id/sessions | 학생의 세션 목록 |
| GET | /api/students/:id/weekly | 학생의 주간 리포트 |

#### GET /api/students/:id/sessions
응답:
```json
{
  "studentId": "student-1",
  "sessions": [
    {
      "sessionId": "sess-1712500000",
      "lecture": { "title": "미적분 기초", "subject": "수학" },
      "date": "2026-04-07",
      "duration": 30,
      "avgAttention": 82.5,
      "sleepCount": 3,
      "status": "completed"
    }
  ]
}
```

#### GET /api/students/:id/weekly
응답:
```json
{
  "studentId": "student-1",
  "period": "2026-04-01 ~ 2026-04-07",
  "daily": [
    { "date": "2026-04-01", "dayOfWeek": "월", "avgAttention": 78, "totalTime": 90, "sessionCount": 2 },
    { "date": "2026-04-02", "dayOfWeek": "화", "avgAttention": 82, "totalTime": 120, "sessionCount": 3 }
  ],
  "weeklyAvgAttention": 79.5,
  "weeklyTotalTime": 605,
  "tips": [
    "이번 주 평균 집중률은 79.5%입니다.",
    "화요일과 토요일에 가장 높은 집중력을 보였습니다.",
    "수요일 집중률이 65%로 가장 낮았습니다. 수요일 학습 환경을 점검해보세요."
  ]
}
```

---

## 4. 데이터 저장소 (utils/fileStore.js)

JSON 파일 기반의 간단한 저장소. MongoDB 불필요.

```javascript
// 제공 함수:
// readData(filename)   — JSON 파일 읽기, 없으면 빈 배열/객체 반환
// writeData(filename, data) — JSON 파일 쓰기
// appendData(filename, item) — 배열에 항목 추가
// updateData(filename, id, updates) — id로 찾아서 업데이트
```

- 데이터 경로: src/data/ 폴더
- 서버 재시작 시에도 유지됨 (파일 기반)
- Render 배포 시 무료 플랜은 재배포마다 파일 초기화되지만, 데모용으로는 충분

---

## 5. 리포트 생성 로직 (utils/reportGenerator.js)

```javascript
// generateSessionReport(session) → report 객체 생성
//
// 입력: session (records 포함)
// 출력:
// - summary: 총 시간, 평균 집중률, 졸음 횟수, 상태 분포
// - timeline: 5분 단위로 records를 그룹핑하여 평균 상태값 계산
// - tips: 아래 규칙 기반으로 자동 생성

// 코칭 팁 생성 규칙:
// 1. 평균 집중률 80% 이상 → 긍정 메시지
// 2. 졸음 횟수 3회 이상 → 수면 관리 조언
// 3. 후반부(70% 이후) 집중률이 전반부보다 20% 이상 낮으면 → 휴식 권장
// 4. 특정 시간대에 집중률이 급격히 떨어지면 → 해당 시간대 언급
// 5. 과목별 비교 (여러 세션이 있을 때) → 과목별 차이 언급
// 6. 탭 이탈 횟수가 3회 이상 → "강의 중 다른 화면으로 N회 전환했습니다" 경고
// 7. 총 이탈 시간이 학습 시간의 10% 이상 → "학습 시간 중 M분을 다른 화면에서 보냈습니다" 알림

// generateWeeklyReport(studentId, sessions) → 주간 리포트 생성
// - 최근 7일 세션을 날짜별로 그룹핑
// - 일간 평균 집중률/총 시간 계산
// - 주간 트렌드 분석 팁 생성
```

---

## 6. 초기 샘플 데이터

### data/students.json
```json
[
  {
    "id": "student-1",
    "name": "김민수",
    "grade": "고등학교 2학년",
    "parentId": "parent-1",
    "profileImg": null
  }
]
```

### data/lectures.json
```json
[
  { "id": "lec-1", "title": "미적분 기초", "subject": "수학", "duration": 30 },
  { "id": "lec-2", "title": "영문법 완성", "subject": "영어", "duration": 25 },
  { "id": "lec-3", "title": "물리 역학", "subject": "과학", "duration": 20 }
]
```

### data/sessions.json
- 초기값: 빈 배열 `[]`
- 데모용 샘플 세션 5~7개를 미리 생성해서 넣어둘 것
  - 최근 7일에 걸쳐 분산
  - 각 세션마다 records 배열 포함 (generateMockSessionRecords 함수로 생성)
  - 학부모 대시보드가 바로 동작하도록

---

## 7. .env.example

```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

---

---

## 8. 자막 파싱 유틸 (utils/subtitleParser.js)

```javascript
// SRT/VTT 파일을 파싱하여 타임스탬프 + 텍스트 배열로 변환
// parseSRT(filePath) → [{ start: "00:00:00", end: "00:00:03", text: "안녕하세요" }, ...]
// parseVTT(filePath) → 동일 형식
// toPlainText(subtitles) → 전체 텍스트를 하나의 문자열로 합치기 (Claude API 입력용)
// toTimedText(subtitles) → 타임스탬프 포함 텍스트 (RAG용)
```

---

## 9. Claude API 연동 (utils/claudeService.js)

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 1. 강좌 콘텐츠 분석 — 강좌 등록/초기화 시 1회 실행
// analyzeLectureContent(subtitleText, lectureTitle)
// → Claude API에 자막 전문 전달
// → 구간별 주제 + 키워드 추출 요청
// → 반환: { segments: [{ start, end, topic, keywords[] }] }
//
// 프롬프트 핵심:
// "다음은 '{lectureTitle}' 강의의 자막입니다.
//  강의 내용을 시간 순서대로 주요 구간별로 나누고,
//  각 구간의 주제와 핵심 키워드를 JSON으로 정리해주세요."

// 2. RAG 맞춤형 리포트 생성 — 세션 종료 시 1회 실행
// generateRagReport(sessionData, lectureSegments)
// → 학생 집중도 타임라인 + 탭 이탈 기록 + 강좌 구간 정보를 함께 전달
// → 맞춤형 학습 분석 및 조언 요청
// → 반환: string (마크다운 형식 분석 리포트)
//
// 프롬프트 핵심:
// "다음은 학생의 온라인 강의 수강 데이터입니다.
//  [강좌 구간별 주제]: {segments JSON}
//  [학생 집중도 타임라인]: {5분 단위 평균 status 배열}
//  [탭 이탈 기록]: {departures 배열}
//  이 데이터를 분석하여:
//  1. 어떤 강의 내용에서 집중도가 떨어졌는지 구체적으로 분석
//  2. 가능한 원인 추정 (내용 난이도, 시간대 등)
//  3. 맞춤형 학습 조언
//  을 학부모가 이해하기 쉽게 작성해주세요."
```

### RAG 분석 API 엔드포인트 상세

#### GET /api/sessions/:id/rag-analysis
응답:
```json
{
  "sessionId": "sess-1712500000",
  "analysis": "## 학습 분석 리포트\n\n### 집중도 하락 구간 분석\n삼차방정식 풀이법을 설명하는 12:00~18:00 구간에서 집중도가 62%로 하락했습니다...",
  "generatedAt": "2026-04-07T15:00:00.000Z"
}
```
- 이미 생성된 분석이 있으면 캐싱된 결과 반환
- 없으면 Claude API 호출 후 저장 + 반환
- Claude API 호출 실패 시 규칙 기반 리포트로 폴백

---

## 10. 강좌 API (routes/lectures.js)

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/lectures | 강좌 목록 조회 |
| GET | /api/lectures/:id | 강좌 상세 (segments 포함) |
| POST | /api/lectures/:id/analyze | 강좌 자막 분석 트리거 (Claude API) |

#### POST /api/lectures/:id/analyze
- 해당 강좌의 자막 파일을 파싱
- Claude API로 콘텐츠 분석 요청
- 분석 결과(segments)를 lectures.json에 저장
- 데모용: 서버 시작 시 또는 수동 트리거로 3개 강좌 사전 분석

---

## 11. 데이터 파일 업데이트

### data/lectures.json (segments 포함)
```json
[
  {
    "id": "lec-1",
    "title": "미적분 기초",
    "subject": "수학",
    "duration": 30,
    "subtitleFile": "subtitles/lec-1.srt",
    "segments": [
      { "start": "00:00", "end": "05:30", "topic": "이차방정식 복습", "keywords": ["이차방정식", "근의 공식"] },
      { "start": "05:30", "end": "12:00", "topic": "삼차방정식 개념 도입", "keywords": ["삼차방정식", "인수분해"] }
    ],
    "analyzed": true
  }
]
```

---

## 12. 구현 순서 (권장)

1. index.js (Express 앱 기본 설정 + CORS + 라우터 등록)
2. health.js (헬스체크)
3. fileStore.js (JSON 파일 유틸)
4. 초기 샘플 데이터 JSON 파일 생성 (students, lectures, sessions)
5. sessions.js (세션 CRUD API)
6. reportGenerator.js (리포트 생성 로직 — 규칙 기반)
7. students.js (학생 정보 + 주간 리포트 API)
8. subtitleParser.js (자막 파싱 유틸)
9. claudeService.js (Claude API 연동 — 강좌 분석 + RAG 리포트)
10. lectures.js (강좌 API + 자막 분석 트리거)
11. 데모용 자막 파일 준비 + 사전 분석 실행
12. 데모용 샘플 세션 데이터 자동 생성 스크립트

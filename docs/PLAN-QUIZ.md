# AI 퀴즈 자동 생성 — 구현 계획서

> EXPANSION.md 섹션 5 기반. 공모전 프로토타입 범위.
> 세션 리포트에서 집중도가 낮았던 강의 구간의 핵심 내용을 퀴즈로 자동 생성하여,
> 학생이 해당 내용을 이해했는지 확인하는 기능.

---

## 1. 기능 요약

### 핵심 흐름
```
세션 종료 → SessionReport 페이지 진입
  → "복습 퀴즈 생성" 버튼 클릭
  → 집중도 낮은 구간의 자막 + segments를 OpenAI API에 전달
  → 객관식 3문제 자동 생성 (캐싱)
  → 학생이 퀴즈 풀이 → 정답률 표시 + 오답 해설
  → 학부모 대시보드에서 퀴즈 정답률 확인
```

### 전제 조건
- 강의에 자막(`Lecture.subtitleText`)이 있고, 분석 완료(`Lecture.analyzed === true`, `Lecture.segments` 존재)
- 세션에 충분한 집중도 레코드(`Session.records`)가 존재
- OpenAI API 키 설정 (기존 `aiService.js`가 OpenAI `gpt-4o-mini` 사용 중)

---

## 2. 데이터 모델

### 2-1. Quiz (신규 컬렉션)

```javascript
// backend/src/models/Quiz.js
const quizSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  studentId: { type: String, required: true },         // Session.studentId와 동일
  lectureId: { type: String, required: true },          // Session.lectureId와 동일
  subject: { type: String, default: '' },
  lowFocusSegments: [{                                  // 퀴즈 생성에 사용된 저집중 구간 (감사용)
    start: String,
    end: String,
    topic: String,
    avgFocus: Number
  }],
  questions: [{
    question: { type: String, required: true },
    options: { type: [String], required: true },        // 4개 선택지
    answer: { type: Number, required: true },           // 정답 인덱스 (0~3)
    explanation: { type: String, required: true }       // 해설
  }],
  results: {
    answers: { type: [Number], default: null },         // 학생 선택 배열 (null이면 미풀이)
    score: { type: Number, default: null },
    total: { type: Number, default: null },
    completedAt: { type: Date, default: null }
  }
}, { timestamps: true, versionKey: false });

// 세션당 퀴즈 1개만 (중복 생성 방지)
quizSchema.index({ sessionId: 1 }, { unique: true });
```

> **설계 결정:**
> - `sessionId`에 유니크 인덱스: 같은 세션에 대해 퀴즈가 두 번 생성되는 것을 DB 레벨에서 차단.
>   네트워크 재시도/새로고침으로 중복 생성 시 duplicate key error(11000) → 기존 퀴즈 반환.
> - `lowFocusSegments`: 어떤 구간을 기반으로 퀴즈가 생성되었는지 기록. 디버깅 및 학부모 설명용.
> - `results.answers`: 학생이 선택한 답을 기록하여 오답 해설에 활용. null이면 아직 안 풀었음.
> - 기존 Session 모델에 필드를 추가하지 않음: Session은 집중도 데이터 전용, 퀴즈는 별도 컬렉션.

### 2-2. 기존 모델 변경: 없음

Session, Lecture 모델은 수정하지 않는다.
퀴즈와 세션의 관계는 `Quiz.sessionId`로 참조하고, 세션 조회 시 필요하면 별도 API로 퀴즈를 로드한다.

---

## 3. 백엔드 API

### 3-0. 권한 검증

기존 `hasSessionAccess()` 함수 재사용:
```javascript
// sessionController.js에 이미 존재 (line 20~27) + 이미 export됨 (line 497)
// 학생: session.studentId === req.user.studentId
// 학부모: Parent.children에 해당 학생의 ObjectId가 포함되어 있는지 DB 조회
```
퀴즈 API는 세션 소유권 검증을 세션 기반으로 수행한다. 별도 권한 함수 불필요.
`quizController.js`에서 `require('./sessionController').hasSessionAccess`로 바로 사용.

---

### 3-1. `POST /api/sessions/:sessionId/quiz` — 퀴즈 생성

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` → `requireRole('student')` |
| 권한 검증 | `hasSessionAccess(session, req.user)` — 본인 세션만 |
| 선행 조건 | 세션 종료(`endTime !== null`), 강의 분석 완료(`Lecture.analyzed === true`) |
| 중복 방지 | `Quiz.sessionId` 유니크 인덱스. 이미 존재 시 기존 퀴즈 반환 (생성 아님) |
| 처리 흐름 | 아래 상세 |
| 성공 응답 | `201 Created` + Quiz 문서 (신규) 또는 `200 OK` + Quiz 문서 (기존) |
| 실패 케이스 | 403 (타인 세션), 400 (미종료 세션 / 미분석 강의 / 레코드 부족), 500 (OpenAI API 실패) |

#### 퀴즈 생성 흐름

```
1. Session 조회 → endTime 존재 확인
2. [중복 체크] Quiz.findOne({ sessionId })
   → 존재하면 200 OK + 기존 퀴즈 반환, 종료
3. Lecture 조회 (Lecture.findOne({ lectureId: session.lectureId }))
   → analyzed === false 또는 segments 없으면 400
4. 저집중 구간 추출 (아래 "저집중 구간 판정" 참조)
   → 저집중 구간이 없으면 전체 구간에서 추출
5. 해당 구간의 자막 텍스트 추출
6. OpenAI API 호출 (gpt-4o-mini) → 퀴즈 JSON 생성
7. JSON 파싱 + 유효성 검증
8. Quiz.create() → duplicate key error(11000) 시 기존 퀴즈 반환
9. 201 Created + Quiz 문서
```

#### 저집중 구간 판정

```javascript
// 기존 calcAvgFocus와 동일한 STATUS_TO_FOCUS 매핑 사용
const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };

function findLowFocusSegments(records, segments) {
  // 각 segment의 시간 범위에 해당하는 records를 매칭
  // segment별 평균 집중도 계산
  // 평균 집중도 < 60% 인 segment를 저집중 구간으로 판정
  // 저집중 구간이 없으면 전체 segment 중 집중도가 가장 낮은 2개 선택
  // 최소 1개, 최대 3개 구간 반환
}
```

#### records와 segments의 시간 매칭 — 구현 수준 설계

##### 현재 상태: record에 `videoTime` 필드 이미 존재

```
현재 record 구조 (Session.records):
  { timestamp: Date, status: 1~5, confidence: 0~1, focusProb: 0~100, videoTime: Number|null }

segments 구조 (Lecture.segments):
  { start: "05:00", end: "10:00", topic: "...", keywords: [...] }

videoTime은 "강의 몇 초 시점의 판정인지"를 나타낸다.
프론트엔드 StudentDashboard.jsx에서 ytCurrentTimeRef를 통해
record 전송 시 videoTime을 이미 포함하고 있다.
Session 모델과 validate.js의 addRecords 스키마에도 이미 정의되어 있다.
→ 추가 수정 없이 바로 사용 가능.
```

##### 매칭 로직 — videoTime 기반

```javascript
function findLowFocusSegments(records, segments) {
  // segment.start/end를 초로 변환: "05:00" → 300
  function timeToSec(t) {
    const [m, s] = t.split(':').map(Number);
    return m * 60 + (s || 0);
  }

  return segments.map(seg => {
    const segStart = timeToSec(seg.start);
    const segEnd = timeToSec(seg.end);

    // 해당 구간에 속하는 records 필터
    const matched = records.filter(r =>
      r.videoTime != null && r.videoTime >= segStart && r.videoTime < segEnd
    );

    // 구간별 평균 집중도
    const avgFocus = matched.length > 0
      ? Math.round(matched.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / matched.length)
      : null;  // 매칭된 record가 없으면 판정 불가

    return { ...seg, avgFocus, matchedCount: matched.length };
  })
  .filter(seg => seg.avgFocus !== null)       // 데이터 없는 구간 제외
  .sort((a, b) => a.avgFocus - b.avgFocus)    // 집중도 낮은 순
  .slice(0, 3);                                // 최대 3개
}
```

##### 구버전 데이터 폴백 (videoTime === null)

`videoTime`이 없는 기존 세션 데이터에 대해서는 균등 분할 폴백을 적용한다:

```javascript
function findLowFocusSegmentsFallback(records, segments, sessionStartTime) {
  // videoTime이 하나도 없으면 폴백
  // session.startTime 기반 경과 시간으로 추정 (부정확할 수 있음)
  // departures 시간을 빼서 보정 시도
}
```

폴백 사용 시 API 응답에 `fallback: true` 플래그를 포함한다:
```javascript
// POST /sessions/:id/quiz 응답
{ quiz: { ...quizDoc }, fallback: true }
```

##### 폴백 안내 UI — QuizSection에 표시

```
┌─────────────────────────────────────────────┐
│  📝 복습 퀴즈  (3문제)                       │
│                                             │
│  ⚠ 이 세션은 재생 위치 데이터가 없어          │
│    강의 구간 매칭이 부정확할 수 있습니다.       │
│    퀴즈 내용이 실제 저집중 구간과              │
│    다를 수 있습니다.                          │
│                                             │
│  Q1. ...                                    │
└─────────────────────────────────────────────┘
```

| 항목 | 구현 |
|------|------|
| 위치 | QuizSection 상단, 문제 목록 위 |
| 스타일 | `.sr-quiz-fallback-notice` — `var(--text-muted)`, `font-size: 0.85rem`, 좌측 ⚠ 아이콘 |
| 조건 | `quiz.fallback === true`일 때만 표시 |
| 톤 | 경고가 아닌 안내 (amber/회색, 빨강 아님). 퀴즈 자체는 정상 풀이 가능 |
| 학부모 화면 | ParentDashboard에서는 표시 안 함 (결과만 보므로 불필요) |

#### OpenAI API 프롬프트

```javascript
// aiService.js에 추가
async function generateQuiz(subtitleText, segments, lectureTitle, subject) {
  const client = getOpenAIClient();

  const segmentInfo = segments
    .map(s => `${s.start}~${s.end} [${s.topic}] 키워드: ${(s.keywords || []).join(', ')}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: '당신은 교육 콘텐츠 기반 퀴즈 출제 전문가입니다. 반드시 JSON 형식으로만 응답하세요.',
      },
      {
        role: 'user',
        content: `다음은 "${lectureTitle}" (${subject}) 강의에서 학생이 집중하지 못한 구간입니다.
이 구간의 핵심 개념을 확인하는 객관식 퀴즈 3문제를 생성해주세요.

[구간 정보]
${segmentInfo}

[해당 구간 자막]
${subtitleText}

아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "questions": [
    {
      "question": "문제 텍스트",
      "options": ["선택지A", "선택지B", "선택지C", "선택지D"],
      "answer": 0,
      "explanation": "정답 해설"
    }
  ]
}`
      }
    ]
  });

  const text = response.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('OpenAI API 응답에서 JSON을 파싱할 수 없습니다.');
  const parsed = JSON.parse(jsonMatch[0]);

  // 유효성 검증
  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('퀴즈 생성 결과가 유효하지 않습니다.');
  }
  for (const q of parsed.questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4
        || typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3
        || !q.explanation) {
      throw new Error('퀴즈 문제 형식이 유효하지 않습니다.');
    }
  }
  return parsed.questions;
}
```

> **기존 패턴 준수:** `analyzeLectureContent`, `generateRagReport`와 동일한 구조 —
> OpenAI 클라이언트 사용, JSON 파싱, 에러 핸들링, `withRetry` 래퍼 적용.

---

### 3-2. `GET /api/sessions/:sessionId/quiz` — 퀴즈 조회

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` (학생/학부모 모두) |
| 권한 검증 | `hasSessionAccess(session, req.user)` — 학생 본인 또는 연결된 학부모 |
| 문서 미존재 시 | **`200 OK` + `{ quiz: null }`** (404 아님 — 아래 설계 근거 참조) |
| **미제출 상태 응답** | `200 OK` + `{ quiz: { questions(정답/해설 제외), results, ... } }` |
| **제출 완료 응답** | `200 OK` + `{ quiz: Quiz 전체 문서 (정답/해설 포함) }` |
| 학부모 조회 시 | 제출 완료 후와 동일 (정답/해설 포함). 미제출 시 "학생이 아직 풀지 않았습니다" 상태만 |

#### 정답 공개 정책 — 제출 전에는 answer/explanation 숨김

Quiz 문서의 `questions[].answer`와 `questions[].explanation`은 DB에 저장되어 있으나,
GET 응답 시 `results.completedAt`이 null이면(미제출) 이 필드를 제거하고 반환한다.

```javascript
// quizController.js — GET 응답 가공
function sanitizeQuiz(quiz) {
  if (quiz.results.completedAt !== null) {
    // 제출 완료 → 전체 공개
    return quiz;
  }
  // 미제출 → answer, explanation 제거
  const sanitized = quiz.toObject();
  sanitized.questions = sanitized.questions.map(q => ({
    question: q.question,
    options: q.options,
    // answer, explanation 생략
  }));
  return sanitized;
}
```

> **DB에 정답을 저장하되 API에서 필터링하는 이유:**
> - 별도 정답 테이블/필드로 분리하면 채점 시 JOIN이 필요하고 모델이 복잡해짐
> - API 레벨에서 toObject() 후 필드 제거가 가장 단순
> - 학부모가 미제출 퀴즈를 조회해도 정답이 노출되지 않아야 함 (자녀에게 알려줄 수 있으므로)

> **404 대신 200 + null로 응답하는 이유:**
> 현재 `request()` 함수(api.js:14)는 HTTP 에러 시 `throw new Error(message)`만 던지고
> 상태 코드를 Error 객체에 포함하지 않는다. 따라서 프론트엔드에서 `err.status === 404`로
> 분기할 수 없다. `request()`를 수정하면 기존 전체 호출부에 영향이 가므로,
> 퀴즈 미존재를 정상 응답(`quiz: null`)으로 처리하는 것이 기존 구조에서 가장 안전하다.
> 기존 RAG 분석(`getRagAnalysis`)도 미완료 시 200으로 응답하는 패턴과 일치한다.

---

### 3-3. `PUT /api/sessions/:sessionId/quiz/submit` — 퀴즈 제출

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` → `requireRole('student')` |
| 권한 검증 | `hasSessionAccess(session, req.user)` — 본인 세션만 |
| 요청 바디 | `{ answers: [2, 0, 1] }` — 각 문제에 대한 선택 인덱스 배열 |
| 유효성 검증 (Zod) | `answers`: 배열, 길이 === quiz.questions.length, 각 원소 0~3 |
| 이미 제출됨 | `results.completedAt !== null` → `409 { message: '이미 제출된 퀴즈입니다.' }` (재제출 불가) |
| 처리 | 정답 비교 → score 계산 → Quiz.results 업데이트 |
| 성공 응답 | `200 OK` + 갱신된 Quiz 전체 문서 (정답/해설 포함) — 아래 참조 |

#### 제출 응답 설계 — 별도 DTO 없이 Quiz 문서 반환

```
제출 성공 시 응답: { quiz: Quiz 전체 문서 }
```

제출 완료 시점에서 `completedAt !== null`이 되므로, `sanitizeQuiz()`를 통과해도
answer/explanation이 포함된 전체 문서가 반환된다. 별도 `correctAnswers`, `explanations`
배열을 만들지 않고, 프론트엔드는 반환된 quiz 문서에서 직접 추출한다:

```javascript
// 프론트엔드 — 제출 후 결과 표시
const result = await sessionAPI.submitQuiz(sessionId, answers);
setQuiz(result.quiz);  // quiz state를 갱신 → 자동으로 결과 UI 렌더링
// quiz.questions[i].answer, quiz.questions[i].explanation → 각 문제별 정답/해설
// quiz.results.score, quiz.results.total → 점수
```

> **별도 응답 DTO를 두지 않는 이유:**
> - 제출 후 프론트에서 별도 `getQuiz()`를 다시 호출할 필요 없이, 응답으로 받은 quiz로 state 교체
> - SessionReport와 ParentDashboard 모두 quiz 객체의 동일한 구조를 기대하므로, 응답 형태 통일
> - 재방문 시에도 `getQuiz()`가 동일한 전체 문서를 반환하므로, 제출 시점의 응답과 일관적

#### 제출 처리 흐름

```
1. Quiz.findOne({ sessionId }) → 없으면 400 "퀴즈가 생성되지 않았습니다"
2. quiz.results.completedAt !== null → 이미 제출, 409 + 기존 Quiz 문서 반환
3. answers 길이 === questions.length 검증
4. 채점: questions[i].answer === answers[i] 비교
5. [원자적] Quiz.findOneAndUpdate(
     { sessionId, 'results.completedAt': null },  // 미제출 상태만
     { results: { answers, score, total, completedAt: new Date() } },
     { new: true }
   )
   → null이면 동시 제출로 판단, 기존 Quiz 조회 후 반환
6. 200 OK + { quiz: 갱신된 Quiz 문서 }
```

> **재제출 방지:**
> - `results.completedAt`이 null인 경우에만 제출 가능
> - `findOneAndUpdate` 조건에 `completedAt: null`을 포함하여 원자적 처리
> - 동시에 두 번 제출해도 하나만 성공
> - 이미 제출된 경우 409이지만, 기존 Quiz 문서도 함께 반환하여 프론트가 결과를 표시 가능

---

## 4. 프론트엔드 구현

### 4-1. SessionReport 확장 (기존 파일 수정)

`SessionReport.jsx`의 기존 레이아웃:
```
sr-header → sr-summary-row(4카드) → sr-chart-section → sr-bottom-grid(tips + rag)
```

하단에 **퀴즈 섹션** 추가:
```
sr-header → sr-summary-row → sr-chart-section → sr-bottom-grid → [신규] sr-quiz-section
```

#### 퀴즈 섹션 상태 흐름

```
(1) 퀴즈 미생성 상태
    → "복습 퀴즈 생성" 버튼 표시
    → 클릭 시 POST /sessions/:id/quiz 호출 → 로딩 스피너

(2) 퀴즈 생성 완료, 미풀이 상태 (results.completedAt === null)
    → 문제 + 4지선다 표시
    → 학생이 답 선택 → "제출" 버튼 활성화
    → 학부모 접근 시: "학생이 아직 풀지 않았습니다" 표시

(3) 퀴즈 풀이 완료 상태 (results.completedAt !== null)
    → 정답률 표시 ("2/3 정답")
    → 각 문제별 정답/오답 표시 + 오답 해설
    → 학부모도 동일하게 결과 확인 가능
```

#### 데이터 로딩

```javascript
// SessionReport.jsx useEffect 추가
// GET /sessions/:id/quiz는 미존재 시 200 + { quiz: null }을 반환한다 (404 아님).
// 현재 request()가 Error에 status를 포함하지 않으므로, 정상 응답으로 처리.
useEffect(() => {
  if (!sessionId) return;
  sessionAPI.getQuiz(sessionId)
    .then(data => setQuiz(data.quiz))   // null이면 미생성, 객체면 생성됨
    .catch(err => setQuizError(err.message));  // 권한 오류 등 진짜 에러만
}, [sessionId]);
```

### 4-2. QuizSection 컴포넌트 (신규)

```
frontend/src/components/quiz/QuizSection.jsx
frontend/src/components/quiz/QuizSection.css
```

#### Props

```javascript
{
  sessionId: string,
  quiz: Quiz | null,          // null이면 미생성
  userRole: 'student' | 'parent',
  onQuizGenerated: (quiz) => void,  // 생성 완료 콜백
  onQuizSubmitted: (result) => void  // 제출 완료 콜백
}
```

#### UI 구성

**미생성 상태:**
```
┌─────────────────────────────────┐
│  📝 복습 퀴즈                    │
│                                 │
│  집중도가 낮았던 구간의 핵심      │
│  내용을 퀴즈로 확인해보세요.      │
│                                 │
│       [퀴즈 생성하기]            │
│                                 │
│  ※ 강의 자막 분석이 완료된       │
│    세션에서만 생성 가능           │
└─────────────────────────────────┘
```

**풀이 중 상태:**
```
┌─────────────────────────────────┐
│  📝 복습 퀴즈  (3문제)           │
│                                 │
│  Q1. 삼차방정식에서 조립제법을    │
│      사용하는 이유는?            │
│                                 │
│  ○ A. 선택지1                   │
│  ● B. 선택지2  ← 선택됨         │
│  ○ C. 선택지3                   │
│  ○ D. 선택지4                   │
│                                 │
│  Q2. ...                        │
│                                 │
│          [제출하기]              │
└─────────────────────────────────┘
```

**결과 상태:**
```
┌─────────────────────────────────┐
│  📝 복습 퀴즈 결과  2/3 정답     │
│                                 │
│  Q1. ✅ 정답                    │
│                                 │
│  Q2. ❌ 오답 (선택: B → 정답: C) │
│      해설: 조립제법은 삼차 이상의 │
│      다항식에서...               │
│                                 │
│  Q3. ✅ 정답                    │
└─────────────────────────────────┘
```

### 4-3. ParentDashboard 확장

#### 데이터 기준: 선택된 세션 (`selectedSessionId`)

현재 ParentDashboard는 `selectedSessionId` 변경 시 report(line 51~58)와 rag(line 61~72)를
각각 별도 useEffect로 로딩한다. 퀴즈도 **동일 패턴**으로 3번째 useEffect를 추가한다.

```javascript
// ParentDashboard.jsx — 퀴즈 로딩 추가
const [quizData, setQuizData] = useState(null);
const [quizLoading, setQuizLoading] = useState(false);

// 기존 report, rag useEffect와 병렬로 실행됨 (동일한 selectedSessionId 의존)
useEffect(() => {
  if (!selectedSessionId) return;
  setQuizLoading(true);
  sessionAPI.getQuiz(selectedSessionId)
    .then(data => setQuizData(data.quiz))  // null이면 미생성
    .catch(() => setQuizData(null))
    .finally(() => setQuizLoading(false));
}, [selectedSessionId]);
```

> **세션 선택 변경 시 3개 API가 병렬 실행:**
> `selectedSessionId` 변경 → report + rag + quiz 각각 독립 useEffect 트리거.
> React가 동일 렌더 사이클에서 3개 useEffect를 실행하므로 자연스럽게 병렬 호출된다.

> **자녀 선택 변경 시 초기화:**
> 기존 코드(line 83~91)에서 자녀 선택 시 `setReport(null)`, `setRagText('')` 하듯이
> `setQuizData(null)`도 추가하여 이전 자녀의 퀴즈가 잔류하지 않도록 한다.

#### UI 배치

기존 리포트 섹션(우측 카드 영역)에 퀴즈 결과 카드 추가:

```
[기존 AI 코칭] [기존 RAG 분석]
[신규: 퀴즈 결과]
```

#### 표시 로직

| quizData 상태 | quizLoading | 표시 |
|-------------|-------------|------|
| — | true | 로딩 스피너 |
| null | false | 카드 자체를 숨김 (퀴즈 미생성) |
| quiz.results.completedAt === null | false | "복습 퀴즈: 미풀이" (회색 텍스트) |
| quiz.results.completedAt !== null | false | "복습 퀴즈: 2/3 정답" (정답률에 따라 색상) |

---

## 5. 파일 구조

### 신규 파일
```
backend/
  src/models/Quiz.js                    # Quiz 스키마 + 유니크 인덱스
  src/controllers/quizController.js     # 생성, 조회, 제출 컨트롤러

frontend/
  src/components/quiz/QuizSection.jsx   # 퀴즈 UI 컴포넌트
  src/components/quiz/QuizSection.css   # 퀴즈 스타일
```

### 수정 파일
```
backend/
  src/utils/aiService.js                # generateQuiz() 함수 추가 (withRetry 래퍼 포함)
  src/routes/sessions.js                # quiz 라우트 3개 추가

frontend/
  src/services/api.js                   # sessionAPI에 quiz 관련 함수 3개 추가
  src/pages/SessionReport.jsx           # 하단에 QuizSection 컴포넌트 추가
  src/pages/SessionReport.css           # 퀴즈 섹션 스타일 (또는 QuizSection.css에 전부)
  src/pages/ParentDashboard.jsx         # 퀴즈 결과 카드 추가
  src/pages/ParentDashboard.css         # 퀴즈 결과 카드 스타일
```

> **라우트를 sessions.js에 추가하는 이유:**
> 퀴즈는 세션에 1:1로 종속되므로 `/api/sessions/:sessionId/quiz`가 자연스럽다.
> 별도 `/api/quiz` 라우트를 만들면 세션 권한 검증을 중복 구현해야 한다.

> **참고:** `claudeService.js` → `aiService.js` 리네임은 이미 완료됨.
> `hasSessionAccess` 함수도 이미 `sessionController.js`에서 export 중.
> `quizController.js`에서 `require('../controllers/sessionController').hasSessionAccess`로 바로 사용 가능.

---

## 6. API 클라이언트 추가 (frontend/src/services/api.js)

```javascript
// sessionAPI 객체에 추가
// 기존 시그니처: request(method, path, body)
// 참고: body는 함수 내부에서 JSON.stringify 처리됨 (직접 stringify 하지 않음)

/** 퀴즈 생성 (저집중 구간 기반) → Quiz 문서 */
generateQuiz: (sessionId) =>
  request('POST', `/sessions/${sessionId}/quiz`, {}),

/** 퀴즈 조회 → { quiz: Quiz문서 | null } (미생성 시 quiz: null, 404 아님) */
getQuiz: (sessionId) =>
  request('GET', `/sessions/${sessionId}/quiz`),

/** 퀴즈 제출 → { quiz: Quiz 전체 문서 (정답/해설 포함) } */
submitQuiz: (sessionId, answers) =>
  request('PUT', `/sessions/${sessionId}/quiz/submit`, { answers }),
```

---

## 7. 중복/정합성 방어

| 위협 | 방어 | 메커니즘 |
|------|------|---------|
| 퀴즈 중복 생성 (새로고침/재시도) | `Quiz.sessionId` 유니크 인덱스 | duplicate key error(11000) catch → 기존 퀴즈 반환 |
| 퀴즈 중복 제출 | `results.completedAt: null` 조건부 업데이트 | findOneAndUpdate 원자적 처리, null이면 이미 제출 |
| 타인 세션 퀴즈 접근 | `hasSessionAccess()` 재사용 | 학생 본인 또는 연결된 학부모만 |
| OpenAI 응답 형식 오류 | JSON 파싱 + 구조 검증 | questions 배열, options 4개, answer 0~3, explanation 필수 |
| 미종료 세션에서 퀴즈 생성 | `endTime !== null` 선행 조건 | 세션 종료 전에는 생성 거부 |
| 미분석 강의에서 퀴즈 생성 | `Lecture.analyzed === true` 선행 조건 | 자막 분석 미완료 시 400 반환 |
| 제출 전 정답 열람 | GET 응답에서 answer/explanation 제거 | `sanitizeQuiz()` — completedAt null이면 정답 필드 제외 |
| 학부모 경유 정답 유출 | 학부모 GET도 동일 필터 적용 | 미제출 상태에서는 학부모에게도 정답 숨김 |

---

## 8. 테스트 계획

### 8-0. 테스트 인프라

PLAN-EDUPOINT.md에서 구축하는 Jest + supertest + mongodb-memory-server 인프라를 공유한다.
퀴즈 테스트 파일은 `backend/src/tests/quiz/` 디렉토리에 배치.

```
backend/src/tests/quiz/
  generate.test.js     # 퀴즈 생성
  submit.test.js       # 퀴즈 제출
  authorization.test.js # 권한
```

### 8-1. 퀴즈 생성 테스트 — generate.test.js

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 정상 생성 | 종료된 세션 + 분석 완료 강의 | 201, Quiz 문서 생성, questions 3개 |
| 캐시 반환 (중복 방지) | 이미 퀴즈가 있는 세션에 재요청 | 200, 기존 Quiz 반환, DB에 1개만 존재 |
| 동시 생성 요청 | Promise.all로 2회 동시 호출 | 1회만 생성, 다른 1회는 기존 반환 (유니크 인덱스) |
| 미종료 세션 | endTime === null | 400 |
| 미분석 강의 | Lecture.analyzed === false | 400 |
| segments 없는 강의 | Lecture.segments === [] | 400 |
| 레코드 부족 | Session.records.length === 0 | 400 |
| OpenAI API 실패 | API 호출 에러 (mock) | 500, Quiz 생성 안 됨 |
| OpenAI 잘못된 JSON | 유효하지 않은 형식 반환 (mock) | 500, "퀴즈 문제 형식이 유효하지 않습니다" |

### 8-2. 퀴즈 제출 테스트 — submit.test.js

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 정상 제출 | answers [0, 2, 1], 정답 [0, 1, 1] | 200, score: 2, total: 3 |
| 전부 정답 | 모든 answers가 정답 | quiz.results.score === quiz.results.total |
| 전부 오답 | 모든 답이 틀림 | score === 0 |
| 이미 제출됨 (재제출 방지) | completedAt !== null인 퀴즈에 다시 제출 | 409 "이미 제출된 퀴즈" |
| 동시 제출 | Promise.all로 2회 동시 제출 | 1회만 성공, 다른 1회는 기존 결과 반환 |
| answers 길이 불일치 | 3문제인데 answers 2개 | 400 |
| answer 범위 초과 | answers에 4 또는 -1 포함 | 400 |
| 퀴즈 미존재 | 퀴즈 없는 세션에 제출 | 400 "퀴즈가 생성되지 않았습니다" |

### 8-3. 권한 테스트 — authorization.test.js

| 테스트 케이스 | 요청 | 기대 |
|-------------|------|------|
| 학생 본인 퀴즈 생성 | POST /sessions/본인세션/quiz | 201 |
| 학생 타인 퀴즈 생성 | POST /sessions/타인세션/quiz | 403 |
| 학생 본인 퀴즈 조회 | GET /sessions/본인세션/quiz | 200 |
| 학생 타인 퀴즈 조회 | GET /sessions/타인세션/quiz | 403 |
| 학부모 자녀 퀴즈 조회 | GET /sessions/자녀세션/quiz | 200 |
| 학부모 미연결 학생 퀴즈 조회 | GET /sessions/미연결학생세션/quiz | 403 |
| 학부모 퀴즈 생성 시도 | POST /sessions/자녀세션/quiz | 403 (student만 가능) |
| 학부모 퀴즈 제출 시도 | PUT /sessions/자녀세션/quiz/submit | 403 (student만 가능) |
| 토큰 없이 접근 | GET /sessions/:id/quiz (인증 없음) | 401 |
| **미제출 퀴즈 GET — 학생** | GET /sessions/본인세션/quiz (completedAt null) | 200, questions에 answer/explanation 없음 |
| **제출 완료 퀴즈 GET — 학생** | GET /sessions/본인세션/quiz (completedAt 있음) | 200, questions에 answer/explanation 포함 |
| **미제출 퀴즈 GET — 학부모** | GET /sessions/자녀세션/quiz (completedAt null) | 200, questions에 answer/explanation 없음 (자녀에게 전달 방지) |
| **제출 완료 퀴즈 GET — 학부모** | GET /sessions/자녀세션/quiz (completedAt 있음) | 200, questions에 answer/explanation 포함 |

### 8-4. 저집중 구간 추출 테스트

| 테스트 케이스 | 입력 | 기대 |
|-------------|------|------|
| 명확한 저집중 구간 존재 | segment A: avg 80%, B: avg 40%, C: avg 90% | B만 반환 |
| 여러 저집중 구간 | A: 30%, B: 45%, C: 55%, D: 90% | A, B, C 중 최대 3개 |
| 저집중 구간 없음 (전부 고집중) | 모든 segment avg > 60% | 가장 낮은 2개 segment 반환 |
| segment 1개만 | 1개 segment | 해당 segment 반환 |
| videoTime 있는 records | 정상 데이터 | videoTime 기반으로 segment에 정확히 매칭 |
| videoTime 없는 구버전 records | 전부 null | 균등 분할 폴백 + UI 안내 "구간 매칭이 부정확할 수 있습니다" |
| videoTime 일부만 있음 | 혼재 | videoTime 있는 records만 사용, 없는 건 무시 |

---

## 9. 구현 순서

### ~~Phase 0: record에 재생 위치 추가~~ — 완료됨
> `videoTime` 필드가 Session 모델, validate.js, StudentDashboard.jsx에 이미 구현됨.
> `ytCurrentTimeRef`도 이미 존재. 추가 작업 없음.

### Phase 1: 백엔드
1. `Quiz` Mongoose 모델 생성 (유니크 인덱스 포함)
2. `aiService.js`에 `generateQuiz()` 함수 추가 (기존 `withRetry` 래퍼 적용)
3. `quizController.js` — 생성, 조회, 제출 컨트롤러 + `findLowFocusSegments` (videoTime 기반 매칭)
4. `sessions.js` 라우트에 quiz 엔드포인트 3개 추가

> `hasSessionAccess`는 이미 `sessionController.js`에서 export 중 — 추가 작업 없음.

### Phase 2: 프론트엔드
5. `api.js`에 quiz API 함수 3개 추가
6. `QuizSection.jsx` + `QuizSection.css` 컴포넌트 구현
7. `SessionReport.jsx`에 QuizSection 통합
8. `ParentDashboard.jsx`에 퀴즈 결과 카드 추가

### Phase 3: 테스트
9. 퀴즈 생성 테스트 (OpenAI mock 포함)
10. 퀴즈 제출 테스트 (중복 제출 방지 포함)
11. 권한 테스트
12. 저집중 구간 추출 단위 테스트

---

## 10. UI 디자인 가이드 — 기존 스타일링 구조 준수

### 스타일링 규칙

기존 프로젝트는 커스텀 CSS 파일 + CSS 변수 기반이 주력이다 (PLAN-EDUPOINT.md 섹션 9 참조).

| 항목 | 규칙 |
|------|------|
| 스타일 파일 | `components/quiz/QuizSection.css` — 퀴즈 전용 스타일 |
| 클래스 네이밍 | 기존 SessionReport 패턴: `.sr-quiz-section`, `.sr-quiz-question`, `.sr-quiz-option` |
| 카드 | `.glass` 클래스 재사용, `border-radius: 14px` (기존 `.sr-chart-section`과 동일) |
| 색상 | 정답: `#22c55e` (기존 FOCUS_COLOR green), 오답: `#ef4444` (기존 red) |
| 퀴즈 배지 | `.sr-rag-badge` 패턴 차용 → `.sr-quiz-badge` (보라 → 파란 그라데이션) |
| 반응형 | `@media (max-width: 800px)` — 기존 SessionReport 브레이크포인트와 동일 |
| 로딩 | `.sr-spinner` 재사용 |
| 선택지 라디오 | 커스텀 CSS 라디오 버튼 (기본 라디오 숨기고 `.sr-quiz-option` 스타일링) |

### ParentDashboard 퀴즈 카드

```css
/* ParentDashboard.css에 추가 */
.quiz-result-card {
  /* 기존 .report-card 패턴 차용 */
}
.quiz-score {
  font-size: 1.7rem;
  font-weight: 700;
  /* 정답률에 따라 color 변경 (FOCUS_COLOR 함수 재사용) */
}
```

---

## 11. 에지 케이스 정책

| 상황 | 정책 |
|------|------|
| 자막이 너무 짧음 (100자 미만) | 퀴즈 생성 거부 → "자막이 너무 짧아 퀴즈를 생성할 수 없습니다" |
| 자막이 너무 김 (토큰 초과 우려) | 저집중 구간의 자막만 전달 (전체 자막 X), max 2000자 절삭 |
| OpenAI가 3문제 미만 반환 | 반환된 만큼만 사용 (1~2문제도 허용) |
| OpenAI가 3문제 초과 반환 | 앞에서 3개만 사용, 나머지 버림 |
| 학생이 퀴즈 생성 후 페이지 이탈 | 퀴즈는 DB에 저장됨 → 재방문 시 GET으로 로드 |
| 같은 강의 다른 세션 | 세션마다 별도 퀴즈 (집중도 패턴이 다르므로 다른 구간 출제) |
| 학부모가 퀴즈 페이지 접근 | 조회만 가능, 생성/제출 불가 (requireRole('student')) |

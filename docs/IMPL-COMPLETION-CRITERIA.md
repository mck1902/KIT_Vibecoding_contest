# 구현 가이드 — 완료 기준을 실제 완강 여부로 변경

> 원본 계획: `docs/PLAN-COMPLETION-CRITERIA.md`  
> 작성일: 2026-04-13  
> 브랜치: `feat/khh`

---

## 변경 목표

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 완료 판별 | `!!s.endTime` | `!!s.endTime && completionRate >= 90` |
| 포인트 지급 조건 | `!abandoned && focusRate >= targetRate` | `!abandoned && completionRate >= 90 && focusRate >= targetRate` |
| `watchedSec` 전송 | 없음 | 프론트에서 서버로 전달 |
| ENDED 자동 종료 | `getCurrentTime()` 사용 | `getDuration()` 사용 (100% 처리) |

---

## Step 1 — Session 모델에 `completionRate` 필드 추가

**파일:** `backend/src/models/Session.js`

**현재 코드 (line 43–46):**
```js
focusRate: { type: Number, default: null },
pointEarned: { type: Number, default: null },
pointAwarded: { type: Boolean, default: false },
```

**변경 후:**
```js
focusRate: { type: Number, default: null },
completionRate: { type: Number, default: 0 },   // ← 추가
pointEarned: { type: Number, default: null },
pointAwarded: { type: Boolean, default: false },
```

**주의사항:**
- Mongoose `default: 0` 은 신규 생성 문서에만 적용됨
- 기존 DB 문서는 `completionRate` 필드 자체가 없어 API 응답에서 `undefined` 로 옴
- 프론트에서 `?? 0` 으로 처리하므로 마이그레이션 스크립트 불필요

---

## Step 2 — `validate.js` 에 `endSession` 스키마 추가

**파일:** `backend/src/middleware/validate.js`

### 2-a. 스키마 정의 추가

`createSessionSchema` 선언 바로 아래(line 58 이후)에 추가:

```js
const endSessionSchema = z.object({
  abandoned:  z.boolean().optional().default(false),
  watchedSec: z.number().finite().min(0).optional().default(0),
});
```

각 제약 조건의 의도:
- `finite()` — NaN / Infinity 차단
- `min(0)` — 음수 차단
- `optional().default(0)` — `watchedSec` 없이 호출하는 기존 클라이언트 하위 호환

### 2-b. `schemas` export 객체에 추가

**현재 코드 (line 80–101):**
```js
module.exports = {
  validate,
  schemas: {
    register: registerSchema,
    login: loginSchema,
    link: linkSchema,
    updateProfile: updateProfileSchema,
    createSession: createSessionSchema,
    addRecords: addRecordsSchema,
    addDeparture: addDepartureSchema,
    edupointSettings: z.object({ ... }),
    edupointCharge: z.object({ ... }),
  },
};
```

**변경 후 (`createSession` 바로 아래에 추가):**
```js
    createSession: createSessionSchema,
    endSession: endSessionSchema,      // ← 추가
    addRecords: addRecordsSchema,
```

---

## Step 3 — `sessions.js` 라우트에 validate 미들웨어 연결

**파일:** `backend/src/routes/sessions.js`

**현재 코드 (line 21):**
```js
router.put('/:id/end', requireAuth, requireRole('student'), endSession);
```

**변경 후:**
```js
router.put('/:id/end', requireAuth, requireRole('student'), validate(schemas.endSession), endSession);
```

`validate` 와 `schemas` 는 이미 line 14에서 import 중이므로 import 추가 불필요:
```js
const { validate, schemas } = require('../middleware/validate');
```

---

## Step 4 — `sessionController.js` `endSession` 함수 수정

**파일:** `backend/src/controllers/sessionController.js`

### 4-a. 파일 상단에 상수 선언

`require` 블록 바로 아래(line 10 이후)에 추가:
```js
const COMPLETION_THRESHOLD = 90; // 완강 인정 기준 (%)
```

### 4-b. `req.body` 에서 `watchedSec` 추출

**현재 코드 (line 235):**
```js
const { abandoned = false } = req.body;
```

**변경 후:**
```js
const { abandoned = false, watchedSec = 0 } = req.body;
// validate 미들웨어 통과 후 도달하므로 watchedSec은 유한한 0 이상의 숫자가 보장됨
```

### 4-c. `completionRate` 계산 로직 추가

`focusRate` 계산 라인(line 237) 바로 아래에 추가:
```js
const focusRate = calcAvgFocus(session.records, session.pauseEvents);

// completionRate 계산 — Lecture.durationSec 기반
const lecForCompletion = await Lecture.findOne({ lectureId: session.lectureId });
const durationSec = lecForCompletion?.durationSec ?? 0;
const completionRate = durationSec > 0
  ? Math.min(100, Math.round(watchedSec / durationSec * 100))
  : 0;
// durationSec = 0 이면 Lecture 없음 → 방어 처리로 0 반환
```

> `Lecture` 는 이미 line 3에서 `require('../models/Lecture')` 로 import 되어 있음.

### 4-d. `updateOne` 에 `completionRate` 포함

**현재 코드 (line 238):**
```js
await session.updateOne({ endTime, focusRate });
```

**변경 후:**
```js
await session.updateOne({ endTime, focusRate, completionRate });
```

### 4-e. 포인트 지급 조건에 `completionRate >= COMPLETION_THRESHOLD` 추가

**현재 코드 (line 244):**
```js
if (!abandoned && edupoint && focusRate >= edupoint.settings.targetRate) {
```

**변경 후:**
```js
if (!abandoned && completionRate >= COMPLETION_THRESHOLD && edupoint && focusRate >= edupoint.settings.targetRate) {
```

### 4-f. 응답 객체에 `completionRate` 포함

**현재 코드 (line 261–268):**
```js
const response = {
  ...session.toObject(),
  endTime,
  focusRate,
  pointEarned: pointResult?.pointEarned || 0,
  studentEarned: pointResult?.studentEarned || null,
  weeklyBonus: weeklyBonusResult?.weeklyBonus || null,
};
```

**변경 후:**
```js
const response = {
  ...session.toObject(),
  endTime,
  focusRate,
  completionRate,                              // ← 추가
  pointEarned: pointResult?.pointEarned || 0,
  studentEarned: pointResult?.studentEarned || null,
  weeklyBonus: weeklyBonusResult?.weeklyBonus || null,
};
```

---

## Step 5 — `api.js` `sessionAPI.end()` 에 `watchedSec` 파라미터 추가

**파일:** `frontend/src/services/api.js`

**현재 코드 (line 70–71):**
```js
end: (sessionId, abandoned = false) =>
  request('PUT', `/sessions/${sessionId}/end`, { abandoned }),
```

**변경 후:**
```js
end: (sessionId, abandoned = false, watchedSec = 0) =>
  request('PUT', `/sessions/${sessionId}/end`, { abandoned, watchedSec }),
```

---

## Step 6 — `StudentDashboard.jsx` `handleEndSession` 수정

**파일:** `frontend/src/pages/StudentDashboard.jsx`

### 6-a. ENDED 이벤트 호출부 (line 120)

YouTube 영상이 끝까지 재생된 경우 `ended=true` 플래그 전달.

**현재 코드:**
```js
if (e.data === window.YT.PlayerState.ENDED && sessionStartedRef.current) {
  handleEndSessionRef.current?.();
}
```

**변경 후:**
```js
if (e.data === window.YT.PlayerState.ENDED && sessionStartedRef.current) {
  handleEndSessionRef.current?.(false, false, true); // ended=true
}
```

### 6-b. 함수 시그니처에 `ended` 파라미터 추가 (line 465)

**현재 코드:**
```js
const handleEndSession = async (force = false, abandoned = false) => {
```

**변경 후:**
```js
const handleEndSession = async (force = false, abandoned = false, ended = false) => {
```

### 6-c. `watched` 계산 로직 분기 (line 479)

ENDED 자동 종료 시 `getDuration()` 사용 → 명시적으로 100% 완강 처리.  
수동 종료 시 `getCurrentTime()` 사용 → 실제 시청 위치 기록.

**현재 코드:**
```js
const watched = playerRef.current?.getCurrentTime?.() ?? elapsedRef.current;
```

**변경 후:**
```js
const watched = ended
  ? (playerRef.current?.getDuration?.() ?? elapsedRef.current)
  : (playerRef.current?.getCurrentTime?.() ?? elapsedRef.current);
```

### 6-d. `sessionAPI.end()` 호출 시 `watchedSec` 전달 (line 488, 491)

**현재 코드:**
```js
try {
  endData = await sessionAPI.end(sid, abandoned);
} catch (_) {
  await new Promise(r => setTimeout(r, 1500));
  endData = await sessionAPI.end(sid, abandoned);
}
```

**변경 후:**
```js
try {
  endData = await sessionAPI.end(sid, abandoned, Math.round(watched));
} catch (_) {
  await new Promise(r => setTimeout(r, 1500));
  endData = await sessionAPI.end(sid, abandoned, Math.round(watched));
}
```

> `Math.round(watched)` — 소수점 제거. `watched` 는 이미 line 479에서 계산된 값.

---

## Step 7 — `ParentDashboard.jsx` 완료 판별 조건 변경

**파일:** `frontend/src/pages/ParentDashboard.jsx`

`completionRate` 가 없는 기존 문서는 `undefined` 로 올 수 있으므로 `?? 0` 으로 방어 처리.

### 수정 위치 5곳

#### 7-a. `filteredSessions` 필터 (line 102–104)

**현재 코드:**
```js
const filteredSessions = childSessions.filter(s =>
  statusFilter === 'ended' ? !!s.endTime : !s.endTime
);
```

**변경 후:**
```js
const filteredSessions = childSessions.filter(s =>
  statusFilter === 'ended'
    ? !!s.endTime && (s.completionRate ?? 0) >= 90
    : !s.endTime || (s.completionRate ?? 0) < 90
);
```

#### 7-b. `handleChildSelect` 내부 필터 (line 125–127)

**현재 코드:**
```js
const filtered = target.filter(s =>
  statusFilter === 'ended' ? !!s.endTime : !s.endTime
);
```

**변경 후:**
```js
const filtered = target.filter(s =>
  statusFilter === 'ended'
    ? !!s.endTime && (s.completionRate ?? 0) >= 90
    : !s.endTime || (s.completionRate ?? 0) < 90
);
```

#### 7-c. `handleStatusFilter` 내부 필터 (line 136–138)

**현재 코드:**
```js
const filtered = childSessions.filter(s =>
  status === 'ended' ? !!s.endTime : !s.endTime
);
```

**변경 후:**
```js
const filtered = childSessions.filter(s =>
  status === 'ended'
    ? !!s.endTime && (s.completionRate ?? 0) >= 90
    : !s.endTime || (s.completionRate ?? 0) < 90
);
```

#### 7-d, 7-e. 완료/미완료 탭 카운트 배지 (line 241–242)

**현재 코드:**
```js
{ key: 'ended',   label: '완료',   count: childSessions.filter(s => !!s.endTime).length },
{ key: 'ongoing', label: '미완료', count: childSessions.filter(s => !s.endTime).length },
```

**변경 후:**
```js
{ key: 'ended',   label: '완료',   count: childSessions.filter(s => !!s.endTime && (s.completionRate ?? 0) >= 90).length },
{ key: 'ongoing', label: '미완료', count: childSessions.filter(s => !s.endTime || (s.completionRate ?? 0) < 90).length },
```

---

## Step 8 — `seedDemo.js` 데모 세션에 `completionRate` 추가

**파일:** `backend/scripts/seedDemo.js`

데모 세션은 완강 세션이므로 `completionRate: 100` 추가.

**현재 코드 (line 104–113):**
```js
const session = await Session.create({
  studentId: 'demo-student-001',
  lectureId: lec.lectureId,
  subject: lec.subject,
  startTime: sessionStart,
  endTime: new Date(sessionStart.getTime() + lec.durationMin * 60 * 1000),
  records,
  departures,
  ragAnalysis: null,
});
```

**변경 후:**
```js
const session = await Session.create({
  studentId: 'demo-student-001',
  lectureId: lec.lectureId,
  subject: lec.subject,
  startTime: sessionStart,
  endTime: new Date(sessionStart.getTime() + lec.durationMin * 60 * 1000),
  records,
  departures,
  completionRate: 100,    // ← 추가 (완강 데모)
  ragAnalysis: null,
});
```

---

## Step 9 — 자동 테스트 작성

**파일:** `backend/src/tests/session/completion.test.js` (신규 생성)

`reward.test.js` 와 동일한 supertest + `setup.js` 헬퍼 패턴 사용.

`endSession` 이 `Lecture.findOne({ lectureId })` 로 `durationSec` 를 조회하므로,
각 테스트에서 `Lecture.create(...)` 픽스처를 만들어야 함.

```js
const request = require('supertest');
const app = require('../app');
const Lecture = require('../../models/Lecture');
const Session = require('../../models/Session');
const EduPoint = require('../../models/EduPoint');
const {
  getStudentToken,
  createTestParentWithChild,
  createTestEduPoint,
  createTestSession,
  makeRecords,
} = require('../setup');

// Lecture 픽스처 헬퍼
async function createTestLecture(lectureId = 'LEC001', durationSec = 1000) {
  return Lecture.create({
    lectureId,
    subject: '테스트과목',   // Lecture.js:6 subject: required
    title: '테스트강의',
    youtubeId: 'test-yt-id',
    durationSec,
  });
}

describe('completionRate 계산', () => {
  let token;
  beforeEach(async () => {
    await createTestParentWithChild('STU001');
    token = getStudentToken('STU001');
  });

  test('watchedSec=500, durationSec=1000 → completionRate=50, 응답에 포함', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 500 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(50);
  });

  test('watchedSec=950, durationSec=1000 → completionRate=95, 응답에 포함', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(95);
  });

  test('watchedSec=1100 (초과) → completionRate=100 (clamp)', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 1100 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(100);
  });

  test('Lecture 없음 → completionRate=0 (방어 처리)', async () => {
    // Lecture 생성 안 함
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 900 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(0);
  });
});

describe('입력 검증 (validate 미들웨어)', () => {
  let token;
  beforeEach(async () => {
    await createTestParentWithChild('STU001');
    token = getStudentToken('STU001');
  });

  test('watchedSec 누락 → 200, completionRate=0 (default)', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({});  // watchedSec 없음

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(0);
  });

  test('watchedSec=-1 → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: -1 });

    expect(res.status).toBe(400);
  });

  test('watchedSec="abc" (문자열) → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 'abc' });

    expect(res.status).toBe(400);
  });

  test('watchedSec=Infinity → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: Infinity });

    expect(res.status).toBe(400);
  });
});

describe('포인트 지급 정책 (completionRate + focusRate 연동)', () => {
  let parent, token;
  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    token = getStudentToken('STU001');
  });

  test('watchedSec=500 (50%) + 높은 집중률 → pointEarned=0 (완강 미달)', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10)); // status 1 → 집중률 높음

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 500 }); // completionRate=50 < 90

    expect(res.status).toBe(200);
    expect(res.body.pointEarned).toBe(0);
  });

  test('watchedSec=950 (95%) + 집중률 >= targetRate → pointEarned > 0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 }); // completionRate=95 >= 90

    expect(res.status).toBe(200);
    expect(res.body.pointEarned).toBe(100);
  });

  test('watchedSec=950 (95%) + 집중률 < targetRate → pointEarned=0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 90, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    const session = await createTestSession('STU001', 'LEC001', makeRecords(3, 10)); // status 3 → 집중률 낮음

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.pointEarned).toBe(0);
  });

  test('abandoned=true + watchedSec=950 → pointEarned=0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ abandoned: true, watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.pointEarned).toBe(0);
  });
});
```

---

## 수동 검증 체크리스트

구현 완료 후 다음 순서로 확인:

```
[ ] Step 1-4 완료 후: backend npm run dev 기동 오류 없음
[ ] Step 5-6 완료 후: frontend npm run dev 기동 오류 없음
[ ] YouTube 영상 끝까지 재생 → DB에서 completionRate=100 확인
[ ] 수동 종료(50% 시점) → completionRate=50, 부모 대시보드 "미완료" 탭 표시 확인
[ ] 수동 종료(95% 시점) + 집중률 달성 → pointEarned > 0, "완료" 탭 표시 확인
[ ] seedDemo.js 재실행 → 부모 대시보드 "완료" 탭에 3개 세션 표시 확인
[ ] 기존 세션 (completionRate 없음) → "미완료" 탭에 표시 확인
[ ] npm test → 전체 테스트 통과 확인
```

---

## 실행 순서 요약

```
Step 1  backend/src/models/Session.js           completionRate 필드 추가
Step 2  backend/src/middleware/validate.js       endSession 스키마 추가
Step 3  backend/src/routes/sessions.js           /:id/end 라우트에 validate 연결
Step 4  backend/src/controllers/sessionController.js
          4-a  COMPLETION_THRESHOLD 상수
          4-b  watchedSec 추출
          4-c  completionRate 계산
          4-d  updateOne에 completionRate 포함
          4-e  포인트 조건에 completionRate >= 90 추가
          4-f  응답에 completionRate 포함
Step 5  frontend/src/services/api.js             end()에 watchedSec 파라미터 추가
Step 6  frontend/src/pages/StudentDashboard.jsx
          6-a  ENDED 이벤트 호출부 (ended=true)
          6-b  handleEndSession 시그니처 (ended 파라미터)
          6-c  watched 계산 분기 (ended ? getDuration : getCurrentTime)
          6-d  sessionAPI.end() 호출에 Math.round(watched) 전달
Step 7  frontend/src/pages/ParentDashboard.jsx  완료 판별 조건 5곳
Step 8  backend/scripts/seedDemo.js              completionRate: 100 추가
Step 9  backend/src/tests/session/completion.test.js 신규 작성
```

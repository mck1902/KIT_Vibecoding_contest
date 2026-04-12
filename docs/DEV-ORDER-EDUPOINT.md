# 에듀 포인트 보상 시스템 — 개발 순서서

> PLAN-EDUPOINT.md의 설계를 기반으로 한 단계별 구현 가이드.
> 각 스텝은 독립적으로 동작 확인 가능한 단위로 분할했다.
> 참조하는 파일 경로와 라인 번호는 2026-04-12 기준 실제 코드 상태.

---

## Step 1. 백엔드 모델 생성

### 1-1. EduPoint 모델 생성

**신규 파일:** `backend/src/models/EduPoint.js`

```javascript
const mongoose = require('mongoose');

const eduPointSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  studentId: { type: String, required: true, trim: true },
  balance: { type: Number, default: 0 },
  studentEarned: { type: Number, default: 0 },
  settings: {
    targetRate: { type: Number, default: 70, min: 50, max: 95 },
    rewardPerSession: { type: Number, default: 100, min: 10, max: 500 },
    weeklyBonusCount: { type: Number, default: 5, min: 1, max: 7 },
    weeklyBonusReward: { type: Number, default: 500, min: 10, max: 5000 },
  },
  settingsEffectiveFrom: { type: Date, default: null },
  previousSettings: {
    weeklyBonusCount: { type: Number, default: null },
    weeklyBonusReward: { type: Number, default: null },
  },
}, { timestamps: true, versionKey: false });

eduPointSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('EduPoint', eduPointSchema);
```

**확인:** `node -e "require('./src/models/EduPoint')"` 에러 없으면 통과.

### 1-2. PointHistory 모델 생성

**신규 파일:** `backend/src/models/PointHistory.js`

```javascript
const mongoose = require('mongoose');

const pointHistorySchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  type: { type: String, required: true, enum: ['earn', 'charge', 'weekly_bonus', 'weekly_bonus_failed'] },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  parentBalanceAfter: { type: Number, required: true },
  studentEarnedAfter: { type: Number, default: null },
}, { timestamps: true, versionKey: false });

// 세션당 earn/weekly_bonus 중복 방지 — DB 레벨 물리적 방어
pointHistorySchema.index(
  { sessionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('PointHistory', pointHistorySchema);
```

### 1-3. Session 모델 확장

**수정 파일:** `backend/src/models/Session.js` (line 21~36)

기존 sessionSchema에 3개 필드 추가:
```javascript
focusRate: { type: Number, default: null },
pointEarned: { type: Number, default: null },
pointAwarded: { type: Boolean, default: false },
```

**주의:** 기존 필드(`studentId`, `lectureId`, `records`, `departures` 등)는 일체 변경하지 않는다.

**확인:** 서버 시작 후 기존 세션 API(`POST /api/sessions`, `PUT /api/sessions/:id/end`)가 정상 동작하는지 확인. 기존 필드에 영향 없어야 한다.

---

## Step 2. 유틸리티 함수

### 2-1. weekUtils.js 생성

**신규 파일:** `backend/src/utils/weekUtils.js`

PLAN-EDUPOINT.md 섹션 3-4의 `getWeekRangeKST()` 함수 구현.
`getNextMondayKST()` 함수도 함께 구현 (settings 소급 방지용).

**확인:** Node REPL에서 직접 호출하여 KST 월요일 00:00 경계값 확인.
```
const { getWeekRangeKST } = require('./src/utils/weekUtils');
console.log(getWeekRangeKST(new Date('2026-04-13T00:00:00+09:00')));
// weekStart: 2026-04-12T15:00:00.000Z (= 4/13 00:00 KST)
```

---

## Step 3. endSession idempotency 가드

**수정 파일:** `backend/src/controllers/sessionController.js` — `endSession` 함수 (line 54~72)

현재 코드는 `endTime`이 이미 있어도 덮어쓴다. 아래 가드를 추가:

```javascript
// line 62 이후, session을 찾은 직후에 추가
if (session.endTime) {
  // 이미 종료된 세션 — 기존 결과 반환, 포인트 재지급 없음
  return res.status(200).json(session.toObject());
}
```

**확인:** 같은 세션에 `PUT /:id/end` 두 번 호출 → 첫 번째 200, 두 번째도 200이지만 endTime 변경 없음.

**이 스텝을 먼저 하는 이유:** 포인트 지급 로직 추가 전에 중복 호출 방어부터 확보. 이후 스텝에서 포인트 로직을 추가해도 이 가드가 1차 방어선 역할.

---

## Step 4. 에듀포인트 API (설정 + 충전 + 조회)

### 4-1. Zod 유효성 스키마 추가

**수정 파일:** `backend/src/middleware/validate.js`

기존 `schemas` 객체에 추가:
```javascript
edupointSettings: z.object({
  body: z.object({
    targetRate: z.number().int().min(50).max(95),
    rewardPerSession: z.number().int().min(10).max(500),
    weeklyBonusCount: z.number().int().min(1).max(7),
    weeklyBonusReward: z.number().int().min(10).max(5000),
  }),
}),
edupointCharge: z.object({
  body: z.object({
    amount: z.number().refine(v => [1000, 5000, 10000].includes(v)),
  }),
}),
```

### 4-2. edupointController.js 생성

**신규 파일:** `backend/src/controllers/edupointController.js`

구현할 함수 4개 (PLAN-EDUPOINT.md 섹션 3-1 참조):
1. `getEduPoint(req, res)` — GET /:studentId
2. `updateSettings(req, res)` — PUT /:studentId/settings
3. `chargePoints(req, res)` — POST /:studentId/charge
4. `getHistory(req, res)` — GET /:studentId/history

모든 함수 진입부에 `validateAccess()` 호출 (PLAN-EDUPOINT.md 섹션 3-0).

**핵심 구현 사항:**
- `getEduPoint`: 문서 미존재 시 기본값 + `initialized: false` 반환 (404 아님)
- `updateSettings`: `findOneAndUpdate` + `upsert: true`. 최초 설정 시 `settingsEffectiveFrom` = 현재 주 월요일, 변경 시 = 다음 주 월요일
- `chargePoints`: EduPoint 미존재 시 400. `$inc: { balance: +amount }` + PointHistory 기록
- `getHistory`: 페이지네이션 + type 필터

### 4-3. edupoint 라우트 생성

**신규 파일:** `backend/src/routes/edupoint.js`

```javascript
const express = require('express');
const { getEduPoint, updateSettings, chargePoints, getHistory } = require('../controllers/edupointController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.get('/:studentId', requireAuth, getEduPoint);
router.put('/:studentId/settings', requireAuth, requireRole('parent'), validate(schemas.edupointSettings), updateSettings);
router.post('/:studentId/charge', requireAuth, requireRole('parent'), validate(schemas.edupointCharge), chargePoints);
router.get('/:studentId/history', requireAuth, getHistory);

module.exports = router;
```

### 4-4. 라우트 등록

**수정 파일:** `backend/src/index.js`

기존 라우트 등록 영역에 추가:
```javascript
const edupointRoutes = require('./routes/edupoint');
app.use('/api/edupoint', edupointRoutes);
```

**확인 (curl 또는 Postman):**
```
1. 학부모 로그인 → JWT 획득
2. PUT /api/edupoint/STU001/settings { targetRate: 80, ... } → 200, 문서 생성
3. GET /api/edupoint/STU001 → 200, initialized: true
4. POST /api/edupoint/STU001/charge { amount: 5000 } → 200, balance: 5000
5. GET /api/edupoint/STU001/history → 200, charge 내역 1건
6. 학생 로그인 → GET /api/edupoint/STU001 → 200 (본인)
7. 학생 로그인 → GET /api/edupoint/STU002 → 403 (타인)
8. 학생 로그인 → PUT /api/edupoint/STU001/settings → 403 (student 거부)
```

---

## Step 5. 세션 종료 시 포인트 지급 통합

### 5-1. awardPoints 함수 구현

**수정 파일:** `backend/src/controllers/sessionController.js`

상단에 import 추가:
```javascript
const EduPoint = require('../models/EduPoint');
const PointHistory = require('../models/PointHistory');
```

PLAN-EDUPOINT.md 섹션 3-3의 `awardPoints()` 함수를 `sessionController.js`에 추가.
MongoDB 트랜잭션 사용 (`mongoose.startSession()` + `withTransaction()`).

### 5-2. endSession에 포인트 로직 통합

`endSession` 함수 수정 (Step 3에서 추가한 idempotency 가드 이후):

```javascript
// endTime 설정 후
const focusRate = calcAvgFocus(session.records);
session.focusRate = focusRate;
await session.save();

// 포인트 지급 시도
const edupoint = await EduPoint.findOne({ studentId: session.studentId });
let pointResult = null;
if (edupoint && focusRate >= edupoint.settings.targetRate) {
  pointResult = await awardPoints(session._id, focusRate, edupoint);
}

// 주간 보너스 판정 (별도 트랜잭션)
if (pointResult) {
  await checkWeeklyBonus(session.studentId, edupoint);
}
```

### 5-3. 주간 보너스 판정 함수 구현

`checkWeeklyBonus()` 함수를 `sessionController.js`에 추가.
PLAN-EDUPOINT.md 섹션 3-4의 판정 흐름 구현.
`weekUtils.js`의 `getWeekRangeKST()` 사용.

**확인:**
```
1. 학부모: 설정 저장 (targetRate: 50) + 충전 5000P
2. 학생: 세션 시작 → records 전송 (전부 status 1) → 세션 종료
   → 응답에 pointEarned > 0, studentEarned > 0 확인
3. 같은 세션 재종료 → pointEarned 변동 없음 (idempotency)
4. 학부모: GET /api/edupoint/STU001 → balance 차감 확인
5. 학부모: GET /api/edupoint/STU001/history → earn 내역 확인
```

---

## Step 6. 프론트엔드 API 클라이언트

**수정 파일:** `frontend/src/services/api.js`

기존 `sessionAPI` 객체 뒤에 `edupointAPI` 추가:

```javascript
export const edupointAPI = {
  /** 포인트 설정 & 잔액 조회 → EduPoint 문서 */
  get: (studentId) =>
    request('GET', `/edupoint/${studentId}`),

  /** 포인트 설정 변경 (학부모 전용) */
  updateSettings: (studentId, settings) =>
    request('PUT', `/edupoint/${studentId}/settings`, settings),

  /** 포인트 충전 (학부모 전용, 시뮬레이션) */
  charge: (studentId, amount) =>
    request('POST', `/edupoint/${studentId}/charge`, { amount }),

  /** 포인트 내역 조회 */
  getHistory: (studentId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/edupoint/${studentId}/history${query ? '?' + query : ''}`);
  },
};
```

**확인:** 브라우저 콘솔에서 `edupointAPI.get('STU001')` 호출 → 응답 확인.

---

## Step 7. 프론트엔드 — CSS 변수 추가

**수정 파일:** `frontend/src/index.css`

라이트 모드 변수 영역 (`:root` 또는 `[data-theme="light"]`)에 추가:
```css
--point-gold: #f59e0b;
--point-success: #22c55e;
--point-danger: #ef4444;
```

다크 모드 변수 영역 (`[data-theme="dark"]`)에 추가:
```css
--point-gold: #fbbf24;
--point-success: #4ade80;
--point-danger: #f87171;
```

---

## Step 8. 프론트엔드 — 학부모 포인트 설정 페이지

### 8-1. ParentPointSettings 페이지

**신규 파일:**
- `frontend/src/pages/ParentPointSettings.jsx`
- `frontend/src/pages/ParentPointSettings.css`

**구현 내용** (PLAN-EDUPOINT.md 섹션 4-1(A)(B)):
- 목표 집중률 슬라이더 (50~95%)
- 세션당 보상 입력 (10~500P)
- 주간 보너스 조건 (횟수 1~7, 포인트)
- 저장 버튼 + "변경된 주간 보너스 조건은 다음 주 월요일부터 적용됩니다" 안내
- 포인트 충전 영역 (1,000P / 5,000P / 10,000P 버튼)
- 현재 잔액 표시

### 8-2. App.jsx에 라우트 추가

**수정 파일:** `frontend/src/App.jsx`

import 추가 + Route 추가:
```jsx
import ParentPointSettings from './pages/ParentPointSettings';

// Routes 내부에 추가
<Route path="/parent/point-settings" element={
  <ProtectedRoute role="parent"><ParentPointSettings /></ProtectedRoute>
} />
```

**확인:** `/parent/point-settings` 접근 → 설정 저장 → 충전 → 잔액 반영.

---

## Step 9. 프론트엔드 — 학부모 대시보드 위젯

### 9-1. 포인트 컴포넌트 생성

**신규 파일:**
- `frontend/src/components/point/PointBalance.jsx` + `.css` — 잔액 카드 (충전 버튼 포함)
- `frontend/src/components/point/PointHistory.jsx` + `.css` — 최근 내역 리스트
- `frontend/src/components/point/WeeklyProgress.jsx` + `.css` — 주간 달성 진행바

### 9-2. ParentDashboard에 위젯 통합

**수정 파일:** `frontend/src/pages/ParentDashboard.jsx`

기존 `selectedSessionId` 변경 시 report(line 51~58), rag(line 61~72) useEffect와 동일한 패턴으로 edupoint 데이터 로딩 추가:

```javascript
const [edupoint, setEdupoint] = useState(null);

useEffect(() => {
  if (!selectedChild?.studentId) return;
  edupointAPI.get(selectedChild.studentId)
    .then(data => setEdupoint(data))
    .catch(() => setEdupoint(null));
}, [selectedChild?.studentId]);
```

기존 summary-cards 영역 또는 하단에 PointBalance, PointHistory, WeeklyProgress 배치.
"에듀 포인트 설정" 버튼 → `/parent/point-settings` 링크.

**수정 파일:** `frontend/src/pages/ParentDashboard.css` — 포인트 카드 스타일 추가.

**확인:**
1. 학부모 로그인 → 대시보드에 포인트 잔액, 최근 내역, 주간 현황 표시
2. 자녀 선택 변경 → 해당 자녀의 포인트 데이터로 갱신
3. 설정 미생성 자녀 → "포인트 시스템을 설정해주세요" 안내

---

## Step 10. 프론트엔드 — 학생 화면

### 10-1. StudentDashboard 목표 집중률 실시간 표시

**수정 파일:** `frontend/src/pages/StudentDashboard.jsx`

세션 시작 시 `edupointAPI.get(user.studentId)` 호출 → targetRate 로드.
기존 집중도 위젯 영역에 "목표: 80% / 현재: 73%" 텍스트 추가.
"현재"는 누적 가중치 평균 (기존 STATUS_TO_FOCUS 매핑 재사용, records 배열 계산).

### 10-2. StudentDashboard 포인트 위젯

같은 파일에 포인트 위젯 추가:
- 내 포인트 (studentEarned)
- 최근 획득 내역 (최근 3건)
- 주간 달성 현황 진행바

### 10-3. 목표 달성 축하 모달

**신규 파일:**
- `frontend/src/components/point/GoalAchievedModal.jsx` + `.css`

세션 종료 응답에 `pointEarned > 0`이면 모달 표시:
"목표 달성! +100P 획득"

**수정 파일:** `frontend/src/pages/StudentDashboard.jsx`
— `handleEndSession` (line 335~362) 수정. 세션 종료 응답에서 pointEarned 확인 → 모달 state 설정.

**확인:**
1. 학생 로그인 → 세션 시작 → "목표: 70%" 표시 확인
2. 세션 종료 (집중도 높은 records) → 축하 모달 + 포인트 위젯 갱신
3. 세션 종료 (집중도 낮은 records) → 모달 없음, pointEarned: 0

---

## Step 11. 프론트엔드 — 세션 리포트 확장

**수정 파일:** `frontend/src/pages/SessionReport.jsx`

기존 리포트 하단에 포인트 획득 결과 카드 추가:
- 세션 집중률 + 목표 집중률 비교
- 획득 포인트 표시 (0이면 "미달성")

**수정 파일:** `frontend/src/pages/SessionReport.css` — 포인트 결과 카드 스타일.

---

## Step 12. 테스트 인프라 구축

### 12-1. 테스트 의존성 설치

**위치:** `backend/`

```bash
npm install --save-dev jest supertest mongodb-memory-server
```

**현재 devDependencies:** `nodemon` 만 있음 (package.json 확인 완료).

### 12-2. Jest 설정

**신규 파일:** `backend/jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  setupFilesAfterSetup: ['./src/tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
};
```

**수정 파일:** `backend/package.json` — scripts에 `"test": "jest --forceExit --detectOpenHandles"` 추가.

### 12-3. 테스트 공통 셋업

**신규 파일:** `backend/src/tests/setup.js`

PLAN-EDUPOINT.md 섹션 7-8의 셋업 구현:
- MongoMemoryServer 시작/종료
- 테스트 간 컬렉션 초기화
- 인증 헬퍼: `getStudentToken()`, `getParentToken()`
- 데이터 헬퍼: `createTestStudent()`, `createTestParentWithChild()`, `createTestEduPoint()`, `createTestSession()`

---

## Step 13. 테스트 작성

### 13-1. 유틸 단위 테스트

**신규 파일:** `backend/src/tests/utils/weekUtils.test.js`

PLAN-EDUPOINT.md 섹션 7-1의 6개 KST 경계 케이스 + calcAvgFocus 4개 케이스.

### 13-2. 권한 테스트

**신규 파일:** `backend/src/tests/edupoint/authorization.test.js`

PLAN-EDUPOINT.md 섹션 7-2의 10개 케이스 (학생 접근 제어, 학부모 접근 제어, 인증 없음).

### 13-3. 설정 API 테스트

**신규 파일:** `backend/src/tests/edupoint/settings.test.js`

PLAN-EDUPOINT.md 섹션 7-3의 7개 케이스 (최초 GET, upsert, 유효성 실패, 소급 방지).

### 13-4. 충전 테스트

**신규 파일:** `backend/src/tests/edupoint/charge.test.js`

PLAN-EDUPOINT.md 섹션 7-4의 4개 케이스.

### 13-5. 포인트 지급 테스트

**신규 파일:** `backend/src/tests/edupoint/reward.test.js`

PLAN-EDUPOINT.md 섹션 7-5의 케이스:
- 정상 흐름 (달성/미달/미설정)
- 3중 방어 각각 검증 + 동시 호출 시뮬레이션
- 잔액 경계값 (정확히 일치, 1 부족, 0)
- 트랜잭션 정합성 (잔액 부족 시 전체 롤백)

### 13-6. 주간 보너스 테스트

**신규 파일:** `backend/src/tests/edupoint/weeklyBonus.test.js`

PLAN-EDUPOINT.md 섹션 7-6의 케이스:
- 정상 흐름, 중복/경계, 설정 변경 소급 방지

### 13-7. 다자녀 시나리오 테스트

reward.test.js 또는 별도 파일에 PLAN-EDUPOINT.md 섹션 7-7의 4개 케이스.

**확인:** `cd backend && npm test` → 전체 통과.

---

## 의존 관계 요약

```
Step 1  모델 생성 ──────────────────────────────┐
Step 2  weekUtils ──────────────────────────────┤
Step 3  endSession idempotency ─────────────────┤
                                                ▼
Step 4  에듀포인트 API (설정/충전/조회) ──────────┤
                                                ▼
Step 5  세션 종료 포인트 지급 (Step 1,2,3,4 필요)─┤
                                                ▼
Step 6  프론트 API 클라이언트 ───────────────────┤
Step 7  CSS 변수 ───────────────────────────────┤
                                                ▼
Step 8  학부모 설정 페이지 (Step 6,7 필요) ──────┤
Step 9  학부모 대시보드 위젯 (Step 6,7 필요) ────┤
Step 10 학생 화면 (Step 5,6,7 필요) ────────────┤
Step 11 세션 리포트 (Step 5,6,7 필요) ──────────┤
                                                ▼
Step 12 테스트 인프라 (독립, 언제든 가능) ────────┤
Step 13 테스트 작성 (Step 1~5 완료 후) ──────────┘
```

**병렬 가능:**
- Step 1 + 2 + 3: 독립적, 동시 진행 가능
- Step 8 + 9: 독립적, 동시 진행 가능
- Step 10 + 11: 독립적, 동시 진행 가능
- Step 12: 아무 때나 가능 (다른 스텝에 의존 없음)

---

## 체크리스트

- [ ] Step 1: EduPoint, PointHistory 모델 + Session 확장
- [ ] Step 2: weekUtils.js (KST 주 범위 계산)
- [ ] Step 3: endSession idempotency 가드
- [ ] Step 4: 에듀포인트 API 4개 엔드포인트
- [ ] Step 5: 세션 종료 포인트 지급 + 주간 보너스
- [ ] Step 6: 프론트 API 클라이언트 (edupointAPI)
- [ ] Step 7: CSS 변수 (--point-gold 등)
- [ ] Step 8: 학부모 포인트 설정 페이지
- [ ] Step 9: 학부모 대시보드 포인트 위젯
- [ ] Step 10: 학생 화면 (목표 표시 + 포인트 위젯 + 축하 모달)
- [ ] Step 11: 세션 리포트 포인트 결과
- [ ] Step 12: 테스트 인프라 (Jest + supertest + MongoMemoryServer)
- [ ] Step 13: 테스트 작성 (6개 파일)

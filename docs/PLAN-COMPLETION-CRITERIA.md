# Plan: 완료 기준을 실제 완강 여부로 변경

## Context

현재 ParentDashboard의 "완료" 탭은 `session.endTime` 존재 여부만 판단한다.
학생이 강의를 10%만 보고 종료 버튼을 눌러도 "완료"로 표시된다.
이를 **실제로 강의를 끝까지(90% 이상) 시청했을 때만 완료**로 표기하도록 변경한다.

또한 현재 포인트 지급 조건(`!abandoned && focusRate >= targetRate`)은 완강 여부를 전혀 보지 않아,
10%만 보고 집중률이 높으면 `pointAwarded=true`가 되고 주간 보너스 카운트(`WeeklyProgress.jsx:30`)에도
포함되는 모순이 발생한다. 표시와 포인트 지급 로직을 일관되게 맞추기 위해
**포인트 지급 조건에도 `completionRate >= 90` 을 추가한다.**

---

## 핵심 데이터 흐름 (변경 후)

```
StudentDashboard
  ytCurrentTimeRef (매초 추적) → sessionAPI.end({ abandoned, watchedSec })
  ↓
sessionController.endSession()
  Lecture.durationSec 로 completionRate = watchedSec / durationSec * 100 계산 후 clamp
  Session 에 completionRate 저장
  포인트 지급 조건: !abandoned && completionRate >= 90 && focusRate >= targetRate
  ↓
ParentDashboard
  완료 = !!s.endTime && (s.completionRate ?? 0) >= 90
  주간 보너스 카운트(WeeklyProgress) = pointAwarded === true (자동으로 완강 조건 포함됨)
```

---

## 변경 파일 목록

### 1. `backend/src/models/Session.js`
- `completionRate: { type: Number, default: 0 }` 필드 추가

### 2. `backend/src/middleware/validate.js` — `endSession` 스키마 추가
기존 `validate` + Zod 패턴을 그대로 사용 (sessions.js:14에서 이미 import 중):
```js
const endSessionSchema = z.object({
  abandoned:  z.boolean().optional().default(false),
  watchedSec: z.number().finite().min(0).optional().default(0),
});
```
- `finite()`: NaN / Infinity 차단
- `min(0)`: 음수 차단
- `optional().default(0)`: 기존 클라이언트(watchedSec 없이 호출) 하위 호환

### 3. `backend/src/routes/sessions.js` — `endSession` 라우트에 validate 추가
```js
// 변경 전 (line 21)
router.put('/:id/end', requireAuth, requireRole('student'), endSession);

// 변경 후
router.put('/:id/end', requireAuth, requireRole('student'), validate(schemas.endSession), endSession);
```

### 4. `backend/src/controllers/sessionController.js` — `endSession` 함수
- `req.body`에서 `watchedSec` 수신 (validate 통과 후 보장된 값)
- `Lecture.findOne({ lectureId: session.lectureId })` 로 `durationSec` 조회
- 서버에서 clamp: `completionRate = durationSec > 0 ? Math.min(100, Math.round(watchedSec / durationSec * 100)) : 0`
  - validate로 음수/NaN/Infinity는 차단, `Math.min(100, ...)` 으로 durationSec 초과 값도 clamp
- `session.updateOne({ endTime, focusRate, completionRate })` 에 포함
- 응답 객체에 `completionRate` 포함
- **포인트 지급 조건 변경**: 기존 `!abandoned && focusRate >= targetRate`
  → `!abandoned && completionRate >= COMPLETION_THRESHOLD && focusRate >= targetRate`
  - 주간 보너스 카운트는 `pointAwarded` 기반이므로 별도 수정 불필요 (자동으로 완강 조건 포함됨)

### 5. `frontend/src/services/api.js` — `sessionAPI.end()`
- 현재: `put(\`/sessions/${id}/end\`, { abandoned })`
- 변경: `put(\`/sessions/${id}/end\`, { abandoned, watchedSec })`
- `watchedSec` 파라미터 추가

### 6. `frontend/src/pages/StudentDashboard.jsx` — `handleEndSession`

현재 코드:
- line 119: `PlayerState.ENDED` → `handleEndSessionRef.current?.()` (인자 없음)
- line 465: `handleEndSession(force=false, abandoned=false)` — ended 파라미터 없음
- line 474: `pauseVideo()` 먼저 호출 후 line 479에서 `getCurrentTime()` 읽음
  → `pauseVideo()` 이후 `getCurrentTime()` 반환값이 duration임을 보장할 수 없음

변경 방법 — `ended` 플래그 파라미터 추가:
```js
// 변경 전 (line 119-120)
handleEndSessionRef.current?.();

// 변경 후
handleEndSessionRef.current?.(false, false, true); // ended=true

// 함수 시그니처 변경 (line 465)
const handleEndSession = async (force = false, abandoned = false, ended = false) => {

// watchedSec 계산 (line 479 교체)
const watched = ended
  ? (playerRef.current?.getDuration?.() ?? elapsedRef.current)
  : (playerRef.current?.getCurrentTime?.() ?? elapsedRef.current);
```
- 수동 종료: `getCurrentTime()` → 실제 시청 위치 기록
- 자동 종료(ENDED): `getDuration()` → 명시적으로 100% 처리

### 7. `frontend/src/pages/ParentDashboard.jsx`
- 완료 판별: `!!s.endTime` → `!!s.endTime && (s.completionRate ?? 0) >= 90`
- 미완료 판별: `!s.endTime` → `!s.endTime || (s.completionRate ?? 0) < 90`
- 해당 조건이 있는 모든 곳 수정 (line 103, 126, 137, 241, 242)
- `?? 0` 사용 이유: 기존 DB 문서에 `completionRate` 필드가 없으면 API 응답에서 `undefined`로 옴.
  Mongoose `default: 0`은 신규 생성 시에만 적용되며 기존 문서를 소급하지 않음.
  `undefined >= 90`은 우연히 `false`이지만 의도가 불명확하므로 `?? 0`으로 명시적으로 처리.

### 8. `backend/scripts/seedDemo.js`
- 데모 세션 생성 시 `completionRate: 100` 추가 (완강 데모이므로)

---

## 완강 임계값

- **90% 이상 = 완료**
- 상수 `COMPLETION_THRESHOLD = 90` 을 `sessionController.js` 상단에 선언

---

## 주의사항

- `Lecture` 모델의 `durationSec` 필드는 이미 존재함 (`backend/src/models/Lecture.js`)
- `lectureId` 로 Lecture를 조회하되, 없을 경우 `completionRate = 0` 처리 (방어 코드)
- **기존 세션 처리**: 마이그레이션 스크립트 없음. 기존 문서는 `completionRate` 필드 자체가 없어 API 응답이 `undefined`. 프론트에서 `?? 0` 으로 처리하므로 자동으로 미완료로 표시됨 (의도된 동작).

---

## 검증 방법

### 자동 테스트 — `backend/src/tests/session/completion.test.js` 신규 작성

기존 `reward.test.js` 패턴 그대로 사용 (supertest + setup.js 헬퍼).
`endSession` 이 `Lecture.findOne({ lectureId })` 로 `durationSec` 를 조회하므로,
각 테스트에서 `Lecture.create({ lectureId: 'LEC001', durationSec: 1000, ... })` 픽스처 필요.

```
completionRate 계산
  ✓ watchedSec=500, durationSec=1000 → completionRate=50, 응답에 포함
  ✓ watchedSec=950, durationSec=1000 → completionRate=95, 응답에 포함
  ✓ watchedSec=1100 (초과) → completionRate=100 (clamp)
  ✓ Lecture 없음 → completionRate=0 (방어 처리)

입력 검증 (validate 미들웨어)
  ✓ watchedSec 누락 → 200, completionRate=0 (default)
  ✓ watchedSec=-1 → 400
  ✓ watchedSec="abc" (문자열) → 400
  ✓ watchedSec=Infinity → 400

포인트 지급 정책
  ✓ watchedSec=500 (50%) + 높은 집중률 → pointEarned=0 (완강 미달)
  ✓ watchedSec=950 (95%) + 집중률 >= targetRate → pointEarned > 0
  ✓ watchedSec=950 (95%) + 집중률 < targetRate → pointEarned=0
  ✓ abandoned=true + watchedSec=950 → pointEarned=0
```

### 수동 확인

- YouTube ENDED 자동 종료 → `completionRate=100` DB 저장 확인
- `seedDemo.js` 재실행 후 데모 세션이 부모 대시보드 "완료" 탭에 표시되는지 확인
- 기존 세션(`completionRate` 필드 없음) → "미완료" 탭에 표시되는지 확인

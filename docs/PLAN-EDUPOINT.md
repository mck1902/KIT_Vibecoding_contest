# 에듀 포인트 보상 시스템 — 구현 계획서

> 공모전 프로토타입 범위의 에듀 포인트 보상 시스템 구현 계획.
> EXPANSION.md 섹션 1을 기반으로, 기존 EduWatch 아키텍처(React + Express + MongoDB)에 통합.

---

## 1. 기능 요약

학부모가 목표 집중률과 보상 포인트를 설정하면, 학생이 세션에서 해당 기준을 달성할 때 에듀 포인트를 자동 획득한다.
프로토타입에서는 실결제 없이 시뮬레이션 충전(버튼 클릭 즉시 충전)으로 구현한다.

### 핵심 흐름
```
학부모: 목표 설정 & 포인트 충전(시뮬레이션)
  → 학생: 강의 수강 중 실시간 목표 진행률 표시
  → 세션 종료: 집중률 ≥ 목표 → 포인트 자동 지급
  → 주간 보너스: 주 N회 달성 시 추가 포인트 지급
  → 학부모: 대시보드에서 포인트 내역 확인
```

---

## 2. 데이터 모델 (MongoDB)

### 2-1. EduPoint (학부모별 포인트 설정 & 잔액)

```javascript
// backend/src/models/EduPoint.js
// 학부모-자녀 간 포인트 관계 (1:1). 자녀가 여러 명이면 각각 별도 문서.
{
  parentId: ObjectId,           // ref: Parent
  studentId: String,            // ref: Student.studentId (자녀)
  balance: Number,              // 학부모 예산 잔액 — 충전하면 증가, 지급하면 차감 (기본: 0)
  studentEarned: Number,        // 학생 누적 획득 포인트 — 지급받으면 증가만 함 (기본: 0)
  settings: {
    targetRate: Number,         // 목표 집중률 % (기본: 70, 범위: 50~95)
    rewardPerSession: Number,   // 세션당 보상 P (기본: 100, 범위: 10~500)
    weeklyBonusCount: Number,   // 주간 보너스 달성 횟수 (기본: 5)
    weeklyBonusReward: Number   // 주간 보너스 P (기본: 500)
  },
  settingsEffectiveFrom: Date,  // 현재 settings 적용 시작 주 월요일 (KST 00:00). 소급 방지용
  previousSettings: {           // 직전 settings (settingsEffectiveFrom 이전 주에 적용)
    weeklyBonusCount: Number,
    weeklyBonusReward: Number
  },
  createdAt, updatedAt
}
```

> **설계 결정: 학생 누적 포인트를 별도 필드(`studentEarned`)로 둔 이유**
> - PointHistory를 매번 SUM 집계하면 내역이 쌓일수록 느려지고, 집계 오류 시 UI에 잘못된 값이 표시됨
> - `studentEarned`는 포인트 지급 시 `$inc`로 원자적 증가만 하므로 정합성 유지가 단순
> - `balance`(학부모 잔액)와 `studentEarned`(학생 누적)는 역할이 다름:
>   - `balance`: 충전 시 증가, 지급 시 차감 (양방향)
>   - `studentEarned`: 지급 시 증가만 (단방향, 감소 없음)
> - PointHistory의 `balanceAfter`는 감사 로그 용도로 유지하되, UI 표시용 정수(source of truth)는 `studentEarned`

### 2-2. PointHistory (포인트 획득/충전 내역)

```javascript
// backend/src/models/PointHistory.js
{
  studentId: String,          // ref: Student.studentId
  parentId: ObjectId,         // ref: Parent
  type: String,               // "earn" | "charge" | "weekly_bonus"
  amount: Number,             // 획득/충전 포인트
  reason: String,             // "세션달성" | "주간보너스" | "충전"
  sessionId: ObjectId,        // ref: Session (earn/bonus일 때, charge일 때 null)
  parentBalanceAfter: Number, // 처리 후 학부모 예산 잔액 (감사 로그용)
  studentEarnedAfter: Number, // 처리 후 학생 누적 포인트 (감사 로그용, charge일 때 null)
  createdAt
}

// DB 레벨 중복 방지 — sessionId + type 복합 유니크 인덱스
// charge는 sessionId가 null이므로 partial filter로 earn/weekly_bonus만 대상
PointHistorySchema.index(
  { sessionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } }
);
```

### 2-3. 기존 Session 모델 확장

```javascript
// Session에 추가할 필드
{
  // ... 기존 필드 유지
  focusRate: Number,          // 세션 종료 시 계산된 최종 집중률 (%)
  pointEarned: Number,        // 이 세션에서 획득한 포인트 (0이면 미달성)
}
```

---

## 3. 백엔드 API

### 3-0. 공통 권한 검증 — 기존 패턴 준수

기존 시스템의 권한 검증 패턴:
- `requireAuth` 미들웨어: JWT 토큰 검증 → `req.user` 세팅 (`{ _id, role, studentId?, ... }`)
- `requireRole('parent' | 'student')` 미들웨어: 역할 체크
- `sessionController`: `session.studentId !== req.user.studentId`로 소유권 체크

에듀포인트 API에서 `:studentId` 파라미터 접근 시 **공통 권한 검증 함수**를 도입:

```javascript
// edupointController.js 상단에 정의
async function validateAccess(req, res, studentId) {
  // 학생: 자기 자신만 접근 가능
  if (req.user.role === 'student') {
    if (req.user.studentId !== studentId) {
      res.status(403).json({ message: '본인의 포인트만 조회할 수 있습니다.' });
      return null;
    }
  }
  // 학부모: children 배열에 해당 학생이 있는지 확인
  if (req.user.role === 'parent') {
    const parent = await Parent.findById(req.user.id).populate('children');
    const child = parent?.children.find(c => c.studentId === studentId);
    if (!child) {
      res.status(403).json({ message: '연결되지 않은 자녀입니다.' });
      return null;
    }
  }
  return true; // 접근 허용
}
```

> **기존 `Parent.children`은 ObjectId 배열**이므로 populate 후 `studentId` 필드로 매칭한다.
> 이 검증은 모든 `/api/edupoint/:studentId/*` 엔드포인트 진입부에서 호출한다.

### 3-1. 에듀 포인트 설정 API — 상세 명세

---

#### `GET /api/edupoint/:studentId`

해당 자녀의 포인트 설정 & 잔액 조회.

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` (학부모/학생 모두 가능) |
| 권한 검증 | `validateAccess` — 학생은 본인만, 학부모는 children에 포함된 자녀만 |
| 문서 미존재 시 | **기본값 객체 반환 (404 아님)** — `{ balance: 0, studentEarned: 0, settings: { targetRate: 70, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 }, initialized: false }` |
| `initialized` 플래그 | `false`면 학부모가 아직 설정을 저장하지 않은 상태. 프론트엔드에서 "포인트 시스템을 설정해주세요" 안내 표시에 사용 |
| 성공 응답 | `200 OK` + EduPoint 문서 (+ `initialized: true`) |

> **기본값 반환 이유:** 학생 StudentDashboard에서 세션 시작 시 targetRate를 로드하는데, 404 처리를 강제하면 학생 화면에 불필요한 에러 핸들링이 필요. 미설정 상태는 initialized 플래그로 구분.

---

#### `PUT /api/edupoint/:studentId/settings`

목표 집중률, 보상 포인트 설정 변경.

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` → `requireRole('parent')` |
| 권한 검증 | `validateAccess` — children에 포함된 자녀만 |
| upsert 여부 | **upsert: true** — 최초 호출 시 EduPoint 문서 생성 + settings 저장 |
| 요청 바디 | `{ targetRate, rewardPerSession, weeklyBonusCount, weeklyBonusReward }` |
| 유효성 검증 (Zod) | `targetRate: 50~95`, `rewardPerSession: 10~500`, `weeklyBonusCount: 1~7`, `weeklyBonusReward: 10~5000` |
| 실패 케이스 | 403 (자녀 미연결), 400 (유효성 실패) |
| 성공 응답 | `200 OK` + 갱신된 EduPoint 문서 |

```javascript
// 구현 핵심: findOneAndUpdate + upsert
await EduPoint.findOneAndUpdate(
  { parentId: req.user._id, studentId },
  { $set: { settings: validated } },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
```

---

#### `POST /api/edupoint/:studentId/charge`

포인트 충전 (시뮬레이션, 실결제 없음).

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` → `requireRole('parent')` |
| 권한 검증 | `validateAccess` — children에 포함된 자녀만 |
| 요청 바디 | `{ amount }` |
| 유효성 검증 | `amount: 1000 \| 5000 \| 10000` (허용된 충전 단위만) |
| EduPoint 미존재 시 | `400 { message: '먼저 포인트 설정을 완료해주세요.' }` — 충전 전에 settings가 있어야 함 |
| 처리 | `EduPoint.findOneAndUpdate({ $inc: { balance: +amount } })` + PointHistory 기록 |
| 성공 응답 | `200 OK` + `{ balance: 갱신된잔액, charged: amount }` |

---

#### `GET /api/edupoint/:studentId/history`

포인트 획득/충전 내역 조회.

| 항목 | 내용 |
|------|------|
| 미들웨어 | `requireAuth` (학부모/학생 모두 가능) |
| 권한 검증 | `validateAccess` — 학생은 본인만, 학부모는 children에 포함된 자녀만 |
| 쿼리 파라미터 | `?limit=20&offset=0&type=earn\|charge\|weekly_bonus` (선택) |
| 정렬 | `createdAt: -1` (최신순) |
| 성공 응답 | `200 OK` + `{ history: [...], total: N }` |

### 3-3. 포인트 지급 로직 (내부) — 중복 지급 방지 설계

#### 문제: 네트워크 재시도/중복 호출 시 포인트 이중 지급

현재 `endSession`은 `endTime`만 설정하며, 이미 종료된 세션의 재호출을 막지 않는다.
포인트 지급을 여기에 단순 추가하면, 재시도 한 번으로 포인트가 두 번 들어간다.

#### 해결: 3중 방어

**방어 1 — 세션 종료 idempotency (sessionController.js)**
```
endSession 진입 시:
  if (session.endTime !== null) → 이미 종료된 세션
    → 포인트 재지급 없이 기존 결과만 반환 (200 OK, 기존 데이터)
    → 클라이언트는 정상 응답으로 처리
```
현재 코드(line 66)는 endTime이 이미 있어도 덮어쓰므로, 이 가드를 반드시 추가한다.

**방어 2 — Session.pointAwarded 플래그 (원자적 처리)**
```javascript
// Session 모델에 추가
{
  pointAwarded: { type: Boolean, default: false }  // 포인트 지급 완료 여부
}
```
포인트 지급 시 findOneAndUpdate의 조건으로 사용:
```javascript
// 핵심: 조건부 업데이트로 원자적 처리
const updated = await Session.findOneAndUpdate(
  { _id: sessionId, pointAwarded: false },  // 미지급 상태인 세션만
  { pointAwarded: true, focusRate, pointEarned },
  { new: true }
);
if (!updated) return; // 이미 지급됨 → 아무것도 하지 않음
```
MongoDB의 findOneAndUpdate는 원자적이므로, 동시에 두 요청이 와도 하나만 성공한다.

**방어 3 — PointHistory 중복 체크 (최후 방어선)**
```
포인트 기록 직전:
  PointHistory.exists({ sessionId, type: "earn" }) → true면 지급 중단
```
앱 레벨의 빠른 실패(fast-fail) 역할. 불필요한 write 시도를 줄인다.

**방어 4 — DB 레벨 유니크 인덱스 (물리적 방어)**
```
PointHistorySchema.index(
  { sessionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } }
);
```
방어 3의 exists() 체크는 레이스 컨디션에서 두 요청이 동시에 "없음"을 확인하고 모두 insert할 수 있다.
유니크 인덱스는 MongoDB 엔진 레벨에서 중복을 물리적으로 차단하므로, 이 틈을 완전히 막는다.
charge는 sessionId가 null이므로 partialFilterExpression으로 제외한다.
지급 로직에서 duplicate key error(11000)를 catch하여 "이미 지급됨"으로 처리한다.

#### 전체 지급 흐름 — MongoDB 트랜잭션 적용

##### 문제: step 6~8이 분리된 연산일 때의 정합성 리스크

```
위험 시나리오:
  step 6: Session.pointAwarded = true  ← 성공
  step 7: EduPoint.balance 차감        ← 실패 (잔액 부족) 또는 서버 크래시
  롤백 코드: pointAwarded = false      ← 여기에 도달 못 하면?

결과: pointAwarded=true인데 포인트 미지급 → 해당 세션은 영구적으로 지급 불가
```

##### 해결: MongoDB 트랜잭션으로 step 6~8을 원자적 묶음 처리

MongoDB Atlas(프로젝트 배포 대상)는 replica set이므로 multi-document 트랜잭션을 지원한다.
Session 업데이트 + EduPoint 차감 + PointHistory 기록을 하나의 트랜잭션으로 묶어,
전부 성공(commit)하거나 전부 취소(abort)되도록 보장한다.

```javascript
// sessionController.js — 포인트 지급 핵심 로직
async function awardPoints(sessionId, focusRate, edupoint) {
  // 주의: mongoose.startSession()의 mongoSession과 학습 Session 모델 혼동 방지
  const mongoSession = await mongoose.startSession();
  try {
    let result = null;
    await mongoSession.withTransaction(async () => {
      // step 6: pointAwarded 플래그 선점 (중복 방어)
      const updated = await Session.findOneAndUpdate(
        { _id: sessionId, pointAwarded: false },
        { pointAwarded: true, focusRate, pointEarned: edupoint.settings.rewardPerSession },
        { new: true, session: mongoSession }
      );
      if (!updated) return; // 이미 지급됨 → 트랜잭션 내 변경 없음 → 자동 commit (no-op)

      // step 7: 잔액 차감 + 학생 누적 증가 (원자적)
      const charged = await EduPoint.findOneAndUpdate(
        { _id: edupoint._id, balance: { $gte: edupoint.settings.rewardPerSession } },
        { $inc: {
            balance: -edupoint.settings.rewardPerSession,
            studentEarned: +edupoint.settings.rewardPerSession
        }},
        { new: true, session: mongoSession }
      );
      if (!charged) {
        // 잔액 부족 → abort → step 6의 pointAwarded=true도 자동 롤백
        await mongoSession.abortTransaction();
        return;
      }

      // step 8: PointHistory 기록 (유니크 인덱스가 최후 방어)
      await PointHistory.create([{
        studentId: updated.studentId,
        parentId: edupoint.parentId,
        type: 'earn',
        amount: edupoint.settings.rewardPerSession,
        reason: '세션달성',
        sessionId,
        parentBalanceAfter: charged.balance,
        studentEarnedAfter: charged.studentEarned,
      }], { session: mongoSession });

      result = {
        pointEarned: edupoint.settings.rewardPerSession,
        studentEarned: charged.studentEarned,
        balance: charged.balance,
      };
    });
    return result; // null이면 미지급 (이미 지급됨 or 잔액 부족)
  } finally {
    await mongoSession.endSession();
  }
}
```

##### 트랜잭션이 보장하는 것

| 시나리오 | 트랜잭션 없이 (기존) | 트랜잭션 적용 후 |
|---------|-------------------|----------------|
| step 7 잔액 부족 | 롤백 코드에 의존 (도달 못 하면 불일치) | `abortTransaction()` → step 6도 자동 롤백 |
| step 7~8 사이 서버 크래시 | pointAwarded=true, 잔액 차감됨, 히스토리 없음 | MongoDB가 자동 abort → 3개 모두 롤백 |
| step 6~7 사이 서버 크래시 | pointAwarded=true, 잔액 미차감 | MongoDB가 자동 abort → pointAwarded도 롤백 |
| 동시 요청 2건 | findOneAndUpdate 원자성에만 의존 | 트랜잭션 + findOneAndUpdate 이중 보호 |

##### 전체 흐름 (트랜잭션 적용 최종)

```
세션 종료 시 (PUT /api/sessions/:id/end):

[트랜잭션 밖]
  1. session.endTime이 이미 있으면 → 기존 결과 반환, 종료
  2. endTime 설정
  3. focusRate 계산: 기존 calcAvgFocus 가중치 평균 (섹션 8 참조)
  4. EduPoint 설정 조회 → 없으면 포인트 시스템 비활성, 스킵
  5. focusRate >= targetRate → 미달이면 스킵 (pointEarned: 0)

[트랜잭션 안 — awardPoints()]
  6. Session.pointAwarded: false → true  (중복 방어)
  7. EduPoint.balance 차감 + studentEarned 증가  (잔액 검증)
  8. PointHistory 생성  (감사 로그 + 유니크 인덱스 방어)
  → 전부 성공: commit / 어느 하나 실패: 전부 rollback

[트랜잭션 밖]
  9. 주간 보너스 판정 (별도 트랜잭션 — 세션 보상 실패가 보너스를 막으면 안 됨)
  10. 응답에 pointEarned + studentEarned 포함
```

> **주간 보너스도 동일 패턴:** EduPoint 잔액 차감 + PointHistory 기록을 별도 트랜잭션으로 묶는다.
> 세션 보상 트랜잭션과 보너스 트랜잭션은 독립적으로 실행한다.

### 3-4. 주간 보너스 판정 — 정책 상세

#### 정책 결정 사항

| 정책 | 결정 | 근거 |
|------|------|------|
| **주 기준 시간대** | KST (Asia/Seoul) 고정, 월요일 00:00:00 ~ 일요일 23:59:59 | 사용자 전원이 국내 학생/학부모. 서버 TZ와 무관하게 KST 기준으로 계산해야 "월요일에 시작"이 사용자 체감과 일치 |
| **설정 변경 시 소급** | 소급 적용 안 함 | 주 중에 `weeklyBonusCount: 5 → 3`으로 낮추면 이미 3회 달성한 학생에게 즉시 보너스가 지급되는 문제. 변경된 설정은 **다음 주 월요일**부터 적용 |
| **소급 방지 구현** | EduPoint에 `settingsEffectiveFrom: Date` 필드 추가. PUT settings 시 다음 주 월요일로 설정. 보너스 판정 시 현재 주 시작일 >= settingsEffectiveFrom인 settings만 사용, 아니면 이전 settings 적용 | 단순 "다음 주부터"를 코드로 강제 |
| **주간 지급 횟수** | 주당 1회만 | 임계치를 넘긴 세션이 여러 개여도 보너스는 1회. PointHistory에 해당 주의 weekly_bonus 레코드 존재 여부로 판정 |
| **보너스 잔액 부족** | 보너스 미지급 + 학부모에게 알림 플래그 | 세션 보상과 동일하게 `balance >= weeklyBonusReward` 조건부 차감. 실패 시 PointHistory에 `{ type: "weekly_bonus_failed", reason: "잔액부족" }` 기록하여 학부모 대시보드에서 "잔액 부족으로 주간 보너스가 지급되지 않았습니다" 표시 |
| **달성 카운트 기준** | 해당 주(KST) 내 `Session.pointAwarded === true`인 세션 수 | pointAwarded가 true인 세션 = 목표 달성 + 포인트 실제 지급 완료. 잔액 부족으로 세션 포인트가 지급 안 된 경우는 카운트 안 됨 |

#### 소급 방지를 위한 모델 변경

```javascript
// EduPoint 모델에 추가
{
  settings: { /* 기존 필드 */ },
  settingsEffectiveFrom: Date,   // 현재 settings가 적용되기 시작하는 주의 월요일 00:00 KST
  previousSettings: {            // 이전 settings (현재 주에 아직 settingsEffectiveFrom 전이면 이쪽 사용)
    weeklyBonusCount: Number,
    weeklyBonusReward: Number
  }
}
```

PUT settings 시:
```javascript
const nextMonday = getNextMondayKST(); // 이번 주 월요일이 이미 지났으면 다음 주 월요일
await EduPoint.findOneAndUpdate(
  { parentId, studentId },
  {
    $set: {
      settings: newSettings,
      settingsEffectiveFrom: nextMonday,
      previousSettings: {
        weeklyBonusCount: currentDoc.settings.weeklyBonusCount,
        weeklyBonusReward: currentDoc.settings.weeklyBonusReward
      }
    }
  }
);
```

> **예외: 최초 설정(upsert)** 시에는 `settingsEffectiveFrom`을 현재 주 월요일로 설정하여 즉시 적용.

#### 판정 흐름

```
세션 종료 시 포인트 지급 완료 후 (전체 흐름 step 9):

1. 현재 KST 기준 주 범위 계산
   weekStart = 이번 주 월요일 00:00:00 KST
   weekEnd   = 다음 주 월요일 00:00:00 KST

2. 적용할 보너스 설정 결정
   if (edupoint.settingsEffectiveFrom <= weekStart)
     → 현재 settings 사용
   else
     → previousSettings 사용 (없으면 보너스 판정 스킵)

3. 이번 주 달성 횟수 집계
   count = Session.countDocuments({
     studentId,
     pointAwarded: true,
     endTime: { $gte: weekStart, $lt: weekEnd }
   })

4. count >= activeSettings.weeklyBonusCount 확인
   → 미달이면 종료

5. [중복 방지] PointHistory.exists({
     studentId,
     type: "weekly_bonus",
     createdAt: { $gte: weekStart, $lt: weekEnd }
   })
   → 이미 존재하면 종료 (같은 주 재지급 방지)

6. [원자적 잔액 차감]
   const result = await EduPoint.findOneAndUpdate(
     { _id: edupointId, balance: { $gte: activeSettings.weeklyBonusReward } },
     { $inc: { balance: -weeklyBonusReward, studentEarned: +weeklyBonusReward } },
     { new: true }
   )

7-A. result !== null → 성공
   PointHistory 기록: { type: "weekly_bonus", amount: weeklyBonusReward, ... }

7-B. result === null → 잔액 부족
   PointHistory 기록: { type: "weekly_bonus_failed", amount: 0, reason: "잔액부족" }
   → 학부모 대시보드에서 이 레코드를 감지하여 알림 표시
```

#### KST 주 범위 계산 유틸

```javascript
// backend/src/utils/weekUtils.js
function getWeekRangeKST(date = new Date()) {
  // UTC → KST (+9h) 기준으로 월요일 00:00 계산
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(date.getTime() + kstOffset);
  const day = kstNow.getUTCDay(); // 0=일, 1=월, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(kstNow);
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  // KST → UTC로 되돌려서 DB 쿼리에 사용
  const weekStart = new Date(monday.getTime() - kstOffset);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}
```

---

## 4. 프론트엔드 구현

### 4-1. 학부모 화면

#### (A) 포인트 설정 페이지 (신규: `ParentPointSettings.jsx`)
- 접근: ParentDashboard에서 "에듀 포인트 설정" 버튼
- UI 구성:
  - **목표 집중률**: 슬라이더 (50%~95%, 기본 70%)
  - **세션당 보상**: 숫자 입력 (10P~500P, 기본 100P)
  - **주간 보너스 조건**: 주 N회 달성 (1~7, 기본 5) + 보너스 포인트 (기본 500P)
  - **저장** 버튼
  - 저장 시 안내 문구: "변경된 주간 보너스 조건은 다음 주 월요일부터 적용됩니다"
- API: `PUT /api/edupoint/:studentId/settings`

#### (B) 포인트 충전 (시뮬레이션)
- 위치: 포인트 설정 페이지 또는 ParentDashboard 내
- UI: 충전 금액 선택 (1,000P / 5,000P / 10,000P) + "충전" 버튼
- 동작: 클릭 시 즉시 잔액 증가 (실결제 없음)
- API: `POST /api/edupoint/:studentId/charge`

#### (C) ParentDashboard 확장
- 기존 대시보드에 추가할 위젯:
  - **포인트 잔액 카드**: 현재 잔액 + 충전 버튼
  - **최근 포인트 내역**: 최근 5건 (세션달성/주간보너스/충전)
  - **주간 목표 달성 현황**: 이번 주 달성 횟수 / 목표 횟수 진행바

### 4-2. 학생 화면

#### (A) StudentDashboard 실시간 위젯 확장
- `StudentDashboard.jsx` 내 강의 수강 영역의 기존 집중도 위젯에 추가:
  - "목표: 80% / 현재: 73%" 텍스트 표시
  - "현재"는 세션 시작부터의 **누적 가중치 평균** (순간값 아님, 섹션 8 참조)
  - 목표 달성 시 색상 변경 (빨강 → 초록)
  - 계산은 프론트엔드에서 수행 (records 배열 이미 보유, calcAvgFocus 동일 로직)
- 데이터: 세션 시작 시 `GET /api/edupoint/:studentId`로 targetRate 로드

> **참고: LecturePage는 존재하지 않음.** 현재 프로젝트에는 별도 LecturePage가 없으며, 강의 목록 + 수강 + 실시간 집중도 표시를 모두 `StudentDashboard.jsx`가 담당한다. (`App.jsx` 라우트: `/student` → `StudentDashboard`)

#### (B) StudentDashboard 확장
- 추가 위젯:
  - **내 포인트**: 누적 포인트 표시
  - **최근 획득 내역**: 최근 3건
  - **주간 달성 현황**: 이번 주 달성 횟수 + 진행바

#### (C) 목표 달성 축하 모달
- 세션 종료 시 focusRate >= targetRate이면 축하 모달 표시
- 내용: "목표 달성! +100P 획득" + 간단한 애니메이션 (CSS)

---

## 5. 파일 구조 (신규/수정)

### 신규 파일
```
backend/
  src/models/EduPoint.js          # EduPoint 스키마
  src/models/PointHistory.js      # PointHistory 스키마
  src/routes/edupoint.js          # 에듀포인트 라우트
  src/controllers/edupointController.js  # 에듀포인트 컨트롤러
  src/utils/weekUtils.js          # KST 기준 주 범위 계산 유틸
  jest.config.js                  # Jest 설정
  src/tests/setup.js              # 공통 셋업 (MongoMemoryServer, 인증/데이터 헬퍼)
  src/tests/utils/weekUtils.test.js
  src/tests/edupoint/settings.test.js
  src/tests/edupoint/charge.test.js
  src/tests/edupoint/reward.test.js
  src/tests/edupoint/weeklyBonus.test.js
  src/tests/edupoint/authorization.test.js

frontend/
  src/pages/ParentPointSettings.jsx     # 학부모 포인트 설정 페이지
  src/pages/ParentPointSettings.css       # 포인트 설정 페이지 스타일
  src/components/point/PointBalance.jsx   # 포인트 잔액 카드
  src/components/point/PointBalance.css
  src/components/point/PointHistory.jsx   # 포인트 내역 리스트
  src/components/point/PointHistory.css
  src/components/point/WeeklyProgress.jsx # 주간 달성 진행바
  src/components/point/WeeklyProgress.css
  src/components/point/GoalAchievedModal.jsx # 목표 달성 축하 모달
  src/components/point/GoalAchievedModal.css
```

### 수정 파일
```
backend/
  src/index.js                    # edupoint 라우트 등록
  src/models/Session.js           # focusRate, pointEarned, pointAwarded 필드 추가
  src/controllers/sessionController.js  # 세션 종료 시 포인트 지급 로직

frontend/
  src/index.css                   # 포인트 전용 CSS 변수 추가 (--point-gold, --point-success, --point-danger)
  src/App.jsx                     # ParentPointSettings 라우트 추가
  src/pages/ParentDashboard.jsx   # 포인트 위젯 추가
  src/pages/StudentDashboard.jsx  # 포인트 위젯 + 목표 집중률 실시간 표시 (LecturePage는 존재하지 않음, 이 파일이 담당)
  src/pages/SessionReport.jsx     # 포인트 획득 결과 표시
  src/services/api.js             # edupoint API 함수 추가
```

---

## 6. 구현 순서

### Phase 1: 백엔드 (데이터 모델 + API)
1. `EduPoint`, `PointHistory` Mongoose 모델 생성
2. `Session` 모델에 `focusRate`, `pointEarned`, **`pointAwarded`** 필드 추가
3. `sessionController.js` — **endSession에 idempotency 가드 추가** (endTime 존재 시 조기 반환)
4. `edupointController.js` — 설정 CRUD, 충전, 내역 조회
5. `edupoint.js` 라우트 + `index.js`에 등록
6. `sessionController.js` — 세션 종료 시 포인트 지급 로직 통합 (3중 방어 적용)

### Phase 2: 프론트엔드 — 학부모 화면
6. `api.js`에 edupoint API 함수 추가
7. `ParentPointSettings.jsx` 페이지 구현 (설정 + 충전)
8. `ParentDashboard.jsx`에 포인트 위젯 추가
9. `App.jsx`에 라우트 추가

### Phase 3: 프론트엔드 — 학생 화면
10. `StudentDashboard.jsx`에 포인트 위젯 추가
11. `StudentDashboard.jsx`에 목표 집중률 실시간 표시
12. `SessionReport.jsx`에 포인트 획득 결과 표시
13. `GoalAchievedModal.jsx` 축하 모달 구현

### Phase 4: 테스트 (아래 섹션 7 상세 참조)
14. 테스트 인프라 구축 (Jest + supertest + MongoDB Memory Server)
15. 유틸 단위 테스트 (weekUtils, calcAvgFocus)
16. API 통합 테스트 (권한, 설정 CRUD, 충전, 포인트 지급)
17. 시나리오 테스트 (중복 지급, 잔액 경계, 주간 보너스, 다자녀)

---

## 7. 테스트 계획

### 7-0. 테스트 인프라 (현재 없음 → 신규 구축)

현재 프로젝트에는 테스트 파일, 테스트 라이브러리가 없다. 에듀포인트는 금전적 가치가 있는 포인트를 다루므로 테스트 없이 배포하면 안 된다.

```
신규 의존성:
  devDependencies:
    jest
    supertest              # HTTP 엔드포인트 테스트
    mongodb-memory-server  # 테스트용 인메모리 MongoDB (실 DB 오염 방지)

설정 파일:
  backend/jest.config.js
  backend/src/tests/setup.js   # MongoDB Memory Server 시작/종료, 컬렉션 초기화

테스트 파일 구조:
  backend/src/tests/
    setup.js                         # 공통 셋업 (DB 연결, 인증 헬퍼)
    utils/weekUtils.test.js          # 유틸 단위 테스트
    edupoint/settings.test.js        # 설정 API 테스트
    edupoint/charge.test.js          # 충전 API 테스트
    edupoint/reward.test.js          # 포인트 지급 테스트
    edupoint/weeklyBonus.test.js     # 주간 보너스 테스트
    edupoint/authorization.test.js   # 권한 테스트
```

### 7-1. 유틸 단위 테스트

#### weekUtils.test.js — KST 주 범위 계산

| 테스트 케이스 | 입력 | 기대 결과 |
|-------------|------|----------|
| 월요일 오전 (KST) | `2026-04-13 09:00 KST` | weekStart = 4/13 월 00:00 KST, weekEnd = 4/20 월 00:00 KST |
| 일요일 심야 (KST) | `2026-04-19 23:59 KST` | weekStart = 4/13 월 00:00 KST (같은 주) |
| **경계: 월요일 00:00 정각** | `2026-04-13 00:00:00 KST` | weekStart = 4/13 (이번 주에 포함) |
| **경계: 일요일→월요일 넘어가는 순간** | `2026-04-19 23:59:59 KST` → `2026-04-20 00:00:00 KST` | 전자는 4/13주, 후자는 4/20주 |
| UTC 자정 ≠ KST 자정 | `2026-04-13 00:00 UTC` (= 4/13 09:00 KST) | KST 기준으로 4/13 주 |
| UTC 일요일 15:00 = KST 월요일 00:00 | `2026-04-12 15:00 UTC` (= 4/13 00:00 KST) | 새 주 시작 |

#### calcAvgFocus 연동 확인

| 테스트 케이스 | 입력 | 기대 결과 |
|-------------|------|----------|
| 전부 status 1 | records 10개, 모두 status 1 | 95 |
| 전부 status 3 | records 10개, 모두 status 3 | 55 |
| 빈 배열 | [] | 0 |
| 혼합 | status 1×5, status 5×5 | (95×5 + 15×5) / 10 = 55 |

### 7-2. 권한 테스트 — authorization.test.js

#### 학생 접근 제어

| 테스트 케이스 | 요청 | 기대 |
|-------------|------|------|
| 자기 포인트 조회 | `GET /api/edupoint/STU001` (본인) | 200 |
| 타인 포인트 조회 | `GET /api/edupoint/STU002` (타인) | 403 "본인의 포인트만 조회할 수 있습니다" |
| 학생이 설정 변경 시도 | `PUT /api/edupoint/STU001/settings` | 403 "parent 계정만 접근" |
| 학생이 충전 시도 | `POST /api/edupoint/STU001/charge` | 403 "parent 계정만 접근" |

#### 학부모 접근 제어

| 테스트 케이스 | 요청 | 기대 |
|-------------|------|------|
| 연결된 자녀 조회 | `GET /api/edupoint/STU001` (children에 포함) | 200 |
| 미연결 자녀 조회 | `GET /api/edupoint/STU999` (children에 미포함) | 403 "연결되지 않은 자녀" |
| 미연결 자녀 설정 변경 | `PUT /api/edupoint/STU999/settings` | 403 |
| 미연결 자녀 충전 | `POST /api/edupoint/STU999/charge` | 403 |

#### 인증 없음

| 테스트 케이스 | 요청 | 기대 |
|-------------|------|------|
| 토큰 없이 접근 | `GET /api/edupoint/STU001` (Authorization 헤더 없음) | 401 |
| 만료된 토큰 | 유효기간 지난 JWT | 401 |

### 7-3. 설정 API 테스트 — settings.test.js

| 테스트 케이스 | 동작 | 기대 |
|-------------|------|------|
| 최초 GET (문서 미존재) | `GET /api/edupoint/STU001` | 200, `initialized: false`, 기본값 반환 |
| 최초 PUT (upsert) | `PUT settings { targetRate: 80, ... }` | 200, 문서 생성, `settingsEffectiveFrom` = 현재 주 월요일 |
| PUT 후 GET | `GET /api/edupoint/STU001` | 200, `initialized: true`, 설정된 값 반환 |
| 유효성 실패: targetRate 범위 | `PUT settings { targetRate: 99 }` | 400 |
| 유효성 실패: targetRate 범위 하한 | `PUT settings { targetRate: 30 }` | 400 |
| 유효성 실패: rewardPerSession 범위 | `PUT settings { rewardPerSession: 0 }` | 400 |
| **설정 변경 시 소급 방지** | 주 중에 weeklyBonusCount: 5→3 변경 | `settingsEffectiveFrom` = 다음 주 월요일, `previousSettings`에 이전 값 보존 |

### 7-4. 충전 테스트 — charge.test.js

| 테스트 케이스 | 동작 | 기대 |
|-------------|------|------|
| 정상 충전 | `POST charge { amount: 5000 }` | 200, balance += 5000, PointHistory type:"charge" 생성 |
| 허용되지 않은 금액 | `POST charge { amount: 3000 }` | 400 |
| 설정 미완료 상태에서 충전 | EduPoint 문서 없이 charge | 400 "먼저 포인트 설정을 완료해주세요" |
| 연속 충전 | 5000 → 5000 두 번 | balance = 10000, PointHistory 2건 |

### 7-5. 포인트 지급 테스트 — reward.test.js

#### 정상 흐름

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 목표 달성 → 지급 | targetRate: 70, 세션 focusRate: 75 | pointEarned = rewardPerSession, studentEarned 증가, balance 감소 |
| 목표 미달 → 미지급 | targetRate: 70, 세션 focusRate: 65 | pointEarned = 0, balance 변동 없음 |
| EduPoint 미설정 → 스킵 | EduPoint 문서 없이 세션 종료 | 포인트 로직 스킵, 세션 정상 종료 |

#### 중복 지급 방어 (3중 방어 각각 검증)

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| **방어1: 이미 종료된 세션 재호출** | endTime이 이미 있는 세션에 `PUT /:id/end` | 200, 기존 결과 반환, pointEarned/balance 변동 없음 |
| **방어2: pointAwarded 플래그** | pointAwarded=true인 세션 강제 지급 시도 | findOneAndUpdate null 반환, 지급 스킵 |
| **방어3: PointHistory 중복** | 동일 sessionId + type:"earn" 레코드 존재 시 | 지급 중단 |
| **동시 호출 시뮬레이션** | 같은 세션에 대해 endSession 2회 동시 호출 (Promise.all) | 1회만 지급, 다른 1회는 기존 결과 반환 |

#### 잔액 경계값

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 잔액 = 보상액 정확히 일치 | balance: 100, rewardPerSession: 100 | 지급 성공, balance = 0 |
| 잔액 < 보상액 (1 부족) | balance: 99, rewardPerSession: 100 | 트랜잭션 abort → pointAwarded=false 유지, balance=99 유지 |
| 잔액 = 0 | balance: 0 | 트랜잭션 abort → 동일 |
| 잔액 부족 후 충전 → 다음 세션 | balance 0 → 충전 5000 → 새 세션 종료 | 새 세션에서 정상 지급 |

#### 트랜잭션 정합성

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 잔액 부족 시 전체 롤백 | balance: 50, reward: 100 | Session.pointAwarded=false, EduPoint 변동 없음, PointHistory 생성 안 됨 |
| 유니크 인덱스 방어 | 수동으로 동일 sessionId+earn PointHistory 삽입 후 지급 시도 | duplicate key error → 트랜잭션 abort → Session/EduPoint 롤백 |
| 세션 보상 실패해도 보너스 판정은 독립 | 세션 보상 잔액 부족이지만 이전 달성 횟수로 보너스 조건 충족 | 세션 보상: 미지급, 보너스: 별도 트랜잭션으로 판정 (잔액 있으면 지급) |

### 7-6. 주간 보너스 테스트 — weeklyBonus.test.js

#### 정상 흐름

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 5회 달성 → 보너스 지급 | weeklyBonusCount: 5, 이번 주 5번째 세션 달성 | weeklyBonusReward 지급, PointHistory type:"weekly_bonus" |
| 4회 달성 → 보너스 미지급 | 이번 주 4번째 세션 달성 | 보너스 없음 |

#### 중복/경계

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| **같은 주 6회 달성** | 5회에서 보너스 지급 후 6회째 달성 | 추가 보너스 없음 (주당 1회) |
| **주 경계: 일→월 넘어갈 때** | 일요일 23:59 KST에 4회째 달성, 월요일 00:01 KST에 1회째 달성 | 각각 다른 주로 카운트 |
| **보너스 잔액 부족** | 세션 보상은 지급됐으나 보너스 지급 시 잔액 부족 | `weekly_bonus_failed` 기록, 세션 보상은 유지 |

#### 설정 변경 소급 방지

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 주 중 조건 완화 | 월~수 3회 달성, 수요일에 weeklyBonusCount 5→3 변경 | 이번 주는 previousSettings(5) 적용 → 보너스 미지급 |
| 다음 주 적용 확인 | 위 시나리오 후 다음 주 3회 달성 | 새 settings(3) 적용 → 보너스 지급 |
| 최초 설정은 즉시 적용 | 수요일에 처음 설정 (upsert) | settingsEffectiveFrom = 이번 주 월요일 → 즉시 적용 |

### 7-7. 다자녀 시나리오

| 테스트 케이스 | 시나리오 | 기대 |
|-------------|---------|------|
| 자녀별 독립 잔액 | 부모 1명 + 자녀 A, B. A에게 5000 충전 | A의 balance: 5000, B의 balance: 0 |
| 자녀별 독립 설정 | A는 targetRate 70, B는 targetRate 80 | 각각 다른 기준 적용 |
| 자녀별 독립 보너스 | A가 주간 보너스 달성 | B의 보너스 상태에 영향 없음 |
| A 잔액 부족이 B에 영향 없음 | A 잔액 0 → A 세션 미지급 | B는 별도 EduPoint 문서이므로 무관 |

### 7-8. 테스트 헬퍼 (setup.js)

```javascript
// 테스트 공통 셋업
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  // Express app 초기화 (DB 연결 포함)
});

afterEach(async () => {
  // 컬렉션 초기화 (테스트 간 격리)
  const collections = mongoose.connection.collections;
  for (const col of Object.values(collections)) {
    await col.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// 인증 헬퍼: 테스트용 JWT 생성
function getStudentToken(studentId = 'STU001') { ... }
function getParentToken(parentId, childrenIds = ['STU001']) { ... }

// 데이터 헬퍼: 테스트용 시드 데이터 생성
async function createTestStudent(studentId = 'STU001') { ... }
async function createTestParentWithChild(studentId = 'STU001') { ... }
async function createTestEduPoint(parentId, studentId, overrides = {}) { ... }
async function createTestSession(studentId, lectureId, records = []) { ... }
```

---

## 8. 핵심 비즈니스 규칙

| 규칙 | 설명 |
|------|------|
| 세션 종료 idempotency | endTime이 이미 존재하면 재지급 없이 기존 결과 반환 |
| 세션당 중복 지급 방지 | `Session.pointAwarded` 플래그 + findOneAndUpdate 원자적 처리 |
| PointHistory 최후 방어 | 동일 sessionId + type:"earn" 레코드 존재 시 지급 중단 |
| 잔액 부족 시 | `balance >= reward` 조건부 차감, 실패 시 pointAwarded 롤백 |
| 주간 보너스 중복 방지 | 같은 주(KST 월~일)에 weekly_bonus PointHistory 존재 시 스킵, 주당 1회만 |
| 주간 보너스 시간대 | KST (Asia/Seoul) 고정, 월 00:00 ~ 일 23:59:59 |
| 주간 보너스 설정 변경 | 소급 안 함 — 변경된 조건은 다음 주 월요일부터 적용 (`settingsEffectiveFrom`) |
| 주간 보너스 잔액 부족 | 미지급 + `weekly_bonus_failed` 기록 → 학부모 대시보드에 알림 |
| 집중률 계산 | 기존 `calcAvgFocus` 가중치 평균과 동일 (아래 "집중률 정의" 참조) |
| 설정 미생성 시 | 학부모가 설정을 만들기 전까지 포인트 시스템 비활성 |
| 포인트 이동 | `EduPoint.balance`(학부모 예산)에서 차감 + `EduPoint.studentEarned`(학생 누적)에 증가, 단일 findOneAndUpdate로 원자적 처리 |
| 학생 누적 표시 | UI의 "내 포인트"는 `EduPoint.studentEarned`를 source of truth로 사용 (PointHistory 집계 아님) |

---

## 8. 집중률 정의 — 기존 시스템과의 통일

### 문제

계획서 초안은 집중률을 `(status 1,2 수) / 전체 수`(이진 비율)로 정의했으나,
기존 시스템은 `calcAvgFocus`(가중치 평균)를 사용한다. 두 방식은 같은 데이터에서 완전히 다른 값을 산출한다.

```
예시: 10개 레코드, 전부 status 3 (비집중+차분)
  이진 비율: 0%   (status 1,2가 없으므로)
  가중치 평균: 55% (STATUS_TO_FOCUS[3] = 55)

→ 학부모가 목표를 50%로 설정하면:
  이진 비율 → 미달성 (0% < 50%), 가중치 평균 → 달성 (55% >= 50%)
```

### 결정: 가중치 평균 사용 (기존 calcAvgFocus 재사용)

```javascript
// sessionController.js에 이미 존재하는 로직
const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };

function calcAvgFocus(records) {
  if (!records || records.length === 0) return 0;
  return Math.round(
    records.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / records.length
  );
}
```

**근거:**
- 리포트, 코칭 팁, RAG 분석이 모두 이 값을 사용 중 → 포인트 시스템만 다른 기준이면 학생/학부모 혼란
- 학부모 설정의 targetRate 슬라이더도 이 스케일 위에서 작동해야 일관적
- `Session.focusRate` 필드에 저장할 값도 이 함수의 반환값

### 실시간 목표 진행률 정의

StudentDashboard에서 "목표: 80% / 현재: 73%"를 표시할 때의 "현재" 값 정의:

| 항목 | 정의 |
|------|------|
| 표시 값 | 세션 시작부터 현재까지 **누적된 전체 레코드**의 가중치 평균 |
| 계산 위치 | 프론트엔드 (records 배열을 이미 보유) |
| 갱신 주기 | AI 분류 결과가 추가될 때마다 (3초 간격) |
| 순간값 아님 | 최근 1건의 status가 아니라, 세션 전체 누적 평균 |

```
현재 집중률 = calcAvgFocus(현재까지의 모든 records)
```

**근거:**
- 순간값(최근 1건)은 3초마다 급변하여 목표 달성 여부가 불안정하게 깜빡임
- 누적 평균은 시간이 지날수록 안정적이며, 세션 종료 시 저장되는 `focusRate`와 동일한 값으로 수렴
- 학생이 "지금 이 페이스면 달성할 수 있겠다"를 판단하기에 적합

---

## 9. UI 디자인 가이드 — 기존 스타일링 구조 준수

### 현재 프론트엔드 스타일링 구조

프로젝트는 **커스텀 CSS 파일 + CSS 변수 기반**이 주력이다. Tailwind는 index.css에 디렉티브가 있고 일부 유틸리티 클래스가 보조적으로 쓰이지만, 페이지/컴포넌트의 레이아웃과 핵심 스타일은 전부 커스텀 CSS로 작성되어 있다.

```
스타일링 구조:
  index.css          → CSS 변수 정의 (다크/라이트 테마), .glass, .container 등 공통 클래스
  pages/*.css        → 페이지별 전용 스타일 (ParentDashboard.css, StudentDashboard.css 등)
  components/*.css   → 컴포넌트별 전용 스타일

클래스 네이밍: 커스텀 BEM-like (예: .summary-card, .lecture-card, .dashboard-grid)
레이아웃: CSS Grid / Flexbox (Tailwind grid 아님)
테마: CSS 변수로 전환 ([data-theme="dark"] / [data-theme="light"])
```

### 에듀포인트에서 따를 규칙

| 항목 | 규칙 |
|------|------|
| **스타일 파일** | `pages/ParentPointSettings.css` 신규 생성, 포인트 컴포넌트는 `components/point/*.css` |
| **클래스 네이밍** | 기존 패턴 따르기: `.point-balance-card`, `.point-history-list`, `.weekly-progress-bar` |
| **색상** | 기존 CSS 변수 사용 (`var(--primary)`, `var(--text-muted)`, `var(--card-bg)`) |
| **포인트 전용 색상** | CSS 변수로 추가 정의 (index.css에): `--point-gold: #f59e0b`, `--point-success: #22c55e`, `--point-danger: #ef4444` |
| **카드** | 기존 `.glass` 클래스 + `.summary-card` 패턴 재사용 (배경: `var(--card-bg)`, 테두리: `var(--card-border)`, border-radius: 12px) |
| **다크/라이트 대응** | 새 색상 변수도 `[data-theme="dark"]` / `[data-theme="light"]` 양쪽에 정의 |
| **Tailwind 사용** | 보조적 유틸리티(간격, 텍스트 크기 등)에만 허용, 레이아웃/핵심 스타일은 커스텀 CSS |
| **아이콘** | lucide-react (`Coins`, `Target`, `Trophy`, `TrendingUp`) — 기존 프로젝트에서 사용 중 |

### 신규 CSS 파일 목록 (파일 구조 섹션에도 추가)

```
frontend/
  src/pages/ParentPointSettings.css      # 포인트 설정 페이지
  src/components/point/PointBalance.css   # 잔액 카드
  src/components/point/PointHistory.css   # 내역 리스트
  src/components/point/WeeklyProgress.css # 주간 진행바
  src/components/point/GoalAchievedModal.css # 축하 모달
```

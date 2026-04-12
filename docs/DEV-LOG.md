# EduWatch 개발 작업 내역

> 최종 수정: 2026-04-12 | 공모전 마감: 2026-04-13

---

> **[이번 세션 수정 요약]**
> - fix/report-improvements 브랜치 병합 (AI 추론 개선 + focusProb 방식 도입)
> - 에듀포인트 설정 진입 버튼 추가 (ParentDashboard 헤더 상시 노출)
> - 에듀포인트 위젯 표시 조건 수정 (API 오류·미초기화 시 설정 유도 화면 보장)
> - 세션 리포트 집중률 불일치 수정 (focusRate DB값 우선 사용)
> - 포인트 달성 표시 불일치 수정: 목표 달성 + 잔액 부족 시 "미달성" 오표시 → "목표 달성 (잔액 부족)"으로 수정

---

## 작업 내역 (날짜순)

### 2026-04-12 (1) | fix/report-improvements 병합 + 에듀포인트 버그 수정

#### fix/report-improvements 브랜치 병합 (`feat/khh` ← `origin/fix/report-improvements`)

| 파일 | 변경 내용 |
|------|---------|
| `backend/src/utils/claudeService.js` → `aiService.js` | 파일명 rename |
| `backend/src/utils/constants.js` | `STATUS_TO_FOCUS`, `calcFocus` 상수 통합 신규 추가 |
| `frontend/src/hooks/useAttentionAnalysis.js` | AI 추론 간격 1초, 서버 전송 3초 배치화, `focusProb` 확률 합산 방식 도입 |
| `backend/src/controllers/sessionController.js` | `calcFocus(status, confidence, focusProb)` — focusProb 우선 사용 |
| `docs/PLAN-QUIZ.md`, `PLAN-EDUPOINT.md` | 기능 계획 문서 추가 |

---

#### 에듀포인트 설정 진입 버튼 추가 (`frontend/src/pages/ParentDashboard.jsx`)

**문제**: "포인트 설정하기" 링크가 에듀포인트 위젯 내부에만 존재 → 자녀 미연결 또는 다자녀 전체 보기 상태에서 위젯이 숨겨져 진입 불가.

**수정**: 헤더 우측에 항상 노출되는 버튼 추가.

```jsx
<button className="point-nav-btn" onClick={() => navigate('/parent/point-settings')}>
  🪙 에듀 포인트 설정
</button>
```

- `useNavigate` 임포트 추가
- `.point-nav-btn` CSS — outline 스타일, hover 시 primary 색상 채움

---

#### 에듀포인트 위젯 표시 조건 수정 (`frontend/src/pages/ParentDashboard.jsx`)

**문제**: `edupointAPI.get()` 실패(API 오류·403) 시 catch에서 `setEdupoint(null)` → `if (!edupoint) return null`로 위젯 전체 숨김, 설정 유도 화면도 사라짐.

```js
// 수정 전
if (!edupoint) return null;          // API 오류 시 위젯 통째로 숨김
if (!edupoint.initialized) { ... }  // 설정 유도 화면

// 수정 후
if (!edupoint || !edupoint.initialized) { ... }  // null 포함해서 설정 유도 화면 표시
```

백엔드는 미초기화 학생에 대해 404가 아닌 `{ initialized: false }` 200 응답을 반환하므로, API 오류(500/403) 케이스만 null로 떨어짐. 수정 후 두 경우 모두 "포인트 설정하기 →" 안내 표시.

---

#### 세션 리포트 집중률 불일치 수정 (`backend/src/controllers/sessionController.js`)

**문제**: `getReport`가 `avgFocus = calcAvgFocus(session.records)`로 재계산 → 세션 종료 직후 늦게 도착한 레코드가 포함되면 `endSession`에서 에듀포인트 비교에 쓴 `focusRate`와 불일치. 화면에 표시된 집중률과 포인트 달성 판단 기준이 달라 보이는 문제.

```js
// 수정 전
const avgFocus = calcAvgFocus(session.records);  // 매번 재계산

// 수정 후
// endSession 저장값 우선, 미종료·구버전 데이터는 재계산 폴백
const avgFocus = session.focusRate ?? calcAvgFocus(session.records);
```

`session.focusRate`는 `endSession` 시점에 DB에 저장되며, 에듀포인트 `targetRate` 비교에 쓰인 값과 동일 → 화면 표시와 포인트 판단이 일치.

---

### 2026-04-12 (2) | 포인트 달성 표시 불일치 수정

#### 문제

세션 진행 중 "달성!" 표시 → 리포트에서 "미달성 (0P)" 표시. 두 조건이 달랐음.

| 위치 | 조건 |
|------|------|
| `StudentDashboard` 사이드바 | `cumulativeFocus >= targetRate` (프론트엔드 실시간 누적) |
| `SessionReport` 에듀포인트 결과 | `(sessionDetail.pointEarned ?? 0) > 0` (DB 저장값) |

학부모가 포인트를 충전하지 않은 경우(`balance = 0`), `awardPoints()` 내부 트랜잭션이 `InsufficientBalanceError`로 abort → 세션 DB의 `pointEarned` 가 `null` 그대로 → `(null ?? 0) > 0 = false` → "미달성 (0P)" 오표시.

#### 수정 1 — `backend/src/controllers/sessionController.js`

`focusRate >= targetRate` 이지만 잔액 부족(`awardPoints` null 반환) 시 `pointEarned: 0` 명시 저장.

```js
if (edupoint && focusRate >= edupoint.settings.targetRate) {
  pointResult = await awardPoints(session._id, focusRate, edupoint);
  if (!pointResult) {
    // 목표 달성했으나 학부모 잔액 부족 — pointEarned: 0으로 기록 (null과 구분)
    await Session.updateOne({ _id: session._id }, { pointEarned: 0 });
  }
} else if (edupoint) {
  await Session.updateOne({ _id: session._id }, { pointEarned: 0 });
}
```

#### 수정 2 — `frontend/src/pages/SessionReport.jsx`

`report.avgFocus >= edupoint.settings.targetRate` 로 목표 달성 여부를 직접 판단해 3가지 상태 표시.

```
goalAchieved + pointsEarned > 0  →  "✓ +NP 획득!"
goalAchieved + pointsEarned = 0  →  "✓ 목표 달성! (학부모 포인트 잔액 부족)"
!goalAchieved                    →  "✗ 미달성 (0P)"
```

`pointEarned` 필드(포인트 지급 성공 여부)와 `goalAchieved`(집중률 목표 충족 여부)를 분리해 표시.

---

### 2026-04-11 (1) | 시연용 영상 교체 + 세션 자동 종료 로직

#### develop 브랜치 병합 (`feat/khh` ← `origin/develop`)

| 파일 | 변경 내용 |
|------|---------|
| `frontend/src/api/client.js` | `BASE_URL` 환경변수 분기 (배포 대응) |
| `frontend/src/contexts/AuthContext.jsx` | `BASE_URL` 사용으로 Render 백엔드 API 라우팅 |
| `frontend/src/services/api.js` | `BASE_URL` 환경변수 분기 |
| `frontend/vercel.json` | SPA 라우팅 설정 추가 (새로고침 404 방지) |

---

#### 시연용 영상 3편으로 강의 목록 교체

EBS 강의 영상 → 사물궁이 잡학지식 채널 영상으로 전체 교체. 분석 문서는 `docs/DEMO-VIDEO-ANALYSIS*.md` 참고.

| 강의 ID | 제목 | YouTube ID | 길이 | SRT 항목 수 |
|---------|------|-----------|------|------------|
| lec-001 | 왜 조선시대 배경의 무협 소설은 없을까? | `E1gAsvazXZo` | 04:49 | 125개 |
| lec-002 | 인간은 다시 젊어질 수 있을까? | `MTg2HYj-88c` | 05:42 | 146개 |
| lec-003 | 유리는 왜 투명하고 잘 깨질까? | `CkqxHhdmlZk` | 08:02 | 200개 |

**수정 파일:**
- `backend/data/lectures.json` — 강의 정보 교체
- `frontend/src/data/lectures.json` — 강의 정보 + duration/durationSec 교체
- `backend/data/subtitles/lec-001.srt` — 조선무협.srt 복사
- `backend/data/subtitles/lec-002.srt` — 인간젊어지기.srt 복사
- `backend/data/subtitles/lec-003.srt` — 유리투명.srt 복사
- `backend/data/subtitles/조선무협.srt` — 원본 자막 추가
- `backend/data/subtitles/인간젊어지기.srt` — 원본 자막 추가
- `backend/data/subtitles/유리투명.srt` — 원본 자막 추가

> **적용 방법**: MongoDB 사용 시 `cd backend && node scripts/seedLectures.js` 재실행 필요.

---

#### 세션 자동 종료 로직 (`frontend/src/pages/StudentDashboard.jsx`)

**기존**: 수동 "세션 종료 · 리포트 확인 →" 버튼으로만 종료

**변경**: 버튼 제거, 아래 조건에 따라 자동 종료

| 종료 트리거 | 1분 미만 시청 | 1분 이상 시청 |
|-----------|------------|------------|
| YouTube 영상 재생 완료 | 강의 목록으로 이동 | 리포트 자동 생성 |
| 다른 강의 카드 선택 | 강의 목록으로 이동 | 리포트 자동 생성 |

**구현 상세:**

`sessionStartedRef`, `handleEndSessionRef` 추가 — YouTube `onStateChange` 콜백(클로저 환경)에서 최신 state 참조를 위한 ref 동기화 패턴 사용.

```js
// YouTube 플레이어 onStateChange
onStateChange: (e) => {
  if (e.data === window.YT.PlayerState.ENDED && sessionStartedRef.current) {
    handleEndSessionRef.current?.(); // ?.() — ref null 안전성
  }
}

// 세션 종료 처리
const handleEndSession = async (force = false) => {
  if (isEndingRef.current) return; // 중복 호출 가드
  isEndingRef.current = true;

  // YouTube 실제 재생 위치 기준 (seek 방지로 재생 위치 ≈ 실제 시청량)
  // 플레이어 미준비 시 elapsedRef(세션 경과 시간)으로 폴백
  const watched = playerRef.current?.getCurrentTime?.() ?? elapsedRef.current;

  try {
    if (sid) await sessionAPI.end(sid);
    if (sid && (watched >= MIN_SESSION_SEC || force)) {
      navigate(`/student/report/${sid}`);
    } else {
      navigate('/student');
    }
  } catch (_) {
    navigate('/student');
  } finally {
    isEndingRef.current = false; // 모든 경로에서 반드시 리셋
  }
};
```

`handleLectureSelect` — 세션 진행 중 강의 변경 시 `handleEndSession()` 자동 호출 후 전환.

1분 이상 시청 시 하단 컨트롤 바에 `"영상이 끝나면 리포트가 자동 생성됩니다"` 안내 문구 표시.

**`isEndingRef` 도입 배경:**
`handleEndSessionRef.current = null`로 중복을 막으려 했으나, 렌더마다 line 351에서 ref를 재등록하므로 비동기 처리 중 재발화 시 null이 덮어써져 두 번째 호출이 가능했음. `isEndingRef`는 렌더와 무관하게 유지되므로 안전.

---

#### seek 방지 오탐 수정 (`frontend/src/pages/StudentDashboard.jsx`)

**기존 문제:** 1초 인터벌에서 `getCurrentTime()` 차이가 2초 초과이면 seek로 판단. 브라우저 타이머 지연(탭 전환, CPU 부하, 모바일)으로 정상 재생도 오탐 가능.

```
정상 재생 중 타이머 1.1초 지연:
  재생 차이 = 1(재생) + 1.1(지연) = 2.1초 > 고정 임계값 2초 → 오탐 강제 복귀
```

**수정:** `lastCheckTimeRef`로 실제 인터벌 경과 시간을 측정하여 임계값을 동적 산출.

```js
const now = Date.now();
const realElapsed = (now - lastCheckTimeRef.current) / 1000;
lastCheckTimeRef.current = now;

// 동적 임계값: 실경과 시간 + 여유 1.5초
if (t - lastValidTimeRef.current > realElapsed + 1.5) {
  playerRef.current.seekTo(lastValidTimeRef.current, true); // seek 감지
}
```

```
타이머 1.1초 지연, 정상 재생: realElapsed=2.1 → 임계값 3.6초 → 차이 2.1초 < 3.6초 → 오탐 없음 ✓
타이머 정상, 5초 seek:        realElapsed=1.0 → 임계값 2.5초 → 차이 5.0초 > 2.5초 → 감지 ✓
```

---

## 프로젝트 현황 요약

| 항목 | 상태 |
|------|------|
| 프론트엔드 UI | ✅ 완료 (6페이지 + 공통 컴포넌트) |
| YouTube 강의 영상 연동 | ✅ 완료 (EBS 3개) |
| 백엔드 세션 API | ✅ 완료 (CRUD + 기록/이탈/종료) |
| Claude API 자막 분석 | ✅ 완료 |
| Claude RAG 맞춤형 리포트 | ✅ 완료 |
| 프론트-백엔드 실데이터 연결 | ✅ 완료 |
| JWT 인증 시스템 (로그인/회원가입) | ✅ 완료 |
| 회원 정보 수정 (초대코드/이름/비밀번호) | ✅ 완료 |
| Student/Parent 분리 모델 + 다자녀 지원 | ✅ 완료 |
| 초대 코드 연결 버그 수정 (4건) | ✅ 완료 |
| 학부모 대시보드 자녀 선택 필터 | ✅ 완료 |
| TF.js 웹캠 연동 | ✅ 완료 (인터벌 중복 버그 수정 포함) |
| 배포 (Vercel + Render) | ❌ 미구현 |

---

### 2026-04-10 (7) | develop 브랜치 병합 + 버그 수정 (P1 3건 + 시드 타임스탬프)

#### develop 브랜치 병합 — Student/Parent 분리 모델 충돌 해결

`feat/khh` ← `develop` 머지. 충돌 파일 3개 수동 해결:

| 파일 | 해결 방향 |
|------|-----------|
| `backend/src/controllers/authController.js` | develop의 Student/Parent 구조 채택 + HEAD의 기능(`getChild`, `getParent`, `unlink`, `updateProfile`, lazy inviteCode) 적응 |
| `backend/src/scripts/seed.js` | develop 버전(Student/Parent 모델 기반)으로 교체 |
| `frontend/src/pages/ParentDashboard.jsx` | HEAD 버전(`childStudentIds`, `authAPI.getChild()`, `childNames`) 유지 |

`backend/src/models/User.js` — develop에서 삭제됨, HEAD에서 `git rm`으로 제거.

---

#### 랜딩 페이지 버튼 라우팅 연결 (`frontend/src/pages/Landing.jsx`)

`useNavigate` 추가, 5개 버튼에 경로 연결:

| 버튼 | 경로 |
|------|------|
| Login (헤더) | `/login` |
| Sign Up (헤더) | `/register` |
| 지금 시작하기 | `/login` |
| 학생 모드 탐색 | `/login` |
| 학부모 모드 탐색 | `/login` |

`Register.jsx` — `useLocation`으로 `state.role` 수신, 초기 역할 자동 선택 지원 (현재 미사용, 추후 활용 가능).

---

#### 모의 탭 이탈 버튼 제거 (`frontend/src/pages/StudentDashboard.jsx`)

- `triggerMockDeparture` 함수 삭제
- 하단 컨트롤 바에서 "모의 탭 이탈" 버튼 제거

---

#### P1 버그 수정 3건

**① 학부모 중복 연결 차단 (`backend/src/controllers/authController.js`)**

학부모가 학생 초대 코드 입력 시, 해당 학생이 이미 다른 학부모와 연결된 경우를 차단하지 않던 문제.

```js
// 수정 전: 중복 체크 없음
await Parent.findByIdAndUpdate(caller._id, { $addToSet: { children: partner._id } });

// 수정 후
const existingParent = await Parent.findOne({ children: partner._id });
if (existingParent) {
  return { linked: false, message: '해당 학생은 이미 다른 학부모와 연결되어 있습니다.' };
}
```

학생 쪽(`BUG-03`)은 기존에 차단됨. 학부모 쪽도 동일하게 1:1 관계 강제.

**② TF.js 분석 인터벌 중복 실행 방지 (`frontend/src/hooks/useAttentionAnalysis.js`)**

`startAnalysis()` 호출 시 기존 `intervalRef.current`를 정리하지 않아 중복 인터벌 생성, 추론 2배 실행 + 메모리 누수 발생.

```js
// 수정: 진입 시 기존 인터벌 먼저 정리
if (intervalRef.current) {
  clearInterval(intervalRef.current);
  intervalRef.current = null;
}
```

**③ 학부모 대시보드 가짜 데이터 제거 (`frontend/src/pages/ParentDashboard.jsx`)**

세션이 없을 때 `avgFocus: 82`, `totalSec: 5400`, `departureCount: 2` 같은 하드코딩 수치와 `MOCK_CHART`를 표시하던 문제.

- `MOCK_CHART` 상수 삭제
- `?? 82`, `?? 5400`, `?? 2` 폴백 제거
- `hasReport = !!report` 플래그 기반으로 렌더링 분기
  - 데이터 없음 시: 수치 카드 `—`, 차트 안내 문구, AI 코칭 "세션 데이터가 없습니다."

---

#### 시드 데이터 타임스탬프 버그 수정 (`backend/scripts/seedDemo.js`)

`generateRecords()`가 `startTime`을 `'2026-04-09T14:00:00Z'`로 하드코딩. 루프에서 `sessionStart`는 2시간씩 증가하므로 2번째/3번째 세션의 records·departures 타임스탬프가 세션 시작 시각보다 2~4시간 앞서는 문제.

```js
// 수정 전
function generateRecords(durationMin) {
  const startTime = new Date('2026-04-09T14:00:00.000Z'); // 하드코딩

// 수정 후
function generateRecords(durationMin, startTime) {
  // 호출부: generateRecords(lec.durationMin, sessionStart)
```

`generateDepartures(startTime)` → `generateDepartures(sessionStart)` 동일하게 수정.

---

### 2026-04-10 (6) | 학부모 대시보드 UX 개선 — 자녀 선택 필터 + ProfileSettings 닫기 버튼

#### 학부모 대시보드 자녀 선택 드롭다운 (`frontend/src/pages/ParentDashboard.jsx`)

다자녀 환경에서 특정 자녀의 세션만 필터링하여 조회할 수 있도록 추가.

- `selectedChild` state 추가 (null = 전체)
- `filteredSessions` — `selectedChild`가 있으면 `sessions.filter(s => s.studentId === selectedChild.studentId)`, 없으면 전체
- `handleChildSelect(child)` — 자녀 변경 시 `report`, `ragText` 초기화 후 해당 자녀의 첫 세션 자동 선택
- 자녀가 2명 이상일 때만 `<select>` 드롭다운 표시 (1명이면 생략)
  - "전체 자녀 (N명)" 옵션이 기본값
  - 각 옵션: `{이름} ({고등|중등})` 형식
- 세션 드롭다운도 `filteredSessions` 기준으로 변경
- 헤더 subtitle: 선택된 자녀 이름 / "전체 자녀 (N명)" / "자녀를 연결해주세요" 동적 표시

**CSS 추가 (`frontend/src/pages/ParentDashboard.css`)**

`.session-select` — 자녀/세션 공통 드롭다운 스타일 (둥근 테두리, primary focus, 최대 360px)

#### ProfileSettings 닫기 버튼 (`frontend/src/pages/ProfileSettings.jsx`)

- 헤더 우측에 `✕` 버튼 추가
- 학부모: `/parent` / 학생: `/student` 로 `navigate()` 이동
- `.settings-close-btn` CSS: 원형, hover 시 배경색 전환

---

### 2026-04-10 (5) | Student/Parent 분리 모델 + 초대 코드 연결 버그 수정

#### 모델 분리 (`backend/src/models/`)

단일 `User.js` → 역할별 별도 모델로 완전 분리. 계획: `docs/LINK-BUG-FIX-PLAN.md` 참고.

| 파일 | 역할 | 핵심 필드 |
|------|------|---------|
| `Student.js` | 학생 계정 | `email`, `passwordHash`, `name`, `studentId`, `gradeLevel`, `inviteCode` |
| `Parent.js` | 학부모 계정 | `email`, `passwordHash`, `name`, `children: [ObjectId ref 'Student']`, `inviteCode` |

- `role` 필드: `default`로 고정, `immutable: true` 설정 (변경 불가)
- 학부모의 자녀 목록은 `ObjectId` 참조 배열 (`$addToSet` / `$pull` 운용)

#### authController 전체 재작성 (`backend/src/controllers/authController.js`)

**`buildUserPayload(user)`**
- 학부모인 경우 `Parent.findById().populate('children')` 재조회
- `childStudentIds: children.map(c => c.studentId)` — 문자열 배열로 JWT에 포함
- sessionController의 `$in` 필터가 이 배열을 사용

**`register`**
- `Student` / `Parent` 모델 분기 생성
- `partnerCode` 입력 시 `linkByCode()` 즉시 호출

**`linkByCode(caller, partnerCode)`**
- Student/Parent 두 컬렉션 모두 조회해 초대 코드 소유자 확인
- BUG-01 수정 (학부모 중복 연결 차단):
  ```js
  const alreadyLinked = caller.children.some(c => c.equals(partner._id));
  if (alreadyLinked) return { linked: false, message: '이미 연결된 자녀입니다.' };
  ```
- BUG-03 수정 (학생 다중 학부모 연결 차단):
  ```js
  const existingParent = await Parent.findOne({ children: caller._id });
  if (existingParent) return { linked: false, message: '이미 연결된 학부모가 있습니다. 먼저 연결을 해제해주세요.' };
  ```

**`unlink`**
- 학생: `Parent.updateMany({ children: student._id }, { $pull: { children: student._id } })`
- 학부모: `?studentId=` 쿼리 파라미터로 특정 자녀만 해제, 없으면 전체 해제

**`getChild`** — `Parent.findById().populate('children')` → `{ children: [...] }` 배열 반환

**`getParent`** — `Parent.findOne({ children: student._id })` → 학생에게 연결된 학부모 반환

#### sessionController 반영 (`backend/src/controllers/sessionController.js`)

- `hasSessionAccess`: 부모 → `user.childStudentIds.includes(session.studentId)` 배열 체크
- `getSessions`: 부모 필터 → `{ studentId: { $in: childStudentIds } }` (전체 자녀 세션 통합 조회)

#### 프론트엔드 반영

**`frontend/src/services/api.js`**
- `getChild()` → `{ children: [] }` 배열 응답 처리
- `unlink(studentId?)` → `?studentId=` 쿼리 파라미터 지원

**`frontend/src/pages/ProfileSettings.jsx`**
- `childInfo` → `children[]` 배열 state로 전환
- "연결된 자녀" 섹션: 자녀 목록 + 각 자녀별 개별 "연결 해제" 버튼
- `handleUnlink(studentId?)` — 특정 자녀 studentId 전달로 개별 해제
- BUG-02 수정: `handleLink` 완료 후 학생 역할이면 `authAPI.getParent()` 재조회 → `setParentInfo` 즉시 반영

**`frontend/src/pages/ParentDashboard.jsx`**
- `children[]` 배열 state로 전환 (이름, gradeLevel, studentId 포함)
- 자녀 연결 폼: 항상 표시 (다자녀 추가 연결 허용)

> **⚠️ DB 초기화 필요**: 기존 `User` 컬렉션은 사용하지 않음. `npm run seed`로 데모 계정 재생성 필요.

---

### 2026-04-10 (4) | 보안 강화 — CORS 제한 / 레이트 리밋 / 입력값 검증

#### CORS 설정 강화 (`backend/src/index.js`)

- `app.use(cors())` 전면 허용 → origin/methods/allowedHeaders 명시적 제한
- `ALLOWED_ORIGINS` 환경변수로 개발/운영 분리 (기본값: `http://localhost:5173`)
- `methods`: GET, POST, PUT, PATCH, DELETE
- `allowedHeaders`: Content-Type, Authorization

#### 레이트 리밋 (`express-rate-limit`, `backend/src/routes/auth.js`)

| 엔드포인트 | 제한 |
|-----------|------|
| `POST /api/auth/login` | IP당 15분에 20회 |
| `POST /api/auth/register` | IP당 1시간에 10회 |
| `PUT /api/auth/link`, `PATCH /api/auth/profile` | IP당 15분에 30회 |

초과 시 `429 Too Many Requests` + 한국어 메시지 반환.

#### 입력값 검증 (`zod`, `backend/src/middleware/validate.js`)

`validate(schema)` 미들웨어 팩토리 생성. 검증 실패 시 컨트롤러 진입 전 `400` 차단.

| 엔드포인트 | 검증 항목 |
|-----------|---------|
| `POST /register` | email 형식, password 6자+, role enum, student → gradeLevel 필수 |
| `POST /login` | email 형식, password 존재 |
| `PUT /link` | partnerCode 존재 |
| `PATCH /profile` | 변경 항목 존재, 비밀번호 변경 시 currentPassword 필수 |
| `POST /sessions` | lectureId 필수 |
| `POST /sessions/:id/records` | timestamp ISO 형식, status 1~5, confidence 0~1 |
| `POST /sessions/:id/departures` | leaveTime/returnTime ISO 형식, duration 0+ |

---

### 2026-04-10 (3) | 다자녀 지원 스키마 마이그레이션

#### User 모델 변경 (`backend/src/models/User.js`)

| 변경 전 | 변경 후 | 이유 |
|---------|---------|------|
| `childStudentId: String` | `childStudentIds: [String]` | 학부모 1명이 여러 자녀를 모니터링 |

#### authController 전체 반영 (`backend/src/controllers/authController.js`)

- `generateToken`, `userPayload` — `childStudentIds` 배열로 교체
- `linkByCode` — `$push: { childStudentIds }` (중복 방지 포함)
- `link` — 학생/학부모 모두 `$push` + 중복 시 409 반환
- `getChild` — 단일 객체 → `{ children: [...] }` 배열 반환 (`User.find({ studentId: { $in: [...] } })`)
- `getParent` — `childStudentIds: student.studentId` 조건으로 학부모 조회
- `unlink`
  - 학생: `User.updateMany({ childStudentIds: studentId }, $pull)` — 연결된 모든 학부모에서 제거
  - 학부모: `?studentId=` 쿼리 파라미터로 특정 자녀만 제거, 없으면 전체 해제

#### sessionController 반영 (`backend/src/controllers/sessionController.js`)

- `hasSessionAccess` — 부모 역할 시 `childStudentIds.includes(session.studentId)` 배열 체크로 변경
- `getSessions` — 부모 필터: `{ studentId: { $in: childStudentIds } }` (전체 자녀 세션 조회)

#### 시드 스크립트 업데이트 (`backend/src/scripts/seed.js`)

- 데모 학부모 계정: `childStudentIds: [DEMO_STUDENT_ID]` 배열로 변경

#### 프론트엔드 반영

**`frontend/src/services/api.js`**
- `getChild()` 응답 형식: `{ child }` → `{ children: [] }`
- `unlink(studentId?)` — 학부모가 특정 자녀만 해제 시 `?studentId=` 쿼리 파라미터 전달

**`frontend/src/pages/ParentDashboard.jsx`**
- `childName` → `childNames[]` 배열, `getChild()` 응답의 `children` 매핑
- 헤더 subtitle: 여러 자녀 이름 쉼표로 나열 (`"김학생, 이학생의 학습 리포트"`)
- 자녀 연결 폼: 항상 표시 (다자녀 추가 허용)
- `user?.childStudentId` → `user?.childStudentIds?.length` 조건 전환

**`frontend/src/pages/ProfileSettings.jsx`**
- `childInfo` → `children[]` 배열
- "연결된 자녀" 섹션: 자녀 목록 렌더링 + 각 자녀별 개별 "연결 해제" 버튼
- `handleUnlink(studentId?)` — 특정 자녀 studentId 전달로 개별 해제
- `isLinked`: `user?.childStudentIds?.length > 0` 조건으로 변경
- 학부모 연결 현황 문구: "자녀 N명과 연결되어 있습니다. 추가 연결도 가능합니다."

> **⚠️ DB 마이그레이션 필요**: 기존 MongoDB에 `childStudentId` 필드로 저장된 데이터는 `childStudentIds` 배열로 수동 이전 또는 `npm run seed` 재실행 필요.

---

### 2026-04-10 (2) | 연결 해제 기능 + 비밀번호 버그 수정

#### 학생 → 학부모 연결 해제

**Backend 추가**
- `GET /api/auth/parent` — 학생 `studentId`로 연결된 학부모 조회 (`name`, `inviteCode` 반환)
- `DELETE /api/auth/link` — 연결 해제
  - 학생: 학부모의 `childStudentId` null 처리
  - 학부모: 본인 `childStudentId` null 처리 + 새 토큰 발급

**Frontend 추가**
- `authAPI.getParent()`, `authAPI.unlink()` 추가 (`services/api.js`)
- `ProfileSettings.jsx` — 학생 마운트 시 학부모 정보 조회
  - 연결됨: 학부모 이름 + 초대 코드 표시, 입력 칸 비활성화
  - "연결 해제" 버튼 → 인라인 확인 UI 전환 (`window.confirm` 미사용)
  - [취소] / [해제] 버튼으로 처리, 완료 후 상태 초기화

#### 비밀번호 변경 버그 수정

**원인**: `PATCH /api/auth/profile`에서 현재 비밀번호 불일치 시 `401` 반환
→ `api.js`의 `request()`가 401을 토큰 만료로 오인해 로그아웃 + `/login` 리다이렉트

**수정 1 — Backend** (`authController.js`)
- 현재 비밀번호 불일치 응답: `401` → `400` 변경
- `401`은 토큰 무효/만료에만 사용하도록 의미 분리

**수정 2 — Frontend** (`api.js`)
- 기존: 401 응답이면 무조건 로그아웃
- 변경: `err.message === '유효하지 않은 토큰입니다.'`일 때만 로그아웃 처리
- 비밀번호 불일치 등 일반 오류는 에러 메시지만 표시

---

### 2026-04-10 | Day 5: 인증 시스템 + 회원 정보 수정

#### 인증 시스템 (JWT)

**Backend 신규**
- `backend/src/models/User.js` — User 스키마 (email, passwordHash, role, name, studentId, childStudentId, gradeLevel, inviteCode)
- `backend/src/middleware/auth.js` — `requireAuth` (JWT 검증), `requireRole`
- `backend/src/controllers/authController.js` — register / login / me / link / updateProfile / getChild
- `backend/src/routes/auth.js` — `/api/auth/*` 라우트 전체
- `backend/src/scripts/seed.js` — 데모 계정 2개 (student@demo.com / parent@demo.com)

**Auth API 엔드포인트**

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 (inviteCode 자동 발급, partnerCode 연결 옵션) |
| POST | `/api/auth/login` | 로그인 → JWT 발급 |
| GET | `/api/auth/me` | 내 정보 조회 (inviteCode null이면 자동 발급) |
| PUT | `/api/auth/link` | 초대 코드로 학생↔학부모 연결 |
| PATCH | `/api/auth/profile` | 이름·비밀번호 변경 |
| GET | `/api/auth/child` | 연결된 자녀 정보 조회 (학부모 전용) |

**Frontend 신규/수정**
- `frontend/src/contexts/AuthContext.jsx` — user/token 전역 관리, login/register/logout/updateUser
- `frontend/src/components/common/ProtectedRoute.jsx` — role 기반 보호 라우트
- `frontend/src/pages/Login.jsx` — 이메일+비밀번호 로그인 폼
- `frontend/src/pages/Register.jsx` — 역할 선택, 학교급, 초대 코드 입력 포함 회원가입
- `frontend/src/pages/ProfileSettings.jsx` — 계정 정보 / 자녀 정보 / 초대 코드 / 이름 변경 / 비밀번호 변경
- `frontend/src/components/common/NavBar.jsx` — 로그인 상태 반영, ⚙ 설정 아이콘 추가
- `frontend/src/App.jsx` — 보호 라우트 적용, `/settings` 추가

#### StudentDashboard sessionAPI 연동

- raw `fetch()` 5곳 → `sessionAPI.*` 서비스 호출로 교체
- `useAuth`로 로그인 사용자 연동
- 사이드바에 초대 코드 카드 추가 (`user?.inviteCode`)

#### ParentDashboard 자녀 이름 표시

- `authAPI.getChild()` 호출로 자녀 이름 조회
- subtitle: `${childName}의 학습 리포트` (미연결 시 "자녀를 연결해주세요")

#### 버그 수정 / 환경 설정

- 백엔드 포트 5000 → **5001** 변경 (`backend/.env`, Vite proxy 정합)
- `GET /api/auth/me`에서 inviteCode 없는 기존 계정 자동 발급 (lazy migration)
- 비밀번호 변경 성공 시 성공 화면 전환 후 [확인] 버튼으로만 폼 초기화

---

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
- [x] JWT 인증 시스템 구현 (로그인/회원가입/보호 라우트) ✅
- [x] 회원 정보 수정 페이지 (초대코드/이름/비밀번호) ✅
- [ ] `ANTHROPIC_API_KEY` 설정 후 3개 강좌 자막 분석 실행
  ```bash
  curl -X POST http://localhost:5001/api/lectures/lec-001/analyze
  curl -X POST http://localhost:5001/api/lectures/lec-002/analyze
  curl -X POST http://localhost:5001/api/lectures/lec-003/analyze
  ```
- [ ] 전체 데모 흐름 E2E 테스트 (강의 시작 → 세션 종료 → 리포트 → RAG 확인)

### 🟡 있으면 좋음

- [ ] TensorFlow.js 웹캠 + 실제 MobileNet V3 집중도 분류 연동
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

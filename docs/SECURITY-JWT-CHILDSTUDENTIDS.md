# JWT childStudentIds 제거 — 보안 설계 개선

## 배경

### 문제 제기

코드 리뷰 과정에서 다음 구조적 취약점이 확인되었다.

1. 부모가 로그인하면 JWT payload에 `childStudentIds`(자녀의 studentId 문자열 배열)가 포함됨
2. 인증 미들웨어(`auth.js`)는 JWT 서명만 검증하고 부모-자녀 관계를 DB에서 재확인하지 않음
3. 세션 접근 권한이 `req.user.childStudentIds`(JWT 값)만 보고 결정됨
4. 학생이 연결 해제하면 DB의 `children`은 제거되지만 기존 부모 JWT는 무효화되지 않음
5. 결과: 토큰 만료(7일) 전까지 연결 해제된 자녀의 세션에 계속 접근 가능

### 왜 설계 문제인가

JWT는 발급 시점의 스냅샷이다. **변할 수 있는 권한 정보**(`childStudentIds`)를 JWT에 넣으면, 서버는 DB의 현재 상태가 아닌 발급 당시 상태를 신뢰하게 된다. 이는 JWT의 대표적인 안티패턴이다.

```
잘못된 설계:
  JWT payload → { id, role, childStudentIds: ['student-abc'] }  ← 변하는 권한 정보
  권한 검증   → req.user.childStudentIds 신뢰                    ← 토큰 기준

올바른 설계:
  JWT payload → { id, role }                                    ← 불변 식별자만
  권한 검증   → DB에서 현재 parent.children 조회                 ← DB 기준
```

---

## 수정 내용

### 수정 일자
2026-04-10

### 수정 범위

총 4개 파일, 7개 지점

---

### 1. `backend/src/controllers/authController.js`

**`buildUserPayload` 함수에서 `childStudentIds` 제거**

```js
// 수정 전
const populated = await Parent.findById(user._id).populate('children', 'studentId');
base.children = (populated?.children || []).map(c => c._id);
base.childStudentIds = (populated?.children || []).map(c => c.studentId);  // ← 제거

// 수정 후
const populated = await Parent.findById(user._id).populate('children', 'studentId');
base.children = (populated?.children || []).map(c => c._id);  // ObjectId[]만 유지
```

`buildUserPayload`는 login, register, link, unlink, me, updateProfile 등 토큰을 발급하는 모든 경로에서 공통으로 호출된다. 한 곳만 수정하면 전체에 적용된다.

---

### 2. `backend/src/controllers/sessionController.js`

**이미 DB 조회로 교체됨 — 코드 변경 없음**

이전 수정에서 `fetchParentChildIds(parentId)` 헬퍼를 추가해 JWT 값 대신 DB를 직접 조회하도록 변경되어 있다.

```js
// fetchParentChildIds — DB에서 현재 children 조회
async function fetchParentChildIds(parentId) {
  const parent = await Parent.findById(parentId).populate('children', 'studentId');
  if (!parent) return [];
  return parent.children.map(c => c.studentId);
}

// hasSessionAccess — 부모 역할은 DB 조회로 검증
async function hasSessionAccess(user, session) {
  if (user.role === 'student') return user.studentId === session.studentId;
  if (user.role === 'parent') {
    const childStudentIds = await fetchParentChildIds(user.id);
    return childStudentIds.includes(session.studentId);
  }
  return false;
}
```

적용 범위: `GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/report`, `GET /api/sessions/:id/rag-analysis`

---

### 3. `frontend/src/pages/ParentDashboard.jsx`

`user.childStudentIds` → `user.children` 으로 교체 (3곳)

| 위치 | 수정 전 | 수정 후 |
|---|---|---|
| useEffect 가드 (line 36) | `user?.childStudentIds?.length` | `user?.children?.length` |
| useEffect 의존성 (line 48) | `user?.childStudentIds?.join(',')` | `user?.children?.join(',')` |
| "세션 없음" 조건 (line 190) | `user?.childStudentIds?.length > 0` | `user?.children?.length > 0` |

`user.children`은 ObjectId 배열이다. 실제 자녀 정보(name, gradeLevel, studentId)는 `authAPI.getChild()` → `/api/auth/child`(DB 조회)에서 가져오므로, 프론트에서 `childStudentIds`의 실제 값(studentId 문자열)을 직접 사용하는 곳은 없다.

---

### 4. `frontend/src/pages/ProfileSettings.jsx`

`user.childStudentIds` → `user.children` 으로 교체 (2곳)

| 위치 | 수정 전 | 수정 후 |
|---|---|---|
| isLinked 판단 (line 43) | `!!(user?.childStudentIds?.length)` | `!!(user?.children?.length)` |
| useEffect 의존성 (line 51) | `user?.childStudentIds?.join(',')` | `user?.children?.join(',')` |

---

### 5. `backend/src/controllers/authController.js` — `/me` 엔드포인트 개선

앱 시작 시 `/api/auth/me`가 새 토큰을 발급해 반환하도록 수정되었다.

```js
// 수정 전
return res.status(200).json({ user: payload });

// 수정 후
const token = signToken(payload);
return res.status(200).json({ user: payload, token });
```

---

### 6. `frontend/src/contexts/AuthContext.jsx` — 앱 시작 시 토큰 갱신

```js
// 수정 전
setToken(stored);          // 기존 토큰 그대로 사용
setUser(data.user);

// 수정 후
const freshToken = data.token || stored;  // /me가 반환한 새 토큰으로 교체
setToken(freshToken);
setUser(data.user);
localStorage.setItem('eduwatch_token', freshToken);
```

---

## 최종 보안 구조

```
부모 로그인/연결/해제
  → buildUserPayload: { id, role, children(ObjectId[]) }  ← childStudentIds 없음
  → JWT 발급

앱 시작
  → /api/auth/me 호출
  → DB 기준 최신 payload로 새 토큰 발급
  → AuthContext가 localStorage 토큰 갱신

세션 API 요청
  → auth.js: JWT 서명 검증 → req.user 세팅
  → sessionController: fetchParentChildIds(req.user.id) → DB 직접 조회
  → 현재 DB 상태 기준으로 접근 허용/거부
```

### 방어 레이어

| 레이어 | 역할 |
|---|---|
| JWT payload 정리 | `childStudentIds` 제거로 stale 권한 정보 원천 차단 |
| `/me` 토큰 갱신 | 앱 시작마다 DB 기준 최신 토큰 발급 |
| sessionController DB 조회 | 토큰 내용과 무관하게 DB로 최종 검증 (Defense in depth) |

---

## 기능 영향

**없음.** 아래 이유로 기능 동작이 동일하게 유지된다.

- 프론트에서 `childStudentIds`의 실제 문자열 값을 직접 사용하는 코드가 없었음
- 모든 사용처가 `.length` 체크 또는 `.join(',')` 변경 감지 키로만 사용
- 자녀 상세 정보는 `/api/auth/child`(DB 조회)에서 별도로 가져옴
- `children`(ObjectId 배열)은 기존에도 JWT에 포함되어 있어 대체재로 바로 사용 가능

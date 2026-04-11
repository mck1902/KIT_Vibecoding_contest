# 보안 개선 내역

> 작성일: 2026-04-10  
> 대상 브런치: staging

---

## 1. 이메일 포맷 검증 추가

**파일:** `backend/src/controllers/authController.js`

`register` 함수의 필수값 검사 이후에 이메일 포맷 정규식 검증을 추가했습니다.

```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!EMAIL_RE.test(email)) {
  return res.status(400).json({ message: '유효한 이메일 형식이 아닙니다.' });
}
```

---

## 2. 역할 기반 세션 접근 제어

**파일:** `backend/src/controllers/sessionController.js`

### 2-1. 헬퍼 함수 추가

```js
function resolveStudentId(user) {
  if (user.role === 'student') return user.studentId;
  if (user.role === 'parent') return user.childStudentId;
  return null;
}

function hasSessionAccess(user, session) {
  const allowedId = resolveStudentId(user);
  return allowedId && session.studentId === allowedId;
}
```

### 2-2. 읽기 계열 소유권 검증

`getSessionById`, `getSessionReport`, `getRagAnalysis`에 `hasSessionAccess` 검증 추가.
- student: 본인 세션만 조회 가능
- parent: 자녀(`childStudentId`) 세션만 조회 가능

### 2-3. 쓰기 계열 소유권 검증

`endSession`, `addRecords`, `addDeparture`에 student 본인 세션 여부 직접 비교 추가.

```js
if (session.studentId !== req.user.studentId) {
  return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
}
```

- `findByIdAndUpdate` → `findById` 후 소유권 검증 → `updateOne()` 순서로 변경
- 읽기는 student/parent 모두 허용(`hasSessionAccess`), 쓰기는 student 본인만 허용(직접 비교)으로 분리

---

## 3. requireRole 미들웨어 도입

**파일:** `backend/src/middleware/auth.js`, `backend/src/routes/sessions.js`

### 3-1. 미들웨어 추가

```js
function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ message: `${role} 계정만 접근할 수 있습니다.` });
    }
    next();
  };
}
```

### 3-2. 라우트에 적용

```js
router.post('/',              requireAuth, requireRole('student'), createSession);
router.put('/:id/end',        requireAuth, requireRole('student'), endSession);
router.post('/:id/records',   requireAuth, requireRole('student'), addRecords);
router.post('/:id/departures',requireAuth, requireRole('student'), addDeparture);
```

- 컨트롤러 내부 역할 조건문을 미들웨어 레벨로 격상
- `createSession`의 중복 역할 검사 제거

---

## 4. JWT_SECRET 환경변수 필수화

**파일:** `backend/src/middleware/auth.js`, `backend/.env`

```js
// 변경 전
const JWT_SECRET = process.env.JWT_SECRET || 'eduwatch-secret-key';

// 변경 후
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}
```

- 환경변수 미설정 시 서버 실행 자체를 중단
- `.env`에 `JWT_SECRET` 추가 (운영 배포 시 강력한 랜덤값으로 교체 필요)

---

## 5. User 모델 정합성 강화

**파일:** `backend/src/models/User.js`

### 5-1. studentId 커스텀 validator

```js
studentId: {
  type: String,
  default: null,
  validate: {
    validator: function (v) { return this.role !== 'student' || !!v; },
    message: 'studentId는 학생 계정에 필수입니다.',
  },
},
```

### 5-2. 역할 반대 필드 강제 초기화 (pre save 훅)

```js
userSchema.pre('save', function (next) {
  if (this.role === 'student') this.childStudentId = null;
  if (this.role === 'parent') this.studentId = null;
  next();
});
```

### 5-3. trim 후 빈 문자열 방지

```js
email: { ..., minlength: 1 },
name:  { ..., minlength: 1 },
```

---

## 6. 앱 시작 시 토큰 유효성 검증 및 자동 로그아웃

**파일:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/services/api.js`

### 6-1. 앱 시작 시 서버 검증

localStorage 토큰을 그대로 신뢰하지 않고 `/api/auth/me`로 서버 검증 후 복원.
검증 실패 시(만료·위조) localStorage 클리어 및 비로그인 상태로 전환.

### 6-2. API 401 자동 로그아웃

```js
if (res.status === 401) {
  localStorage.removeItem('eduwatch_token');
  localStorage.removeItem('eduwatch_user');
  window.location.href = '/login';
}
```

API 호출 중 401 응답 수신 시 토큰 삭제 후 `/login`으로 자동 리다이렉트.

---

## 7. Login.jsx 렌더 중 navigate() 호출 제거

**파일:** `frontend/src/pages/Login.jsx`

렌더 함수 내에서 직접 `navigate()`를 호출하는 방식은 React의 순수 렌더 원칙에 위배됩니다. StrictMode에서 렌더가 두 번 실행될 경우 `navigate()`도 두 번 호출될 수 있습니다.

```jsx
// 변경 전
if (user) {
  navigate(user.role === 'student' ? '/student' : '/parent', { replace: true });
  return null;
}

// 변경 후
if (user) {
  return <Navigate to={user.role === 'student' ? '/student' : '/parent'} replace />;
}
```

React Router가 권장하는 선언적 `<Navigate>` 컴포넌트로 교체했습니다.

---

## 8. Register.jsx 렌더 중 navigate() 호출 제거

**파일:** `frontend/src/pages/Register.jsx`

Login.jsx와 동일한 문제. 이미 로그인 상태일 때 렌더 중 `navigate()`를 직접 호출하는 방식을 `<Navigate>` 컴포넌트로 교체했습니다.

```jsx
// 변경 전
if (user) {
  navigate(user.role === 'student' ? '/student' : '/parent', { replace: true });
  return null;
}

// 변경 후
if (user) {
  return <Navigate to={user.role === 'student' ? '/student' : '/parent'} replace />;
}
```

---

## 9. ParentDashboard useLocation().state 의존 제거

**파일:** `frontend/src/pages/ParentDashboard.jsx`

계획서 Phase 7 요구사항(`useLocation().state` 의존 제거)을 완전히 이행했습니다.

- `useLocation` import 및 `location.state?.sessionId` 참조 제거
- `selectedSessionId` 초기값을 `null`로 단순화 (세션 목록 자동 조회 후 첫 번째 세션 선택)
- `!sessionId` 조건으로 분기하던 하드코딩 목업 텍스트 제거
- 로그인한 학부모의 `childStudentId` 기준으로 `/api/sessions` 자동 조회하는 단일 진입 경로만 유지

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|---|---|
| `backend/src/controllers/authController.js` | 이메일 포맷 검증 추가 |
| `backend/src/controllers/sessionController.js` | 읽기/쓰기 소유권 검증, 역할 조건문 제거 |
| `backend/src/middleware/auth.js` | `requireRole` 추가, `JWT_SECRET` 필수화 |
| `backend/src/routes/sessions.js` | 쓰기 라우트에 `requireRole('student')` 적용 |
| `backend/src/models/User.js` | `studentId` validator, `pre save` 훅, `minlength` 추가 |
| `backend/.env` | `JWT_SECRET` 추가 |
| `frontend/src/contexts/AuthContext.jsx` | 앱 시작 시 `/api/auth/me` 서버 검증 |
| `frontend/src/services/api.js` | 401 자동 로그아웃 처리 |
| `frontend/src/pages/Login.jsx` | 렌더 중 `navigate()` → `<Navigate>` 컴포넌트로 교체 |
| `frontend/src/pages/Register.jsx` | 렌더 중 `navigate()` → `<Navigate>` 컴포넌트로 교체 |
| `frontend/src/pages/ParentDashboard.jsx` | `useLocation().state` 의존 제거, 단일 자동 조회 경로로 통일 |

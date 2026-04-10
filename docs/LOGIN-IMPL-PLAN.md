# 로그인 기능 구현 계획

## Context

현재 앱은 역할 선택(학생/학부모 버튼 클릭)만 있고 실제 인증이 없다. 모든 라우트가 비보호 상태이며 `StudentDashboard`는 `demo-student-001`을 하드코딩해 사용한다. 이를 JWT 기반 이메일/비밀번호 인증으로 교체한다.

**선택 사항:** JWT 인증, 회원가입 포함, 학부모는 studentId 직접 입력으로 자녀 연결

---

## 구현 단계

### Phase 1: 백엔드 — 패키지 및 User 모델

**파일:** `backend/package.json`, `backend/src/models/User.js` (신규)

1. `bcryptjs`, `jsonwebtoken` 패키지 설치
   ```bash
   cd backend && npm install bcryptjs jsonwebtoken
   ```
2. `User` 모델 생성:

| 필드 | 타입 | 설명 |
|---|---|---|
| `email` | String (unique) | 로그인 ID |
| `passwordHash` | String | bcrypt 해시 |
| `role` | `'student'` \| `'parent'` | 역할 |
| `name` | String | 표시 이름 |
| `studentId` | String | role=student일 때 세션 연결용 ID |
| `childStudentId` | String | role=parent일 때 자녀 studentId |

---

### Phase 2: 백엔드 — 인증 라우트 & 미들웨어

**신규 파일:**
- `backend/src/routes/auth.js`
- `backend/src/controllers/authController.js`
- `backend/src/middleware/auth.js`

**수정 파일:** `backend/src/index.js`

#### 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/auth/register` | 회원가입 (이메일/비번/역할/이름) |
| `POST` | `/api/auth/login` | 로그인 → JWT 발급 |
| `GET` | `/api/auth/me` | 현재 사용자 정보 (토큰 필요) |
| `PUT` | `/api/auth/link-child` | 학부모 자녀 연결 (studentId 입력) |

#### 미들웨어 (`auth.js`)
- `requireAuth`: Authorization 헤더에서 JWT 검증 → `req.user` 주입
- `requireRole(role)`: 역할 체크 (선택적)

---

### Phase 3: 백엔드 — 기존 세션 API 보호

**수정 파일:** `backend/src/routes/sessions.js`, `backend/src/controllers/sessionController.js`

1. `POST /api/sessions` — `requireAuth` 적용, `req.user.studentId` 자동 연결
2. `GET /api/sessions` — 학생은 자신의 세션만, 학부모는 `childStudentId`의 세션만 조회
3. 나머지 세션 라우트에 `requireAuth` 적용

---

### Phase 4: 프론트엔드 — AuthContext

**신규 파일:** `frontend/src/contexts/AuthContext.jsx`

**수정 파일:** `frontend/src/App.jsx`, `frontend/src/services/api.js`

1. `AuthContext` 제공 값:
   - 상태: `user`, `token`, `loading`
   - 함수: `login(email, password)`, `register(data)`, `logout()`
   - `localStorage`에 토큰 저장/복원 (페이지 새로고침 유지)
2. `App.jsx`를 `<AuthProvider>`로 감싸기
3. `api.js`: 요청 시 `Authorization: Bearer <token>` 헤더 자동 첨부

---

### Phase 5: 프론트엔드 — 보호된 라우트

**신규 파일:** `frontend/src/components/common/ProtectedRoute.jsx`

**수정 파일:** `frontend/src/App.jsx`

```jsx
// 라우트 구조
/              → Landing (공개)
/features      → Features (공개)
/login         → Login (공개, 로그인 상태면 대시보드로 리다이렉트)
/register      → Register (공개)
/student       → ProtectedRoute(role=student) → StudentDashboard
/parent        → ProtectedRoute(role=parent)  → ParentDashboard
/student/report/:sessionId → ProtectedRoute(role=student) → SessionReport
```

`ProtectedRoute` 동작:
- 비로그인 → `/login`으로 리다이렉트
- 역할 불일치 → 본인 역할 대시보드로 리다이렉트

---

### Phase 6: 프론트엔드 — 로그인/회원가입 페이지

**수정 파일:** `frontend/src/pages/Login.jsx`

**신규 파일:** `frontend/src/pages/Register.jsx`

#### Login.jsx 변경사항
- 역할 선택 버튼 → 이메일/비밀번호 폼
- 에러 메시지 표시
- 회원가입 페이지 링크 (`/register`)
- 로그인 성공 시 역할에 따라 `/student` 또는 `/parent`로 이동

#### Register.jsx (신규)
- 입력 필드: 이름, 이메일, 비밀번호, 역할 선택
- 역할 = 학부모 선택 시 → 자녀 studentId 입력 필드 표시
- 가입 성공 시 자동 로그인 후 대시보드 이동

---

### Phase 7: 프론트엔드 — 대시보드 연동

**수정 파일:**
- `frontend/src/pages/StudentDashboard.jsx`
- `frontend/src/pages/ParentDashboard.jsx`
- `frontend/src/components/common/NavBar.jsx`

1. `StudentDashboard.jsx`: 하드코딩된 `"demo-student-001"` 제거 → `useAuth().user.studentId` 사용
2. `ParentDashboard.jsx`: `useLocation().state` 의존 제거 → 로그인된 학부모의 `childStudentId`로 세션 목록 자동 조회
3. `NavBar.jsx`: 로그인 상태 표시 — 사용자 이름 + 로그아웃 버튼

---

### Phase 8: 시드 데이터

**신규 파일:** `backend/src/scripts/seed.js`

데모 계정:

| 역할 | 이메일 | 비밀번호 | ID |
|---|---|---|---|
| 학생 | `student@demo.com` | `password123` | `demo-student-001` |
| 학부모 | `parent@demo.com` | `password123` | childStudentId: `demo-student-001` |

`backend/package.json` scripts에 추가:
```json
"seed": "node src/scripts/seed.js"
```

---

## 수정 파일 전체 목록

### 신규 파일 (8개)
```
backend/src/models/User.js
backend/src/controllers/authController.js
backend/src/routes/auth.js
backend/src/middleware/auth.js
backend/src/scripts/seed.js
frontend/src/contexts/AuthContext.jsx
frontend/src/components/common/ProtectedRoute.jsx
frontend/src/pages/Register.jsx
```

### 수정 파일 (9개)
```
backend/src/index.js                              — auth 라우트 등록
backend/src/routes/sessions.js                   — requireAuth 적용
backend/src/controllers/sessionController.js     — req.user 기반 로직
frontend/src/App.jsx                              — AuthProvider 래핑, 라우트 보호
frontend/src/pages/Login.jsx                     — 이메일/비번 폼으로 교체
frontend/src/pages/StudentDashboard.jsx          — useAuth로 studentId 사용
frontend/src/pages/ParentDashboard.jsx           — 로그인 사용자 기반 세션 조회
frontend/src/services/api.js                     — Authorization 헤더 자동 첨부
frontend/src/components/common/NavBar.jsx        — 로그인 상태 표시 + 로그아웃
```

---

## 검증 방법

```bash
# 1. 패키지 설치 및 시드 데이터 생성
cd backend && npm install bcryptjs jsonwebtoken && npm run seed

# 2. 서버 실행
npm run dev  # backend (port 5000)
npm run dev  # frontend (port 5173)
```

브라우저 테스트:
- [ ] `/student` 직접 접근 → `/login`으로 리다이렉트
- [ ] `student@demo.com` / `password123` 로그인 → 학생 대시보드 이동
- [ ] `parent@demo.com` / `password123` 로그인 → 학부모 대시보드 이동
- [ ] 새 계정 회원가입 → 자동 로그인 후 대시보드 이동
- [ ] 학부모 가입 시 자녀 studentId 입력 → 자녀 세션 목록 조회
- [ ] 로그아웃 후 보호된 라우트 접근 → 리다이렉트
- [ ] 페이지 새로고침 후 로그인 상태 유지 (localStorage 토큰)

---

## 추가 기능: 초대 코드 기반 학부모-학생 연결

> 배경: 기존 방식은 학부모가 아무 문자열이나 `studentId`로 입력 가능해 유효성 검증이 없었음.
> 학생/학부모 모두 고유 초대 코드를 발급받고 상대방 코드를 입력해 연결하는 방식으로 개선.

### 흐름

- 학생 먼저 가입 → 코드 발급 (예: `ABC123`) → 학부모에게 공유
  → 학부모 가입 시 또는 대시보드에서 코드 입력 → 연결
- 학부모 먼저 가입 → 코드 발급 (예: `XYZ789`) → 학생에게 공유
  → 학생 가입 시 또는 대시보드에서 코드 입력 → 연결

### 초대 코드 형식

- 6자리 대문자 영숫자 (혼동 문자 제외: `0`, `O`, `1`, `I`, `L`)
- 사용 문자: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (32개)
- 경우의 수: 32⁶ ≈ 10억 → 충돌 가능성 매우 낮음

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `backend/src/models/User.js` | `inviteCode` 필드 추가 (unique, 학생/학부모 모두) |
| `backend/src/controllers/authController.js` | 코드 생성 함수, 가입 시 연결 로직, `link` 함수 |
| `backend/src/routes/auth.js` | `PUT /link` 추가, `link-child` 제거 |
| `backend/src/scripts/seed.js` | 데모 고정 코드 `DEMO01`/`DEMO02` + 연결 |
| `frontend/src/pages/Register.jsx` | `partnerCode` 입력 필드 (양쪽 모두, 선택) |
| `frontend/src/pages/StudentDashboard.jsx` | 내 초대 코드 + 복사 버튼 카드 |
| `frontend/src/pages/ParentDashboard.jsx` | 내 초대 코드 표시 + 미연결 시 자녀 코드 입력 폼 |

### 연결 규칙

- 반드시 반대 역할 코드여야 연결 성공 (학생↔학부모)
- 가입 시 코드 오류여도 가입 자체는 성공 (경고만 반환)
- 가입 후 `PUT /api/auth/link` 로 언제든 재연결 가능

### 데모 계정 초대 코드

| 계정 | 초대 코드 |
|---|---|
| `student@demo.com` | `DEMO01` |
| `parent@demo.com` | `DEMO02` |

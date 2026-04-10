# 회원 정보 수정 기능 구현 플랜

> **상태: ✅ 전체 구현 완료** (2026-04-10)

---

## 구현된 기능 목록

| 기능 | 상태 |
|------|------|
| 내 초대 코드 확인 및 복사 | ✅ 완료 |
| 상대방 초대 코드 등록 (학생↔학부모 연결) | ✅ 완료 |
| 연결된 자녀 정보 표시 (학부모 전용) | ✅ 완료 |
| 연결된 학부모 정보 표시 + 입력 비활성화 (학생 전용) | ✅ 완료 |
| 연결 해제 (인라인 확인 UI) | ✅ 완료 |
| 이름 변경 (인라인 편집) | ✅ 완료 |
| 비밀번호 변경 (성공 화면 전환 UX) | ✅ 완료 |
| NavBar ⚙ 설정 아이콘 | ✅ 완료 |
| inviteCode 없는 기존 계정 자동 발급 | ✅ 완료 |

---

## 최종 구현 파일 목록

### Backend

| 파일 | 변경 내용 |
|------|-----------|
| `backend/src/controllers/authController.js` | `updateProfile`, `getChild`, `getParent`, `unlink`, `me`(lazy inviteCode 발급) 추가 |
| `backend/src/routes/auth.js` | `PATCH /profile`, `GET /child`, `GET /parent`, `DELETE /link` 라우트 추가 |

#### API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| PATCH | `/api/auth/profile` | 이름·비밀번호 변경 (비밀번호 불일치 → 400 반환) | 필요 |
| GET | `/api/auth/child` | 연결된 자녀 목록 조회 → `{ children[] }` (학부모 전용) | 필요 |
| GET | `/api/auth/parent` | 연결된 학부모 정보 조회 → `{ parent }` (학생 전용) | 필요 |
| DELETE | `/api/auth/link` | 연결 해제 — 학생: 모든 학부모에서 제거 / 학부모: `?studentId=` 특정 자녀 또는 전체 해제 | 필요 |

`GET /api/auth/me` — inviteCode가 null인 기존 계정에 자동 발급 후 저장

### Frontend

| 파일 | 변경 내용 |
|------|-----------|
| `frontend/src/services/api.js` | `authAPI.updateProfile()`, `authAPI.getChild()` 추가 |
| `frontend/src/pages/ProfileSettings.jsx` | 신규 — 전체 설정 페이지 |
| `frontend/src/pages/ProfileSettings.css` | 신규 — 글래스 카드 기반 스타일 |
| `frontend/src/App.jsx` | `/settings` 보호 라우트 추가 |
| `frontend/src/components/common/NavBar.jsx` | `FiSettings` 아이콘 + 현재 경로 하이라이트 |
| `frontend/src/components/common/NavBar.css` | `.btn-settings` 스타일 추가 |

---

## ProfileSettings 페이지 섹션 구성

```
┌──────────────────────────────────────┐
│  계정 정보                           │
│  이름 / 이메일 / 역할                │
├──────────────────────────────────────┤
│  연결된 자녀  [학부모만 표시]         │
│  이름 / 학교급 / 학생 ID             │
├──────────────────────────────────────┤
│  내 초대 코드                        │
│  [ A3F9KZ ]  [복사]                  │
├──────────────────────────────────────┤
│  학부모/자녀 연결                    │
│  [ 코드 입력 ]  [연결하기]           │
│  (연결됨 상태 표시)                  │
├──────────────────────────────────────┤
│  이름 변경   [편집] 버튼             │
│  → 인라인 폼 (저장/취소)            │
├──────────────────────────────────────┤
│  비밀번호 변경                       │
│  → 성공 시 성공 화면 전환            │
│  → [확인] 버튼으로만 닫힘           │
└──────────────────────────────────────┘
```

---

## 비밀번호 변경 UX 흐름

```
폼 입력 → [비밀번호 변경] 클릭
  ├── 프론트 유효성: 새 PW 일치 + 6자 이상
  ├── 실패 → 에러 메시지 표시, 폼 유지
  └── 성공 → 성공 화면 전환 (초록 체크 + 메시지)
             → [확인] 클릭 시에만 폼 초기화
```

---

## 주요 설계 결정

- `GET /api/auth/me` 호출 시 inviteCode 없는 계정은 자동 발급 — 기존 계정 마이그레이션 불필요
- `authAPI.link()` 응답의 새 토큰을 반드시 `updateUser(user, token)`으로 저장 — JWT에 `childStudentId` 포함
- 학부모 설정 페이지 진입 시 `authAPI.getChild()` 호출로 자녀 이름 표시
- 초대 코드 연결 성공 시 자녀 정보 즉시 갱신 (`setChildInfo`)

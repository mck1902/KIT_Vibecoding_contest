# 보안 개선 체크리스트

## 결론

현재 프로젝트를 "보안 취약점이 없다"고 평가할 수는 없다.
정적 코드 기준으로 최소 아래 항목들은 실제 보안 이슈 또는 높은 운영 리스크로 본다.

## 주요 이슈

### 1. 평문 비밀값 노출

- 대상: `backend/.env`
- 문제:
  - `JWT_SECRET`가 평문으로 저장되어 있다.
  - MongoDB 접속 문자열에 계정/비밀번호가 포함되어 있다.
- 위험:
  - 저장소 공유, 백업 유출, 화면 공유, 실수 커밋만으로 인증/DB 접근이 노출될 수 있다.
- 조치:
  - `JWT_SECRET` 즉시 교체
  - MongoDB 비밀번호 즉시 교체
  - 가능하면 DB 사용자도 재생성
  - `.env` 파일 Git 추적 제외 확인

### 2. 인증 API 레이트 리밋 부재 ✅ 해결됨

- `express-rate-limit` 적용 완료 (`backend/src/routes/auth.js`)
  - 로그인: IP당 15분에 20회
  - 회원가입: IP당 1시간에 10회
  - 연결/프로필 변경: IP당 15분에 30회

### 3. CORS 전면 허용 ✅ 해결됨

- `backend/src/index.js` 수정 완료
  - `ALLOWED_ORIGINS` 환경변수 기반 origin 제한 (기본값: `http://localhost:5173`)
  - `methods`: GET, POST, PUT, PATCH, DELETE 명시
  - `allowedHeaders`: Content-Type, Authorization 명시

### 4. 부모 권한 토큰 잔류 (stale token) ✅ 해결됨

- 대상:
  - `backend/src/controllers/sessionController.js`
- 문제:
  - 부모 JWT에 `childStudentIds`가 발급 시점에 고정된다.
  - 학생이 연결을 해제(`DELETE /api/auth/link`)해도 부모 토큰은 무효화되지 않아, 기존 토큰(최대 7일)으로 이전 자녀 세션을 계속 열람할 수 있었다.
- 영향 범위:
  - `GET /api/sessions` — 부모 세션 목록 조회
  - `GET /api/sessions/:id/report` — 세션 리포트 조회
  - `GET /api/sessions/:id/rag-analysis` — RAG 분석 조회
  - `GET /api/sessions/:id` — 세션 상세 조회
- 조치:
  - **설계 수정**: `buildUserPayload`에서 `childStudentIds` 제거 — JWT payload에 변하는 권한 정보를 넣지 않음 (`authController.js`)
  - **근본 수정 (토큰 갱신)**: `/api/auth/me`가 DB 기준 최신 payload로 새 토큰을 발급해 반환 (`authController.js`)
  - **프론트 수정**: `AuthContext.jsx` — 앱 시작 시 `/me` 응답의 새 토큰을 localStorage에 저장. `ParentDashboard.jsx`, `ProfileSettings.jsx` — `childStudentIds` 참조를 `children`(ObjectId 배열)으로 교체
  - **방어 심층화 (Defense in depth)**: `sessionController.js`에 `fetchParentChildIds` 헬퍼 추가 — 부모 역할은 DB를 직접 조회해 접근 검증
  - 상세 내용: `docs/SECURITY-JWT-CHILDSTUDENTIDS.md` 참고

### 5. JWT의 localStorage 저장

- 대상:
  - `frontend/src/contexts/AuthContext.jsx`
  - `frontend/src/services/api.js`
- 문제:
  - 토큰이 `localStorage`에 저장된다.
- 위험:
  - XSS가 발생하면 토큰 탈취 피해가 커진다.
- 조치:
  - 가능하면 `HttpOnly`, `Secure`, `SameSite` 쿠키 방식 검토
  - 유지 시 XSS 방어를 더 엄격히 관리

## 권장 추가 조치

### 5. 보안 헤더 추가

- 대상: Express 서버
- 조치:
  - `helmet` 적용
  - 필요 시 CSP 조정

### 6. 입력값 검증 강화 ✅ 해결됨

- `zod` + `validate` 미들웨어 적용 완료 (`backend/src/middleware/validate.js`)
  - 인증 API: register, login, link, updateProfile 스키마 적용
  - 세션 API: createSession, addRecords, addDeparture 스키마 적용

### 7. 의존성 취약점 점검

- 조치:
  - 프론트/백엔드 모두 `npm audit` 또는 동등한 점검 수행
- 비고:
  - 이 항목은 정적 코드 리뷰만으로는 확정할 수 없다.

## 우선순위

1. 비밀값 교체
2. `.env` 추적 제외 및 샘플 파일 분리
3. 인증 API 레이트 리밋 추가
4. CORS 제한
5. 부모 권한 토큰 잔류 차단
6. 보안 헤더 추가
7. 입력 검증 강화
8. 토큰 저장 방식 재검토
9. 의존성 점검

## 즉시 실행 체크리스트

- [ ] `JWT_SECRET` 재발급
- [ ] MongoDB 비밀번호 교체
- [ ] `.gitignore`에 `.env`, `backend/.env` 포함 여부 확인
- [ ] `backend/.env.example` 작성
- [x] `express-rate-limit` 추가 — 로그인(20회/15분), 회원가입(10회/1시간), 기타 인증 액션(30회/15분)
- [x] `cors()`를 허용 origin 기반 설정으로 교체 — methods, allowedHeaders 명시 포함
- [x] 부모 권한 토큰 잔류 차단 — `fetchParentChildIds` DB 실시간 조회로 교체 (`sessionController.js`)
- [ ] `helmet` 추가
- [x] 인증/세션 API 요청 스키마 검증 추가 — `zod` + `validate` 미들웨어 적용
- [ ] 프론트/백엔드 의존성 취약점 점검

## 한계

이 문서는 현재 코드에 대한 정적 검토 결과다.
아래 항목은 아직 별도 검증이 필요하다.

- 실제 배포 환경 설정
- Git 이력상 비밀값 유출 여부
- 의존성 CVE
- 런타임 XSS/SSRF/오픈리다이렉트 등의 동적 취약점

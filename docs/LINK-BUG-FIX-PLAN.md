# 초대 코드 연결 버그 수정 계획 ✅ 완료

> 작성일: 2026-04-10 | 브랜치: staging

---

## 현황 요약

`Student` / `Parent` 분리 모델로 전환 후 초대 코드 연결 로직에서 세 가지 버그 발견.

---

## 버그 목록

### BUG-01. 이미 연결된 자녀 재연결 시 중복 감지 없음
- **파일**: `backend/src/controllers/authController.js` — `linkByCode`
- **증상**: 학부모가 이미 연결된 자녀의 초대 코드를 다시 입력하면 `$addToSet`이 DB 중복은 막지만 `{ linked: true }` 반환 → 프론트에서 "연결되었습니다!" 표시
- **수정**: `$addToSet` 전 `caller.children.includes(partner._id)` 체크 → 중복이면 `{ linked: false, duplicate: true, message: '이미 연결된 자녀입니다.' }` 반환

### BUG-02. 학생이 학부모 코드 입력 후 UI 즉시 미반영
- **파일**: `frontend/src/pages/ProfileSettings.jsx` — `handleLink`
- **증상**: 학생이 학부모 코드 입력 후 "연결되었습니다!" 표시되나 `parentInfo` 재조회 없음 → 학부모 이름 미표시, 연결 폼 비활성화 안 됨
- **수정**: `handleLink` 완료 후 `newUser.role === 'student'`일 때 `authAPI.getParent()` 호출 → `setParentInfo` 업데이트

### BUG-03. 학생이 여러 학부모에 중복 연결 가능
- **파일**: `backend/src/controllers/authController.js` — `linkByCode`
- **증상**: 학생이 다른 학부모 초대 코드를 연속 입력하면 여러 학부모의 `children`에 추가됨. `getParent`는 `findOne`으로 첫 번째만 반환 → 비일관성
- **수정**: 학생이 코드 입력 시 `Parent.findOne({ children: caller._id })` 조회 → 이미 연결된 학부모가 있으면 `{ linked: false, message: '이미 연결된 학부모가 있습니다. 먼저 연결을 해제해주세요.' }` 반환

---

## 수정 계획

### Step 1 — `linkByCode` 수정 (BUG-01 + BUG-03)
**파일**: `backend/src/controllers/authController.js`

```
caller = student:
  → Parent.findOne({ children: caller._id }) 존재하면 → linked: false (이미 연결된 학부모)
  → 없으면 → $addToSet으로 학부모 children에 추가

caller = parent:
  → caller.children.map(String).includes(partner._id.toString()) → linked: false (이미 연결된 자녀)
  → 없으면 → $addToSet으로 내 children에 추가
```

### Step 2 — `ProfileSettings.jsx` 수정 (BUG-02)
**파일**: `frontend/src/pages/ProfileSettings.jsx`

```
handleLink 완료 후:
  if (newUser.role === 'student') {
    authAPI.getParent().then(data => { if (data.parent) setParentInfo(data.parent); })
  }
```

---

## 수정 파일 목록

| 파일 | 버그 |
|------|------|
| `backend/src/controllers/authController.js` | BUG-01, BUG-03 |
| `frontend/src/pages/ProfileSettings.jsx` | BUG-02 |

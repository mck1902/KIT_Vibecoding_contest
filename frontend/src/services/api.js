/* frontend/src/services/api.js
 * 백엔드 API 호출 함수 모음
 * vite.config.js의 proxy 설정으로 /api → http://localhost:5000/api 포워딩됨
 */

export const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

function getToken() {
  return localStorage.getItem('eduwatch_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    // 토큰 만료/무효일 때만 강제 로그아웃 (비밀번호 오류 등 일반 401은 제외)
    if (res.status === 401 && err.message === '유효하지 않은 토큰입니다.') {
      localStorage.removeItem('eduwatch_token');
      localStorage.removeItem('eduwatch_user');
      window.location.href = '/login';
    }
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────
// 인증 API
// ──────────────────────────────────────────────
export const authAPI = {
  /** 초대 코드로 상대방 연결 → { token, user } */
  link: (partnerCode) =>
    request('PUT', '/auth/link', { partnerCode }),

  /** 이름·비밀번호 변경 → { token, user } */
  updateProfile: (data) =>
    request('PATCH', '/auth/profile', data),

  /** 연결된 자녀 목록 조회 (학부모 전용) → { children: [{ name, gradeLevel, studentId }] } */
  getChild: () =>
    request('GET', '/auth/child'),

  /** 연결된 학부모 정보 조회 (학생 전용) → { parent: { name, inviteCode } | null } */
  getParent: () =>
    request('GET', '/auth/parent'),

  /** 연결 해제 → 학생: { message } / 학부모(전체): { token, user } / 학부모(특정 자녀): { token, user } */
  unlink: (studentId = null) =>
    request('DELETE', studentId ? `/auth/link?studentId=${encodeURIComponent(studentId)}` : '/auth/link'),
};

// ──────────────────────────────────────────────
// 세션 API
// ──────────────────────────────────────────────
export const sessionAPI = {
  /** 새 학습 세션 시작 → { _id, studentId, lectureId, subject, startTime } */
  start: (lectureId, subject) =>
    request('POST', '/sessions', { lectureId, subject }),

  /** 세션 종료 — abandoned: true이면 포인트 미지급 (강의 전환 등 중도 이탈) */
  end: (sessionId, abandoned = false, watchedSec = 0) =>
    request('PUT', `/sessions/${sessionId}/end`, { abandoned, watchedSec }),

  /** 집중도 기록 배열 일괄 저장 */
  addRecords: (sessionId, records) =>
    request('POST', `/sessions/${sessionId}/records`, { records }),

  /** 탭 이탈 기록 저장 */
  addDeparture: (sessionId, departure) =>
    request('POST', `/sessions/${sessionId}/departures`, departure),

  /** 일시정지 기록 저장 */
  addPauseEvent: (sessionId, pauseEvent) =>
    request('POST', `/sessions/${sessionId}/pause-events`, pauseEvent),

  /** 규칙 기반 리포트 조회 → { sessionId, avgFocus, totalSec, departureCount, chartData, tips, ... } */
  getReport: (sessionId) =>
    request('GET', `/sessions/${sessionId}/report`),

  /** AI RAG 맞춤형 분석 조회 → { ragAnalysis: string } */
  getRagAnalysis: (sessionId) =>
    request('GET', `/sessions/${sessionId}/rag-analysis`),

  /** 세션 상세 조회 */
  getById: (sessionId) =>
    request('GET', `/sessions/${sessionId}`),

  /** 퀴즈 생성 (저집중 구간 기반) */
  generateQuiz: (sessionId) =>
    request('POST', `/sessions/${sessionId}/quiz`, {}),

  /** 퀴즈 조회 → { quiz: Quiz | null } (미생성 시 quiz: null) */
  getQuiz: (sessionId) =>
    request('GET', `/sessions/${sessionId}/quiz`),

  /** 퀴즈 제출 → { quiz: Quiz 전체 문서 } */
  submitQuiz: (sessionId, answers) =>
    request('PUT', `/sessions/${sessionId}/quiz/submit`, { answers }),

  /** 로그인 사용자의 세션 목록 조회 (역할별 자동 필터) */
  getAll: () =>
    request('GET', '/sessions'),
};

// ──────────────────────────────────────────────
// 에듀포인트 API
// ──────────────────────────────────────────────
export const edupointAPI = {
  /** 포인트 설정 & 잔액 조회 → EduPoint 문서 (미설정 시 initialized: false + 기본값) */
  get: (studentId) =>
    request('GET', `/edupoint/${studentId}`),

  /** 포인트 설정 변경 (학부모 전용, upsert) */
  updateSettings: (studentId, settings) =>
    request('PUT', `/edupoint/${studentId}/settings`, settings),

  /** 포인트 충전 — 시뮬레이션 (학부모 전용) */
  charge: (studentId, amount) =>
    request('POST', `/edupoint/${studentId}/charge`, { amount }),

  /** 포인트 내역 조회 → { history: [...], total: N } */
  getHistory: (studentId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/edupoint/${studentId}/history${query ? '?' + query : ''}`);
  },
};

// ──────────────────────────────────────────────
// 강좌 API
// ──────────────────────────────────────────────
export const lectureAPI = {
  /** 강좌 목록 조회 */
  getAll: () => request('GET', '/lectures'),

  /** 강좌 자막 분석 트리거 (AI API → segments 저장) */
  analyze: (lectureId) => request('POST', `/lectures/${lectureId}/analyze`, {}),
};

// ──────────────────────────────────────────────
// 헬스체크
// ──────────────────────────────────────────────
export const healthCheck = () => request('GET', '/health');

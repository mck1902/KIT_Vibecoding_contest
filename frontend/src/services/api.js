/* frontend/src/services/api.js
 * 백엔드 API 호출 함수 모음
 * vite.config.js의 proxy 설정으로 /api → http://localhost:5000/api 포워딩됨
 */

const BASE_URL = '/api';

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
    if (res.status === 401) {
      localStorage.removeItem('eduwatch_token');
      localStorage.removeItem('eduwatch_user');
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({}));
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
};

// ──────────────────────────────────────────────
// 세션 API
// ──────────────────────────────────────────────
export const sessionAPI = {
  /** 새 학습 세션 시작 → { _id, studentId, lectureId, subject, startTime } */
  start: (lectureId, subject) =>
    request('POST', '/sessions', { lectureId, subject }),

  /** 세션 종료 */
  end: (sessionId) =>
    request('PUT', `/sessions/${sessionId}/end`, {}),

  /** 집중도 기록 배열 일괄 저장 */
  addRecords: (sessionId, records) =>
    request('POST', `/sessions/${sessionId}/records`, { records }),

  /** 탭 이탈 기록 저장 */
  addDeparture: (sessionId, departure) =>
    request('POST', `/sessions/${sessionId}/departures`, departure),

  /** 규칙 기반 리포트 조회 → { sessionId, avgFocus, totalSec, departureCount, chartData, tips, ... } */
  getReport: (sessionId) =>
    request('GET', `/sessions/${sessionId}/report`),

  /** Claude RAG 맞춤형 분석 조회 → { ragAnalysis: string } */
  getRagAnalysis: (sessionId) =>
    request('GET', `/sessions/${sessionId}/rag-analysis`),

  /** 세션 상세 조회 */
  getById: (sessionId) =>
    request('GET', `/sessions/${sessionId}`),

  /** 로그인 사용자의 세션 목록 조회 (역할별 자동 필터) */
  getAll: () =>
    request('GET', '/sessions'),
};

// ──────────────────────────────────────────────
// 강좌 API
// ──────────────────────────────────────────────
export const lectureAPI = {
  /** 강좌 목록 조회 */
  getAll: () => request('GET', '/lectures'),

  /** 강좌 자막 분석 트리거 (Claude API → segments 저장) */
  analyze: (lectureId) => request('POST', `/lectures/${lectureId}/analyze`, {}),
};

// ──────────────────────────────────────────────
// 헬스체크
// ──────────────────────────────────────────────
export const healthCheck = () => request('GET', '/health');

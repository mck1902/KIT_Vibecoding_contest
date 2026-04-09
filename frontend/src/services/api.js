/* frontend/src/services/api.js
 * 백엔드 API 호출 함수 모음
 * vite.config.js의 proxy 설정으로 /api → http://localhost:5000/api 포워딩됨
 */

const BASE_URL = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────
// 세션 API
// ──────────────────────────────────────────────
export const sessionAPI = {
  /** 새 학습 세션 시작 → { _id, studentId, lectureId, subject, startTime } */
  start: (studentId, lectureId, subject) =>
    request('POST', '/sessions', { studentId, lectureId, subject }),

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

  /** 학생의 세션 목록 조회 */
  getByStudent: (studentId) =>
    request('GET', `/sessions?studentId=${studentId}`),
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

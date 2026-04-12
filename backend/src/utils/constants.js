const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };
const STATUS_LABEL = { 1: '집중+흥미', 2: '집중+차분', 3: '비집중', 4: '지루함', 5: '졸음' };

/**
 * 집중도 점수 반환
 * focusProb이 있으면(새 방식: 집중 클래스 확률 합) 그대로 사용
 * 없으면(기존 데이터) status + confidence 기반 계산으로 폴백
 */
function calcFocus(status, confidence = 1, focusProb = null) {
  if (focusProb != null) return Math.round(focusProb);
  const base = STATUS_TO_FOCUS[status] || 50;
  const conf = Math.max(0, Math.min(1, confidence || 1));
  return Math.round(base * conf + 50 * (1 - conf));
}

module.exports = { STATUS_TO_FOCUS, STATUS_LABEL, calcFocus };

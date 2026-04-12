const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };
const STATUS_LABEL = { 1: '집중+흥미', 2: '집중+차분', 3: '비집중', 4: '지루함', 5: '졸음' };

/**
 * status(1~5)와 confidence(0~1)를 결합하여 집중도 점수 반환
 * confidence가 낮으면 중립(50%)으로 보정
 */
function calcFocus(status, confidence = 1) {
  const base = STATUS_TO_FOCUS[status] || 50;
  const conf = Math.max(0, Math.min(1, confidence || 1));
  return Math.round(base * conf + 50 * (1 - conf));
}

module.exports = { STATUS_TO_FOCUS, STATUS_LABEL, calcFocus };

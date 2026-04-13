const { calcFocus } = require('./constants');

/**
 * 세션 데이터를 기반으로 규칙 기반 AI 코칭 팁 생성
 */
function generateRuleBasedTips({ records, departures, avgFocus }) {
  const tips = [];

  // 탭 이탈 관련
  if (departures.length > 0) {
    const totalSec = Math.round(
      departures.reduce((sum, d) => sum + (d.duration || 0), 0) / 1000
    );
    tips.push(
      `총 ${departures.length}회 탭 이탈이 감지되었습니다. 누적 이탈 시간은 약 ${totalSec}초입니다. 학습 중 스마트폰이나 다른 탭 사용을 줄여보세요.`
    );
  }

  // 평균 집중도 관련
  if (avgFocus < 60) {
    tips.push(
      `평균 집중도가 ${avgFocus}%로 낮습니다. 학습 환경을 점검하고, 짧은 휴식 후 다시 학습하는 것을 권장합니다.`
    );
  } else if (avgFocus >= 85) {
    tips.push(`평균 집중도 ${avgFocus}%로 매우 우수합니다! 오늘 학습 태도가 훌륭했습니다.`);
  } else {
    tips.push(`평균 집중도 ${avgFocus}%로 양호한 학습을 유지했습니다.`);
  }

  // 졸음 빈도 관련
  if (records.length > 0) {
    const sleepCount = records.filter(r => r.status === 5).length;
    const sleepRatio = sleepCount / records.length;
    if (sleepRatio > 0.2) {
      tips.push(
        `학습 중 졸음 상태가 자주 감지되었습니다. 충분한 수면과 규칙적인 수면 습관이 필요합니다.`
      );
    }
  }

  if (tips.length === 0) {
    tips.push('오늘 학습 세션이 순조롭게 진행되었습니다. 내일도 꾸준히 이어가요!');
  }

  return tips;
}

/**
 * records 배열을 1분 단위 차트 데이터로 변환
 * X축: 세션 시작 기준 경과 시간 (0분, 1분, ...)
 * pauseEvents가 있으면 일시정지 기간의 레코드를 제외
 */
function buildChartData(records, pauseEvents = []) {
  if (!records || records.length === 0) return [];

  let filtered = records;
  if (pauseEvents.length > 0) {
    const pauseRanges = pauseEvents
      .filter(p => p.pauseTime && p.resumeTime)
      .map(p => [new Date(p.pauseTime).getTime(), new Date(p.resumeTime).getTime()]);

    if (pauseRanges.length > 0) {
      filtered = records.filter(r => {
        const t = new Date(r.timestamp).getTime();
        return !pauseRanges.some(([start, end]) => t >= start && t <= end);
      });
    }
  }

  if (filtered.length === 0) return [];

  const firstMs = new Date(filtered[0].timestamp).getTime();
  const byMinute = {};

  for (const r of filtered) {
    const elapsed = Math.floor((new Date(r.timestamp).getTime() - firstMs) / 60000);
    const key = `${elapsed}분`;
    if (!byMinute[key]) byMinute[key] = [];
    byMinute[key].push(calcFocus(r.status, r.confidence, r.focusProb));
  }

  return Object.entries(byMinute).map(([time, vals]) => ({
    time,
    focus: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
  }));
}

module.exports = { generateRuleBasedTips, buildChartData };

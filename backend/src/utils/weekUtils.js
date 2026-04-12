/**
 * KST(한국 표준시, UTC+9) 기준 주간 범위 유틸리티
 * - DB 쿼리용 UTC Date 반환
 */

const KST_OFFSET = 9 * 60 * 60 * 1000;

/**
 * 주어진 날짜가 속한 KST 기준 주의 월요일 00:00 ~ 다음 월요일 00:00 (UTC) 반환
 * @param {Date} date - 기준 날짜 (기본: 현재)
 * @returns {{ weekStart: Date, weekEnd: Date }}
 */
function getWeekRangeKST(date = new Date()) {
  const kstNow = new Date(date.getTime() + KST_OFFSET);
  const day = kstNow.getUTCDay(); // 0=일, 1=월, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(kstNow);
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  // KST → UTC로 되돌려서 DB 쿼리에 사용
  const weekStart = new Date(monday.getTime() - KST_OFFSET);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { weekStart, weekEnd };
}

/**
 * 다음 주 월요일 KST 00:00을 UTC Date로 반환
 * 설정 변경 시 소급 방지용 (settingsEffectiveFrom)
 * @param {Date} date - 기준 날짜 (기본: 현재)
 * @returns {Date}
 */
function getNextMondayKST(date = new Date()) {
  const { weekEnd } = getWeekRangeKST(date);
  // weekEnd는 이미 다음 주 월요일 KST 00:00 (UTC)
  return weekEnd;
}

/**
 * 이번 주 월요일 KST 00:00을 UTC Date로 반환
 * 최초 설정(upsert) 시 즉시 적용용 (settingsEffectiveFrom)
 * @param {Date} date - 기준 날짜 (기본: 현재)
 * @returns {Date}
 */
function getCurrentMondayKST(date = new Date()) {
  const { weekStart } = getWeekRangeKST(date);
  return weekStart;
}

module.exports = { getWeekRangeKST, getNextMondayKST, getCurrentMondayKST };

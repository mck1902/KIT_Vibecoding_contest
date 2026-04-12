const { getWeekRangeKST, getNextMondayKST, getCurrentMondayKST } = require('../../utils/weekUtils');
const { calcFocus } = require('../../utils/constants');

describe('getWeekRangeKST', () => {
  test('월요일 오전 KST → 해당 주', () => {
    // 2026-04-13 09:00 KST = 2026-04-13 00:00 UTC
    const date = new Date('2026-04-13T00:00:00.000Z');
    const { weekStart, weekEnd } = getWeekRangeKST(date);
    // weekStart = 4/13 월 00:00 KST = 4/12 15:00 UTC
    expect(weekStart.toISOString()).toBe('2026-04-12T15:00:00.000Z');
    expect(weekEnd.toISOString()).toBe('2026-04-19T15:00:00.000Z');
  });

  test('일요일 심야 KST → 같은 주', () => {
    // 2026-04-19 23:59 KST = 2026-04-19 14:59 UTC
    const date = new Date('2026-04-19T14:59:00.000Z');
    const { weekStart } = getWeekRangeKST(date);
    expect(weekStart.toISOString()).toBe('2026-04-12T15:00:00.000Z');
  });

  test('경계: 월요일 00:00 정각 KST → 이번 주에 포함', () => {
    // 2026-04-13 00:00:00 KST = 2026-04-12 15:00:00 UTC
    const date = new Date('2026-04-12T15:00:00.000Z');
    const { weekStart } = getWeekRangeKST(date);
    expect(weekStart.toISOString()).toBe('2026-04-12T15:00:00.000Z');
  });

  test('경계: 일요일→월요일 넘어가는 순간', () => {
    // 일요일 23:59:59 KST = 2026-04-19 14:59:59 UTC
    const sunday = new Date('2026-04-19T14:59:59.000Z');
    const { weekStart: ws1 } = getWeekRangeKST(sunday);
    expect(ws1.toISOString()).toBe('2026-04-12T15:00:00.000Z');

    // 월요일 00:00:00 KST = 2026-04-19 15:00:00 UTC
    const monday = new Date('2026-04-19T15:00:00.000Z');
    const { weekStart: ws2 } = getWeekRangeKST(monday);
    expect(ws2.toISOString()).toBe('2026-04-19T15:00:00.000Z');
  });

  test('UTC 자정 ≠ KST 자정', () => {
    // 2026-04-13 00:00 UTC = 4/13 09:00 KST → 4/13 주
    const date = new Date('2026-04-13T00:00:00.000Z');
    const { weekStart } = getWeekRangeKST(date);
    expect(weekStart.toISOString()).toBe('2026-04-12T15:00:00.000Z');
  });

  test('UTC 일요일 15:00 = KST 월요일 00:00 → 새 주 시작', () => {
    const date = new Date('2026-04-12T15:00:00.000Z');
    const { weekStart } = getWeekRangeKST(date);
    expect(weekStart.toISOString()).toBe('2026-04-12T15:00:00.000Z');
  });
});

describe('getNextMondayKST', () => {
  test('다음 주 월요일 반환', () => {
    const date = new Date('2026-04-13T00:00:00.000Z'); // 월 09:00 KST
    const next = getNextMondayKST(date);
    expect(next.toISOString()).toBe('2026-04-19T15:00:00.000Z');
  });
});

describe('getCurrentMondayKST', () => {
  test('이번 주 월요일 반환', () => {
    const date = new Date('2026-04-15T00:00:00.000Z'); // 수 09:00 KST
    const current = getCurrentMondayKST(date);
    expect(current.toISOString()).toBe('2026-04-12T15:00:00.000Z');
  });
});

describe('calcFocus', () => {
  test('status 1, confidence 1 → 95', () => {
    expect(calcFocus(1, 1)).toBe(95);
  });

  test('status 3, confidence 1 → 55', () => {
    expect(calcFocus(3, 1)).toBe(55);
  });

  test('status 5, confidence 1 → 15', () => {
    expect(calcFocus(5, 1)).toBe(15);
  });

  test('confidence 0 → falsy이므로 기본값 1 적용 (기존 구현)', () => {
    // calcFocus 내부: confidence || 1 → 0은 falsy라 1로 처리
    expect(calcFocus(1, 0)).toBe(95);
    expect(calcFocus(5, 0)).toBe(15);
  });

  test('confidence 0.5 → base와 50 사이 보간', () => {
    // calcFocus(1, 0.5) = round(95 * 0.5 + 50 * 0.5) = round(72.5) = 73
    expect(calcFocus(1, 0.5)).toBe(73);
  });
});

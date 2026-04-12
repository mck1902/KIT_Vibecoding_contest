const request = require('supertest');
const app = require('../app');
const Session = require('../../models/Session');
const EduPoint = require('../../models/EduPoint');
const PointHistory = require('../../models/PointHistory');
const { getWeekRangeKST } = require('../../utils/weekUtils');
const {
  getStudentToken,
  createTestParentWithChild,
  createTestEduPoint,
  createTestSession,
  makeRecords,
} = require('../setup');

describe('주간 보너스 테스트', () => {
  let parent, token;
  const settings = {
    targetRate: 50,
    rewardPerSession: 100,
    weeklyBonusCount: 3,
    weeklyBonusReward: 500,
  };

  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    token = getStudentToken('STU001');
  });

  async function completeSession() {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));
    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`);
    return res;
  }

  describe('정상 흐름', () => {
    test('3회 달성 → 주간 보너스 지급', async () => {
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings,
      });

      // 3회 세션 달성
      await completeSession();
      await completeSession();
      const res = await completeSession();

      expect(res.body.weeklyBonus).toBe(500);

      const bonus = await PointHistory.findOne({ studentId: 'STU001', type: 'weekly_bonus' });
      expect(bonus).toBeTruthy();
      expect(bonus.amount).toBe(500);
    });

    test('2회 달성 → 보너스 미지급', async () => {
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings,
      });

      await completeSession();
      const res = await completeSession();

      expect(res.body.weeklyBonus).toBeNull();

      const bonus = await PointHistory.findOne({ studentId: 'STU001', type: 'weekly_bonus' });
      expect(bonus).toBeNull();
    });
  });

  describe('중복/경계', () => {
    test('같은 주 4회 달성 → 추가 보너스 없음 (주당 1회)', async () => {
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings,
      });

      await completeSession();
      await completeSession();
      await completeSession(); // 3회 → 보너스 지급
      await completeSession(); // 4회 → 추가 보너스 없음

      const bonuses = await PointHistory.find({ studentId: 'STU001', type: 'weekly_bonus' });
      expect(bonuses).toHaveLength(1);
    });

    test('보너스 잔액 부족 → weekly_bonus_failed 기록', async () => {
      // 세션 보상 300 (3 * 100) + 보너스 500 필요 → 잔액 350이면 보너스 부족
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 350,
        settings,
      });

      await completeSession();
      await completeSession();
      await completeSession(); // 3회째: 세션 보상은 되지만 보너스 잔액 부족

      const failed = await PointHistory.findOne({ studentId: 'STU001', type: 'weekly_bonus_failed' });
      expect(failed).toBeTruthy();
      expect(failed.reason).toBe('잔액부족');

      // 세션 보상은 3회 다 지급되었는지 확인
      const earns = await PointHistory.find({ studentId: 'STU001', type: 'earn' });
      expect(earns).toHaveLength(3);
    });
  });

  describe('설정 변경 소급 방지', () => {
    test('주 중 조건 완화 → 이번 주는 이전 설정 적용', async () => {
      const { getNextMondayKST } = require('../../utils/weekUtils');

      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings: { ...settings, weeklyBonusCount: 5 },
        // settingsEffectiveFrom을 다음 주로 설정 → 이번 주는 previousSettings 적용
        settingsEffectiveFrom: getNextMondayKST(),
        previousSettings: {
          weeklyBonusCount: 5,
          weeklyBonusReward: 500,
        },
      });

      // 3회 달성 (현재 settings는 count=3이지만, 이번 주는 previous의 count=5 적용)
      await completeSession();
      await completeSession();
      const res = await completeSession();

      // previous count=5이므로 3회로는 보너스 미달
      expect(res.body.weeklyBonus).toBeNull();
    });
  });
});

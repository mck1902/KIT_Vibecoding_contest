const request = require('supertest');
const app = require('../app');
const Session = require('../../models/Session');
const EduPoint = require('../../models/EduPoint');
const PointHistory = require('../../models/PointHistory');
const {
  getStudentToken,
  createTestStudent,
  createTestParentWithChild,
  createTestEduPoint,
  createTestSession,
  createTestLecture,
  makeRecords,
} = require('../setup');

describe('포인트 지급 테스트', () => {
  let parent, student, token;

  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    student = result.student;
    token = getStudentToken('STU001');
  });

  describe('정상 흐름', () => {
    test('목표 달성 → 포인트 지급', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      // status 1 (95%) > targetRate 50, watchedSec=950 → completionRate=95 >= 90
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      expect(res.status).toBe(200);
      expect(res.body.pointEarned).toBe(100);
      expect(res.body.studentEarned).toBe(100);

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(9900);
      expect(ep.studentEarned).toBe(100);
    });

    test('목표 미달 → 미지급', async () => {
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings: { targetRate: 90, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      // status 3 (55%) < targetRate 90
      const session = await createTestSession('STU001', 'LEC001', makeRecords(3, 10));

      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.pointEarned).toBe(0);

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(10000); // 변동 없음
    });

    test('EduPoint 미설정 → 포인트 로직 스킵, 세션 정상 종료', async () => {
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.endTime).toBeTruthy();
      expect(res.body.pointEarned).toBe(0);
    });
  });

  describe('중복 지급 방어', () => {
    test('이미 종료된 세션 재호출 → 기존 결과 반환, 포인트 변동 없음', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      // 첫 번째 종료
      await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      // 두 번째 종료 (idempotency)
      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      expect(res.status).toBe(200);

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(9900); // 한 번만 차감
    });

    test('동시 호출 시뮬레이션 → 1회만 지급', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 10000,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      // 동시 호출
      const [res1, res2] = await Promise.all([
        request(app).put(`/api/sessions/${session._id}/end`).set('Authorization', `Bearer ${token}`).send({ watchedSec: 950 }),
        request(app).put(`/api/sessions/${session._id}/end`).set('Authorization', `Bearer ${token}`).send({ watchedSec: 950 }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(9900); // 한 번만 차감

      const history = await PointHistory.find({ sessionId: session._id, type: 'earn' });
      expect(history).toHaveLength(1);
    });
  });

  describe('잔액 경계값', () => {
    test('잔액 = 보상액 정확히 일치 → 지급 성공, balance = 0', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 100,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      expect(res.body.pointEarned).toBe(100);
      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(0);
    });

    test('잔액 < 보상액 (1 부족) → 미지급, 롤백', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 99,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      const res = await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      expect(res.status).toBe(200);

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(99); // 변동 없음

      const sess = await Session.findById(session._id);
      expect(sess.pointAwarded).toBe(false); // 롤백됨
    });

    test('잔액 0 → 미지급', async () => {
      await createTestLecture('LEC001', 1000);
      await createTestEduPoint(parent._id, 'STU001', {
        balance: 0,
        settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
      });
      const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

      await request(app)
        .put(`/api/sessions/${session._id}/end`)
        .set('Authorization', `Bearer ${token}`)
        .send({ watchedSec: 950 });

      const ep = await EduPoint.findOne({ studentId: 'STU001' });
      expect(ep.balance).toBe(0);
      expect(ep.studentEarned).toBe(0);
    });
  });

  describe('다자녀 시나리오', () => {
    test('자녀별 독립 잔액', async () => {
      const result2 = await createTestParentWithChild('STU002');
      await createTestEduPoint(parent._id, 'STU001', { balance: 5000 });
      await createTestEduPoint(result2.parent._id, 'STU002', { balance: 0 });

      const ep1 = await EduPoint.findOne({ studentId: 'STU001' });
      const ep2 = await EduPoint.findOne({ studentId: 'STU002' });
      expect(ep1.balance).toBe(5000);
      expect(ep2.balance).toBe(0);
    });
  });
});

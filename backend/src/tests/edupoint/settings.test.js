const request = require('supertest');
const app = require('../app');
const EduPoint = require('../../models/EduPoint');
const {
  getParentToken,
  createTestParentWithChild,
} = require('../setup');

describe('에듀포인트 설정 API', () => {
  let parent, token;

  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    token = getParentToken(parent._id.toString());
  });

  test('최초 GET — 문서 미존재 시 기본값 + initialized: false', async () => {
    const res = await request(app)
      .get('/api/edupoint/STU001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.initialized).toBe(false);
    expect(res.body.balance).toBe(0);
    expect(res.body.settings.targetRate).toBe(70);
  });

  test('최초 PUT — upsert로 문서 생성, settingsEffectiveFrom = 현재 주 월요일', async () => {
    const res = await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 80, rewardPerSession: 200, weeklyBonusCount: 3, weeklyBonusReward: 1000 });
    expect(res.status).toBe(200);
    expect(res.body.initialized).toBe(true);
    expect(res.body.settings.targetRate).toBe(80);
    expect(res.body.settingsEffectiveFrom).toBeTruthy();
  });

  test('PUT 후 GET — initialized: true', async () => {
    await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 80, rewardPerSession: 200, weeklyBonusCount: 3, weeklyBonusReward: 1000 });

    const res = await request(app)
      .get('/api/edupoint/STU001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.initialized).toBe(true);
    expect(res.body.settings.targetRate).toBe(80);
  });

  test('유효성 실패: targetRate > 95 → 400', async () => {
    const res = await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 99, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 });
    expect(res.status).toBe(400);
  });

  test('유효성 실패: targetRate < 50 → 400', async () => {
    const res = await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 30, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 });
    expect(res.status).toBe(400);
  });

  test('유효성 실패: rewardPerSession = 0 → 400', async () => {
    const res = await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 70, rewardPerSession: 0, weeklyBonusCount: 5, weeklyBonusReward: 500 });
    expect(res.status).toBe(400);
  });

  test('설정 변경 시 소급 방지 — settingsEffectiveFrom = 다음 주, previousSettings 보존', async () => {
    // 최초 설정
    await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 70, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 });

    // 변경
    const res = await request(app)
      .put('/api/edupoint/STU001/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetRate: 80, rewardPerSession: 200, weeklyBonusCount: 3, weeklyBonusReward: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.settings.weeklyBonusCount).toBe(3);
    expect(res.body.previousSettings.weeklyBonusCount).toBe(5);
    expect(res.body.previousSettings.weeklyBonusReward).toBe(500);

    // settingsEffectiveFrom이 현재보다 미래여야 함 (다음 주 월요일)
    const effectiveDate = new Date(res.body.settingsEffectiveFrom);
    expect(effectiveDate.getTime()).toBeGreaterThan(Date.now());
  });
});

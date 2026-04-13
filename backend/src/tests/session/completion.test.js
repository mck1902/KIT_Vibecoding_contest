const request = require('supertest');
const app = require('../app');
const Session = require('../../models/Session');
const EduPoint = require('../../models/EduPoint');
const {
  getStudentToken,
  createTestParentWithChild,
  createTestEduPoint,
  createTestSession,
  createTestLecture,
  makeRecords,
} = require('../setup');

describe('completionRate 계산', () => {
  let token;

  beforeEach(async () => {
    await createTestParentWithChild('STU001');
    token = getStudentToken('STU001');
  });

  test('watchedSec=500, durationSec=1000 → completionRate=50, 응답에 포함', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 500 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(50);
  });

  test('watchedSec=950, durationSec=1000 → completionRate=95, 응답에 포함', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(95);
  });

  test('watchedSec=1100 (초과) → completionRate=100 (clamp)', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 1100 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(100);
  });

  test('Lecture 없음 → completionRate=0 (방어 처리)', async () => {
    // Lecture 생성 안 함 → durationSec=0 → completionRate=0
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 900 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(0);
  });
});

describe('입력 검증 (validate 미들웨어)', () => {
  let token;

  beforeEach(async () => {
    await createTestParentWithChild('STU001');
    token = getStudentToken('STU001');
  });

  test('watchedSec 누락 → 200, completionRate=0 (default)', async () => {
    await createTestLecture('LEC001', 1000);
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({}); // watchedSec 없음 → default 0

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(0);
  });

  test('watchedSec=-1 → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: -1 });

    expect(res.status).toBe(400);
  });

  test('watchedSec="abc" (문자열) → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 'abc' });

    expect(res.status).toBe(400);
  });

  test('watchedSec=Infinity (브라우저에서 null로 직렬화) → 400', async () => {
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    // JSON.stringify({watchedSec: Infinity}) === '{"watchedSec":null}'
    // null은 z.number()가 거부 → 400
    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: null });

    expect(res.status).toBe(400);
  });
});

describe('포인트 지급 정책 (completionRate + focusRate 연동)', () => {
  let parent, token;

  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    token = getStudentToken('STU001');
  });

  test('watchedSec=500 (50%) + 높은 집중률 → pointEarned=0 (완강 미달)', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    // status 1 → 집중률 높음, 그러나 completionRate=50 < 90 이므로 미지급
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 500 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(50);
    expect(res.body.pointEarned).toBe(0);

    const ep = await EduPoint.findOne({ studentId: 'STU001' });
    expect(ep.balance).toBe(10000); // 변동 없음
  });

  test('watchedSec=950 (95%) + 집중률 >= targetRate → pointEarned > 0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    // status 1 → 집중률 높음, completionRate=95 >= 90 → 지급
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(95);
    expect(res.body.pointEarned).toBe(100);

    const ep = await EduPoint.findOne({ studentId: 'STU001' });
    expect(ep.balance).toBe(9900);
  });

  test('watchedSec=950 (95%) + 집중률 < targetRate → pointEarned=0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 90, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    // status 3 → 집중률 낮음 (55%) < targetRate 90 → 미지급
    const session = await createTestSession('STU001', 'LEC001', makeRecords(3, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.completionRate).toBe(95);
    expect(res.body.pointEarned).toBe(0);

    const ep = await EduPoint.findOne({ studentId: 'STU001' });
    expect(ep.balance).toBe(10000); // 변동 없음
  });

  test('abandoned=true + watchedSec=950 → pointEarned=0', async () => {
    await createTestLecture('LEC001', 1000);
    await createTestEduPoint(parent._id, 'STU001', {
      balance: 10000,
      settings: { targetRate: 50, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 },
    });
    const session = await createTestSession('STU001', 'LEC001', makeRecords(1, 10));

    const res = await request(app)
      .put(`/api/sessions/${session._id}/end`)
      .set('Authorization', `Bearer ${token}`)
      .send({ abandoned: true, watchedSec: 950 });

    expect(res.status).toBe(200);
    expect(res.body.pointEarned).toBe(0);

    const ep = await EduPoint.findOne({ studentId: 'STU001' });
    expect(ep.balance).toBe(10000); // 변동 없음
  });
});

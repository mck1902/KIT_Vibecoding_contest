const request = require('supertest');
const app = require('../app');
const PointHistory = require('../../models/PointHistory');
const {
  getParentToken,
  createTestParentWithChild,
  createTestEduPoint,
} = require('../setup');

describe('에듀포인트 충전 API', () => {
  let parent, token;

  beforeEach(async () => {
    const result = await createTestParentWithChild('STU001');
    parent = result.parent;
    token = getParentToken(parent._id.toString());
    await createTestEduPoint(parent._id, 'STU001', { balance: 0 });
  });

  test('정상 충전 5000P → balance += 5000, PointHistory 생성', async () => {
    const res = await request(app)
      .post('/api/edupoint/STU001/charge')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(5000);
    expect(res.body.charged).toBe(5000);

    const history = await PointHistory.find({ studentId: 'STU001', type: 'charge' });
    expect(history).toHaveLength(1);
    expect(history[0].amount).toBe(5000);
  });

  test('허용되지 않은 금액 3000 → 400', async () => {
    const res = await request(app)
      .post('/api/edupoint/STU001/charge')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 3000 });
    expect(res.status).toBe(400);
  });

  test('설정 미완료 상태에서 충전 → 400', async () => {
    const result2 = await createTestParentWithChild('STU002');
    const token2 = getParentToken(result2.parent._id.toString());
    // EduPoint 미생성

    const res = await request(app)
      .post('/api/edupoint/STU002/charge')
      .set('Authorization', `Bearer ${token2}`)
      .send({ amount: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/설정/);
  });

  test('연속 충전 → balance 누적', async () => {
    await request(app)
      .post('/api/edupoint/STU001/charge')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000 });

    const res = await request(app)
      .post('/api/edupoint/STU001/charge')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe(10000);

    const history = await PointHistory.find({ studentId: 'STU001', type: 'charge' });
    expect(history).toHaveLength(2);
  });
});

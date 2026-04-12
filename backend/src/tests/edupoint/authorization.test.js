const request = require('supertest');
const app = require('../app');
const {
  getStudentToken,
  getParentToken,
  createTestStudent,
  createTestParentWithChild,
} = require('../setup');

describe('에듀포인트 권한 테스트', () => {
  describe('학생 접근 제어', () => {
    test('자기 포인트 조회 → 200', async () => {
      await createTestStudent('STU001');
      const token = getStudentToken('STU001');
      const res = await request(app)
        .get('/api/edupoint/STU001')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    test('타인 포인트 조회 → 403', async () => {
      await createTestStudent('STU001');
      const token = getStudentToken('STU001');
      const res = await request(app)
        .get('/api/edupoint/STU002')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/본인/);
    });

    test('학생이 설정 변경 시도 → 403', async () => {
      const token = getStudentToken('STU001');
      const res = await request(app)
        .put('/api/edupoint/STU001/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetRate: 70, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 });
      expect(res.status).toBe(403);
    });

    test('학생이 충전 시도 → 403', async () => {
      const token = getStudentToken('STU001');
      const res = await request(app)
        .post('/api/edupoint/STU001/charge')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 });
      expect(res.status).toBe(403);
    });
  });

  describe('학부모 접근 제어', () => {
    test('연결된 자녀 조회 → 200', async () => {
      const { parent } = await createTestParentWithChild('STU001');
      const token = getParentToken(parent._id.toString());
      const res = await request(app)
        .get('/api/edupoint/STU001')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    test('미연결 자녀 조회 → 403', async () => {
      const { parent } = await createTestParentWithChild('STU001');
      const token = getParentToken(parent._id.toString());
      const res = await request(app)
        .get('/api/edupoint/STU999')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/연결되지 않은/);
    });

    test('미연결 자녀 설정 변경 → 403', async () => {
      const { parent } = await createTestParentWithChild('STU001');
      const token = getParentToken(parent._id.toString());
      const res = await request(app)
        .put('/api/edupoint/STU999/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetRate: 70, rewardPerSession: 100, weeklyBonusCount: 5, weeklyBonusReward: 500 });
      expect(res.status).toBe(403);
    });

    test('미연결 자녀 충전 → 403', async () => {
      const { parent } = await createTestParentWithChild('STU001');
      const token = getParentToken(parent._id.toString());
      const res = await request(app)
        .post('/api/edupoint/STU999/charge')
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1000 });
      expect(res.status).toBe(403);
    });
  });

  describe('인증 없음', () => {
    test('토큰 없이 접근 → 401', async () => {
      const res = await request(app).get('/api/edupoint/STU001');
      expect(res.status).toBe(401);
    });

    test('잘못된 토큰 → 401', async () => {
      const res = await request(app)
        .get('/api/edupoint/STU001')
        .set('Authorization', 'Bearer invalid.token.here');
      expect(res.status).toBe(401);
    });
  });
});

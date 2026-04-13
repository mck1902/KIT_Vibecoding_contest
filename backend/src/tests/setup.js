const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
const EduPoint = require('../models/EduPoint');
const Session = require('../models/Session');
const Lecture = require('../models/Lecture');

// 트랜잭션 테스트를 위해 ReplSet 사용
let replSet;

// JWT secret — 테스트 환경
const JWT_SECRET = 'test-secret-key-for-jest';

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = replSet.getUri();

  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  await mongoose.connect(uri);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const col of Object.values(collections)) {
    await col.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

// ── 인증 헬퍼 ──────────────────────────────────

function getStudentToken(studentId = 'STU001', name = '테스트학생') {
  return jwt.sign(
    { id: new mongoose.Types.ObjectId().toString(), role: 'student', studentId, name },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

function getParentToken(parentId) {
  return jwt.sign(
    { id: parentId, role: 'parent', name: '테스트학부모' },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

// ── 데이터 헬퍼 ─────────────────────────────────

let counter = 0;
function uid() { return `${Date.now()}-${++counter}`; }

async function createTestStudent(studentId = 'STU001', name = '테스트학생') {
  const id = uid();
  return Student.create({
    email: `${studentId.toLowerCase()}-${id}@test.com`,
    passwordHash: '$2a$10$dummyHashForTestingOnly000000000000000000000000000000',
    name,
    studentId,
    gradeLevel: 'high',
    inviteCode: `S${id}`,
  });
}

async function createTestParentWithChild(studentId = 'STU001') {
  const student = await createTestStudent(studentId);
  const id = uid();
  const parent = await Parent.create({
    email: `parent-${studentId.toLowerCase()}-${id}@test.com`,
    passwordHash: '$2a$10$dummyHashForTestingOnly000000000000000000000000000000',
    name: '테스트학부모',
    children: [student._id],
    inviteCode: `P${id}`,
  });
  return { parent, student };
}

async function createTestEduPoint(parentId, studentId, overrides = {}) {
  return EduPoint.create({
    parentId,
    studentId,
    balance: 10000,
    studentEarned: 0,
    settings: {
      targetRate: 70,
      rewardPerSession: 100,
      weeklyBonusCount: 5,
      weeklyBonusReward: 500,
    },
    settingsEffectiveFrom: new Date('2026-01-01'),
    ...overrides,
  });
}

async function createTestSession(studentId, lectureId = 'LEC001', records = [], extra = {}) {
  return Session.create({
    studentId,
    lectureId,
    subject: '테스트강의',
    startTime: new Date(),
    records,
    ...extra,
  });
}

function makeRecords(status, count = 10, confidence = 1) {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(Date.now() - (count - i) * 3000),
    status,
    confidence,
  }));
}

async function createTestLecture(lectureId = 'LEC001', durationSec = 1000) {
  return Lecture.create({
    lectureId,
    subject: '테스트과목',
    title: '테스트강의',
    youtubeId: 'test-yt-id',
    durationSec,
  });
}

module.exports = {
  getStudentToken,
  getParentToken,
  createTestStudent,
  createTestParentWithChild,
  createTestEduPoint,
  createTestSession,
  createTestLecture,
  makeRecords,
};

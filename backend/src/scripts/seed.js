require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
const Parent = require('../models/Parent');

const DEMO_STUDENT_ID = 'demo-student-001';

async function seed() {
  const dbTarget = process.env.DB_TARGET || 'test';
  const dbUri = dbTarget === 'dev' ? process.env.MONGODB_URI_DEV : process.env.MONGODB_URI_TEST;
  if (!dbUri) { console.error(`MONGODB_URI_${dbTarget.toUpperCase()}가 .env에 설정되지 않았습니다.`); process.exit(1); }
  await mongoose.connect(dbUri);
  console.log(`DB 연결 완료 (${dbTarget})`);

  // 1) 데모 학생 생성/업데이트
  const passwordHash = await bcrypt.hash('password123', 10);

  let student = await Student.findOne({ email: 'student@demo.com' });
  if (student) {
    await Student.findByIdAndUpdate(student._id, { inviteCode: 'DEMO01', gradeLevel: 'high' });
    console.log('[UPDATE] student@demo.com');
  } else {
    student = await Student.create({
      email: 'student@demo.com',
      passwordHash,
      name: '데모 학생',
      studentId: DEMO_STUDENT_ID,
      gradeLevel: 'high',
      inviteCode: 'DEMO01',
    });
    console.log('[OK] student@demo.com (student)');
  }

  // 2) 데모 학부모 생성/업데이트 — children에 학생 연결
  let parent = await Parent.findOne({ email: 'parent@demo.com' });
  if (parent) {
    await Parent.findByIdAndUpdate(parent._id, {
      inviteCode: 'DEMO02',
      $addToSet: { children: student._id },
    });
    console.log('[UPDATE] parent@demo.com');
  } else {
    await Parent.create({
      email: 'parent@demo.com',
      passwordHash,
      name: '데모 학부모',
      children: [student._id],
      inviteCode: 'DEMO02',
    });
    console.log('[OK] parent@demo.com (parent)');
  }

  console.log('\n데모 계정:');
  console.log('  학생:  student@demo.com / password123  (초대 코드: DEMO01)');
  console.log('  학부모: parent@demo.com / password123  (초대 코드: DEMO02)');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });

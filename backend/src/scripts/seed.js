require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const DEMO_STUDENT_ID = 'demo-student-001';

const users = [
  {
    email: 'student@demo.com',
    password: 'password123',
    role: 'student',
    name: '데모 학생',
    studentId: DEMO_STUDENT_ID,
    gradeLevel: 'high',
    inviteCode: 'DEMO01',
    childStudentId: null,
  },
  {
    email: 'parent@demo.com',
    password: 'password123',
    role: 'parent',
    name: '데모 학부모',
    studentId: null,
    gradeLevel: null,
    inviteCode: 'DEMO02',
    childStudentId: DEMO_STUDENT_ID,
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB 연결 완료');

  for (const u of users) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      // 기존 계정에 inviteCode/gradeLevel 업데이트
      await User.findByIdAndUpdate(existing._id, {
        inviteCode: u.inviteCode,
        gradeLevel: u.gradeLevel,
        childStudentId: u.childStudentId,
      });
      console.log(`[UPDATE] ${u.email} → inviteCode: ${u.inviteCode}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 10);
    await User.create({
      email: u.email,
      passwordHash,
      role: u.role,
      name: u.name,
      studentId: u.studentId,
      childStudentId: u.childStudentId,
      gradeLevel: u.gradeLevel,
      inviteCode: u.inviteCode,
    });
    console.log(`[OK] ${u.email} (${u.role}) inviteCode: ${u.inviteCode}`);
  }

  console.log('\n데모 계정:');
  console.log('  학생:  student@demo.com / password123  (초대 코드: DEMO01)');
  console.log('  학부모: parent@demo.com / password123  (초대 코드: DEMO02)');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, minlength: 1 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['student', 'parent'], required: true },
    name: { type: String, required: true, trim: true, minlength: 1 },
    // role=student일 때 세션 연결용 ID
    studentId: {
      type: String,
      default: null,
      validate: {
        validator: function (v) { return this.role !== 'student' || !!v; },
        message: 'studentId는 학생 계정에 필수입니다.',
      },
    },
    // role=parent일 때 자녀 studentId
    childStudentId: { type: String, default: null },
    // role=student일 때 학교급: 'middle'(중학생) | 'high'(고등학생)
    gradeLevel: { type: String, enum: ['middle', 'high', null], default: null },
    // 가입 시 발급되는 고유 초대 코드 (학생/학부모 모두)
    inviteCode: { type: String, unique: true, sparse: true, default: null },
  },
  { timestamps: true }
);

// 역할과 반대되는 필드 강제 초기화
userSchema.pre('save', async function () {
  if (this.role === 'student') this.childStudentId = null;
  if (this.role === 'parent') this.studentId = null;
});

module.exports = mongoose.model('User', userSchema);

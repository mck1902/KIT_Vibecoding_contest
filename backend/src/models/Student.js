const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, default: 'student', immutable: true },
    name: { type: String, required: true, trim: true },
    studentId: { type: String, required: true, unique: true },
    gradeLevel: { type: String, enum: ['middle', 'high'], required: true },
    inviteCode: { type: String, unique: true, sparse: true, default: null },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('Student', studentSchema);

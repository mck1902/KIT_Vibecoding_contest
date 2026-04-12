const mongoose = require('mongoose');

const eduPointSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  studentId: { type: String, required: true, trim: true },
  balance: { type: Number, default: 0 },
  studentEarned: { type: Number, default: 0 },
  settings: {
    targetRate: { type: Number, default: 70, min: 50, max: 95 },
    rewardPerSession: { type: Number, default: 100, min: 10, max: 500 },
    weeklyBonusCount: { type: Number, default: 5, min: 1, max: 7 },
    weeklyBonusReward: { type: Number, default: 500, min: 10, max: 5000 },
  },
  settingsEffectiveFrom: { type: Date, default: null },
  previousSettings: {
    weeklyBonusCount: { type: Number, default: null },
    weeklyBonusReward: { type: Number, default: null },
  },
}, { timestamps: true, versionKey: false });

// 학부모-자녀 쌍당 1개만 허용
eduPointSchema.index({ parentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('EduPoint', eduPointSchema);

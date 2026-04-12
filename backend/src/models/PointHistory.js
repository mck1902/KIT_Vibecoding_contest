const mongoose = require('mongoose');

const pointHistorySchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  type: { type: String, required: true, enum: ['earn', 'charge', 'weekly_bonus', 'weekly_bonus_failed'] },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', default: null },
  parentBalanceAfter: { type: Number, required: true },
  studentEarnedAfter: { type: Number, default: null },
}, { timestamps: true, versionKey: false });

// 세션당 earn/weekly_bonus 중복 방지 — DB 레벨 물리적 방어
pointHistorySchema.index(
  { sessionId: 1, type: 1 },
  { unique: true, partialFilterExpression: { sessionId: { $exists: true, $ne: null } } }
);

module.exports = mongoose.model('PointHistory', pointHistorySchema);

const mongoose = require("mongoose");

const lowFocusSegmentSchema = new mongoose.Schema(
  {
    start: { type: String, required: true },
    end: { type: String, required: true },
    topic: { type: String, default: "" },
    avgFocus: { type: Number, default: null },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    answer: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, required: true },
  },
  { _id: false }
);

const quizSchema = new mongoose.Schema(
  {
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", required: true },
    studentId: { type: String, required: true },
    lectureId: { type: String, required: true },
    subject: { type: String, default: "" },
    fallback: { type: Boolean, default: false },
    lowFocusSegments: { type: [lowFocusSegmentSchema], default: [] },
    questions: { type: [questionSchema], default: [] },
    results: {
      answers: { type: [Number], default: null },
      score: { type: Number, default: null },
      total: { type: Number, default: null },
      completedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// 세션당 퀴즈 1개만 허용 (중복 생성 방지)
quizSchema.index({ sessionId: 1 }, { unique: true });

module.exports = mongoose.model("Quiz", quizSchema);

const mongoose = require("mongoose");

const recordSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, required: true },
    status: { type: Number, required: true, min: 1, max: 5 },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    focusProb: { type: Number, default: null, min: 0, max: 100 },
    videoTime: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const departureSchema = new mongoose.Schema(
  {
    leaveTime: { type: Date, required: true },
    returnTime: { type: Date, default: null },
    duration: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, trim: true },
    lectureId: { type: String, required: true, trim: true },
    subject: { type: String, default: "", trim: true },
    startTime: { type: Date, required: true, default: Date.now },
    endTime: { type: Date, default: null },
    records: { type: [recordSchema], default: [] },
    departures: { type: [departureSchema], default: [] },
    pauseEvents: {
      type: [{
        pauseTime: { type: Date, required: true },
        resumeTime: { type: Date, default: null },
        duration: { type: Number, default: 0, min: 0 },
        videoTime: { type: Number, default: null, min: 0 },
        _id: false,
      }],
      default: [],
    },
    ragAnalysis: { type: String, default: null },  // 생성 후 캐시 — API 재호출 방지
    focusRate: { type: Number, default: null },
    pointEarned: { type: Number, default: null },
    pointAwarded: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Session", sessionSchema);

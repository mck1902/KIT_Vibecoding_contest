const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema(
  {
    lectureId: { type: String, required: true, unique: true, trim: true },
    subject: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    episode: { type: String, default: "", trim: true },
    youtubeId: { type: String, required: true, trim: true },
    duration: { type: String, default: "" },
    durationSec: { type: Number, default: 0 },
    color: { type: String, default: "#6b7280" },
    subtitleText: { type: String, default: "" },
    segments: { type: Array, default: [] },
    analyzed: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Lecture", lectureSchema);

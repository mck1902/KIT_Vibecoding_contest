/**
 * 시드 스크립트: lectures.json + SRT 파일 → MongoDB Lecture 컬렉션
 * 실행: cd backend && node scripts/seedLectures.js
 */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Lecture = require("../src/models/Lecture");

const LECTURES_JSON = path.join(__dirname, "../data/lectures.json");
const SUBTITLES_DIR = path.join(__dirname, "../data/subtitles");

// 프론트엔드 JSON에만 있는 UI 필드 보충
const UI_FIELDS = {
  "lec-001": { color: "#3b82f6" },
  "lec-002": { color: "#10b981" },
  "lec-003": { color: "#f59e0b" },
};

async function seed() {
  const dbTarget = process.env.DB_TARGET || 'test';
  const dbUri = dbTarget === 'dev' ? process.env.MONGODB_URI_DEV : process.env.MONGODB_URI_TEST;
  if (!dbUri) { console.error(`MONGODB_URI_${dbTarget.toUpperCase()}가 .env에 설정되지 않았습니다.`); process.exit(1); }
  await mongoose.connect(dbUri);
  console.log(`MongoDB 연결 완료 (${dbTarget})`);

  const lectures = JSON.parse(fs.readFileSync(LECTURES_JSON, "utf-8"));

  for (const lec of lectures) {
    // SRT 파일 읽기
    const srtPath = path.join(SUBTITLES_DIR, `${lec.id}.srt`);
    let subtitleText = "";
    if (fs.existsSync(srtPath)) {
      subtitleText = fs.readFileSync(srtPath, "utf-8");
    }

    const ui = UI_FIELDS[lec.id] || {};

    await Lecture.findOneAndUpdate(
      { lectureId: lec.id },
      {
        lectureId: lec.id,
        subject: lec.subject,
        title: lec.title,
        episode: lec.episode || "",
        youtubeId: lec.youtubeId,
        duration: ui.duration || "",
        durationSec: ui.durationSec || 0,
        color: ui.color || "#6b7280",
        subtitleText,
        segments: lec.segments || [],
        analyzed: lec.analyzed || false,
      },
      { upsert: true, returnDocument: "after" }
    );

    console.log(`✓ ${lec.id} (${lec.title}) 저장 완료`);
  }

  console.log(`\n총 ${lectures.length}개 강좌 시드 완료`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("시드 실패:", err);
  process.exit(1);
});

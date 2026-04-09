const fs = require('fs');
const path = require('path');
const { getSubtitleText } = require('../utils/subtitleParser');
const { analyzeLectureContent } = require('../utils/claudeService');

const LECTURES_PATH = path.join(__dirname, '../../data/lectures.json');

function readLectures() {
  return JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf-8'));
}

function writeLectures(lectures) {
  fs.writeFileSync(LECTURES_PATH, JSON.stringify(lectures, null, 2), 'utf-8');
}

// GET /api/lectures — 강좌 목록 조회
async function getLectures(req, res) {
  try {
    const lectures = readLectures();
    return res.status(200).json(lectures);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to get lectures.', error: error.message });
  }
}

// POST /api/lectures/:id/analyze — 강좌 자막 분석 (Claude API)
async function analyzeLecture(req, res) {
  try {
    const { id } = req.params;
    const lectures = readLectures();
    const idx = lectures.findIndex(l => l.id === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Lecture not found.' });
    }

    const lecture = lectures[idx];

    // 이미 분석된 경우 캐시 반환
    if (lecture.analyzed && lecture.segments && lecture.segments.length > 0) {
      return res.status(200).json({ cached: true, lecture });
    }

    const subtitleText = getSubtitleText(id);
    if (!subtitleText) {
      return res.status(400).json({ message: `자막 파일(${id}.srt)을 찾을 수 없습니다.` });
    }

    const result = await analyzeLectureContent(subtitleText, lecture.title);

    lectures[idx] = { ...lecture, segments: result.segments, analyzed: true };
    writeLectures(lectures);

    return res.status(200).json({ cached: false, lecture: lectures[idx] });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to analyze lecture.', error: error.message });
  }
}

module.exports = { getLectures, analyzeLecture };

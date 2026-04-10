const Lecture = require('../models/Lecture');
const { analyzeLectureContent } = require('../utils/claudeService');

// GET /api/lectures — 강좌 목록 조회
async function getLectures(req, res) {
  try {
    const lectures = await Lecture.find().sort({ lectureId: 1 }).lean();
    // 프론트엔드 호환: lectureId → id
    const mapped = lectures.map(({ lectureId, _id, ...rest }) => ({
      id: lectureId,
      ...rest,
    }));
    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to get lectures.', error: error.message });
  }
}

// POST /api/lectures/:id/analyze — 강좌 자막 분석 (Claude API)
async function analyzeLecture(req, res) {
  try {
    const { id } = req.params;
    const lecture = await Lecture.findOne({ lectureId: id });

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found.' });
    }

    // 이미 분석된 경우 캐시 반환
    if (lecture.analyzed && lecture.segments && lecture.segments.length > 0) {
      return res.status(200).json({ cached: true, lecture });
    }

    if (!lecture.subtitleText) {
      return res.status(400).json({ message: `강좌(${id})에 자막 데이터가 없습니다.` });
    }

    const result = await analyzeLectureContent(lecture.subtitleText, lecture.title);

    lecture.segments = result.segments;
    lecture.analyzed = true;
    await lecture.save();

    return res.status(200).json({ cached: false, lecture });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to analyze lecture.', error: error.message });
  }
}

module.exports = { getLectures, analyzeLecture };

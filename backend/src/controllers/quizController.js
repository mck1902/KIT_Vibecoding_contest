const mongoose = require('mongoose');
const Session = require('../models/Session');
const Lecture = require('../models/Lecture');
const Quiz = require('../models/Quiz');
const { generateQuiz } = require('../utils/aiService');
const { hasSessionAccess } = require('./sessionController');
const { STATUS_TO_FOCUS } = require('../utils/constants');

// ── 헬퍼: "MM:SS" 또는 "HH:MM:SS" → 초 변환 ──────────────────
function timeToSec(t) {
  const parts = t.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  return 0;
}

// ── 저집중 구간 추출 (videoTime 기반) ───────────────────────────
function findLowFocusSegments(records, segments) {
  const scored = segments.map(seg => {
    const segStart = timeToSec(seg.start);
    const segEnd = timeToSec(seg.end);

    const matched = records.filter(r =>
      r.videoTime != null && r.videoTime >= segStart && r.videoTime < segEnd
    );

    const avgFocus = matched.length > 0
      ? Math.round(matched.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / matched.length)
      : null;

    return { start: seg.start, end: seg.end, topic: seg.topic || '', avgFocus, matchedCount: matched.length };
  })
  .filter(seg => seg.avgFocus !== null)
  .sort((a, b) => a.avgFocus - b.avgFocus);

  // 저집중 구간 (avgFocus < 60) 우선
  let lowSegs = scored.filter(s => s.avgFocus < 60);

  // 저집중 구간이 없으면 전체 중 가장 낮은 2개
  if (lowSegs.length === 0) {
    lowSegs = scored.slice(0, 2);
  }

  // 최소 1개, 최대 3개
  return lowSegs.slice(0, 3).map(({ matchedCount, ...rest }) => rest);
}

// ── 저집중 구간 추출 — 폴백 (videoTime 없는 구버전 데이터) ────────
function findLowFocusSegmentsFallback(records, segments, sessionStartTime) {
  const startMs = new Date(sessionStartTime).getTime();

  const scored = segments.map(seg => {
    const segStart = timeToSec(seg.start);
    const segEnd = timeToSec(seg.end);

    const matched = records.filter(r => {
      const elapsedSec = (new Date(r.timestamp).getTime() - startMs) / 1000;
      return elapsedSec >= segStart && elapsedSec < segEnd;
    });

    const avgFocus = matched.length > 0
      ? Math.round(matched.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / matched.length)
      : null;

    return { start: seg.start, end: seg.end, topic: seg.topic || '', avgFocus, matchedCount: matched.length };
  })
  .filter(seg => seg.avgFocus !== null)
  .sort((a, b) => a.avgFocus - b.avgFocus);

  let lowSegs = scored.filter(s => s.avgFocus < 60);
  if (lowSegs.length === 0) {
    lowSegs = scored.slice(0, 2);
  }

  return lowSegs.slice(0, 3).map(({ matchedCount, ...rest }) => rest);
}

// ── SRT 자막에서 해당 구간 텍스트 추출 ──────────────────────────
function extractSubtitleForSegments(subtitleText, segments) {
  if (!subtitleText || segments.length === 0) return '';

  // SRT 파싱: 블록 단위 분리
  const blocks = subtitleText.trim().split(/\n\s*\n/).map(block => {
    const lines = block.trim().split('\n');
    if (lines.length < 3) return null;
    // 타임코드 라인: "00:01:23,456 --> 00:01:25,789"
    const tcMatch = lines[1].match(/(\d{2}:\d{2}:\d{2})/);
    if (!tcMatch) return null;
    const startSec = timeToSec(tcMatch[1]);
    const text = lines.slice(2).join(' ');
    return { startSec, text };
  }).filter(Boolean);

  // segments 범위에 해당하는 블록만 추출
  const segRanges = segments.map(s => ({ start: timeToSec(s.start), end: timeToSec(s.end) }));
  const matched = blocks.filter(b =>
    segRanges.some(r => b.startSec >= r.start && b.startSec < r.end)
  );

  const result = matched.map(b => b.text).join(' ');
  return result.length > 2000 ? result.slice(0, 2000) : result;
}

// ── 정답/해설 제거 (미제출 퀴즈 조회용) ─────────────────────────
function sanitizeQuiz(quiz) {
  if (quiz.results && quiz.results.completedAt !== null) {
    return quiz;
  }
  const obj = quiz.toObject();
  obj.questions = obj.questions.map(q => ({
    question: q.question,
    options: q.options,
  }));
  return obj;
}

// ── POST /api/sessions/:sessionId/quiz — 퀴즈 생성 ──────────────
async function createQuiz(req, res) {
  try {
    const sessionId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    if (!session.endTime) {
      return res.status(400).json({ message: '세션이 종료되지 않았습니다.' });
    }

    // 중복 체크 — 이미 존재하면 기존 퀴즈 반환
    const existing = await Quiz.findOne({ sessionId });
    if (existing) {
      return res.status(200).json({ quiz: existing });
    }

    const lecture = await Lecture.findOne({ lectureId: session.lectureId });
    if (!lecture) return res.status(404).json({ message: 'Lecture not found.' });
    if (!lecture.analyzed || !lecture.segments || lecture.segments.length === 0) {
      return res.status(400).json({ message: '강좌 자막 분석이 완료되지 않았습니다.' });
    }
    if (!lecture.subtitleText || lecture.subtitleText.length < 100) {
      return res.status(400).json({ message: '자막이 너무 짧아 퀴즈를 생성할 수 없습니다.' });
    }

    // videoTime 존재 여부로 매칭 방식 결정
    const hasVideoTime = session.records.some(r => r.videoTime != null);
    let lowFocusSegments;
    let fallback = false;

    if (hasVideoTime) {
      lowFocusSegments = findLowFocusSegments(session.records, lecture.segments);
    } else {
      lowFocusSegments = findLowFocusSegmentsFallback(session.records, lecture.segments, session.startTime);
      fallback = true;
    }

    // 해당 구간 자막 추출
    const subtitleText = extractSubtitleForSegments(lecture.subtitleText, lowFocusSegments);

    // OpenAI API로 퀴즈 생성
    const questions = await generateQuiz(subtitleText, lowFocusSegments, lecture.title, session.subject);

    let quiz;
    try {
      quiz = await Quiz.create({
        sessionId,
        studentId: session.studentId,
        lectureId: session.lectureId,
        subject: session.subject,
        fallback,
        lowFocusSegments,
        questions,
        results: {},
      });
    } catch (err) {
      // duplicate key error → 동시 생성 요청, 기존 퀴즈 반환
      if (err.code === 11000) {
        const dup = await Quiz.findOne({ sessionId });
        return res.status(200).json({ quiz: sanitizeQuiz(dup) });
      }
      throw err;
    }

    return res.status(201).json({ quiz: sanitizeQuiz(quiz) });
  } catch (error) {
    console.error('[createQuiz]', error);
    return res.status(500).json({ message: '퀴즈 생성에 실패했습니다.' });
  }
}

// ── GET /api/sessions/:sessionId/quiz — 퀴즈 조회 ───────────────
async function getQuiz(req, res) {
  try {
    const sessionId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    const quiz = await Quiz.findOne({ sessionId });
    if (!quiz) {
      return res.status(200).json({ quiz: null });
    }

    return res.status(200).json({ quiz: sanitizeQuiz(quiz) });
  } catch (error) {
    console.error('[getQuiz]', error);
    return res.status(500).json({ message: '퀴즈 조회에 실패했습니다.' });
  }
}

// ── PUT /api/sessions/:sessionId/quiz/submit — 퀴즈 제출 ────────
async function submitQuiz(req, res) {
  try {
    const sessionId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    const quiz = await Quiz.findOne({ sessionId });
    if (!quiz) {
      return res.status(400).json({ message: '퀴즈가 생성되지 않았습니다.' });
    }

    // 이미 제출됨
    if (quiz.results && quiz.results.completedAt !== null) {
      return res.status(409).json({ message: '이미 제출된 퀴즈입니다.', quiz });
    }

    // answers 유효성 검증
    const { answers } = req.body;
    if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
      return res.status(400).json({ message: `answers 배열 길이가 ${quiz.questions.length}이어야 합니다.` });
    }
    for (const a of answers) {
      if (typeof a !== 'number' || a < 0 || a > 3) {
        return res.status(400).json({ message: 'answers의 각 원소는 0~3 사이 정수여야 합니다.' });
      }
    }

    // 채점
    let score = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (quiz.questions[i].answer === answers[i]) score++;
    }

    // 원자적 업데이트 (동시 제출 방지)
    const updated = await Quiz.findOneAndUpdate(
      { sessionId, 'results.completedAt': null },
      { results: { answers, score, total: quiz.questions.length, completedAt: new Date() } },
      { new: true }
    );

    // null이면 동시 제출 — 기존 결과 반환
    if (!updated) {
      const existing = await Quiz.findOne({ sessionId });
      return res.status(200).json({ quiz: existing });
    }

    return res.status(200).json({ quiz: updated });
  } catch (error) {
    console.error('[submitQuiz]', error);
    return res.status(500).json({ message: '퀴즈 제출에 실패했습니다.' });
  }
}

module.exports = { createQuiz, getQuiz, submitQuiz };

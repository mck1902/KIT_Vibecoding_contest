const mongoose = require('mongoose');
const Session = require('../models/Session');
const Lecture = require('../models/Lecture');
const Parent = require('../models/Parent');
const { generateRuleBasedTips, buildChartData } = require('../utils/reportGenerator');
const { generateRagReport } = require('../utils/claudeService');
const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };

// JWT의 childStudentIds를 신뢰하지 않고 DB에서 현재 상태를 조회
// 학생이 연결 해제 후에도 기존 토큰으로 세션에 접근하는 권한 잔류 문제를 방지
async function fetchParentChildIds(parentId) {
  const parent = await Parent.findById(parentId).populate('children', 'studentId');
  if (!parent) return [];
  return parent.children.map(c => c.studentId);
}

async function hasSessionAccess(user, session) {
  if (user.role === 'student') return user.studentId === session.studentId;
  if (user.role === 'parent') {
    const childStudentIds = await fetchParentChildIds(user.id);
    return childStudentIds.includes(session.studentId);
  }
  return false;
}

function calcAvgFocus(records) {
  if (!records || records.length === 0) return 0;
  return Math.round(
    records.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / records.length
  );
}

// POST /api/sessions — 세션 시작
async function createSession(req, res) {
  try {
    const { lectureId, subject } = req.body;
    const studentId = req.user.studentId;
    if (!studentId || !lectureId) {
      return res.status(400).json({ message: 'studentId and lectureId are required.' });
    }
    const session = await Session.create({
      studentId,
      lectureId,
      subject: subject || '',
      startTime: new Date(),
    });
    return res.status(201).json(session);
  } catch (error) {
    console.error('[createSession]', error);
    return res.status(500).json({ message: 'Failed to create session.' });
  }
}

// PUT /api/sessions/:id/end — 세션 종료
async function endSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.studentId !== req.user.studentId) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    await session.updateOne({ endTime: new Date() });
    return res.status(200).json({ ...session.toObject(), endTime: new Date() });
  } catch (error) {
    console.error('[endSession]', error);
    return res.status(500).json({ message: 'Failed to end session.' });
  }
}

// POST /api/sessions/:id/records — 집중도 분류 결과 저장
async function addRecords(req, res) {
  try {
    const { id } = req.params;
    const { records } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.studentId !== req.user.studentId) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    const items = Array.isArray(records) ? records : [records];
    await session.updateOne({ $push: { records: { $each: items } } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[addRecords]', error);
    return res.status(500).json({ message: 'Failed to add records.' });
  }
}

// POST /api/sessions/:id/departures — 탭 이탈 기록
async function addDeparture(req, res) {
  try {
    const { id } = req.params;
    const { leaveTime, returnTime, duration } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.studentId !== req.user.studentId) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    await session.updateOne({ $push: { departures: { leaveTime, returnTime, duration } } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[addDeparture]', error);
    return res.status(500).json({ message: 'Failed to add departure.' });
  }
}

// GET /api/sessions/:id/report — 규칙 기반 리포트
async function getSessionReport(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    const avgFocus = calcAvgFocus(session.records);
    const tips = generateRuleBasedTips({
      records: session.records,
      departures: session.departures,
      avgFocus,
    });
    const chartData = buildChartData(session.records);
    const totalSec = session.endTime
      ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)
      : 0;

    return res.status(200).json({
      sessionId: session._id,
      studentId: session.studentId,
      lectureId: session.lectureId,
      subject: session.subject,
      startTime: session.startTime,
      endTime: session.endTime,
      totalSec,
      avgFocus,
      departureCount: session.departures.length,
      chartData,
      tips,
    });
  } catch (error) {
    console.error('[getSessionReport]', error);
    return res.status(500).json({ message: 'Failed to generate report.' });
  }
}

// GET /api/sessions/:id/rag-analysis — Claude RAG 맞춤형 분석
async function getRagAnalysis(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }

    const lecture = await Lecture.findOne({ lectureId: session.lectureId });

    if (!lecture) {
      return res.status(404).json({ message: 'Lecture not found.' });
    }
    if (!lecture.analyzed || !lecture.segments || lecture.segments.length === 0) {
      return res.status(400).json({ message: '강좌 자막 분석이 완료되지 않았습니다. 먼저 /api/lectures/:id/analyze를 호출하세요.' });
    }

    const avgFocus = calcAvgFocus(session.records);
    // 이미 생성된 분석이 있으면 캐시 반환 (Claude API 재호출 방지)
    if (session.ragAnalysis) {
      return res.status(200).json({ ragAnalysis: session.ragAnalysis, cached: true });
    }

    let ragText;
    try {
      ragText = await generateRagReport(
        { records: session.records, departures: session.departures, avgFocus },
        lecture.segments,
        lecture.title
      );
    } catch (ragError) {
      // Claude API 실패 시 규칙 기반 폴백 텍스트 반환
      const tips = generateRuleBasedTips({ records: session.records, departures: session.departures, avgFocus });
      ragText = `[Claude API 미연결 — 규칙 기반 분석]\n\n${tips.join('\n\n')}`;
    }

    // 생성된 결과를 DB에 저장 (이후 재요청 시 API 미호출)
    await Session.findByIdAndUpdate(id, { ragAnalysis: ragText });

    return res.status(200).json({ ragAnalysis: ragText, cached: false });
  } catch (error) {
    console.error('[getRagAnalysis]', error);
    return res.status(500).json({ message: 'Failed to generate RAG analysis.' });
  }
}

// GET /api/sessions — 세션 목록 조회 (역할 기반)
async function getSessions(req, res) {
  try {
    const { lectureId } = req.query;
    const filter = {};

    if (req.user.role === 'student') {
      filter.studentId = req.user.studentId;
    } else if (req.user.role === 'parent') {
      const childStudentIds = await fetchParentChildIds(req.user.id);
      if (!childStudentIds.length) {
        return res.status(200).json([]);
      }
      filter.studentId = { $in: childStudentIds };
    }

    if (lectureId) filter.lectureId = lectureId;
    const sessions = await Session.find(filter).sort({ startTime: -1 });
    return res.status(200).json(sessions);
  } catch (error) {
    console.error('[getSessions]', error);
    return res.status(500).json({ message: 'Failed to fetch sessions.' });
  }
}

// GET /api/sessions/:id — 세션 상세 조회
async function getSessionById(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (!await hasSessionAccess(req.user, session)) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    return res.status(200).json(session);
  } catch (error) {
    console.error('[getSessionById]', error);
    return res.status(500).json({ message: 'Failed to fetch session.' });
  }
}

module.exports = {
  createSession,
  endSession,
  addRecords,
  addDeparture,
  getSessionReport,
  getRagAnalysis,
  getSessions,
  getSessionById,
};

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const { generateRuleBasedTips, buildChartData } = require('../utils/reportGenerator');
const { generateRagReport } = require('../utils/claudeService');

const LECTURES_PATH = path.join(__dirname, '../../data/lectures.json');
const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };

function calcAvgFocus(records) {
  if (!records || records.length === 0) return 0;
  return Math.round(
    records.reduce((sum, r) => sum + (STATUS_TO_FOCUS[r.status] || 50), 0) / records.length
  );
}

// POST /api/sessions — 세션 시작
async function createSession(req, res) {
  try {
    const { studentId, lectureId, subject } = req.body;
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
    return res.status(500).json({ message: 'Failed to create session.', error: error.message });
  }
}

// PUT /api/sessions/:id/end — 세션 종료
async function endSession(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findByIdAndUpdate(id, { endTime: new Date() }, { new: true });
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    return res.status(200).json(session);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to end session.', error: error.message });
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
    const items = Array.isArray(records) ? records : [records];
    await Session.findByIdAndUpdate(id, { $push: { records: { $each: items } } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add records.', error: error.message });
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
    await Session.findByIdAndUpdate(id, {
      $push: { departures: { leaveTime, returnTime, duration } },
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add departure.', error: error.message });
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
    return res.status(500).json({ message: 'Failed to generate report.', error: error.message });
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

    const lectures = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf-8'));
    const lecture = lectures.find(l => l.id === session.lectureId);

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
    return res.status(500).json({ message: 'Failed to generate RAG analysis.', error: error.message });
  }
}

// GET /api/sessions — 세션 목록 조회
async function getSessions(req, res) {
  try {
    const { studentId, lectureId } = req.query;
    const filter = {};
    if (studentId) filter.studentId = studentId;
    if (lectureId) filter.lectureId = lectureId;
    const sessions = await Session.find(filter).sort({ startTime: -1 });
    return res.status(200).json(sessions);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch sessions.', error: error.message });
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
    return res.status(200).json(session);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch session.', error: error.message });
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

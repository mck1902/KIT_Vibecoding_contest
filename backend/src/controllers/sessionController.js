const mongoose = require('mongoose');
const Session = require('../models/Session');
const Lecture = require('../models/Lecture');
const Parent = require('../models/Parent');
const EduPoint = require('../models/EduPoint');
const PointHistory = require('../models/PointHistory');
const { generateRuleBasedTips, buildChartData } = require('../utils/reportGenerator');
const { generateRagReport } = require('../utils/aiService');
const { calcFocus } = require('../utils/constants');
const { getWeekRangeKST } = require('../utils/weekUtils');

const COMPLETION_THRESHOLD = 90; // 완강 인정 기준 (%)

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

/**
 * 일시정지 기간의 레코드를 제외한 평균 집중도 계산
 * pauseEvents가 없으면 전체 레코드를 사용
 */
function calcAvgFocus(records, pauseEvents = []) {
  if (!records || records.length === 0) return 0;

  let filtered = records;
  if (pauseEvents.length > 0) {
    const pauseRanges = pauseEvents
      .filter(p => p.pauseTime && p.resumeTime)
      .map(p => [new Date(p.pauseTime).getTime(), new Date(p.resumeTime).getTime()]);

    if (pauseRanges.length > 0) {
      filtered = records.filter(r => {
        const t = new Date(r.timestamp).getTime();
        return !pauseRanges.some(([start, end]) => t >= start && t <= end);
      });
    }
  }

  if (filtered.length === 0) return 0;
  return Math.round(
    filtered.reduce((sum, r) => sum + calcFocus(r.status, r.confidence, r.focusProb), 0) / filtered.length
  );
}

/**
 * 세션 포인트 지급 — MongoDB 트랜잭션으로 원자적 처리
 * Session.pointAwarded + EduPoint 잔액 차감/누적 증가 + PointHistory 생성을 묶음
 * @returns {{ pointEarned, studentEarned, balance }} | null (미지급)
 */
// withTransaction 내부에서 abort 유도용 — retry 방지를 위해 비 transient 에러로 처리
class InsufficientBalanceError extends Error {
  constructor() { super('잔액 부족'); this.name = 'InsufficientBalanceError'; }
  get hasErrorLabel() { return () => false; } // withTransaction이 retry하지 않도록
}

async function awardPoints(sessionId, focusRate, edupoint) {
  // 방어 3 — 트랜잭션 진입 전 fast-fail (불필요한 write 시도 방지)
  const alreadyEarned = await PointHistory.exists({ sessionId, type: 'earn' });
  if (alreadyEarned) return null;

  const mongoSession = await mongoose.startSession();
  try {
    let result = null;
    await mongoSession.withTransaction(async () => {
      // 방어 2 — pointAwarded 플래그 선점 (중복 방어)
      const updated = await Session.findOneAndUpdate(
        { _id: sessionId, pointAwarded: false },
        { pointAwarded: true, focusRate, pointEarned: edupoint.settings.rewardPerSession },
        { new: true, session: mongoSession }
      );
      if (!updated) return; // 이미 지급됨 → 변경 없이 정상 종료 → commit (no-op)

      // 잔액 차감 + 학생 누적 증가
      const charged = await EduPoint.findOneAndUpdate(
        { _id: edupoint._id, balance: { $gte: edupoint.settings.rewardPerSession } },
        { $inc: {
          balance: -edupoint.settings.rewardPerSession,
          studentEarned: +edupoint.settings.rewardPerSession,
        }},
        { new: true, session: mongoSession }
      );
      if (!charged) {
        // 잔액 부족 → 에러 throw → withTransaction이 abort 처리
        throw new InsufficientBalanceError();
      }

      // 방어 4 — PointHistory 기록 (유니크 인덱스가 물리적 최후 방어)
      await PointHistory.create([{
        studentId: updated.studentId,
        parentId: edupoint.parentId,
        type: 'earn',
        amount: edupoint.settings.rewardPerSession,
        reason: '세션달성',
        sessionId,
        parentBalanceAfter: charged.balance,
        studentEarnedAfter: charged.studentEarned,
      }], { session: mongoSession });

      result = {
        pointEarned: edupoint.settings.rewardPerSession,
        studentEarned: charged.studentEarned,
        balance: charged.balance,
      };
    });
    return result;
  } catch (err) {
    // 잔액 부족은 정상적인 비즈니스 로직 — null 반환
    if (err instanceof InsufficientBalanceError) return null;
    throw err; // 그 외 에러는 상위로 전파
  } finally {
    await mongoSession.endSession();
  }
}

/**
 * 주간 보너스 판정 — 세션 보상과 별도 트랜잭션
 */
async function checkWeeklyBonus(studentId, edupoint) {
  const { weekStart, weekEnd } = getWeekRangeKST();

  // 적용할 보너스 설정 결정 (소급 방지)
  let activeSettings;
  if (!edupoint.settingsEffectiveFrom || edupoint.settingsEffectiveFrom <= weekStart) {
    activeSettings = edupoint.settings;
  } else if (edupoint.previousSettings?.weeklyBonusCount != null) {
    activeSettings = edupoint.previousSettings;
  } else {
    return null; // 이전 설정 없음 → 보너스 판정 스킵
  }

  // 이번 주 달성 횟수 집계
  const count = await Session.countDocuments({
    studentId,
    pointAwarded: true,
    endTime: { $gte: weekStart, $lt: weekEnd },
  });
  if (count < activeSettings.weeklyBonusCount) return null;

  // 중복 방지 — 이번 주 이미 지급했는지 확인
  const alreadyAwarded = await PointHistory.exists({
    studentId,
    type: 'weekly_bonus',
    createdAt: { $gte: weekStart, $lt: weekEnd },
  });
  if (alreadyAwarded) return null;

  // 잔액 차감 시도
  const charged = await EduPoint.findOneAndUpdate(
    { _id: edupoint._id, balance: { $gte: activeSettings.weeklyBonusReward } },
    { $inc: {
      balance: -activeSettings.weeklyBonusReward,
      studentEarned: +activeSettings.weeklyBonusReward,
    }},
    { new: true }
  );

  if (charged) {
    await PointHistory.create({
      studentId,
      parentId: edupoint.parentId,
      type: 'weekly_bonus',
      amount: activeSettings.weeklyBonusReward,
      reason: '주간보너스',
      sessionId: null,
      parentBalanceAfter: charged.balance,
      studentEarnedAfter: charged.studentEarned,
    });
    return { weeklyBonus: activeSettings.weeklyBonusReward };
  }

  // 잔액 부족 — 실패 기록
  await PointHistory.create({
    studentId,
    parentId: edupoint.parentId,
    type: 'weekly_bonus_failed',
    amount: 0,
    reason: '잔액부족',
    sessionId: null,
    parentBalanceAfter: edupoint.balance,
    studentEarnedAfter: edupoint.studentEarned,
  });
  return null;
}

// POST /api/sessions — 세션 시작 (미종료 세션이 있으면 반환)
async function createSession(req, res) {
  try {
    const { lectureId, subject } = req.body;
    const studentId = req.user.studentId;
    if (!studentId || !lectureId) {
      return res.status(400).json({ message: 'studentId and lectureId are required.' });
    }

    // 같은 학생+강의의 미종료 세션이 있으면 기존 세션 반환
    const existing = await Session.findOne({ studentId, lectureId, endTime: null });
    if (existing) {
      // 마지막 sessionPause의 resumedAt 기록 (이어보기 시점)
      const pauses = existing.sessionPauses || [];
      const lastPause = pauses[pauses.length - 1];
      if (lastPause && !lastPause.resumedAt) {
        const now = new Date();
        lastPause.resumedAt = now;
        lastPause.duration = now - new Date(lastPause.pausedAt);
        await existing.updateOne({ sessionPauses: pauses });
      }
      return res.status(200).json({ ...existing.toObject(), sessionPauses: pauses, resumed: true });
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

// PUT /api/sessions/:id/pause — 세션 일시중단 (lastVideoTime 저장, endTime 미설정)
async function pauseSession(req, res) {
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
    if (session.endTime) {
      return res.status(200).json(session.toObject());
    }

    const { lastVideoTime = 0 } = req.body;
    // sessionPauses에 pausedAt 기록
    const pausedAt = new Date();
    await session.updateOne({
      lastVideoTime,
      $push: { sessionPauses: { pausedAt } },
    });
    return res.status(200).json({ ...session.toObject(), lastVideoTime });
  } catch (error) {
    console.error('[pauseSession]', error);
    return res.status(500).json({ message: 'Failed to pause session.' });
  }
}

// DELETE /api/sessions/:id — 미종료 세션 삭제 (처음부터 다시 시작 시)
async function deleteSession(req, res) {
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
    // 이미 종료된 세션은 삭제 불가
    if (session.endTime) {
      return res.status(400).json({ message: '이미 종료된 세션은 삭제할 수 없습니다.' });
    }
    await Session.deleteOne({ _id: id });
    return res.status(200).json({ message: 'Session deleted.' });
  } catch (error) {
    console.error('[deleteSession]', error);
    return res.status(500).json({ message: 'Failed to delete session.' });
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
    // idempotency 가드 — 이미 종료된 세션은 기존 결과만 반환 (포인트 재지급 방지)
    if (session.endTime) {
      return res.status(200).json(session.toObject());
    }

    // 세션 종료 처리
    const { abandoned = false, watchedSec = 0, videoDuration = 0 } = req.body;
    const endTime = new Date();
    const focusRate = calcAvgFocus(session.records, session.pauseEvents);

    // completionRate 계산 — 프론트에서 전달한 videoDuration 우선, 없으면 Lecture.durationSec 폴백
    let durationSec = videoDuration;
    if (!durationSec) {
      const lecForCompletion = await Lecture.findOne({ lectureId: session.lectureId });
      durationSec = lecForCompletion?.durationSec ?? 0;
    }
    const completionRate = durationSec > 0
      ? Math.min(100, Math.round(watchedSec / durationSec * 100))
      : 0;

    await session.updateOne({ endTime, focusRate, completionRate });

    // 포인트 지급 시도 — 중도 이탈(abandoned)이면 포인트 미지급
    let pointResult = null;
    let weeklyBonusResult = null;
    const edupoint = await EduPoint.findOne({ studentId: session.studentId });
    if (!abandoned && completionRate >= COMPLETION_THRESHOLD && edupoint && focusRate >= edupoint.settings.targetRate) {
      pointResult = await awardPoints(session._id, focusRate, edupoint);
      if (!pointResult) {
        // 목표 달성했으나 학부모 잔액 부족 — pointEarned: 0으로 기록 (null과 구분)
        await Session.updateOne({ _id: session._id }, { pointEarned: 0 });
      }
    } else if (edupoint) {
      // 목표 미달 — focusRate만 기록
      await Session.updateOne({ _id: session._id }, { pointEarned: 0 });
    }

    // 주간 보너스 판정 (포인트 지급 성공 시에만, 별도 트랜잭션)
    if (pointResult && edupoint) {
      const freshEdupoint = await EduPoint.findById(edupoint._id);
      weeklyBonusResult = await checkWeeklyBonus(session.studentId, freshEdupoint);
    }

    const response = {
      ...session.toObject(),
      endTime,
      focusRate,
      completionRate,
      pointEarned: pointResult?.pointEarned || 0,
      studentEarned: pointResult?.studentEarned || null,
      weeklyBonus: weeklyBonusResult?.weeklyBonus || null,
    };
    return res.status(200).json(response);
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

// POST /api/sessions/:id/pause-events — 일시정지 기록
async function addPauseEvent(req, res) {
  try {
    const { id } = req.params;
    const { pauseTime, resumeTime, duration, videoTime } = req.body;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid session ID.' });
    }
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ message: 'Session not found.' });
    if (session.studentId !== req.user.studentId) {
      return res.status(403).json({ message: '이 세션에 접근할 권한이 없습니다.' });
    }
    await session.updateOne({ $push: { pauseEvents: { pauseTime, resumeTime, duration, videoTime } } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[addPauseEvent]', error);
    return res.status(500).json({ message: 'Failed to add pause event.' });
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

    // endSession에서 저장한 focusRate를 우선 사용 (에듀포인트 비교값과 일치 보장)
    // 세션 진행 중(미종료) 또는 구버전 데이터는 records로 재계산
    const avgFocus = session.focusRate ?? calcAvgFocus(session.records, session.pauseEvents);
    const tips = generateRuleBasedTips({
      records: session.records,
      departures: session.departures,
      avgFocus,
    });
    const chartData = buildChartData(session.records, session.pauseEvents);

    // 세션 pause 총 시간 (이탈 후 이어보기까지 빠진 시간, ms → sec)
    const sessionPauseSec = (session.sessionPauses || [])
      .filter(p => p.duration > 0)
      .reduce((sum, p) => sum + p.duration, 0) / 1000;

    // 영상 일시정지 총 시간 (ms → sec)
    const videoPauseSec = (session.pauseEvents || [])
      .filter(p => p.duration > 0)
      .reduce((sum, p) => sum + p.duration, 0) / 1000;

    // 총 학습시간 = (endTime - startTime) - 세션 이탈 시간
    // 영상 멈춤 시간은 학습시간에 포함
    const rawSec = session.endTime
      ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)
      : 0;
    const totalSec = Math.max(0, Math.round(rawSec - sessionPauseSec));

    return res.status(200).json({
      sessionId: session._id,
      studentId: session.studentId,
      lectureId: session.lectureId,
      subject: session.subject,
      startTime: session.startTime,
      endTime: session.endTime,
      totalSec,
      videoPauseCount: (session.pauseEvents || []).filter(p => p.duration > 0).length,
      videoPauseSec: Math.round(videoPauseSec),
      sessionPauseCount: (session.sessionPauses || []).filter(p => p.duration > 0).length,
      sessionPauseSec: Math.round(sessionPauseSec),
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

// GET /api/sessions/:id/rag-analysis — AI RAG 맞춤형 분석
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

    const avgFocus = calcAvgFocus(session.records, session.pauseEvents);
    // 이미 생성된 분석이 있으면 캐시 반환 (AI API 재호출 방지)
    if (session.ragAnalysis) {
      return res.status(200).json({ ragAnalysis: session.ragAnalysis, cached: true });
    }

    let ragText;
    try {
      ragText = await generateRagReport(
        {
          records: session.records,
          departures: session.departures,
          pauseEvents: session.pauseEvents || [],
          sessionPauses: session.sessionPauses || [],
          avgFocus,
          startTime: session.startTime,
          endTime: session.endTime,
        },
        lecture.segments,
        lecture.title
      );
    } catch (ragError) {
      // AI API 실패 시 규칙 기반 폴백 텍스트 반환
      const tips = generateRuleBasedTips({ records: session.records, departures: session.departures, avgFocus });
      ragText = `[AI API 미연결 — 규칙 기반 분석]\n\n${tips.join('\n\n')}`;
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
  pauseSession,
  deleteSession,
  addRecords,
  addDeparture,
  addPauseEvent,
  getSessionReport,
  getRagAnalysis,
  getSessions,
  getSessionById,
  hasSessionAccess,
};

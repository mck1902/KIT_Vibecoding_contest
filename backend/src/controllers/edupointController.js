const EduPoint = require('../models/EduPoint');
const PointHistory = require('../models/PointHistory');
const Parent = require('../models/Parent');
const { getWeekRangeKST, getNextMondayKST } = require('../utils/weekUtils');

// ── 공통 권한 검증 ──────────────────────────────────

async function validateAccess(req, res, studentId) {
  if (req.user.role === 'student') {
    if (req.user.studentId !== studentId) {
      res.status(403).json({ message: '본인의 포인트만 조회할 수 있습니다.' });
      return null;
    }
  }
  if (req.user.role === 'parent') {
    const parent = await Parent.findById(req.user.id).populate('children');
    const child = parent?.children.find(c => c.studentId === studentId);
    if (!child) {
      res.status(403).json({ message: '연결되지 않은 자녀입니다.' });
      return null;
    }
  }
  return true;
}

// ── GET /:studentId ─────────────────────────────────

async function getEduPoint(req, res) {
  try {
    const { studentId } = req.params;
    const access = await validateAccess(req, res, studentId);
    if (!access) return;

    const doc = await EduPoint.findOne({ studentId });
    if (!doc) {
      return res.json({
        balance: 0,
        studentEarned: 0,
        settings: {
          targetRate: 70,
          rewardPerSession: 100,
          weeklyBonusCount: 5,
          weeklyBonusReward: 500,
        },
        initialized: false,
      });
    }

    const obj = doc.toObject();
    obj.initialized = true;
    return res.json(obj);
  } catch (err) {
    console.error('[edupointController] getEduPoint error:', err);
    return res.status(500).json({ message: '포인트 조회 중 오류가 발생했습니다.' });
  }
}

// ── PUT /:studentId/settings ────────────────────────

async function updateSettings(req, res) {
  try {
    const { studentId } = req.params;
    const access = await validateAccess(req, res, studentId);
    if (!access) return;

    const { targetRate, rewardPerSession, weeklyBonusCount, weeklyBonusReward } = req.body;
    const newSettings = { targetRate, rewardPerSession, weeklyBonusCount, weeklyBonusReward };

    // 기존 문서 확인 (소급 방지 위해 이전 설정 보존 필요)
    const existing = await EduPoint.findOne({ parentId: req.user.id, studentId });

    if (!existing) {
      // 최초 설정 → 현재 주 월요일부터 즉시 적용
      const { weekStart } = getWeekRangeKST();
      const doc = await EduPoint.findOneAndUpdate(
        { parentId: req.user.id, studentId },
        {
          $set: {
            settings: newSettings,
            settingsEffectiveFrom: weekStart,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      const obj = doc.toObject();
      obj.initialized = true;
      return res.json(obj);
    }

    // 설정 변경 → 다음 주 월요일부터 적용, 이전 settings 보존
    const nextMonday = getNextMondayKST();
    const doc = await EduPoint.findOneAndUpdate(
      { parentId: req.user.id, studentId },
      {
        $set: {
          settings: newSettings,
          settingsEffectiveFrom: nextMonday,
          previousSettings: {
            weeklyBonusCount: existing.settings.weeklyBonusCount,
            weeklyBonusReward: existing.settings.weeklyBonusReward,
          },
        },
      },
      { new: true },
    );
    const obj = doc.toObject();
    obj.initialized = true;
    return res.json(obj);
  } catch (err) {
    console.error('[edupointController] updateSettings error:', err);
    return res.status(500).json({ message: '설정 저장 중 오류가 발생했습니다.' });
  }
}

// ── POST /:studentId/charge ─────────────────────────

async function chargePoints(req, res) {
  try {
    const { studentId } = req.params;
    const access = await validateAccess(req, res, studentId);
    if (!access) return;

    const { amount } = req.body;

    const edupoint = await EduPoint.findOne({ parentId: req.user.id, studentId });
    if (!edupoint) {
      return res.status(400).json({ message: '먼저 포인트 설정을 완료해주세요.' });
    }

    const updated = await EduPoint.findOneAndUpdate(
      { _id: edupoint._id },
      { $inc: { balance: amount } },
      { new: true },
    );

    await PointHistory.create({
      studentId,
      parentId: req.user.id,
      type: 'charge',
      amount,
      reason: '충전',
      sessionId: null,
      parentBalanceAfter: updated.balance,
      studentEarnedAfter: null,
    });

    return res.json({ balance: updated.balance, charged: amount });
  } catch (err) {
    console.error('[edupointController] chargePoints error:', err);
    return res.status(500).json({ message: '충전 중 오류가 발생했습니다.' });
  }
}

// ── GET /:studentId/history ─────────────────────────

async function getHistory(req, res) {
  try {
    const { studentId } = req.params;
    const access = await validateAccess(req, res, studentId);
    if (!access) return;

    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const filter = { studentId };
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const [history, total] = await Promise.all([
      PointHistory.find(filter).sort({ createdAt: -1 }).skip(offset).limit(limit),
      PointHistory.countDocuments(filter),
    ]);

    return res.json({ history, total });
  } catch (err) {
    console.error('[edupointController] getHistory error:', err);
    return res.status(500).json({ message: '내역 조회 중 오류가 발생했습니다.' });
  }
}

module.exports = { getEduPoint, updateSettings, chargePoints, getHistory };

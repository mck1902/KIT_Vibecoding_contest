const express = require('express');
const {
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
} = require('../controllers/sessionController');
const { createQuiz, getQuiz, submitQuiz } = require('../controllers/quizController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.post('/', requireAuth, requireRole('student'), validate(schemas.createSession), createSession);
router.get('/', requireAuth, getSessions);
router.get('/:id', requireAuth, getSessionById);
router.put('/:id/end', requireAuth, requireRole('student'), validate(schemas.endSession), endSession);
router.put('/:id/pause', requireAuth, requireRole('student'), pauseSession);
router.delete('/:id', requireAuth, requireRole('student'), deleteSession);
router.post('/:id/records', requireAuth, requireRole('student'), validate(schemas.addRecords), addRecords);
router.post('/:id/departures', requireAuth, requireRole('student'), validate(schemas.addDeparture), addDeparture);
router.post('/:id/pause-events', requireAuth, requireRole('student'), addPauseEvent);
router.get('/:id/report', requireAuth, getSessionReport);
router.get('/:id/rag-analysis', requireAuth, getRagAnalysis);

// 퀴즈
router.post('/:id/quiz', requireAuth, requireRole('student'), createQuiz);
router.get('/:id/quiz', requireAuth, getQuiz);
router.put('/:id/quiz/submit', requireAuth, requireRole('student'), submitQuiz);

module.exports = router;

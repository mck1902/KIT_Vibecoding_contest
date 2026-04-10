const express = require('express');
const {
  createSession,
  endSession,
  addRecords,
  addDeparture,
  getSessionReport,
  getRagAnalysis,
  getSessions,
  getSessionById,
} = require('../controllers/sessionController');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', requireAuth, requireRole('student'), createSession);
router.get('/', requireAuth, getSessions);
router.get('/:id', requireAuth, getSessionById);
router.put('/:id/end', requireAuth, requireRole('student'), endSession);
router.post('/:id/records', requireAuth, requireRole('student'), addRecords);
router.post('/:id/departures', requireAuth, requireRole('student'), addDeparture);
router.get('/:id/report', requireAuth, getSessionReport);
router.get('/:id/rag-analysis', requireAuth, getRagAnalysis);

module.exports = router;

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

const router = express.Router();

router.post('/', createSession);
router.get('/', getSessions);
router.get('/:id', getSessionById);
router.put('/:id/end', endSession);
router.post('/:id/records', addRecords);
router.post('/:id/departures', addDeparture);
router.get('/:id/report', getSessionReport);
router.get('/:id/rag-analysis', getRagAnalysis);

module.exports = router;

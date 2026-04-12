const express = require('express');
const { getEduPoint, updateSettings, chargePoints, getHistory } = require('../controllers/edupointController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

router.get('/:studentId', requireAuth, getEduPoint);
router.put('/:studentId/settings', requireAuth, requireRole('parent'), validate(schemas.edupointSettings), updateSettings);
router.post('/:studentId/charge', requireAuth, requireRole('parent'), validate(schemas.edupointCharge), chargePoints);
router.get('/:studentId/history', requireAuth, getHistory);

module.exports = router;

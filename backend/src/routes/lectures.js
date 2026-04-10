const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getLectures, analyzeLecture } = require('../controllers/lectureController');

const router = express.Router();

router.get('/', requireAuth, getLectures);
router.post('/:id/analyze', requireAuth, analyzeLecture);

module.exports = router;

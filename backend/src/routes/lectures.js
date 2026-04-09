const express = require('express');
const { getLectures, analyzeLecture } = require('../controllers/lectureController');

const router = express.Router();

router.get('/', getLectures);
router.post('/:id/analyze', analyzeLecture);

module.exports = router;

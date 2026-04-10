const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, me, link, updateProfile, getChild, getParent, unlink } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');

const router = express.Router();

// 로그인: IP당 15분에 20회
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 회원가입: IP당 1시간에 10회
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: '요청이 너무 많습니다. 1시간 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 연결/프로필: IP당 15분에 30회
const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', registerLimiter, validate(schemas.register), register);
router.post('/login', loginLimiter, validate(schemas.login), login);
router.get('/me', requireAuth, me);
router.put('/link', requireAuth, authActionLimiter, validate(schemas.link), link);
router.patch('/profile', requireAuth, authActionLimiter, validate(schemas.updateProfile), updateProfile);
router.get('/child', requireAuth, getChild);
router.get('/parent', requireAuth, getParent);
router.delete('/link', requireAuth, unlink);

module.exports = router;

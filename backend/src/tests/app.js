/**
 * 테스트용 Express 앱 인스턴스
 * index.js의 app.listen() 없이 라우트만 구성
 */
// auth.js가 모듈 로딩 시점에 JWT_SECRET을 체크하므로 require 전에 설정
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-jest';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';

const express = require('express');
const sessionRoutes = require('../routes/sessions');
const edupointRoutes = require('../routes/edupoint');

const app = express();
app.use(express.json());

app.use('/api/sessions', sessionRoutes);
app.use('/api/edupoint', edupointRoutes);

// Express 5 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[test-app] Error:', err.message);
  res.status(500).json({ message: err.message });
});

module.exports = app;

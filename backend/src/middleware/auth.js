const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. .env 파일을 확인하세요.');
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: '인증이 필요합니다.' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) {
      return res.status(403).json({ message: `${role} 계정만 접근할 수 있습니다.` });
    }
    next();
  };
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, requireRole, signToken };

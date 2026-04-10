const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');

const INVITE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateInviteCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += INVITE_CHARS[Math.floor(Math.random() * INVITE_CHARS.length)];
  return code;
}

async function uniqueInviteCode() {
  let code, exists;
  do {
    code = generateInviteCode();
    exists = await User.findOne({ inviteCode: code });
  } while (exists);
  return code;
}

function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name, studentId: user.studentId, childStudentId: user.childStudentId, gradeLevel: user.gradeLevel, inviteCode: user.inviteCode },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function userPayload(user) {
  return { id: user._id, email: user.email, role: user.role, name: user.name, studentId: user.studentId, childStudentId: user.childStudentId, gradeLevel: user.gradeLevel, inviteCode: user.inviteCode };
}

// 코드로 반대 역할 사용자를 찾아 연결 처리
async function linkByCode(newUser, partnerCode) {
  const partner = await User.findOne({ inviteCode: partnerCode.toUpperCase() });
  if (!partner) return { linked: false, message: '해당 초대 코드를 찾을 수 없습니다.' };
  if (partner.role === newUser.role) return { linked: false, message: '같은 역할의 초대 코드는 사용할 수 없습니다.' };

  if (newUser.role === 'student') {
    // 학부모 → 학생 연결: 학부모의 childStudentId를 내 studentId로 설정
    await User.findByIdAndUpdate(partner._id, { childStudentId: newUser.studentId });
  } else {
    // 학부모가 가입 → 학생의 studentId를 내 childStudentId로 설정
    await User.findByIdAndUpdate(newUser._id, { childStudentId: partner.studentId });
    newUser.childStudentId = partner.studentId; // 로컬 반영
  }
  return { linked: true };
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { email, password, role, name, gradeLevel, partnerCode } = req.body;
    if (!email || !password || !role || !name) {
      return res.status(400).json({ message: '이메일, 비밀번호, 역할, 이름은 필수입니다.' });
    }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: '유효한 이메일 형식이 아닙니다.' });
    }
    if (!['student', 'parent'].includes(role)) {
      return res.status(400).json({ message: '역할은 student 또는 parent여야 합니다.' });
    }
    if (role === 'student' && !['middle', 'high'].includes(gradeLevel)) {
      return res.status(400).json({ message: '학생은 학교급(중학생/고등학생)을 선택해야 합니다.' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: '이미 사용 중인 이메일입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inviteCode = await uniqueInviteCode();

    let studentId = null;
    if (role === 'student') {
      const prefix = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
      const suffix = Date.now().toString(36);
      studentId = `student-${prefix}-${suffix}`;
    }

    const user = await User.create({
      email,
      passwordHash,
      role,
      name,
      studentId,
      childStudentId: null,
      gradeLevel: role === 'student' ? gradeLevel : null,
      inviteCode,
    });

    // 초대 코드로 상대방 연결 시도 (실패해도 가입은 성공)
    let linkWarning = null;
    if (partnerCode) {
      const result = await linkByCode(user, partnerCode);
      if (!result.linked) linkWarning = result.message;
    }

    // DB에서 최신 상태 반영 (linkByCode에서 childStudentId 변경됐을 수 있음)
    const freshUser = await User.findById(user._id);
    const token = generateToken(freshUser);
    return res.status(201).json({ token, user: userPayload(freshUser), ...(linkWarning && { linkWarning }) });
  } catch (error) {
    return res.status(500).json({ message: '회원가입에 실패했습니다.', error: error.message });
  }
}

// POST /api/auth/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: '이메일과 비밀번호를 입력해주세요.' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const token = generateToken(user);
    return res.status(200).json({ token, user: userPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: '로그인에 실패했습니다.', error: error.message });
  }
}

// GET /api/auth/me
async function me(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    return res.status(200).json({ user: userPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: '사용자 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// PUT /api/auth/link — 가입 후 초대 코드로 연결
async function link(req, res) {
  try {
    const { partnerCode } = req.body;
    if (!partnerCode) {
      return res.status(400).json({ message: '초대 코드를 입력해주세요.' });
    }
    const partner = await User.findOne({ inviteCode: partnerCode.toUpperCase() });
    if (!partner) {
      return res.status(404).json({ message: '해당 초대 코드를 찾을 수 없습니다.' });
    }
    if (partner.role === req.user.role) {
      return res.status(400).json({ message: '같은 역할의 초대 코드는 사용할 수 없습니다.' });
    }

    const me = await User.findById(req.user.id);

    if (me.role === 'student') {
      await User.findByIdAndUpdate(partner._id, { childStudentId: me.studentId });
    } else {
      await User.findByIdAndUpdate(me._id, { childStudentId: partner.studentId });
    }

    const freshUser = await User.findById(req.user.id);
    const token = generateToken(freshUser);
    return res.status(200).json({ token, user: userPayload(freshUser) });
  } catch (error) {
    return res.status(500).json({ message: '연결에 실패했습니다.', error: error.message });
  }
}

module.exports = { register, login, me, link };

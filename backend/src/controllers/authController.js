const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Parent = require('../models/Parent');
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
    exists = await Student.findOne({ inviteCode: code }) || await Parent.findOne({ inviteCode: code });
  } while (exists);
  return code;
}

// 이메일로 학생 또는 학부모를 찾는 헬퍼
async function findUserByEmail(email) {
  const student = await Student.findOne({ email });
  if (student) return student;
  return Parent.findOne({ email });
}

function generateToken(user) {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
  if (user.role === 'student') {
    payload.studentId = user.studentId;
    payload.gradeLevel = user.gradeLevel;
  }
  payload.inviteCode = user.inviteCode;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function userPayload(user) {
  const base = {
    id: user._id,
    email: user.email,
    role: user.role,
    name: user.name,
    inviteCode: user.inviteCode,
  };
  if (user.role === 'student') {
    base.studentId = user.studentId;
    base.gradeLevel = user.gradeLevel;
  } else {
    base.children = user.children || [];
  }
  return base;
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

    // 이메일 중복 검사 (양쪽 컬렉션)
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ message: '이미 사용 중인 이메일입니다.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const inviteCode = await uniqueInviteCode();

    let user;
    if (role === 'student') {
      const prefix = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
      const suffix = Date.now().toString(36);
      user = await Student.create({
        email, passwordHash, name,
        studentId: `student-${prefix}-${suffix}`,
        gradeLevel,
        inviteCode,
      });
    } else {
      user = await Parent.create({
        email, passwordHash, name,
        children: [],
        inviteCode,
      });
    }

    // 초대 코드로 연결 시도
    let linkWarning = null;
    if (partnerCode) {
      const result = await linkByCode(user, partnerCode);
      if (!result.linked) linkWarning = result.message;
    }

    // DB에서 최신 상태 반영
    const Model = role === 'student' ? Student : Parent;
    const freshUser = await Model.findById(user._id);
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
    const user = await findUserByEmail(email);
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
    const Model = req.user.role === 'student' ? Student : Parent;
    const user = await Model.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });
    return res.status(200).json({ user: userPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: '사용자 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// 코드로 상대 역할 사용자를 찾아 연결
async function linkByCode(caller, partnerCode) {
  const code = partnerCode.toUpperCase();
  const partnerStudent = await Student.findOne({ inviteCode: code });
  const partnerParent = await Parent.findOne({ inviteCode: code });
  const partner = partnerStudent || partnerParent;

  if (!partner) return { linked: false, message: '해당 초대 코드를 찾을 수 없습니다.' };
  if (partner.role === caller.role) return { linked: false, message: '같은 역할의 초대 코드는 사용할 수 없습니다.' };

  if (caller.role === 'student') {
    // 학생이 학부모 코드 입력 → 학부모의 children에 학생 추가
    await Parent.findByIdAndUpdate(partner._id, { $addToSet: { children: caller._id } });
  } else {
    // 학부모가 학생 코드 입력 → 내 children에 학생 추가
    await Parent.findByIdAndUpdate(caller._id, { $addToSet: { children: partner._id } });
  }
  return { linked: true };
}

// PUT /api/auth/link — 가입 후 초대 코드로 연결
async function link(req, res) {
  try {
    const { partnerCode } = req.body;
    if (!partnerCode) {
      return res.status(400).json({ message: '초대 코드를 입력해주세요.' });
    }

    const Model = req.user.role === 'student' ? Student : Parent;
    const caller = await Model.findById(req.user.id);
    if (!caller) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const result = await linkByCode(caller, partnerCode);
    if (!result.linked) {
      return res.status(400).json({ message: result.message });
    }

    const freshUser = await Model.findById(req.user.id);
    const token = generateToken(freshUser);
    return res.status(200).json({ token, user: userPayload(freshUser) });
  } catch (error) {
    return res.status(500).json({ message: '연결에 실패했습니다.', error: error.message });
  }
}

module.exports = { register, login, me, link };

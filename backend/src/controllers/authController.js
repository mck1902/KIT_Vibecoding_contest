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

// Parent의 children(ObjectId[])를 populate해 childStudentIds(string[]) 포함한 페이로드 생성
async function buildUserPayload(user) {
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
    // children populate → childStudentIds(string[]) 추출 (sessionController 호환)
    const populated = await Parent.findById(user._id).populate('children', 'studentId');
    base.children = (populated?.children || []).map(c => c._id);
    base.childStudentIds = (populated?.children || []).map(c => c.studentId);
  }
  return base;
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
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
    // BUG-03: 학생은 한 명의 학부모에만 연결 가능
    const existingParent = await Parent.findOne({ children: caller._id });
    if (existingParent) {
      if (existingParent._id.equals(partner._id)) {
        return { linked: false, message: '이미 연결된 학부모입니다.' };
      }
      return { linked: false, message: '이미 연결된 학부모가 있습니다. 먼저 연결을 해제해주세요.' };
    }
    // 학생이 학부모 코드 입력 → 학부모의 children에 학생 추가
    await Parent.findByIdAndUpdate(partner._id, { $addToSet: { children: caller._id } });
  } else {
    // 이미 연결된 자녀 중복 체크
    const alreadyLinked = caller.children.some(c => c.equals(partner._id));
    if (alreadyLinked) {
      return { linked: false, message: '이미 연결된 자녀입니다.' };
    }
    // 해당 학생이 다른 학부모에 이미 연결된 경우 차단
    const existingParent = await Parent.findOne({ children: partner._id });
    if (existingParent) {
      return { linked: false, message: '해당 학생은 이미 다른 학부모와 연결되어 있습니다.' };
    }
    // 학부모가 학생 코드 입력 → 내 children에 학생 추가
    await Parent.findByIdAndUpdate(caller._id, { $addToSet: { children: partner._id } });
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

    // 초대 코드로 연결 시도 (실패해도 가입은 성공)
    let linkWarning = null;
    if (partnerCode) {
      const result = await linkByCode(user, partnerCode);
      if (!result.linked) linkWarning = result.message;
    }

    const Model = role === 'student' ? Student : Parent;
    const freshUser = await Model.findById(user._id);
    const payload = await buildUserPayload(freshUser);
    const token = signToken(payload);
    return res.status(201).json({ token, user: payload, ...(linkWarning && { linkWarning }) });
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
    const payload = await buildUserPayload(user);
    const token = signToken(payload);
    return res.status(200).json({ token, user: payload });
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

    // inviteCode가 없는 기존 계정은 자동 발급
    if (!user.inviteCode) {
      user.inviteCode = await uniqueInviteCode();
      await user.save();
    }

    const payload = await buildUserPayload(user);
    return res.status(200).json({ user: payload });
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

    const Model = req.user.role === 'student' ? Student : Parent;
    const caller = await Model.findById(req.user.id);
    if (!caller) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    const result = await linkByCode(caller, partnerCode);
    if (!result.linked) {
      return res.status(400).json({ message: result.message });
    }

    const freshUser = await Model.findById(req.user.id);
    const payload = await buildUserPayload(freshUser);
    const token = signToken(payload);
    return res.status(200).json({ token, user: payload });
  } catch (error) {
    return res.status(500).json({ message: '연결에 실패했습니다.', error: error.message });
  }
}

// GET /api/auth/child — 연결된 자녀 목록 조회 (학부모 전용)
async function getChild(req, res) {
  try {
    const parent = await Parent.findById(req.user.id).populate('children', 'name gradeLevel studentId');
    if (!parent?.children?.length) {
      return res.status(200).json({ children: [] });
    }
    return res.status(200).json({
      children: parent.children.map(c => ({ name: c.name, gradeLevel: c.gradeLevel, studentId: c.studentId })),
    });
  } catch (error) {
    return res.status(500).json({ message: '자녀 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// GET /api/auth/parent — 연결된 학부모 정보 조회 (학생 전용)
async function getParent(req, res) {
  try {
    const student = await Student.findById(req.user.id);
    if (!student) return res.status(200).json({ parent: null });
    const parent = await Parent.findOne({ children: student._id }).select('name inviteCode');
    if (!parent) return res.status(200).json({ parent: null });
    return res.status(200).json({ parent: { name: parent.name, inviteCode: parent.inviteCode } });
  } catch (error) {
    return res.status(500).json({ message: '학부모 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// DELETE /api/auth/link — 연결 해제
// 학생: 학부모의 children에서 본인 제거
// 학부모: ?studentId 쿼리로 특정 자녀 제거 또는 전체 해제
async function unlink(req, res) {
  try {
    if (req.user.role === 'student') {
      const student = await Student.findById(req.user.id);
      await Parent.updateMany(
        { children: student._id },
        { $pull: { children: student._id } }
      );
      return res.status(200).json({ message: '연결이 해제되었습니다.' });
    } else {
      const { studentId } = req.query;
      let update;
      if (studentId) {
        const student = await Student.findOne({ studentId });
        if (!student) return res.status(404).json({ message: '해당 자녀를 찾을 수 없습니다.' });
        update = { $pull: { children: student._id } };
      } else {
        update = { $set: { children: [] } };
      }
      const freshParent = await Parent.findByIdAndUpdate(req.user.id, update, { new: true });
      const payload = await buildUserPayload(freshParent);
      const token = signToken(payload);
      return res.status(200).json({ token, user: payload });
    }
  } catch (error) {
    return res.status(500).json({ message: '연결 해제에 실패했습니다.', error: error.message });
  }
}

// PATCH /api/auth/profile — 이름 또는 비밀번호 변경
async function updateProfile(req, res) {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const Model = req.user.role === 'student' ? Student : Parent;
    const user = await Model.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    if (name) user.name = name.trim();

    if (newPassword) {
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    const payload = await buildUserPayload(user);
    const token = signToken(payload);
    return res.status(200).json({ token, user: payload });
  } catch (error) {
    return res.status(500).json({ message: '프로필 수정에 실패했습니다.', error: error.message });
  }
}

module.exports = { register, login, me, link, updateProfile, getChild, getParent, unlink };

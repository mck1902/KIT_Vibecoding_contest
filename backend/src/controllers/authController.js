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
    { id: user._id, email: user.email, role: user.role, name: user.name, studentId: user.studentId, childStudentIds: user.childStudentIds ?? [], gradeLevel: user.gradeLevel, inviteCode: user.inviteCode },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function userPayload(user) {
  return { id: user._id, email: user.email, role: user.role, name: user.name, studentId: user.studentId, childStudentIds: user.childStudentIds ?? [], gradeLevel: user.gradeLevel, inviteCode: user.inviteCode };
}

// 코드로 반대 역할 사용자를 찾아 연결 처리 (가입 시 호출)
async function linkByCode(newUser, partnerCode) {
  const partner = await User.findOne({ inviteCode: partnerCode.toUpperCase() });
  if (!partner) return { linked: false, message: '해당 초대 코드를 찾을 수 없습니다.' };
  if (partner.role === newUser.role) return { linked: false, message: '같은 역할의 초대 코드는 사용할 수 없습니다.' };

  if (newUser.role === 'student') {
    // 학생 가입 → 학부모의 childStudentIds에 추가
    if (!partner.childStudentIds.includes(newUser.studentId)) {
      await User.findByIdAndUpdate(partner._id, { $push: { childStudentIds: newUser.studentId } });
    }
  } else {
    // 학부모 가입 → 본인 childStudentIds에 추가
    if (!newUser.childStudentIds.includes(partner.studentId)) {
      await User.findByIdAndUpdate(newUser._id, { $push: { childStudentIds: partner.studentId } });
      newUser.childStudentIds = [...(newUser.childStudentIds ?? []), partner.studentId];
    }
  }
  return { linked: true };
}

// POST /api/auth/register
async function register(req, res) {
  try {
    const { email, password, role, name, gradeLevel, partnerCode } = req.body;
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
      childStudentIds: [],
      gradeLevel: role === 'student' ? gradeLevel : null,
      inviteCode,
    });

    // 초대 코드로 상대방 연결 시도 (실패해도 가입은 성공)
    let linkWarning = null;
    if (partnerCode) {
      const result = await linkByCode(user, partnerCode);
      if (!result.linked) linkWarning = result.message;
    }

    // DB에서 최신 상태 반영
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

    // inviteCode가 없는 기존 계정은 자동 발급
    if (!user.inviteCode) {
      user.inviteCode = await uniqueInviteCode();
      await user.save();
    }

    return res.status(200).json({ user: userPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: '사용자 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// PUT /api/auth/link — 초대 코드로 연결 (다자녀 지원)
async function link(req, res) {
  try {
    const { partnerCode } = req.body;
    const partner = await User.findOne({ inviteCode: partnerCode.toUpperCase() });
    if (!partner) {
      return res.status(404).json({ message: '해당 초대 코드를 찾을 수 없습니다.' });
    }
    if (partner.role === req.user.role) {
      return res.status(400).json({ message: '같은 역할의 초대 코드는 사용할 수 없습니다.' });
    }

    const currentUser = await User.findById(req.user.id);

    if (currentUser.role === 'student') {
      // 학생 → 학부모의 childStudentIds에 추가 (중복 방지)
      if (partner.childStudentIds.includes(currentUser.studentId)) {
        return res.status(409).json({ message: '이미 연결된 학부모입니다.' });
      }
      await User.findByIdAndUpdate(partner._id, { $push: { childStudentIds: currentUser.studentId } });
    } else {
      // 학부모 → 본인 childStudentIds에 추가 (중복 방지)
      if (currentUser.childStudentIds.includes(partner.studentId)) {
        return res.status(409).json({ message: '이미 연결된 자녀입니다.' });
      }
      await User.findByIdAndUpdate(currentUser._id, { $push: { childStudentIds: partner.studentId } });
    }

    const freshUser = await User.findById(req.user.id);
    const token = generateToken(freshUser);
    return res.status(200).json({ token, user: userPayload(freshUser) });
  } catch (error) {
    return res.status(500).json({ message: '연결에 실패했습니다.', error: error.message });
  }
}

// GET /api/auth/parent — 연결된 학부모 정보 조회 (학생 전용)
async function getParent(req, res) {
  try {
    const student = await User.findById(req.user.id);
    if (!student?.studentId) return res.status(200).json({ parent: null });
    const parent = await User.findOne({ childStudentIds: student.studentId }).select('name inviteCode');
    if (!parent) return res.status(200).json({ parent: null });
    return res.status(200).json({ parent: { name: parent.name, inviteCode: parent.inviteCode } });
  } catch (error) {
    return res.status(500).json({ message: '학부모 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// DELETE /api/auth/link — 연결 해제
// 학생: 학부모의 childStudentIds에서 본인 제거
// 학부모: ?studentId 쿼리 파라미터로 특정 자녀 제거, 없으면 전체 해제
async function unlink(req, res) {
  try {
    if (req.user.role === 'student') {
      const student = await User.findById(req.user.id);
      await User.updateMany(
        { childStudentIds: student.studentId },
        { $pull: { childStudentIds: student.studentId } }
      );
      return res.status(200).json({ message: '연결이 해제되었습니다.' });
    } else {
      const { studentId } = req.query;
      const update = studentId
        ? { $pull: { childStudentIds: studentId } }
        : { $set: { childStudentIds: [] } };

      const freshUser = await User.findByIdAndUpdate(req.user.id, update, { new: true });
      const token = generateToken(freshUser);
      return res.status(200).json({ token, user: userPayload(freshUser) });
    }
  } catch (error) {
    return res.status(500).json({ message: '연결 해제에 실패했습니다.', error: error.message });
  }
}

// GET /api/auth/child — 연결된 자녀 목록 조회 (학부모 전용)
async function getChild(req, res) {
  try {
    const parent = await User.findById(req.user.id);
    if (!parent?.childStudentIds?.length) {
      return res.status(200).json({ children: [] });
    }
    const children = await User.find({ studentId: { $in: parent.childStudentIds } }).select('name gradeLevel studentId');
    return res.status(200).json({
      children: children.map(c => ({ name: c.name, gradeLevel: c.gradeLevel, studentId: c.studentId })),
    });
  } catch (error) {
    return res.status(500).json({ message: '자녀 정보를 불러오지 못했습니다.', error: error.message });
  }
}

// PATCH /api/auth/profile — 이름 또는 비밀번호 변경
async function updateProfile(req, res) {
  try {
    const { name, currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '사용자를 찾을 수 없습니다.' });

    if (name) user.name = name.trim();

    if (newPassword) {
      const match = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!match) {
        return res.status(401).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
      }
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    const token = generateToken(user);
    return res.status(200).json({ token, user: userPayload(user) });
  } catch (error) {
    return res.status(500).json({ message: '프로필 수정에 실패했습니다.', error: error.message });
  }
}

module.exports = { register, login, me, link, updateProfile, getChild, getParent, unlink };

const { z } = require('zod');

// 검증 미들웨어 팩토리
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const message = issues[0]?.message || '입력값이 올바르지 않습니다.';
      return res.status(400).json({ message });
    }
    req.body = result.data;
    next();
  };
}

// ── Auth 스키마 ──────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('유효한 이메일 형식이 아닙니다.'),
  password: z.string().min(6, '비밀번호는 6자 이상이어야 합니다.'),
  role: z.enum(['student', 'parent'], { message: '역할은 student 또는 parent여야 합니다.' }),
  name: z.string().min(1, '이름을 입력해주세요.').max(50, '이름은 50자 이하여야 합니다.'),
  gradeLevel: z.enum(['middle', 'high']).optional(),
  partnerCode: z.string().length(6).optional(),
}).refine(
  (data) => data.role !== 'student' || !!data.gradeLevel,
  { message: '학생은 학교급(중학생/고등학생)을 선택해야 합니다.', path: ['gradeLevel'] }
);

const loginSchema = z.object({
  email: z.string().email('유효한 이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호를 입력해주세요.'),
});

const linkSchema = z.object({
  partnerCode: z.string().min(1, '초대 코드를 입력해주세요.').max(10),
});

const updateProfileSchema = z.object({
  name: z.string().min(1, '이름은 1자 이상이어야 합니다.').max(50).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, '새 비밀번호는 6자 이상이어야 합니다.').optional(),
}).refine(
  (data) => data.name || data.newPassword,
  { message: '변경할 항목을 입력해주세요.' }
).refine(
  (data) => !data.newPassword || !!data.currentPassword,
  { message: '현재 비밀번호를 입력해주세요.', path: ['currentPassword'] }
);

// ── Session 스키마 ───────────────────────────────

const createSessionSchema = z.object({
  lectureId: z.string().min(1, 'lectureId는 필수입니다.'),
  subject: z.string().max(100).optional().default(''),
});

const endSessionSchema = z.object({
  abandoned:  z.boolean().optional().default(false),
  watchedSec: z.number().finite().min(0).optional().default(0),
});

const recordObject = z.object({
  timestamp: z.string().datetime({ message: 'timestamp는 ISO 8601 형식이어야 합니다.' }),
  status: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
  focusProb: z.number().min(0).max(100).nullable().optional(),
  videoTime: z.number().min(0).nullable().optional(),
});

const addRecordsSchema = z.object({
  records: z.union([
    z.array(recordObject).min(1, 'records는 1개 이상이어야 합니다.'),
    recordObject,
  ]),
});

const addDepartureSchema = z.object({
  leaveTime: z.string().datetime({ message: 'leaveTime은 ISO 8601 형식이어야 합니다.' }),
  returnTime: z.string().datetime({ message: 'returnTime은 ISO 8601 형식이어야 합니다.' }),
  duration: z.number().min(0, 'duration은 0 이상이어야 합니다.'),
});

module.exports = {
  validate,
  schemas: {
    register: registerSchema,
    login: loginSchema,
    link: linkSchema,
    updateProfile: updateProfileSchema,
    createSession: createSessionSchema,
    endSession: endSessionSchema,
    addRecords: addRecordsSchema,
    addDeparture: addDepartureSchema,
    edupointSettings: z.object({
      targetRate: z.number().int().min(50).max(95),
      rewardPerSession: z.number().int().min(10).max(500),
      weeklyBonusCount: z.number().int().min(1).max(7),
      weeklyBonusReward: z.number().int().min(10).max(5000),
    }),
    edupointCharge: z.object({
      amount: z.number().refine(v => [1000, 5000, 10000].includes(v), {
        message: '충전 금액은 1000, 5000, 10000 중 하나여야 합니다.',
      }),
    }),
  },
};

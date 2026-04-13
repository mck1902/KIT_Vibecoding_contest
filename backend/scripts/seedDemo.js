/**
 * seedDemo.js — 데모용 세션 데이터 MongoDB에 삽입
 *
 * 실행: node scripts/seedDemo.js
 *
 * 목적:
 *   - 심사위원이 직접 28분을 기다리지 않아도
 *     풍부한 리포트와 RAG 분석을 바로 볼 수 있도록
 *   - 집중도가 자연스럽게 변화하는 패턴 포함
 *   - 탭 이탈 2회 포함 (RAG 분석에서 언급됨)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Session = require('../src/models/Session');

// ── 집중도 시뮬레이션 파라미터 ──────────────────────────
// status 1~5, 3초 간격, 28분 = 560개 records
function generateRecords(durationMin, startTime) {
  const records = [];
  const totalRecords = Math.floor((durationMin * 60) / 3);

  let status = 1;

  for (let i = 0; i < totalRecords; i++) {
    const elapsedMin = (i * 3) / 60;
    const timestamp = new Date(startTime.getTime() + i * 3000);

    // 시간대별 집중도 패턴
    let targetStatus;
    if (elapsedMin < 5) {
      targetStatus = Math.random() < 0.8 ? 1 : 2;          // 도입: 집중
    } else if (elapsedMin < 10) {
      targetStatus = Math.random() < 0.6 ? 2 : 1;          // 초반: 양호
    } else if (elapsedMin < 15) {
      targetStatus = Math.random() < 0.5 ? 2 : 3;          // 중반: 약간 하락
    } else if (elapsedMin < 22) {
      // 핵심 어려운 구간: 집중도 뚜렷한 하락
      const r = Math.random();
      targetStatus = r < 0.2 ? 2 : r < 0.5 ? 3 : r < 0.8 ? 4 : 5;
    } else {
      targetStatus = Math.random() < 0.6 ? 2 : 3;          // 후반: 회복
    }

    // 연속성 유지 (급격한 변화 방지)
    if (targetStatus > status + 1) targetStatus = status + 1;
    if (targetStatus < status - 1) targetStatus = status - 1;
    status = Math.min(5, Math.max(1, targetStatus));

    const focusMap = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };
    records.push({
      timestamp,
      status,
      confidence: parseFloat((0.75 + Math.random() * 0.2).toFixed(2)),
    });
  }

  return records;
}

// ── 탭 이탈 기록 ─────────────────────────────────────
function generateDepartures(sessionStartTime) {
  return [
    {
      leaveTime: new Date(sessionStartTime.getTime() + 8 * 60 * 1000),    // 8분
      returnTime: new Date(sessionStartTime.getTime() + 9 * 60 * 1000),   // 9분 (1분 이탈)
      duration: 60 * 1000,
    },
    {
      leaveTime: new Date(sessionStartTime.getTime() + 17 * 60 * 1000),   // 17분
      returnTime: new Date(sessionStartTime.getTime() + 19.5 * 60 * 1000),// 19분30초 (2.5분 이탈)
      duration: 2.5 * 60 * 1000,
    },
  ];
}

// ── 메인 ────────────────────────────────────────────
async function seed() {
  const dbTarget = process.env.DB_TARGET || 'test';
  const dbUri = dbTarget === 'dev' ? process.env.MONGODB_URI_DEV : process.env.MONGODB_URI_TEST;
  if (!dbUri) { console.error(`MONGODB_URI_${dbTarget.toUpperCase()}가 .env에 설정되지 않았습니다.`); process.exit(1); }
  await mongoose.connect(dbUri);
  console.log(`MongoDB connected (${dbTarget})`);

  // 기존 데모 세션 제거
  await Session.deleteMany({ studentId: 'demo-student-001' });
  console.log('기존 데모 세션 삭제 완료');

  const lectures = [
    { lectureId: 'lec-001', subject: '수학', durationMin: 28 },
    { lectureId: 'lec-002', subject: '영어', durationMin: 40 },
    { lectureId: 'lec-003', subject: '화학', durationMin: 30 },
  ];

  const baseDate = new Date('2026-04-09T14:00:00.000Z');

  for (let i = 0; i < lectures.length; i++) {
    const lec = lectures[i];
    const sessionStart = new Date(baseDate.getTime() + i * 2 * 60 * 60 * 1000); // 2시간 간격

    const records = generateRecords(lec.durationMin, sessionStart);
    const departures = generateDepartures(sessionStart);

    const session = await Session.create({
      studentId: 'demo-student-001',
      lectureId: lec.lectureId,
      subject: lec.subject,
      startTime: sessionStart,
      endTime: new Date(sessionStart.getTime() + lec.durationMin * 60 * 1000),
      records,
      departures,
      completionRate: 100,    // 완강 데모
      ragAnalysis: null, // 첫 조회 시 Claude API 자동 생성
    });

    console.log(`✅ ${lec.subject} 세션 생성: ${session._id} (records: ${records.length}개)`);
  }

  console.log('\n데모 세션 ID를 메모해두세요 — /student/report/:sessionId 에서 바로 확인 가능합니다.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed 실패:', err.message);
  process.exit(1);
});

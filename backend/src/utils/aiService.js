const OpenAI = require('openai');

// --- OpenAI 클라이언트 ---
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000 });
}

/**
 * OpenAI API 호출을 재시도하는 래퍼
 * @param {Function} fn - async 함수 (API 호출)
 * @param {number} maxRetries - 최대 재시도 횟수 (기본 2)
 * @param {number} baseDelay - 첫 재시도 대기 시간 ms (기본 1000)
 */
async function withRetry(fn, maxRetries = 2, baseDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error.status === 401 || error.status === 400) {
        throw error;
      }
      const delay = error.status === 429
        ? baseDelay * Math.pow(2, attempt) * 2
        : baseDelay * Math.pow(2, attempt);
      if (attempt < maxRetries) {
        console.warn(`[OpenAI] 요청 실패 (시도 ${attempt + 1}/${maxRetries + 1}), ${delay}ms 후 재시도...`, error.message || '');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * SRT 자막 텍스트를 GPT-4o-mini로 분석하여 구간별 주제/키워드 추출
 */
async function analyzeLectureContent(subtitleText, lectureTitle) {
  const client = getOpenAIClient();

  const response = await withRetry(() => client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: '당신은 교육 콘텐츠 분석 전문가입니다. 반드시 JSON 형식으로만 응답하세요.',
      },
      {
        role: 'user',
        content: `다음은 "${lectureTitle}" 강의 자막입니다. 자막을 분석하여 구간별 주제와 키워드를 추출해주세요.

자막:
${subtitleText}

아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "segments": [
    { "start": "00:00", "end": "05:00", "topic": "주제명", "keywords": ["키워드1", "키워드2"] }
  ]
}`,
      },
    ],
  }));

  const text = response.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('OpenAI API 응답에서 JSON을 파싱할 수 없습니다.');
  return JSON.parse(jsonMatch[0]);
}

const { STATUS_LABEL, calcFocus } = require('./constants');

// --- 분석 유틸리티 함수들 ---

/** 경과 시간(초)을 MM:SS 포맷으로 변환 */
function formatElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 1분 단위 집중도 맵 생성 (학습 시작 후 경과 분 기준) */
function buildMinuteFocusMap(records, sessionStartTime) {
  const byMinute = {};
  const startMs = new Date(sessionStartTime).getTime();
  for (const r of records) {
    const elapsed = Math.floor((new Date(r.timestamp).getTime() - startMs) / 60000);
    const key = elapsed;
    if (!byMinute[key]) byMinute[key] = [];
    byMinute[key].push(
      r.focusProb != null ? Math.round(r.focusProb) : calcFocus(r.status, r.confidence)
    );
  }
  const result = {};
  for (const [key, vals] of Object.entries(byMinute)) {
    result[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return result;
}

/** videoTime 기반 1분 단위 집중도 맵 (영상 시간 기준) */
function buildVideoMinuteFocusMap(records) {
  const byMinute = {};
  for (const r of records) {
    if (r.videoTime == null) continue;
    const key = Math.floor(r.videoTime / 60);
    if (!byMinute[key]) byMinute[key] = [];
    byMinute[key].push(
      r.focusProb != null ? Math.round(r.focusProb) : calcFocus(r.status, r.confidence)
    );
  }
  const result = {};
  for (const [key, vals] of Object.entries(byMinute)) {
    result[key] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return result;
}

/** 연속 status 5가 5회 이상인 구간을 얼굴 미감지(자리 이탈 추정)로 집계 */
function detectFaceAbsence(records, sessionStartTime) {
  const startMs = new Date(sessionStartTime).getTime();
  const absences = [];
  let runStart = -1;
  let runLength = 0;

  for (let i = 0; i < records.length; i++) {
    if (records[i].status === 5) {
      if (runStart === -1) runStart = i;
      runLength++;
    } else {
      if (runLength >= 5) {
        const startSec = Math.floor((new Date(records[runStart].timestamp).getTime() - startMs) / 1000);
        const endSec = Math.floor((new Date(records[i - 1].timestamp).getTime() - startMs) / 1000);
        absences.push({ startSec, endSec, count: runLength });
      }
      runStart = -1;
      runLength = 0;
    }
  }
  if (runLength >= 5) {
    const startSec = Math.floor((new Date(records[runStart].timestamp).getTime() - startMs) / 1000);
    const endSec = Math.floor((new Date(records[records.length - 1].timestamp).getTime() - startMs) / 1000);
    absences.push({ startSec, endSec, count: runLength });
  }
  return absences;
}

/** 표준편차 계산 */
function stdDev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(sq) * 10) / 10;
}

/** 집중→비집중 전환 횟수 (status 1,2 → 3,4,5) */
function countFocusDrops(records) {
  let count = 0;
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1].status;
    const curr = records[i].status;
    if ((prev === 1 || prev === 2) && (curr >= 3)) count++;
  }
  return count;
}

/** 이탈(departure) 후 집중(status 1,2) 회복까지 걸린 시간(초) 계산 */
function calcRecoveryTimes(departures, records, sessionStartTime) {
  if (!departures.length || !records.length) return [];
  const startMs = new Date(sessionStartTime).getTime();

  return departures.map((dep, i) => {
    const returnMs = dep.returnTime ? new Date(dep.returnTime).getTime() : null;
    if (!returnMs) return { index: i + 1, recoverySec: null };

    // 복귀 후 첫 집중(status 1 또는 2) record 찾기
    let recoverySec = null;
    for (const r of records) {
      const rMs = new Date(r.timestamp).getTime();
      if (rMs < returnMs) continue;
      if (r.status === 1 || r.status === 2) {
        recoverySec = Math.round((rMs - returnMs) / 1000);
        break;
      }
    }
    return { index: i + 1, recoverySec };
  });
}

/** 레코드 배열을 N등분하여 각 구간 평균 집중도 */
function splitAvgFocus(records, n) {
  if (records.length === 0) return Array(n).fill(0);
  const size = Math.ceil(records.length / n);
  const results = [];
  for (let i = 0; i < n; i++) {
    const chunk = records.slice(i * size, (i + 1) * size);
    if (chunk.length === 0) { results.push(0); continue; }
    const avg = chunk.reduce((s, r) =>
      s + (r.focusProb != null ? Math.round(r.focusProb) : calcFocus(r.status, r.confidence)), 0
    ) / chunk.length;
    results.push(Math.round(avg));
  }
  return results;
}

/** 이탈 시점에 해당하는 lecture segment 주제 매칭 (경과 시간 기준) */
function matchDepartureSegments(departures, lectureSegments, sessionStartTime) {
  const startMs = new Date(sessionStartTime).getTime();

  return departures.map((dep, i) => {
    const leaveMs = new Date(dep.leaveTime).getTime();
    const elapsedSec = Math.floor((leaveMs - startMs) / 1000);
    const elapsedMin = elapsedSec / 60;
    const elapsedFormatted = formatElapsed(elapsedSec);

    let matchedTopic = null;
    if (lectureSegments && lectureSegments.length > 0) {
      for (const seg of lectureSegments) {
        const segStart = parseMinutes(seg.start);
        const segEnd = parseMinutes(seg.end);
        if (elapsedMin >= segStart && elapsedMin <= segEnd) {
          matchedTopic = seg.topic;
          break;
        }
      }
    }
    const dur = Math.round((dep.duration || 0) / 1000);
    return {
      index: i + 1,
      elapsed: elapsedFormatted,
      duration: dur,
      topic: matchedTopic || '해당 구간 정보 없음',
    };
  });
}

/** "MM:SS" 또는 "HH:MM:SS" → 총 분(소수) 변환 */
function parseMinutes(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return 0;
}

/**
 * 세션 집중도 데이터 + 강좌 자막/구간 정보를 결합하여
 * GPT-4o-mini로 학부모용 학습 태도 분석 리포트 생성
 */
async function generateRagReport(sessionData, lectureSegments, lectureTitle) {
  const { records: rawRecords, departures, pauseEvents = [], avgFocus, startTime, endTime } = sessionData;

  // --- 선행조건: 데이터 부족 시 GPT 호출하지 않음 ---
  if (!rawRecords || rawRecords.length < 10) {
    return '학습 데이터가 부족합니다 (최소 10초 이상 학습 필요).';
  }

  // 일시정지 기간의 레코드 제외
  let records = rawRecords;
  if (pauseEvents.length > 0) {
    const pauseRanges = pauseEvents
      .filter(p => p.pauseTime && p.resumeTime)
      .map(p => [new Date(p.pauseTime).getTime(), new Date(p.resumeTime).getTime()]);
    if (pauseRanges.length > 0) {
      records = rawRecords.filter(r => {
        const t = new Date(r.timestamp).getTime();
        return !pauseRanges.some(([s, e]) => t >= s && t <= e);
      });
    }
  }

  if (records.length < 10) {
    return '유효 학습 데이터가 부족합니다 (일시정지 제외 후 최소 10초 이상 필요).';
  }

  const client = getOpenAIClient();
  const total = records.length;
  const startMs = new Date(startTime).getTime();

  // --- 1. 총 학습 시간 ---
  const totalSec = (startTime && endTime)
    ? Math.round((new Date(endTime) - new Date(startTime)) / 1000)
    : 0;
  const totalMin = Math.floor(totalSec / 60);
  const remainSec = totalSec % 60;
  const durationText = totalSec > 0 ? `${totalMin}분 ${remainSec}초` : '측정 불가';

  // --- 2. 상태별 분포 ---
  const statusCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of records) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  const statusDistText = Object.entries(statusCounts)
    .map(([k, v]) => `${STATUS_LABEL[k]}: ${v}회 (${Math.round(v / total * 100)}%)`)
    .join('\n');

  // --- confidence 분석 ---
  const confidenceValues = records.map(r => r.confidence || 0);
  const avgConfidence = Math.round(confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length * 100);
  const lowConfRecords = records.filter(r => (r.confidence || 0) < 0.5);
  const lowConfRatio = Math.round(lowConfRecords.length / total * 100);

  // --- 3. focusProb 기반 1분 단위 타임라인 (경과 시간 기준) ---
  const minuteMap = buildMinuteFocusMap(records, startTime);
  const videoMinuteMap = buildVideoMinuteFocusMap(records);
  const videoTimelineText = Object.entries(videoMinuteMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([m, v]) => `영상 ${formatElapsed(Number(m) * 60)}: ${v}%`)
    .join(', ');
  const minuteValues = Object.values(minuteMap);
  const timelineText = Object.entries(minuteMap)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([m, v]) => `${formatElapsed(Number(m) * 60)}: ${v}%`)
    .join(', ');

  // --- 4. 집중도 변동 분석 ---
  const focusStdDev = stdDev(minuteValues);
  const focusDropCount = countFocusDrops(records);
  const stabilityLabel = focusStdDev < 10 ? '안정적' : focusStdDev < 20 ? '보통' : '불안정';

  // --- 5. 세션 3등분 (전반/중반/후반) ---
  const [firstThird, midThird, lastThird] = splitAvgFocus(records, 3);

  // --- 6. 졸음 분석 (얼굴 미감지 구간 제외) ---
  const faceAbsences = detectFaceAbsence(records, startTime);
  const faceAbsenceIndices = new Set();
  for (const ab of faceAbsences) {
    for (let i = 0; i < records.length; i++) {
      const sec = Math.floor((new Date(records[i].timestamp).getTime() - startMs) / 1000);
      if (sec >= ab.startSec && sec <= ab.endSec && records[i].status === 5) {
        faceAbsenceIndices.add(i);
      }
    }
  }
  const pureSleepRecords = records.filter((r, i) => r.status === 5 && !faceAbsenceIndices.has(i));
  const sleepRatio = Math.round(pureSleepRecords.length / total * 100);
  const sleepTimes = pureSleepRecords.slice(0, 10).map(r => {
    const sec = Math.floor((new Date(r.timestamp).getTime() - startMs) / 1000);
    return formatElapsed(sec);
  });
  const sleepTimesText = sleepTimes.length > 0
    ? `발생 시점 (학습 시작 후): ${[...new Set(sleepTimes)].join(', ')}`
    : '졸음 미감지';

  // --- 7. 얼굴 미감지(자리 이탈 추정) 분석 ---
  const faceAbsenceTotalSec = faceAbsences.reduce((s, a) => s + (a.endSec - a.startSec), 0);
  const faceAbsenceText = faceAbsences.length > 0
    ? `${faceAbsences.length}회 (총 약 ${faceAbsenceTotalSec}초)`
    : '없음';
  const faceAbsenceDetailText = faceAbsences.length > 0
    ? faceAbsences.map((a, i) =>
        `  ${i + 1}. ${formatElapsed(a.startSec)}~${formatElapsed(a.endSec)} (약 ${a.endSec - a.startSec}초, 연속 ${a.count}회 미감지)`
      ).join('\n')
    : '';

  // --- 8. 최고/최저 집중 구간 (1분 단위 top3, bottom3) ---
  const sorted = Object.entries(minuteMap).sort((a, b) => b[1] - a[1]);
  const top3 = sorted.slice(0, 3).map(([m, v]) => `${formatElapsed(Number(m) * 60)}(${v}%)`).join(', ');
  const bottom3 = sorted.slice(-3).reverse().map(([m, v]) => `${formatElapsed(Number(m) * 60)}(${v}%)`).join(', ');

  // --- 9. 이탈과 강의 내용 교차 분석 ---
  const departureTotal = departures.length > 0
    ? Math.round(departures.reduce((s, d) => s + (d.duration || 0), 0) / 1000)
    : 0;
  const departureSegments = matchDepartureSegments(departures, lectureSegments, startTime);
  const departureText = departures.length > 0
    ? `${departures.length}회 (총 이탈 시간: ${departureTotal}초)`
    : '없음';
  // 이탈 심각도 분류
  const shortDepartures = departures.filter(d => (d.duration || 0) < 10000).length; // 10초 미만
  const medDepartures = departures.filter(d => (d.duration || 0) >= 10000 && (d.duration || 0) < 60000).length; // 10초~1분
  const longDepartures = departures.filter(d => (d.duration || 0) >= 60000).length; // 1분 이상
  const departureSeverityText = departures.length > 0
    ? `짧은 이탈(10초 미만): ${shortDepartures}회, 중간 이탈(10초~1분): ${medDepartures}회, 긴 이탈(1분 이상): ${longDepartures}회`
    : '';
  const departureDetailText = departureSegments.length > 0
    ? departureSegments.map(d =>
        `  ${d.index}. 학습 시작 후 ${d.elapsed} (${d.duration}초간 이탈) — 강의 주제: ${d.topic}`
      ).join('\n')
    : '';

  // --- 10. 이탈-강의내용 교차 분석 ---
  const crossAnalysisText = departureSegments.length > 0
    ? departureSegments.map(d =>
        `  - ${d.elapsed} 시점 이탈 → 진행 중 주제: ${d.topic}`
      ).join('\n')
    : '이탈 없음 또는 강의 구간 정보 없음';

  // --- 집중 회복 시간 ---
  const recoveryTimes = calcRecoveryTimes(departures, records, startTime);
  const avgRecovery = recoveryTimes.filter(r => r.recoverySec != null);
  const avgRecoverySec = avgRecovery.length > 0
    ? Math.round(avgRecovery.reduce((s, r) => s + r.recoverySec, 0) / avgRecovery.length)
    : null;
  const recoveryText = avgRecoverySec != null
    ? `평균 집중 회복 시간: ${avgRecoverySec}초 (이탈 복귀 후 다시 집중 상태까지)`
    : '집중 회복 데이터 없음';

  // --- 일시정지 데이터 ---
  const pauseTotal = pauseEvents.length;
  const pauseTotalDuration = Math.round(pauseEvents.reduce((s, p) => s + (p.duration || 0), 0) / 1000);
  const pauseText = pauseTotal > 0
    ? `${pauseTotal}회 (총 ${pauseTotalDuration}초)`
    : '없음';
  const pauseDetailText = pauseEvents.slice(0, 10).map((p, i) => {
    const videoTimeFmt = p.videoTime != null ? formatElapsed(Math.round(p.videoTime)) : '?';
    const dur = Math.round((p.duration || 0) / 1000);
    return `  ${i + 1}. 영상 ${videoTimeFmt} 시점에서 ${dur}초간 일시정지`;
  }).join('\n');

  // --- 11. 구간별 강의 내용 ---
  const segmentsText = (lectureSegments && lectureSegments.length > 0)
    ? lectureSegments.map(s => `${s.start}~${s.end} [${s.topic}] 키워드: ${(s.keywords || []).join(', ')}`).join('\n')
    : '강의 구간 정보 없음';

  const systemPrompt = `당신은 10년 경력의 학습 코칭 전문가이자 교육 데이터 분석가입니다.
초중고 학생의 온라인 학습 태도 데이터를 분석하여 학부모에게 제공할 리포트를 작성합니다.

분석 원칙:
- 한국어, 학부모가 이해하기 쉬운 친근하고 전문적인 말투
- 반드시 데이터에 근거한 분석만 작성 (추측 금지)
- 긍정적인 부분을 먼저 언급하고, 개선점은 건설적으로 제안
- AI 모델 신뢰도가 낮은 구간(50% 미만)이 많으면 리포트 마지막에 "촬영 환경 개선 권고"를 포함할 것

이탈 데이터 해석 규칙 (매우 중요):
- "탭 이탈"은 학생이 브라우저 탭을 전환하거나 창을 최소화한 것이다. 강의 내용에 대한 흥미 부족이 아니라, 외부 요인(메신저, 다른 앱 등)으로 학습이 중단된 것으로 해석해야 한다.
- "얼굴 미감지"는 웹캠에 학생 얼굴이 일정 시간 잡히지 않은 것이다. 자리를 비웠거나 카메라 각도를 벗어난 것으로 해석해야 한다. 졸음과 구분할 것.
- "집중도 하락"은 AI 모델이 학생의 표정과 자세를 분석하여 판별한 것이다. 이것만 강의 내용과의 상관관계를 분석할 수 있다.
- "일시정지"는 학생이 직접 영상을 멈춘 것이다. 특정 구간에서 반복 일시정지가 발생하면 해당 내용이 어렵거나 이해가 필요한 구간일 수 있다. 반드시 부정적으로만 해석하지 말 것.
- 이 세 가지를 혼동하지 말 것.

시간 표기 규칙:
- 강의 구간 정보의 시간(예: 00:36~01:04)은 영상 경과 시간이다.
- 모든 이탈/집중도 기록의 시간도 학습 시작 후 경과 시간으로 표기되어 있다.
- 리포트에서는 "학습 시작 후 약 N분 시점" 형태로 통일하여 학부모가 이해하기 쉽게 작성할 것.

응답 형식 — 아래 5개 섹션으로 구분 (각 섹션 3~4문장):
📊 전체 학습 요약
📈 시간대별 집중도 흐름
🚪 이탈 분석
📖 구간별 학습 분석
💡 맞춤 학습 전략`;

  const userPrompt = `아래 데이터를 분석하여 학부모용 학습 태도 리포트를 작성해주세요.

[강의 정보]
강의명: ${lectureTitle}
총 학습 시간: ${durationText}

[집중도 통계]
평균 집중도: ${avgFocus}%
총 측정 횟수: ${records.length}회
상태별 분포:
${statusDistText}
집중→비집중 전환 횟수: ${focusDropCount}회
분당 집중도 표준편차: ${focusStdDev} (${stabilityLabel})
AI 모델 평균 신뢰도: ${avgConfidence}% (모델이 판단에 확신하는 정도)
낮은 신뢰도(50% 미만) 비율: ${lowConfRatio}% — 이 비율이 높으면 조명/카메라 환경이 좋지 않아 분석 정확도가 떨어질 수 있음

[시간 흐름 분석]
전반(1/3): ${firstThird}% | 중반(2/3): ${midThird}% | 후반(3/3): ${lastThird}%
최고 집중 구간: ${top3 || '데이터 부족'}
최저 집중 구간: ${bottom3 || '데이터 부족'}

[탭 이탈 기록]
이탈 횟수: ${departureText}
${departureSeverityText ? `이탈 심각도: ${departureSeverityText}` : ''}
${departureDetailText ? `상세 (학습 시작 후 경과 시간 기준):\n${departureDetailText}` : ''}

[얼굴 미감지 기록 (자리 이탈 추정)]
횟수: ${faceAbsenceText}
${faceAbsenceDetailText ? `상세 (학습 시작 후 경과 시간 기준):\n${faceAbsenceDetailText}` : ''}

[졸음 감지]
졸음 비율: ${sleepRatio}% (${pureSleepRecords.length}회/${records.length}회, 얼굴 미감지 구간 제외)
${sleepTimesText}

[일시정지 기록]
일시정지: ${pauseText}
${pauseDetailText || ''}

[강의 구간별 내용]
${segmentsText}

[이탈-강의내용 교차]
${crossAnalysisText}

[집중 회복 분석]
${recoveryText}

[1분 단위 집중도 타임라인 (학습 시작 후 경과 시간 기준)]
${timelineText || '데이터 없음'}

[영상 시간 기준 집중도 타임라인]
${videoTimelineText || '데이터 없음 (videoTime 미수집 세션)'}

위 데이터를 기반으로 5개 섹션으로 리포트를 작성해주세요. 이탈은 외부 요인, 집중도 하락은 학습 태도로 명확히 구분하여 분석하세요.`;

  const response = await withRetry(() => client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1500,
    temperature: 0.5,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }));

  return response.choices[0].message.content.trim();
}

/**
 * 저집중 구간의 자막/세그먼트를 기반으로 복습 퀴즈(객관식 3문제) 자동 생성
 */
async function generateQuiz(subtitleText, segments, lectureTitle, subject) {
  const client = getOpenAIClient();

  const segmentInfo = segments
    .map(s => `${s.start}~${s.end} [${s.topic}] 키워드: ${(s.keywords || []).join(', ')}`)
    .join('\n');

  const response = await withRetry(() => client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    temperature: 0.5,
    messages: [
      {
        role: 'system',
        content: '당신은 교육 콘텐츠 기반 퀴즈 출제 전문가입니다. 반드시 JSON 형식으로만 응답하세요.',
      },
      {
        role: 'user',
        content: `다음은 "${lectureTitle}" (${subject}) 강의에서 학생이 집중하지 못한 구간입니다.
이 구간의 핵심 개념을 확인하는 객관식 퀴즈 3문제를 생성해주세요.

[구간 정보]
${segmentInfo}

[해당 구간 자막]
${subtitleText}

아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "questions": [
    {
      "question": "문제 텍스트",
      "options": ["선택지A", "선택지B", "선택지C", "선택지D"],
      "answer": 0,
      "explanation": "정답 해설"
    }
  ]
}`,
      },
    ],
  }));

  const text = response.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('OpenAI API 응답에서 JSON을 파싱할 수 없습니다.');
  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('퀴즈 생성 결과가 유효하지 않습니다.');
  }
  for (const q of parsed.questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4
        || typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3
        || !q.explanation) {
      throw new Error('퀴즈 문제 형식이 유효하지 않습니다.');
    }
  }

  return parsed.questions.slice(0, 3);
}

module.exports = { analyzeLectureContent, generateRagReport, generateQuiz };

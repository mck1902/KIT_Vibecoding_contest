const OpenAI = require('openai');

// --- OpenAI 클라이언트 ---
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/**
 * SRT 자막 텍스트를 GPT-4o-mini로 분석하여 구간별 주제/키워드 추출
 */
async function analyzeLectureContent(subtitleText, lectureTitle) {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
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
  });

  const text = response.choices[0].message.content;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('OpenAI API 응답에서 JSON을 파싱할 수 없습니다.');
  return JSON.parse(jsonMatch[0]);
}

const { STATUS_LABEL, calcFocus } = require('./constants');

/**
 * 세션 집중도 데이터 + 강좌 자막/구간 정보를 결합하여
 * GPT-4o-mini로 학부모용 학습 태도 분석 리포트 생성
 */
async function generateRagReport(sessionData, lectureSegments, lectureTitle) {
  const client = getOpenAIClient();

  const { records, departures, avgFocus } = sessionData;

  // --- 집중도 상태별 분포 ---
  const statusCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of records) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }
  const total = records.length || 1;
  const statusDistText = Object.entries(statusCounts)
    .map(([k, v]) => `${STATUS_LABEL[k]}: ${v}회 (${Math.round(v / total * 100)}%)`)
    .join('\n');

  // --- 1분 단위 집중도 타임라인 ---
  const byMinute = {};
  for (const r of records) {
    const d = new Date(r.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!byMinute[key]) byMinute[key] = [];
    byMinute[key].push(calcFocus(r.status, r.confidence));
  }
  const timelineText = Object.entries(byMinute)
    .map(([t, vals]) => `${t}: ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`)
    .join(', ');

  // --- 구간별 강의 내용 ---
  const segmentsText = lectureSegments
    .map(s => `${s.start}~${s.end} [${s.topic}] 키워드: ${(s.keywords || []).join(', ')}`)
    .join('\n');

  // --- 이탈 정보 ---
  const departureText =
    departures.length > 0
      ? `${departures.length}회 (총 이탈 시간: ${Math.round(departures.reduce((s, d) => s + (d.duration || 0), 0) / 1000)}초)`
      : '없음';

  const departureDetail = departures.length > 0
    ? departures.map((d, i) => {
        const leave = new Date(d.leaveTime);
        const dur = Math.round((d.duration || 0) / 1000);
        return `  ${i + 1}. ${String(leave.getHours()).padStart(2, '0')}:${String(leave.getMinutes()).padStart(2, '0')} (${dur}초간 이탈)`;
      }).join('\n')
    : '';

  const systemPrompt = `당신은 초중고 학생의 온라인 학습 태도를 분석하는 전문 교육 AI입니다.
학부모에게 제공할 학습 태도 분석 리포트를 작성합니다.
다음 규칙을 반드시 따르세요:
- 한국어로 작성
- 학부모가 이해하기 쉬운 친근하고 전문적인 말투
- 데이터에 근거한 구체적 분석 (추측 금지)
- 긍정적인 부분을 먼저 언급하고, 개선점은 건설적으로 제안
- 응답 형식은 아래 4개 섹션으로 구분:
  📊 집중도 통계
  🚪 이탈 분석
  📖 구간별 학습 분석
  💡 개선 제안`;

  const userPrompt = `아래 데이터를 분석하여 학부모용 학습 태도 리포트를 작성해주세요.

[강의 정보]
강의명: ${lectureTitle}

[집중도 통계]
평균 집중도: ${avgFocus}%
총 측정 횟수: ${records.length}회
상태별 분포:
${statusDistText}

[탭 이탈 기록]
이탈 횟수: ${departureText}
${departureDetail ? `상세:\n${departureDetail}` : ''}

[강의 구간별 내용]
${segmentsText || '구간 정보 없음'}

[1분 단위 집중도 타임라인]
${timelineText || '데이터 없음'}

위 데이터를 기반으로 4개 섹션(📊 집중도 통계, 🚪 이탈 분석, 📖 구간별 학습 분석, 💡 개선 제안)으로 나누어 리포트를 작성해주세요.
각 섹션은 2~3문장으로 작성하세요.
집중도가 낮았던 시간대가 있다면 해당 구간의 강의 내용과 연결하여 분석해주세요.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 800,
    temperature: 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return response.choices[0].message.content.trim();
}

module.exports = { analyzeLectureContent, generateRagReport };

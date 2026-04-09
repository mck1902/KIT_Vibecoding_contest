const Anthropic = require('@anthropic-ai/sdk');

// API 키 미설정 시 명확한 에러 메시지
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-xxxxx') {
    throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/**
 * SRT 자막 텍스트를 Claude API로 분석하여 구간별 주제/키워드 추출
 */
async function analyzeLectureContent(subtitleText, lectureTitle) {
  const client = getClient();

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
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

  const text = message.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude API 응답에서 JSON을 파싱할 수 없습니다.');
  return JSON.parse(jsonMatch[0]);
}

/**
 * 세션 집중도 데이터 + 강좌 구간 정보를 결합하여 맞춤형 RAG 리포트 생성
 */
async function generateRagReport(sessionData, lectureSegments, lectureTitle) {
  const client = getClient();

  const { records, departures, avgFocus } = sessionData;

  const STATUS_LABEL = { 1: '집중+흥미', 2: '집중+차분', 3: '비집중', 4: '지루함', 5: '졸음' };
  const STATUS_TO_FOCUS = { 1: 95, 2: 80, 3: 55, 4: 35, 5: 15 };

  // 1분 단위로 집계한 집중도 타임라인
  const byMinute = {};
  for (const r of records) {
    const d = new Date(r.timestamp);
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (!byMinute[key]) byMinute[key] = [];
    byMinute[key].push(STATUS_TO_FOCUS[r.status] || 50);
  }
  const timelineText = Object.entries(byMinute)
    .map(([t, vals]) => `${t}: ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)}%`)
    .join(', ');

  const segmentsText = lectureSegments
    .map(s => `${s.start}~${s.end} [${s.topic}] 키워드: ${s.keywords.join(', ')}`)
    .join('\n');

  const departureText =
    departures.length > 0
      ? `${departures.length}회 (총 ${Math.round(departures.reduce((s, d) => s + (d.duration || 0), 0) / 1000)}초)`
      : '없음';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `학생의 학습 세션 데이터를 분석하여 학부모에게 전달할 맞춤형 학습 리포트를 작성해주세요.

강의명: ${lectureTitle}
평균 집중도: ${avgFocus}%
탭 이탈: ${departureText}

강의 구간별 내용:
${segmentsText}

집중도 타임라인:
${timelineText || '데이터 없음'}

위 데이터를 바탕으로 3~4문장의 구체적인 한국어 분석을 작성해주세요.
집중도가 낮았던 구간의 강의 내용과 연결하여 설명하고, 보충 학습 방향을 제안해주세요.
학부모가 이해하기 쉬운 말투로 작성해주세요.`,
      },
    ],
  });

  return message.content[0].text.trim();
}

module.exports = { analyzeLectureContent, generateRagReport };

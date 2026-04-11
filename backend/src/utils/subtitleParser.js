const fs = require('fs');
const path = require('path');

const SUBTITLES_DIR = path.join(__dirname, '../../data/subtitles');

/**
 * SRT 파일을 파싱하여 타임스탬프 포함 텍스트 반환 (AI API 입력용)
 */
function getSubtitleText(lectureId) {
  const filePath = path.join(SUBTITLES_DIR, `${lectureId}.srt`);
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const blocks = content.trim().split(/\n\n+/);
  const lines = [];

  for (const block of blocks) {
    const parts = block.trim().split('\n');
    if (parts.length < 3) continue;

    // 타임스탬프 라인에서 시작 시간 추출 (HH:MM)
    const timeMatch = parts[1].match(/(\d{2}:\d{2}):\d{2}/);
    const startTime = timeMatch ? timeMatch[1] : '??:??';
    const text = parts.slice(2).join(' ').trim();

    if (text) lines.push(`[${startTime}] ${text}`);
  }

  return lines.join('\n');
}

module.exports = { getSubtitleText };

/* 2026-04-09: 실 세션 데이터 + Claude RAG 리포트 연동 */
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './ParentDashboard.css';

const MOCK_CHART = [
  { time: '10:00', focus: 85 },
  { time: '10:15', focus: 78 },
  { time: '10:30', focus: 90 },
  { time: '10:45', focus: 60 },
  { time: '11:00', focus: 88 },
  { time: '11:15', focus: 95 },
  { time: '11:30', focus: 80 },
];

function formatDuration(sec) {
  if (!sec) return '0분';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const ParentDashboard = () => {
  const location = useLocation();
  const sessionId = location.state?.sessionId || null;

  const [report, setReport] = useState(null);
  const [ragText, setRagText] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState('');
  const [loading, setLoading] = useState(false);

  // 세션 리포트 불러오기
  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}/report`)
      .then(r => r.json())
      .then(data => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // RAG 분석 불러오기
  useEffect(() => {
    if (!sessionId) return;
    setRagLoading(true);
    setRagError('');
    fetch(`/api/sessions/${sessionId}/rag-analysis`)
      .then(r => r.json())
      .then(data => {
        if (data.ragAnalysis) setRagText(data.ragAnalysis);
        else setRagError(data.message || 'RAG 분석을 불러올 수 없습니다.');
      })
      .catch(() => setRagError('서버 연결 오류로 RAG 분석을 불러올 수 없습니다.'))
      .finally(() => setRagLoading(false));
  }, [sessionId]);

  const chartData = report?.chartData?.length > 0 ? report.chartData : MOCK_CHART;
  const avgFocus = report?.avgFocus ?? 82;
  const totalSec = report?.totalSec ?? 5400;
  const departureCount = report?.departureCount ?? 2;
  const tips = report?.tips ?? ['오늘 학습 세션이 순조롭게 진행되었습니다.'];

  return (
    <div className="dashboard-container container animate-fade-in">
      <header className="dashboard-header">
        <h2>학습 대시보드</h2>
        <p className="subtitle">
          {sessionId ? '방금 완료한 세션 리포트' : '샘플 데이터 기반 대시보드'}
          {loading && <span className="loading-tag"> · 불러오는 중...</span>}
        </p>
      </header>

      <section className="summary-cards">
        <div className="summary-card glass">
          <h3>총 학습시간</h3>
          <div className="value">{formatDuration(totalSec)}</div>
        </div>
        <div className="summary-card glass">
          <h3>평균 집중도</h3>
          <div className="value text-primary">{avgFocus}%</div>
        </div>
        <div className="summary-card glass">
          <h3>탭 이탈 횟수</h3>
          <div className={`value ${departureCount > 0 ? 'warning' : ''}`}>{departureCount}회</div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="chart-section glass">
          <h3>집중도 추이</h3>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" />
                <YAxis domain={[0, 100]} stroke="var(--text-muted)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-color)',
                    borderColor: 'var(--card-border)',
                    color: 'var(--text-main)',
                  }}
                  formatter={(v) => [`${v}%`, '집중도']}
                />
                <Area type="monotone" dataKey="focus" stroke="var(--primary)" fillOpacity={1} fill="url(#colorFocus)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="report-section">
          {/* 규칙 기반 AI 코칭 */}
          <div className="report-card glass ai-coaching">
            <div className="card-header">
              <span className="badge">규칙 기반 AI 코칭</span>
            </div>
            {tips.map((tip, i) => (
              <p key={i}>{tip}</p>
            ))}
          </div>

          {/* Claude RAG 맞춤형 분석 */}
          <div className="report-card glass rag-coaching">
            <div className="card-header">
              <span className="badge rag-badge">Claude RAG 맞춤형 분석</span>
            </div>
            {ragLoading && (
              <p className="rag-loading">Claude AI가 분석 중입니다...</p>
            )}
            {!ragLoading && ragText && <p>{ragText}</p>}
            {!ragLoading && !ragText && ragError && (
              <p className="rag-fallback">
                <strong>[수학] EBS 고등예비과정 수학 I</strong><br />
                다항식의 연산 개념 설명 구간에서 집중도가 일시적으로 하락했습니다.
                조립제법과 나머지 정리 부분을 복습하시면 도움이 될 것입니다.
                <br /><br />
                <small className="rag-error-note">※ {ragError}</small>
              </p>
            )}
            {!sessionId && !ragLoading && (
              <p>
                <strong>[수학] EBS 고등예비과정 수학 I</strong><br />
                다항식의 연산 개념 설명 구간(10:30~10:45)에서 집중도가 60%로 하락했습니다.
                조립제법 관련 내용에서 어려움을 느낀 것으로 보이며, 해당 구간 반복 학습을 권장합니다.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ParentDashboard;

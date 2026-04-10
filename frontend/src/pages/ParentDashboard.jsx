/* 2026-04-09: 실 세션 데이터 + Claude RAG 리포트 연동 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { sessionAPI, authAPI } from '../services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './ParentDashboard.css';
import './ParentDashboard.invite.css';

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
  const { user, updateUser } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [linkCode, setLinkCode] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [report, setReport] = useState(null);
  const [ragText, setRagText] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragError, setRagError] = useState('');
  const [loading, setLoading] = useState(false);

  const hasChildren = user?.children && user.children.length > 0;

  // 자녀 세션 목록 불러오기 (children 변경 시 재조회)
  useEffect(() => {
    if (!hasChildren) { setSessions([]); return; }
    sessionAPI.getAll()
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data);
          if (data.length > 0) setSelectedSessionId(data[0]._id);
        }
      })
      .catch(() => {});
  }, [hasChildren]);

  // 세션 리포트 불러오기
  useEffect(() => {
    if (!selectedSessionId) return;
    setLoading(true);
    sessionAPI.getReport(selectedSessionId)
      .then(data => setReport(data))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [selectedSessionId]);

  // RAG 분석 불러오기
  useEffect(() => {
    if (!selectedSessionId) return;
    setRagLoading(true);
    setRagError('');
    sessionAPI.getRagAnalysis(selectedSessionId)
      .then(data => {
        if (data.ragAnalysis) setRagText(data.ragAnalysis);
        else setRagError(data.message || 'RAG 분석을 불러올 수 없습니다.');
      })
      .catch(() => setRagError('서버 연결 오류로 RAG 분석을 불러올 수 없습니다.'))
      .finally(() => setRagLoading(false));
  }, [selectedSessionId]);

  const chartData = report?.chartData?.length > 0 ? report.chartData : MOCK_CHART;
  const avgFocus = report?.avgFocus ?? 82;
  const totalSec = report?.totalSec ?? 5400;
  const departureCount = report?.departureCount ?? 2;
  const tips = report?.tips ?? ['오늘 학습 세션이 순조롭게 진행되었습니다.'];

  const handleLink = async (e) => {
    e.preventDefault();
    if (!linkCode.trim()) return;
    setLinkLoading(true);
    setLinkError('');
    try {
      const data = await authAPI.link(linkCode.toUpperCase());
      updateUser(data.user, data.token);
      setLinkSuccess(true);
      setLinkCode('');
    } catch (err) {
      setLinkError(err.message);
    } finally {
      setLinkLoading(false);
    }
  };

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  return (
    <div className="dashboard-container container animate-fade-in">
      <header className="dashboard-header">
        <h2>학습 대시보드</h2>
        <p className="subtitle">
          {user?.name ? `${user.name}님의 자녀 학습 리포트` : '학습 리포트'}
          {loading && <span className="loading-tag"> · 불러오는 중...</span>}
        </p>

        {/* 내 초대 코드 */}
        {user?.inviteCode && (
          <div className="parent-invite-row">
            <span className="parent-invite-label">내 초대 코드</span>
            <span className="parent-invite-code">{user.inviteCode}</span>
            <button
              className="parent-invite-copy"
              onClick={() => navigator.clipboard.writeText(user.inviteCode).then(() => alert('복사되었습니다.'))}
            >복사</button>
            <span className="parent-invite-hint">자녀에게 알려주세요</span>
          </div>
        )}

        {/* 자녀 미연결 시 연결 폼 */}
        {!hasChildren && (
          <form className="link-form" onSubmit={handleLink}>
            <span className="link-form-label">자녀 초대 코드</span>
            <input
              className="link-form-input"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
              placeholder="예: ABC123"
              maxLength={6}
            />
            <button className="link-form-btn" type="submit" disabled={linkLoading}>
              {linkLoading ? '연결 중...' : '연결하기'}
            </button>
            {linkError && <span className="link-form-error">{linkError}</span>}
            {linkSuccess && <span className="link-form-success">자녀가 연결되었습니다!</span>}
          </form>
        )}

        {sessions.length > 1 && (
          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            style={{ marginTop: '0.5rem', background: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.4rem 0.8rem', cursor: 'pointer' }}
          >
            {sessions.map(s => (
              <option key={s._id} value={s._id}>
                {s.subject || s.lectureId} — {formatDate(s.startTime)}
              </option>
            ))}
          </select>
        )}
        {hasChildren && sessions.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            자녀의 세션이 없습니다. 학생 계정으로 세션을 시작해보세요.
          </p>
        )}
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
                <small className="rag-error-note">※ {ragError}</small>
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ParentDashboard;

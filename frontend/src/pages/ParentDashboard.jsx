/* 2026-04-09: 실 세션 데이터 + Claude RAG 리포트 연동 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { sessionAPI, authAPI } from '../services/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './ParentDashboard.css';
import './ParentDashboard.invite.css';

function formatDuration(sec) {
  if (!sec) return '0분';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

const ParentDashboard = () => {
  const { user, updateUser } = useAuth();

  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null); // null = 전체
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

  // 자녀 정보 + 세션 목록 불러오기 (children 변경 시 재조회)
  useEffect(() => {
    if (!user?.children?.length) { setSessions([]); setChildren([]); return; }
    authAPI.getChild()
      .then(data => { if (data.children?.length) setChildren(data.children); })
      .catch(() => {});
    sessionAPI.getAll()
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data);
          if (data.length > 0) setSelectedSessionId(data[0]._id);
        }
      })
      .catch(() => {});
  }, [user?.children?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 선택된 자녀 기준으로 세션 필터링
  const filteredSessions = selectedChild
    ? sessions.filter(s => s.studentId === selectedChild.studentId)
    : sessions;

  const chartData = report?.chartData?.length > 0 ? report.chartData : [];
  const hasReport = !!report;

  // 자녀 선택 변경 시 세션 초기화
  const handleChildSelect = (child) => {
    setSelectedChild(child);
    setReport(null);
    setRagText('');
    const target = child
      ? sessions.filter(s => s.studentId === child.studentId)
      : sessions;
    setSelectedSessionId(target.length > 0 ? target[0]._id : null);
  };

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
          {selectedChild ? `${selectedChild.name}의 학습 리포트` : children.length > 0 ? `전체 자녀 (${children.length}명)` : '자녀를 연결해주세요'}
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
        {(!user?.children?.length || true) && (
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

        {/* 자녀 선택 드롭다운 (다자녀일 때만 표시) */}
        {children.length > 1 && (
          <select
            className="session-select"
            value={selectedChild?.studentId ?? ''}
            onChange={(e) => {
              const child = children.find(c => c.studentId === e.target.value) ?? null;
              handleChildSelect(child);
            }}
          >
            <option value="">전체 자녀 ({children.length}명)</option>
            {children.map(child => (
              <option key={child.studentId} value={child.studentId}>
                {child.name} ({child.gradeLevel === 'high' ? '고등' : '중등'})
              </option>
            ))}
          </select>
        )}

        {/* 세션 선택 드롭다운 */}
        {filteredSessions.length > 1 && (
          <select
            value={selectedSessionId || ''}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="session-select"
          >
            {filteredSessions.map(s => (
              <option key={s._id} value={s._id}>
                {s.subject || s.lectureId} — {formatDate(s.startTime)}
              </option>
            ))}
          </select>
        )}
        {user?.children?.length > 0 && filteredSessions.length === 0 && !loading && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
            {selectedChild ? `${selectedChild.name}의 세션이 없습니다.` : '자녀의 세션이 없습니다. 학생 계정으로 세션을 시작해보세요.'}
          </p>
        )}
      </header>

      <section className="summary-cards">
        <div className="summary-card glass">
          <h3>총 학습시간</h3>
          <div className="value">{hasReport ? formatDuration(report.totalSec) : '—'}</div>
        </div>
        <div className="summary-card glass">
          <h3>평균 집중도</h3>
          <div className="value text-primary">{hasReport ? `${report.avgFocus}%` : '—'}</div>
        </div>
        <div className="summary-card glass">
          <h3>탭 이탈 횟수</h3>
          <div className={`value ${hasReport && report.departureCount > 0 ? 'warning' : ''}`}>
            {hasReport ? `${report.departureCount}회` : '—'}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="chart-section glass">
          <h3>집중도 추이</h3>
          <div className="chart-wrapper">
            {chartData.length > 0 ? (
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
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                {loading ? '불러오는 중...' : '세션을 선택하면 집중도 추이가 표시됩니다.'}
              </div>
            )}
          </div>
        </section>

        <section className="report-section">
          {/* 규칙 기반 AI 코칭 */}
          <div className="report-card glass ai-coaching">
            <div className="card-header">
              <span className="badge">규칙 기반 AI 코칭</span>
            </div>
            {hasReport && report.tips?.length > 0
              ? report.tips.map((tip, i) => <p key={i}>{tip}</p>)
              : <p style={{ color: 'var(--text-muted)' }}>세션 데이터가 없습니다.</p>
            }
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

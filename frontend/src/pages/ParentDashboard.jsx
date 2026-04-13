/* 2026-04-09: 실 세션 데이터 + AI RAG 리포트 연동 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, authAPI, edupointAPI } from '../services/api';
import { Coins } from 'lucide-react';
import PointBalance from '../components/point/PointBalance';
import PointHistory from '../components/point/PointHistory';
import WeeklyProgress from '../components/point/WeeklyProgress';
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
  const navigate = useNavigate();

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
  const [quizData, setQuizData] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [edupoint, setEdupoint] = useState(null);
  const [edupointRefresh, setEdupointRefresh] = useState(0);
  const [reportKey, setReportKey] = useState(0); // 같은 세션 ID여도 강제 재로드용
  const [statusFilter, setStatusFilter] = useState('ended'); // 'ended' | 'ongoing'

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
          // 완강(completionRate >= 90) 세션 중 가장 최근 것을 기본 선택
          const ended = data.filter(s => !!s.endTime && (s.completionRate ?? 0) >= 90);
          const defaultSession = ended.length > 0 ? ended[0] : data[0];
          if (defaultSession) setSelectedSessionId(defaultSession._id);
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
  }, [selectedSessionId, reportKey]);

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

  // 퀴즈 조회
  useEffect(() => {
    if (!selectedSessionId) return;
    setQuizLoading(true);
    sessionAPI.getQuiz(selectedSessionId)
      .then(data => setQuizData(data.quiz))
      .catch(() => setQuizData(null))
      .finally(() => setQuizLoading(false));
  }, [selectedSessionId]);

  // 에듀포인트 데이터 로딩
  useEffect(() => {
    const sid = selectedChild?.studentId || (children.length === 1 ? children[0].studentId : null);
    if (!sid) { setEdupoint(null); return; }
    edupointAPI.get(sid)
      .then(data => setEdupoint(data))
      .catch(() => setEdupoint(null));
  }, [selectedChild?.studentId, children, edupointRefresh]);

  const handleEdupointUpdate = () => setEdupointRefresh(k => k + 1);

  // 자녀 + 완료 여부로 세션 필터링
  const childSessions = selectedChild
    ? sessions.filter(s => s.studentId === selectedChild.studentId)
    : sessions;
  const filteredSessions = childSessions.filter(s =>
    statusFilter === 'ended'
      ? !!s.endTime && (s.completionRate ?? 0) >= 90
      : !s.endTime || (s.completionRate ?? 0) < 90
  );

  const chartData = report?.chartData?.length > 0 ? report.chartData : [];
  const hasReport = !!report;

  // 필터링된 세션에서 첫 번째를 선택하고 리포트 로드
  const selectFirstSession = (list) => {
    const newId = list.length > 0 ? list[0]._id : null;
    setSelectedSessionId(newId);
    setReportKey(k => k + 1);
  };

  // 자녀 선택 변경
  const handleChildSelect = (child) => {
    setSelectedChild(child);
    setReport(null);
    setRagText('');
    setQuizData(null);
    const target = child
      ? sessions.filter(s => s.studentId === child.studentId)
      : sessions;
    // 자녀 변경 시 statusFilter 유지, 해당 필터에 맞는 첫 세션 선택
    const filtered = target.filter(s =>
      statusFilter === 'ended'
        ? !!s.endTime && (s.completionRate ?? 0) >= 90
        : !s.endTime || (s.completionRate ?? 0) < 90
    );
    selectFirstSession(filtered);
  };

  // 완료/미완료 토글
  const handleStatusFilter = (status) => {
    setStatusFilter(status);
    setReport(null);
    setRagText('');
    setQuizData(null);
    const filtered = childSessions.filter(s =>
      status === 'ended'
        ? !!s.endTime && (s.completionRate ?? 0) >= 90
        : !s.endTime || (s.completionRate ?? 0) < 90
    );
    selectFirstSession(filtered);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>학습 대시보드</h2>
          <button
            className="point-nav-btn"
            onClick={() => navigate('/parent/point-settings')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Coins size={16} fill="#f59e0b" stroke="currentColor" strokeWidth={1.5} /> 에듀 포인트 설정
          </button>
        </div>
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

        {/* 필터 행: 자녀 선택 + 완료/미완료 토글 */}
        {user?.children?.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {/* 자녀 선택 (다자녀일 때만) */}
            {children.length > 1 && (
              <select
                className="session-select"
                style={{ margin: 0 }}
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

            {/* 완료 / 미완료 토글 */}
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--card-border)' }}>
              {[
                { key: 'ended',   label: '완료',   count: childSessions.filter(s => !!s.endTime && (s.completionRate ?? 0) >= 90).length },
                { key: 'ongoing', label: '미완료', count: childSessions.filter(s => !s.endTime || (s.completionRate ?? 0) < 90).length },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => handleStatusFilter(key)}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    fontWeight: statusFilter === key ? 700 : 400,
                    background: statusFilter === key ? 'var(--primary)' : 'var(--card-bg)',
                    color: statusFilter === key ? '#fff' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {label} {count > 0 && <span style={{ opacity: 0.8 }}>({count})</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 강의 선택 드롭다운 */}
        {filteredSessions.length > 0 && (
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
            {statusFilter === 'ended'
              ? (selectedChild ? `${selectedChild.name}의 완료된 강의가 없습니다.` : '완료된 강의가 없습니다.')
              : (selectedChild ? `${selectedChild.name}의 미완료 강의가 없습니다.` : '미완료 강의가 없습니다.')}
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

      {/* 에듀포인트 위젯 */}
      {(() => {
        const targetStudentId = selectedChild?.studentId || (children.length === 1 ? children[0].studentId : null);
        if (!targetStudentId) return null;
        if (!edupoint || !edupoint.initialized) {
          return (
            <div className="point-setup-prompt glass" style={{ padding: '1.5rem', borderRadius: '12px', marginBottom: '2rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>에듀 포인트 시스템이 설정되지 않았습니다.</p>
              <a href="/parent/point-settings" style={{ color: 'var(--primary)', fontWeight: 600 }}>포인트 설정하기 &rarr;</a>
            </div>
          );
        }
        return (
          <section className="point-widgets-section">
            <div className="point-widgets-header">
              <h3>에듀 포인트</h3>
              <a href="/parent/point-settings" className="point-settings-link">설정</a>
            </div>
            <div className="point-widgets-grid">
              <PointBalance studentId={targetStudentId} edupoint={edupoint} onUpdate={handleEdupointUpdate} />
              <WeeklyProgress studentId={targetStudentId} edupoint={edupoint} refreshKey={edupointRefresh} />
              <PointHistory studentId={targetStudentId} refreshKey={edupointRefresh} />
            </div>
          </section>
        );
      })()}

      <section className="chart-section glass" style={{ marginBottom: '2rem' }}>
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

          {/* AI 맞춤형 분석 */}
          <div className="report-card glass rag-coaching">
            <div className="card-header">
              <span className="badge rag-badge">AI 맞춤형 분석</span>
            </div>
            {ragLoading && (
              <p className="rag-loading">AI가 분석 중입니다...</p>
            )}
            {!ragLoading && ragText && (
              <div className="rag-text">
                {ragText.split('\n').map((line, i) => {
                  if (!line.trim()) return <div key={i} className="rag-spacer" />;
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <p key={i}>
                      {parts.map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={j}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                    </p>
                  );
                })}
              </div>
            )}
            {!ragLoading && !ragText && ragError && (
              <p className="rag-fallback">
                <small className="rag-error-note">※ {ragError}</small>
              </p>
            )}
          </div>

          {/* 퀴즈 결과 */}
          {quizLoading ? (
            <div className="report-card glass">
              <div className="card-header"><span className="badge">복습 퀴즈</span></div>
              <p style={{ color: 'var(--text-muted)' }}>불러오는 중...</p>
            </div>
          ) : quizData ? (
            <div className="report-card glass quiz-result-card">
              <div className="card-header">
                <span className="badge" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>복습 퀴즈</span>
              </div>
              {quizData.results?.completedAt ? (
                <>
                  <div style={{ fontSize: '1.7rem', fontWeight: 700, color: quizData.results.score === quizData.results.total ? '#22c55e' : quizData.results.score >= quizData.results.total / 2 ? '#f59e0b' : '#ef4444' }}>
                    {quizData.results.score}/{quizData.results.total} 정답
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    {quizData.questions?.map((q, i) => (
                      <p key={i} style={{ color: quizData.results.answers[i] === q.answer ? '#22c55e' : '#ef4444', fontSize: '0.9rem' }}>
                        Q{i+1}. {quizData.results.answers[i] === q.answer ? '✅ 정답' : `❌ 오답 → 정답: ${q.options[q.answer]}`}
                      </p>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: 'var(--text-muted)' }}>학생이 아직 퀴즈를 풀지 않았습니다.</p>
              )}
            </div>
          ) : null}
        </section>
    </div>
  );
};

export default ParentDashboard;

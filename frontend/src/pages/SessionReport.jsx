/* frontend/src/pages/SessionReport.jsx
 * 세션 종료 후 학생/학부모가 확인하는 학습 리포트 페이지
 * - 규칙 기반 리포트 (집중도 타임라인 + 통계 + 코칭 팁)
 * - AI RAG 맞춤형 분석 (별도 로딩)
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { sessionAPI, edupointAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './SessionReport.css';

const FOCUS_COLOR = (pct) => {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#3b82f6';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
};

function formatDuration(sec) {
  if (!sec || sec <= 0) return '0분';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

export default function SessionReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState(null);

  const [ragText, setRagText] = useState(null);
  const [ragLoading, setRagLoading] = useState(true);
  const [ragError, setRagError] = useState(null);

  const [sessionDetail, setSessionDetail] = useState(null);
  const [edupoint, setEdupoint] = useState(null);

  // 리포트 + RAG 분석 병렬 로딩
  useEffect(() => {
    if (!sessionId) return;

    // 규칙 기반 리포트
    sessionAPI.getReport(sessionId)
      .then((data) => setReport(data))
      .catch((err) => setReportError(err.message))
      .finally(() => setReportLoading(false));

    // RAG 분석 (AI API — 응답이 더 느릴 수 있음)
    sessionAPI.getRagAnalysis(sessionId)
      .then((data) => setRagText(data.ragAnalysis))
      .catch((err) => setRagError(err.message))
      .finally(() => setRagLoading(false));

    // 세션 상세 (포인트 정보 포함)
    sessionAPI.getById(sessionId)
      .then((data) => {
        setSessionDetail(data);
        if (data.studentId) {
          edupointAPI.get(data.studentId)
            .then(ep => setEdupoint(ep))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [sessionId]);

  // ── 로딩 중 ──
  if (reportLoading) {
    return (
      <div className="sr-container container animate-fade-in">
        <div className="sr-loading">
          <div className="sr-spinner" />
          <p>리포트를 생성하는 중입니다...</p>
        </div>
      </div>
    );
  }

  // ── 에러 ──
  if (reportError) {
    return (
      <div className="sr-container container animate-fade-in">
        <div className="sr-error glass">
          <p>리포트를 불러올 수 없습니다.</p>
          <p className="sr-error-msg">{reportError}</p>
          <button className="sr-btn primary" onClick={() => navigate('/student')}>
            강의 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const focusColor = FOCUS_COLOR(report.avgFocus);

  return (
    <div className="sr-container container animate-fade-in">
      {/* 헤더 */}
      <header className="sr-header">
        <div>
          <h2>학습 세션 리포트</h2>
          <p className="subtitle">
            {report.subject && `${report.subject} · `}
            {report.lectureId}
          </p>
        </div>
        <div className="sr-header-actions">
          {isParent && (
            <button className="sr-btn secondary" onClick={() => navigate('/parent')}>
              학부모 대시보드
            </button>
          )}
          <button className="sr-btn primary" onClick={() => navigate('/student')}>
            다른 강의 수강하기
          </button>
        </div>
      </header>

      {/* 요약 카드 4개 */}
      <section className="sr-summary-row">
        <div className="sr-summary-card glass">
          <div className="sr-summary-label">총 학습 시간</div>
          <div className="sr-summary-value">{formatDuration(report.totalSec)}</div>
        </div>
        <div className="sr-summary-card glass">
          <div className="sr-summary-label">평균 집중도</div>
          <div className="sr-summary-value" style={{ color: focusColor }}>
            {report.avgFocus}%
          </div>
        </div>
        <div className="sr-summary-card glass">
          <div className="sr-summary-label">탭 이탈 횟수</div>
          <div
            className="sr-summary-value"
            style={{ color: report.departureCount > 0 ? '#f97316' : 'var(--text-main)' }}
          >
            {report.departureCount}회
          </div>
        </div>
        <div className="sr-summary-card glass">
          <div className="sr-summary-label">분석 구간 수</div>
          <div className="sr-summary-value">
            {report.chartData?.length ?? 0}분
          </div>
        </div>
      </section>

      {/* 집중도 타임라인 차트 */}
      {report.chartData && report.chartData.length > 0 ? (
        <section className="sr-chart-section glass">
          <h3>집중도 타임라인</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={report.chartData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="srFocusGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis
                dataKey="time"
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                stroke="var(--text-muted)"
                tick={{ fontSize: 11 }}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card-bg)',
                  borderColor: 'var(--card-border)',
                  color: 'var(--text-main)',
                  borderRadius: '8px',
                }}
                formatter={(v) => [`${v}%`, '집중도']}
              />
              <Area
                type="monotone"
                dataKey="focus"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#srFocusGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      ) : (
        <section className="sr-chart-section glass sr-no-data">
          <p>분석 데이터가 충분하지 않습니다. (학습 시간이 너무 짧거나 기록이 없습니다)</p>
        </section>
      )}

      {/* 포인트 획득 결과 */}
      {sessionDetail && edupoint?.initialized && (() => {
        const goalAchieved = report.avgFocus >= edupoint.settings.targetRate;
        const pointsEarned = sessionDetail.pointEarned ?? 0;
        // 달성 여부에 따라 3가지 상태: 포인트 지급 / 잔액 부족 달성 / 미달성
        const status = goalAchieved && pointsEarned > 0 ? 'achieved'
          : goalAchieved ? 'achieved-no-balance'
          : 'missed';
        return (
          <section className="sr-point-result glass">
            <h3>에듀 포인트 결과</h3>
            <div className="sr-point-result-body">
              <div className="sr-point-focus-compare">
                <div className="sr-point-focus-item">
                  <span className="sr-point-focus-label">세션 집중률</span>
                  <span className="sr-point-focus-value" style={{ color: focusColor }}>
                    {report.avgFocus}%
                  </span>
                </div>
                <span className="sr-point-focus-vs">vs</span>
                <div className="sr-point-focus-item">
                  <span className="sr-point-focus-label">목표 집중률</span>
                  <span className="sr-point-focus-value" style={{ color: 'var(--primary)' }}>
                    {edupoint.settings.targetRate}%
                  </span>
                </div>
              </div>
              <div className={`sr-point-earned ${status === 'missed' ? 'missed' : 'achieved'}`}>
                {status === 'achieved' && (
                  <>
                    <span className="sr-point-earned-icon">&#10003;</span>
                    <span>+{pointsEarned.toLocaleString()}P 획득!</span>
                  </>
                )}
                {status === 'achieved-no-balance' && (
                  <>
                    <span className="sr-point-earned-icon">&#10003;</span>
                    <span>목표 달성! (학부모 포인트 잔액 부족)</span>
                  </>
                )}
                {status === 'missed' && (
                  <>
                    <span className="sr-point-earned-icon">&#10007;</span>
                    <span>미달성 (0P)</span>
                  </>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      <div className="sr-bottom-grid">
        {/* 규칙 기반 AI 코칭 */}
        <section className="sr-tips-section glass">
          <h3>AI 코칭 메시지</h3>
          {report.tips && report.tips.length > 0 ? (
            <ul className="sr-tips-list">
              {report.tips.map((tip, i) => (
                <li key={i} className="sr-tip-item">
                  <span className="sr-tip-icon">&#10003;</span>
                  {tip}
                </li>
              ))}
            </ul>
          ) : (
            <p className="sr-muted">코칭 메시지가 없습니다.</p>
          )}
        </section>

        {/* AI 맞춤형 분석 */}
        <section className="sr-rag-section glass">
          <div className="sr-rag-header">
            <h3>AI 맞춤형 분석</h3>
            <span className="sr-rag-badge">RAG</span>
          </div>

          {ragLoading && (
            <div className="sr-rag-loading">
              <div className="sr-spinner small" />
              <p>AI가 강의 내용과 집중도를 분석 중입니다...</p>
            </div>
          )}

          {!ragLoading && ragError && (
            <p className="sr-rag-error">
              {ragError.includes('자막 분석') || ragError.includes('analyze')
                ? '강좌 자막 분석이 아직 완료되지 않았습니다. 관리자에게 강좌 분석을 요청하세요.'
                : `RAG 분석 오류: ${ragError}`}
            </p>
          )}

          {!ragLoading && ragText && (
            <div className="sr-rag-content">
              {ragText.split('\n').map((line, i) =>
                line.trim() === '' ? <br key={i} /> : <p key={i}>{line}</p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 하단 액션 버튼 */}
      <div className="sr-footer-actions">
        {isParent && (
          <button className="sr-btn secondary" onClick={() => navigate('/parent')}>
            학부모 대시보드 보기
          </button>
        )}
        <button className="sr-btn primary" onClick={() => navigate('/student')}>
          다른 강의 수강하기
        </button>
      </div>
    </div>
  );
}

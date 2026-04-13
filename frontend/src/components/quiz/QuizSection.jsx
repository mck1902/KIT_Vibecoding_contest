import { useState } from 'react';
import { sessionAPI } from '../../services/api';
import './QuizSection.css';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function QuizSection({ sessionId, quiz, userRole, onQuizGenerated, onQuizSubmitted }) {
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [error, setError] = useState(null);

  // ── 퀴즈 생성 ────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await sessionAPI.generateQuiz(sessionId);
      onQuizGenerated(data.quiz);
    } catch (err) {
      setError(err.message || '퀴즈 생성에 실패했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  // ── 퀴즈 제출 ────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await sessionAPI.submitQuiz(sessionId, selectedAnswers);
      onQuizSubmitted(data.quiz);
    } catch (err) {
      setError(err.message || '퀴즈 제출에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 답 선택 ──────────────────────────────────
  const handleSelect = (qIndex, optIndex) => {
    setSelectedAnswers(prev => {
      const next = [...prev];
      next[qIndex] = optIndex;
      return next;
    });
  };

  // ═══ (1) 미생성 상태 ═══════════════════════════
  if (!quiz) {
    return (
      <section className="sr-quiz-section glass">
        <div className="sr-quiz-header">
          <h3>복습 퀴즈</h3>
          <span className="sr-quiz-badge">QUIZ</span>
        </div>

        {generating ? (
          <div className="sr-quiz-loading">
            <div className="sr-spinner small" />
            <span>퀴즈를 생성하는 중입니다...</span>
          </div>
        ) : (
          <>
            <p className="sr-quiz-desc">
              집중도가 낮았던 구간의 핵심 내용을 퀴즈로 확인해보세요.
            </p>
            {userRole === 'student' ? (
              <button className="sr-btn primary sr-quiz-generate-btn" onClick={handleGenerate}>
                퀴즈 생성하기
              </button>
            ) : (
              <p className="sr-muted">학생이 퀴즈를 생성하지 않았습니다.</p>
            )}
          </>
        )}

        {error && <p className="sr-quiz-error">{error}</p>}
      </section>
    );
  }

  const isCompleted = quiz.results && quiz.results.completedAt !== null;

  // ═══ (3) 결과 상태 ═══════════════════════════
  if (isCompleted) {
    return (
      <section className="sr-quiz-section glass">
        <div className="sr-quiz-header">
          <h3>
            복습 퀴즈 결과
            <span className="sr-quiz-score">{quiz.results.score}/{quiz.results.total} 정답</span>
          </h3>
          <span className="sr-quiz-badge">QUIZ</span>
        </div>

        <div className="sr-quiz-questions">
          {quiz.questions.map((q, i) => {
            const userAnswer = quiz.results.answers[i];
            const isCorrect = userAnswer === q.answer;
            return (
              <div key={i} className="sr-quiz-question">
                <div className={`sr-quiz-result-label ${isCorrect ? 'correct' : 'wrong'}`}>
                  Q{i + 1}. {isCorrect ? '✅ 정답' : '❌ 오답'}
                </div>
                <p className="sr-quiz-question-text">{q.question}</p>

                <div className="sr-quiz-options">
                  {q.options.map((opt, j) => {
                    let cls = 'sr-quiz-option result';
                    if (j === q.answer) cls += ' correct';
                    if (j === userAnswer && !isCorrect) cls += ' wrong';
                    return (
                      <div key={j} className={cls}>
                        <span className="sr-quiz-option-label">{OPTION_LABELS[j]}</span>
                        <span>{opt}</span>
                      </div>
                    );
                  })}
                </div>

                {!isCorrect && (
                  <div className="sr-quiz-explanation">
                    <strong>선택: {OPTION_LABELS[userAnswer]} → 정답: {OPTION_LABELS[q.answer]}</strong>
                    <p>{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // ═══ (2) 미풀이 상태 ═══════════════════════════
  return (
    <section className="sr-quiz-section glass">
      <div className="sr-quiz-header">
        <h3>복습 퀴즈 ({quiz.questions.length}문제)</h3>
        <span className="sr-quiz-badge">QUIZ</span>
      </div>

      {quiz.fallback && (
        <div className="sr-quiz-fallback-notice">
          ⚠ 이 세션은 재생 위치 데이터가 없어 강의 구간 매칭이 부정확할 수 있습니다.
        </div>
      )}

      {userRole !== 'student' ? (
        <p className="sr-muted">학생이 아직 풀지 않았습니다.</p>
      ) : (
        <>
          <div className="sr-quiz-questions">
            {quiz.questions.map((q, i) => (
              <div key={i} className="sr-quiz-question">
                <p className="sr-quiz-question-text">Q{i + 1}. {q.question}</p>
                <div className="sr-quiz-options">
                  {q.options.map((opt, j) => (
                    <label
                      key={j}
                      className={`sr-quiz-option selectable${selectedAnswers[i] === j ? ' selected' : ''}`}
                      onClick={() => handleSelect(i, j)}
                    >
                      <span className="sr-quiz-option-label">{OPTION_LABELS[j]}</span>
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            className="sr-btn primary sr-quiz-submit-btn"
            disabled={selectedAnswers.length !== quiz.questions.length || selectedAnswers.includes(undefined) || submitting}
            onClick={handleSubmit}
          >
            {submitting ? '제출 중...' : '제출하기'}
          </button>
        </>
      )}

      {error && <p className="sr-quiz-error">{error}</p>}
    </section>
  );
}

/* 2026-04-09: YouTube iframe 연동 + 세션 데이터 백엔드 연결 */
/* TF.js 실제 추론 연동: 웹캠 → 얼굴 감지 → MobileNetV3 분류 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { sessionAPI } from '../services/api';
import lectures from '../data/lectures.json';
import useWebcam from '../hooks/useWebcam';
import useAttentionAnalysis from '../hooks/useAttentionAnalysis';
import './StudentDashboard.css';

const STATUS_MAP = {
  1: { label: '집중 + 흥미로움', color: '#22c55e' },
  2: { label: '집중 + 차분함',   color: '#3b82f6' },
  3: { label: '집중하지 않음',   color: '#f59e0b' },
  4: { label: '집중하지 않음 + 지루함', color: '#f97316' },
  5: { label: '졸음',            color: '#ef4444' },
};

const StudentDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedLecture, setSelectedLecture] = useState(lectures[0]);
  const [tabWarning, setTabWarning] = useState(false);
  const [departureCount, setDepartureCount] = useState(0);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ytCurrentTime, setYtCurrentTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const [playerReady, setPlayerReady] = useState(false);

  const elapsedRef = useRef(0);
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const selectedLectureRef = useRef(lectures[0]);
  const sessionIdRef = useRef(null);
  const focusStatusRef = useRef(1);
  const focusLevelRef = useRef(85);
  const focusConfidenceRef = useRef(0.5);
  const recordBufferRef = useRef([]);
  const ytCurrentTimeRef = useRef(0);
  const tabLeaveTimeRef = useRef(null);
  const lastValidTimeRef = useRef(0);
  const lastCheckTimeRef = useRef(Date.now());
  const sessionStartedRef = useRef(false);
  const handleEndSessionRef = useRef(null);
  const isEndingRef = useRef(false);
  const pauseStartRef = useRef(null);
  const pauseVideoTimeRef = useRef(null);

  // 웹캠 + AI 분석 훅
  const webcam = useWebcam();
  const analysis = useAttentionAnalysis(webcam.captureFrame, webcam.isActive);

  // AI 분석 결과를 refs에 동기화 (백엔드 전송용)
  const focusStatus = tabWarning ? 4 : analysis.currentStatus;
  const focusLevel = tabWarning ? 45 : analysis.focusLevel;
  const focusConfidence = tabWarning ? 0.5 : analysis.confidence;

  useEffect(() => {
    focusStatusRef.current = focusStatus;
    focusLevelRef.current = focusLevel;
    focusConfidenceRef.current = focusConfidence;
  }, [focusStatus, focusLevel, focusConfidence]);

  // sessionStarted 및 handleEndSession을 ref에 동기화 (YouTube 콜백에서 사용)
  useEffect(() => {
    sessionStartedRef.current = sessionStarted;
  }, [sessionStarted]);

  // 컴포넌트 마운트 시 모델 사전 로딩
  useEffect(() => {
    analysis.loadModels();
  }, []);

  // YouTube IFrame API 로드 및 플레이어 초기화
  useEffect(() => {
    const initPlayer = () => {
      if (!document.getElementById('yt-player')) return;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      playerRef.current = new window.YT.Player('yt-player', {
        videoId: selectedLectureRef.current.youtubeId,
        playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, origin: window.location.origin },
        events: {
          onReady: (e) => {
            playerReadyRef.current = true;
            setPlayerReady(true);
            const dur = e.target.getDuration();
            if (dur > 0) setYtDuration(dur);
          },
          onStateChange: (e) => {
            // 영상 재생 완료 시 자동 세션 종료
            if (e.data === window.YT.PlayerState.ENDED && sessionStartedRef.current) {
              handleEndSessionRef.current?.();
            }
            // 일시정지 감지
            if (e.data === window.YT.PlayerState.PAUSED && sessionStartedRef.current) {
              pauseStartRef.current = new Date();
              pauseVideoTimeRef.current = e.target.getCurrentTime();
            }
            // 재생 재개 감지 (일시정지 상태에서)
            if (e.data === window.YT.PlayerState.PLAYING && pauseStartRef.current && sessionStartedRef.current) {
              const resumeTime = new Date();
              const duration = resumeTime - pauseStartRef.current;
              if (sessionIdRef.current && duration > 1000) { // 1초 이상 일시정지만 기록
                sessionAPI.addPauseEvent(sessionIdRef.current, {
                  pauseTime: pauseStartRef.current.toISOString(),
                  resumeTime: resumeTime.toISOString(),
                  duration,
                  videoTime: Math.round((pauseVideoTimeRef.current || 0) * 10) / 10,
                }).catch(() => {});
              }
              pauseStartRef.current = null;
              pauseVideoTimeRef.current = null;
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        initPlayer();
      };
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
    }
  }, []);

  // 강좌 변경 시 영상 교체
  useEffect(() => {
    selectedLectureRef.current = selectedLecture;
    if (playerReadyRef.current && playerRef.current) {
      playerRef.current.cueVideoById(selectedLecture.youtubeId);
      setYtCurrentTime(0);
      setYtDuration(selectedLecture.durationSec);
    }
  }, [selectedLecture]);

  // 세션 중 YouTube 재생 시간 추적 + 시간 이동(seek) 방지
  useEffect(() => {
    if (!sessionStarted) return;
    lastValidTimeRef.current = 0;
    lastCheckTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (playerRef.current && playerReadyRef.current) {
        try {
          const t = playerRef.current.getCurrentTime();
          const d = playerRef.current.getDuration();
          if (d > 0) setYtDuration(d);
          if (t === undefined) return;

          // 실제 인터벌 경과 시간 측정 (브라우저 타이머 지연 대응)
          const now = Date.now();
          const realElapsed = (now - lastCheckTimeRef.current) / 1000;
          lastCheckTimeRef.current = now;

          // 재생 차이가 실경과 시간 + 여유(1.5초) 초과 시 seek로 판단해 복귀
          if (t - lastValidTimeRef.current > realElapsed + 1.5) {
            playerRef.current.seekTo(lastValidTimeRef.current, true);
          } else {
            lastValidTimeRef.current = t;
            setYtCurrentTime(t);
            ytCurrentTimeRef.current = t;
          }
        } catch (_) {}
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStarted]);

  // 버퍼 flush 헬퍼 (남은 record 일괄 전송)
  const flushRecordBuffer = useCallback(async () => {
    if (!sessionIdRef.current || recordBufferRef.current.length === 0) return;
    const batch = recordBufferRef.current.splice(0);
    try {
      await sessionAPI.addRecords(sessionIdRef.current, batch);
    } catch (_) {}
  }, []);

  // 1초마다 record 버퍼에 적재, 3초마다 배치 전송
  useEffect(() => {
    if (!sessionStarted) return;
    let tick = 0;

    const interval = setInterval(async () => {
      if (!sessionIdRef.current) return;

      // 매 틱(1초)마다 현재 상태를 버퍼에 추가
      recordBufferRef.current.push({
        timestamp: new Date().toISOString(),
        status: focusStatusRef.current,
        confidence: focusConfidenceRef.current,
        focusProb: focusLevelRef.current,
        videoTime: Math.round(ytCurrentTimeRef.current * 10) / 10,
      });

      // 3틱(3초)마다 버퍼 flush
      tick += 1;
      if (tick >= 3) {
        tick = 0;
        await flushRecordBuffer();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      // 언마운트 시 버퍼에 남은 record 전송
      flushRecordBuffer();
    };
  }, [sessionStarted, flushRecordBuffer]);

  // 전체화면 판정: 브라우저 창 최대화 OR 영상 전체화면(Fullscreen API)
  const isFullscreen = useCallback(() => {
    // 1) 영상이나 페이지가 Fullscreen API 전체화면인 경우
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    // 2) 브라우저 창이 화면 대부분을 차지하는 경우 (최대화)
    const widthRatio = window.outerWidth / screen.availWidth;
    const heightRatio = window.outerHeight / screen.availHeight;
    return widthRatio >= 0.85 && heightRatio >= 0.85;
  }, []);

  const [notFullscreen, setNotFullscreen] = useState(false);

  // 이탈 시작 처리 (공통)
  const handleLeave = useCallback((reason) => {
    if (!sessionStarted || tabLeaveTimeRef.current) return;
    tabLeaveTimeRef.current = new Date();
    setTabWarning(true);
    setDepartureCount(prev => prev + 1);
    console.log(`[EduWatch] 이탈 감지: ${reason}`);
  }, [sessionStarted]);

  // 복귀 처리 (공통)
  const handleReturn = useCallback(async () => {
    if (!tabLeaveTimeRef.current) return;
    const returnTime = new Date();
    const duration = returnTime - tabLeaveTimeRef.current;
    if (sessionIdRef.current) {
      try {
        await sessionAPI.addDeparture(sessionIdRef.current, {
          leaveTime: tabLeaveTimeRef.current.toISOString(),
          returnTime: returnTime.toISOString(),
          duration,
        });
      } catch (_) {}
    }
    tabLeaveTimeRef.current = null;
    setTimeout(() => {
      setTabWarning(false);
    }, 2000);
  }, []);

  // 1) Page Visibility API — 탭 완전히 숨겨짐
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        handleLeave('탭 전환');
      } else if (document.visibilityState === 'visible') {
        // 복귀했지만 전체화면이 아니면 이탈 상태 유지
        if (!isFullscreen()) return;
        handleReturn();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [handleLeave, handleReturn, isFullscreen]);

  // 2) Window blur/focus — 다른 창으로 포커스 이동
  //    YouTube iframe 클릭 시에도 window.blur가 발생하므로,
  //    document.hasFocus()로 페이지 전체(iframe 포함)에 포커스가 있는지 확인
  useEffect(() => {
    let blurTimer = null;
    const handleBlur = () => {
      blurTimer = setTimeout(() => {
        // 페이지 내 iframe에 포커스가 있으면 document.hasFocus()가 true
        if (document.hasFocus()) return;
        handleLeave('포커스 이탈');
      }, 200);
    };
    const handleFocus = () => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
      if (!isFullscreen()) return;
      handleReturn();
    };
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleLeave, handleReturn, isFullscreen]);

  // 3) 전체화면 감시 — 창 최대화 해제 또는 영상 전체화면 해제 시 이탈 처리
  useEffect(() => {
    if (!sessionStarted) return;
    const checkFullscreen = () => {
      const fs = isFullscreen();
      setNotFullscreen(!fs);
      if (!fs) {
        handleLeave('전체화면 해제');
      } else if (fs && document.hasFocus() && document.visibilityState === 'visible') {
        handleReturn();
      }
    };
    // 세션 시작 시 즉시 체크
    checkFullscreen();
    window.addEventListener('resize', checkFullscreen);
    document.addEventListener('fullscreenchange', checkFullscreen);
    document.addEventListener('webkitfullscreenchange', checkFullscreen);
    return () => {
      window.removeEventListener('resize', checkFullscreen);
      document.removeEventListener('fullscreenchange', checkFullscreen);
      document.removeEventListener('webkitfullscreenchange', checkFullscreen);
    };
  }, [sessionStarted, handleLeave, handleReturn, isFullscreen]);

  // 세션 시작/종료 시 웹캠 + AI 분석 제어
  useEffect(() => {
    if (sessionStarted) {
      webcam.start().then(() => {
        // 웹캠이 준비되면 분석 시작 (모델 로딩 완료 시)
        if (analysis.isModelLoaded) {
          analysis.startAnalysis();
        }
      });
    } else {
      analysis.stopAnalysis();
      webcam.stop();
    }
  }, [sessionStarted]);

  // 모델 로딩 완료 후 세션 진행 중이면 분석 시작
  useEffect(() => {
    if (analysis.isModelLoaded && sessionStarted && webcam.isActive) {
      analysis.startAnalysis();
    }
  }, [analysis.isModelLoaded, webcam.isActive]);

  // 세션 경과 시간
  useEffect(() => {
    if (!sessionStarted) return;
    const timer = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionStarted]);

  const formatTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${m}:${ss}`;
  };

  const handleStartSession = async () => {
    try {
      const data = await sessionAPI.start(selectedLecture.id, selectedLecture.subject);
      sessionIdRef.current = data._id || null;
    } catch (_) {
      sessionIdRef.current = null;
    }

    setSessionStarted(true);
    setElapsed(0);
    elapsedRef.current = 0;
    setDepartureCount(0);

    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.playVideo();
    }
  };

  const MIN_SESSION_SEC = 60; // 리포트 생성 최소 시청 시간 (1분)

  const handleEndSession = async (force = false) => {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    // 버퍼에 남은 record 전송 (세션 ID 유효할 때)
    await flushRecordBuffer();

    analysis.stopAnalysis();
    webcam.stop();
    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.pauseVideo();
    }

    const sid = sessionIdRef.current;
    const watched = playerRef.current?.getCurrentTime?.() ?? elapsedRef.current;
    sessionIdRef.current = null;
    setSessionStarted(false);

    try {
      if (sid) await sessionAPI.end(sid);
      if (sid && (watched >= MIN_SESSION_SEC || force)) {
        navigate(`/student/report/${sid}`);
      } else {
        navigate('/student');
      }
    } catch (_) {
      navigate('/student');
    } finally {
      isEndingRef.current = false;
    }
  };

  // handleEndSession을 ref에 등록 (YouTube onStateChange 콜백에서 접근)
  handleEndSessionRef.current = handleEndSession;

  const handleLectureSelect = async (lec) => {
    if (sessionStarted) {
      await handleEndSession();
    } else {
      analysis.stopAnalysis();
      webcam.stop();
    }
    setSelectedLecture(lec);
    setSessionStarted(false);
    setElapsed(0);
    elapsedRef.current = 0;
    setTabWarning(false);
    setDepartureCount(0);
    setYtCurrentTime(0);
  };

  const status = STATUS_MAP[focusStatus];
  const totalSec = ytDuration > 0 ? ytDuration : selectedLecture.durationSec;
  const progressPct = sessionStarted && totalSec > 0
    ? Math.min(100, ((ytCurrentTime || elapsed) / totalSec) * 100)
    : selectedLecture.progress;

  return (
    <div className="student-container container animate-fade-in">
      <section className="lecture-list">
        <h3 className="section-title">수강 강좌</h3>
        <div className="lecture-cards">
          {lectures.map(lec => (
            <button
              key={lec.id}
              className={`lecture-card glass ${selectedLecture.id === lec.id ? 'active' : ''}`}
              style={{ '--lec-color': lec.color }}
              onClick={() => handleLectureSelect(lec)}
            >
              <span className="lec-subject" style={{ color: lec.color }}>{lec.subject}</span>
              <p className="lec-title">{lec.title}</p>
              <p className="lec-episode">{lec.episode}</p>
              {lec.progress > 0 && (
                <div className="lec-progress-bar">
                  <div className="lec-progress-fill" style={{ width: `${lec.progress}%`, background: lec.color }}></div>
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      <header className="student-header">
        <h2>{selectedLecture.title}</h2>
        <p className="subtitle">{selectedLecture.episode} · 총 {selectedLecture.duration}</p>
      </header>

      {tabWarning && (
        <div className="tab-warning-banner">
          {notFullscreen
            ? '⚠️ 창을 전체화면으로 전환해주세요! 전체화면이 아니면 이탈로 기록됩니다.'
            : '⚠️ 탭 이탈이 감지되었습니다. 집중도가 기록되고 있습니다. 학습 창으로 돌아와주세요!'}
        </div>
      )}

      <div className="player-layout">
        <div className="video-section">
          <div className="video-player">
            <div id="yt-player" className="yt-iframe-container"></div>
            {!sessionStarted && (
              <div className="start-overlay">
                <button className="start-session-btn" onClick={handleStartSession} disabled={!playerReady}>
                  <span className="play-icon">▶</span>
                  <span>{playerReady ? '강의 시작' : '로딩 중...'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="video-controls glass">
            <span className="time-display">
              {formatTime(ytCurrentTime || elapsed)} / {selectedLecture.duration}
            </span>
            <div className="control-bar">
              <div className="filled-bar" style={{ width: `${progressPct}%` }}></div>
            </div>
            <div className="control-actions">
              {sessionStarted && elapsed >= MIN_SESSION_SEC && (
                <span className="session-hint">영상이 끝나면 리포트가 자동 생성됩니다</span>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="webcam-box glass">
            <div className="cam-placeholder">
              {webcam.isActive ? (
                <video
                  ref={webcam.videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', transform: 'scaleX(-1)' }}
                />
              ) : (
                <span className="cam-icon">👤</span>
              )}
              {sessionStarted && analysis.faceDetected && (
                <div className="bounding-box" style={{ borderColor: status.color }}></div>
              )}
              {!analysis.faceDetected && sessionStarted && webcam.isActive && (
                <div className="no-face-warning">화면을 바라봐주세요</div>
              )}
            </div>
            <div className="cam-status">
              <span className="live-dot" style={{ background: sessionStarted ? (tabWarning ? '#ef4444' : analysis.faceDetected ? '#22c55e' : '#f59e0b') : '#64748b' }}></span>
              {webcam.error ? webcam.error
                : analysis.modelLoadingProgress ? analysis.modelLoadingProgress
                : sessionStarted ? (tabWarning ? '집중도 하락 기록 중' : analysis.isAnalyzing ? `On-Device AI 분석 중 (${Math.round(analysis.confidence * 100)}%)` : '분석 준비 중...')
                : '대기 중'}
            </div>
          </div>

          <div className="focus-meter glass">
            <h3>실시간 집중도</h3>
            <div className="meter-wrapper">
              <div
                className="meter-circle"
                style={{ background: `conic-gradient(${sessionStarted ? status.color : '#64748b'} ${focusLevel}%, var(--card-border) 0)` }}
              >
                <div className="inner-circle">{focusLevel}%</div>
              </div>
            </div>
            <p className="status-label" style={{ color: sessionStarted ? status.color : 'var(--text-muted)' }}>
              {sessionStarted ? status.label : '강의를 시작해주세요'}
            </p>
          </div>

          <div className="session-stats glass">
            <div className="stat-item">
              <span className="stat-label">탭 이탈</span>
              <span className="stat-value" style={{ color: departureCount > 0 ? '#f59e0b' : 'var(--text-main)' }}>
                {departureCount}회
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">경과 시간</span>
              <span className="stat-value">{formatTime(elapsed)}</span>
            </div>
          </div>

          {user?.inviteCode && (
            <div className="invite-code-card glass">
              <h3 className="invite-code-title">내 초대 코드</h3>
              <div className="invite-code-row">
                <span className="invite-code-value">{user.inviteCode}</span>
                <button
                  className="invite-copy-btn"
                  onClick={() => navigator.clipboard.writeText(user.inviteCode).then(() => alert('복사되었습니다.'))}
                >
                  복사
                </button>
              </div>
              <p className="invite-code-hint">학부모에게 이 코드를 알려주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;

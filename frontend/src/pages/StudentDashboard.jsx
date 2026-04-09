/* 2026-04-09: YouTube iframe 연동 + 세션 데이터 백엔드 연결 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import lectures from '../data/lectures.json';
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
  const [selectedLecture, setSelectedLecture] = useState(lectures[0]);
  const [focusLevel, setFocusLevel] = useState(85);
  const [focusStatus, setFocusStatus] = useState(1);
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
  const tabLeaveTimeRef = useRef(null);

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
        playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            playerReadyRef.current = true;
            setPlayerReady(true);
            const dur = e.target.getDuration();
            if (dur > 0) setYtDuration(dur);
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

  // 세션 중 YouTube 재생 시간 추적
  useEffect(() => {
    if (!sessionStarted) return;
    const interval = setInterval(() => {
      if (playerRef.current && playerReadyRef.current) {
        try {
          const t = playerRef.current.getCurrentTime();
          const d = playerRef.current.getDuration();
          if (t !== undefined) setYtCurrentTime(t);
          if (d > 0) setYtDuration(d);
        } catch (_) {}
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStarted]);

  // 집중도 분류 결과를 3초마다 백엔드로 전송
  useEffect(() => {
    if (!sessionStarted) return;
    const interval = setInterval(async () => {
      if (!sessionIdRef.current) return;
      try {
        await fetch(`/api/sessions/${sessionIdRef.current}/records`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            records: [{
              timestamp: new Date().toISOString(),
              status: focusStatusRef.current,
              confidence: focusLevelRef.current / 100,
            }],
          }),
        });
      } catch (_) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [sessionStarted]);

  // Page Visibility API — 탭 이탈 감지
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'hidden' && sessionStarted) {
        tabLeaveTimeRef.current = new Date();
        setTabWarning(true);
        setDepartureCount(prev => prev + 1);
        setFocusStatus(4);
        setFocusLevel(45);
        focusStatusRef.current = 4;
        focusLevelRef.current = 45;
      } else if (document.visibilityState === 'visible' && tabLeaveTimeRef.current) {
        const returnTime = new Date();
        const duration = returnTime - tabLeaveTimeRef.current;
        if (sessionIdRef.current) {
          try {
            await fetch(`/api/sessions/${sessionIdRef.current}/departures`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                leaveTime: tabLeaveTimeRef.current.toISOString(),
                returnTime: returnTime.toISOString(),
                duration,
              }),
            });
          } catch (_) {}
        }
        tabLeaveTimeRef.current = null;
        setTimeout(() => {
          setTabWarning(false);
          setFocusStatus(2);
          setFocusLevel(80);
          focusStatusRef.current = 2;
          focusLevelRef.current = 80;
        }, 2000);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [sessionStarted]);

  // 집중도 모의 변동 (AI 연동 전 fallback)
  useEffect(() => {
    if (!sessionStarted) return;
    const timer = setInterval(() => {
      setFocusLevel(prev => {
        if (tabWarning) return prev;
        const diff = Math.floor(Math.random() * 7) - 3;
        const next = Math.min(100, Math.max(0, prev + diff));
        let status = 1;
        if (next >= 80) status = 1;
        else if (next >= 65) status = 2;
        else if (next >= 50) status = 3;
        else if (next >= 30) status = 4;
        else status = 5;
        setFocusStatus(status);
        focusStatusRef.current = status;
        focusLevelRef.current = next;
        return next;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [sessionStarted, tabWarning]);

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
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: 'demo-student-001',
          lectureId: selectedLecture.id,
          subject: selectedLecture.subject,
        }),
      });
      const data = await res.json();
      sessionIdRef.current = data._id || null;
    } catch (_) {
      sessionIdRef.current = null;
    }

    setSessionStarted(true);
    setElapsed(0);
    elapsedRef.current = 0;
    setDepartureCount(0);
    setFocusLevel(85);
    setFocusStatus(1);
    focusStatusRef.current = 1;
    focusLevelRef.current = 85;

    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.playVideo();
    }
  };

  const handleEndSession = async () => {
    if (playerRef.current && playerReadyRef.current) {
      playerRef.current.pauseVideo();
    }
    const sid = sessionIdRef.current;
    if (sid) {
      try {
        await fetch(`/api/sessions/${sid}/end`, { method: 'PUT' });
        navigate(`/student/report/${sid}`);
        return;
      } catch (_) {}
    }
    navigate('/parent');
  };

  const handleLectureSelect = (lec) => {
    setSelectedLecture(lec);
    setSessionStarted(false);
    setElapsed(0);
    elapsedRef.current = 0;
    setFocusLevel(85);
    setFocusStatus(1);
    setTabWarning(false);
    setDepartureCount(0);
    setYtCurrentTime(0);
    sessionIdRef.current = null;
  };

  const triggerMockDeparture = async () => {
    if (!sessionStarted) return;
    const leaveTime = new Date();
    setTabWarning(true);
    setDepartureCount(prev => prev + 1);
    setFocusStatus(4);
    setFocusLevel(45);
    focusStatusRef.current = 4;
    focusLevelRef.current = 45;
    setTimeout(async () => {
      const returnTime = new Date();
      const duration = returnTime - leaveTime;
      if (sessionIdRef.current) {
        try {
          await fetch(`/api/sessions/${sessionIdRef.current}/departures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leaveTime: leaveTime.toISOString(),
              returnTime: returnTime.toISOString(),
              duration,
            }),
          });
        } catch (_) {}
      }
      setTabWarning(false);
      setFocusStatus(2);
      setFocusLevel(80);
      focusStatusRef.current = 2;
      focusLevelRef.current = 80;
    }, 4000);
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
          ⚠️ 탭 이탈이 감지되었습니다. 집중도가 기록되고 있습니다. 학습 창으로 돌아와주세요!
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
              <button className="warn-btn" onClick={triggerMockDeparture} disabled={!sessionStarted}>
                모의 탭 이탈
              </button>
              {sessionStarted && (
                <button className="end-btn" onClick={handleEndSession}>
                  세션 종료 · 리포트 확인 →
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="webcam-box glass">
            <div className="cam-placeholder">
              <span className="cam-icon">👤</span>
              <div className="bounding-box" style={{ borderColor: sessionStarted ? status.color : '#64748b' }}></div>
              <div className="landmarks">
                <span className="dot" style={{ top: '40%', left: '30%', background: sessionStarted ? status.color : '#64748b' }}></span>
                <span className="dot" style={{ top: '40%', left: '70%', background: sessionStarted ? status.color : '#64748b' }}></span>
                <span className="dot" style={{ top: '65%', left: '50%', background: sessionStarted ? status.color : '#64748b' }}></span>
              </div>
            </div>
            <div className="cam-status">
              <span className="live-dot" style={{ background: sessionStarted ? (tabWarning ? '#ef4444' : '#22c55e') : '#64748b' }}></span>
              {sessionStarted ? (tabWarning ? '집중도 하락 기록 중' : 'On-Device AI 분석 중') : '대기 중'}
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
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;

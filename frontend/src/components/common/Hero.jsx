import React from 'react';
import './Hero.css';

const Hero = () => {
  return (
    <section className="hero container">
      <div className="hero-content animate-fade-in">
        <div className="badge">2026 KIT 바이브코딩 출품작</div>
        <h1 className="hero-title">
          우리 아이, 인강 틀어놓고 <br/>
          <span className="text-gradient">딴짓하지 않을까?</span>
        </h1>
        <p className="hero-subtitle">
          웹캠 기반 온디바이스 AI가 실시간으로 집중도를 분석하고,<br/>
          RAG 기술로 맞춤형 학부모 리포트를 제공합니다.
        </p>
        <div className="hero-actions">
          <button className="btn-primary btn-large">무료로 시작하기</button>
          <button className="btn-secondary btn-large">작동 원리 보기</button>
        </div>
      </div>
      <div className="hero-image glass animate-fade-in delay-200">
        <div className="mockup-header">
          <div className="dots"><span></span><span></span><span></span></div>
        </div>
        <div className="mockup-body">
          <div className="video-placeholder">
            <div className="webcam-status">
              <span className="status-dot"></span> 분석 중 (온디바이스)
            </div>
            <h3>[수학] 고등 미적분 기초</h3>
          </div>
          <div className="dashboard-preview">
            <div className="stat-card">
              <h4>현재 집중도</h4>
              <div className="progress-bar"><div className="fill" style={{width: '85%'}}></div></div>
              <p>85% (매우 높음)</p>
            </div>
            <div className="stat-card">
              <h4>AI 실시간 코칭</h4>
              <p>개념 설명 구간을 집중해서 듣고 있어요!</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

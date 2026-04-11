import React from 'react';
import { FiMonitor, FiFileText, FiShield, FiTrendingUp } from 'react-icons/fi';
import './Features.css';

const Features = () => {
  const featureList = [
    {
      icon: <FiMonitor />,
      title: "온디바이스 AI 비전 분석",
      desc: "브라우저(TensorFlow.js)에서 실시간으로 5가지 학습 태도를 분류하여 프라이버시를 지킵니다."
    },
    {
      icon: <FiFileText />,
      title: "RAG 기반 맞춤형 리포트",
      desc: "AI가 강의 자막을 분석하고, 특정 구간의 집중도 저하 원인을 구체적으로 설명합니다."
    },
    {
      icon: <FiShield />,
      title: "완벽한 프라이버시 보호",
      desc: "영상 및 음성 데이터는 절대 서버로 전송되지 않으며, 단순 숫자화된 집중도 결과만 기록됩니다."
    },
    {
      icon: <FiTrendingUp />,
      title: "데이터 기반 학습 코칭",
      desc: "탭 이탈 기록과 졸음 빈도를 종합하여 학부모에게 과학적인 자녀 학습 지도를 돕습니다."
    }
  ];

  return (
    <section id="features" className="features container">
      <div className="section-header">
        <h2 className="section-title">주요 기능</h2>
        <p className="section-subtitle">최신 AI 기술로 자녀의 올바른 자기주도학습을 돕습니다.</p>
      </div>
      <div className="features-grid">
        {featureList.map((feature, idx) => (
          <div key={idx} className="feature-card glass animate-fade-in delay-200">
            <div className="icon-wrapper">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-desc">{feature.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Features;

import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer border-t">
      <div className="container footer-content">
        <div className="footer-brand">
          <h3>EduWatch</h3>
          <p>AI 학습태도 모니터링 & 학부모 리포트 서비스</p>
        </div>
        <div className="footer-links">
          <p>2026 KIT 바이브코딩 공모전 출품작</p>
          <p>&copy; 2026 EduWatch Team. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

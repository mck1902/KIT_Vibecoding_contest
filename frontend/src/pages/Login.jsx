/* 2026-04-08 생성: 학부모와 학생 로그인을 목업으로 제공하는 페이지입니다. */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();

  const handleLogin = (role) => {
    if (role === 'parent') {
      navigate('/parent');
    } else {
      navigate('/student');
    }
  };

  return (
    <div className="login-container container">
      <div className="login-box glass animate-fade-in">
        <h2 className="login-title">EduWatch 로그인</h2>
        <p className="login-subtitle">로그인할 계정 유형을 선택해주세요.</p>
        
        <div className="login-options">
          <button className="role-btn" onClick={() => handleLogin('student')}>
            <span className="emoji">📝</span>
            <div className="role-text">
              <h3>학생 로그인</h3>
              <p>인강 시청 및 태도 분석</p>
            </div>
          </button>

          <button className="role-btn parent-btn" onClick={() => handleLogin('parent')}>
            <span className="emoji">👨‍👩‍👦</span>
            <div className="role-text">
              <h3>학부모 로그인</h3>
              <p>자녀 학습 리포트 및 대시보드</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;

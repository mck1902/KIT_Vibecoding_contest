import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 이미 로그인 상태면 대시보드로 이동
  if (user) {
    return <Navigate to={user.role === 'student' ? '/student' : '/parent'} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      navigate(loggedUser.role === 'student' ? '/student' : '/parent', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container container">
      <div className="login-box glass animate-fade-in">
        <h2 className="login-title">EduWatch 로그인</h2>
        <p className="login-subtitle">이메일과 비밀번호로 로그인하세요.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className="login-footer">
          <p>계정이 없으신가요? <Link to="/register" className="link">회원가입</Link></p>
          <p className="demo-hint">
            데모 계정: <code>student@demo.com</code> / <code>password123</code>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

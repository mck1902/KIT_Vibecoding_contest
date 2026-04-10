import React, { useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const Register = () => {
  const navigate = useNavigate();
  const { register, user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student', gradeLevel: 'middle', partnerCode: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to={user.role === 'student' ? '/student' : '/parent'} replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'role' && value === 'student' ? { gradeLevel: 'middle' } : {}),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (form.role === 'student' && !form.gradeLevel) {
      setError('학교급을 선택해주세요.');
      return;
    }
    setLoading(true);
    try {
      const newUser = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        gradeLevel: form.role === 'student' ? form.gradeLevel : undefined,
        partnerCode: form.partnerCode || undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container container">
      <div className="login-box glass animate-fade-in">
        <h2 className="login-title">회원가입</h2>
        <p className="login-subtitle">EduWatch 계정을 만들어보세요.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">이름</label>
            <input
              id="name"
              name="name"
              type="text"
              className="form-input"
              placeholder="홍길동"
              value={form.name}
              onChange={handleChange}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="example@email.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">비밀번호 (6자 이상)</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              placeholder="비밀번호 입력"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>역할 선택</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {[{ value: 'student', label: '학생' }, { value: 'parent', label: '학부모' }].map(opt => (
                <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                  <input
                    type="radio"
                    name="role"
                    value={opt.value}
                    checked={form.role === opt.value}
                    onChange={handleChange}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {form.role === 'student' && (
            <div className="form-group">
              <label>중등/고등부</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {[{ value: 'middle', label: '중학생' }, { value: 'high', label: '고등학생' }].map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'var(--text-main)' }}>
                    <input
                      type="radio"
                      name="gradeLevel"
                      value={opt.value}
                      checked={form.gradeLevel === opt.value}
                      onChange={handleChange}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="partnerCode">
              {form.role === 'student' ? '학부모 초대 코드 (선택)' : '자녀 초대 코드 (선택)'}
            </label>
            <input
              id="partnerCode"
              name="partnerCode"
              type="text"
              className="form-input"
              placeholder="예: ABC123"
              value={form.partnerCode}
              onChange={(e) => setForm(prev => ({ ...prev, partnerCode: e.target.value.toUpperCase() }))}
              maxLength={6}
              style={{ letterSpacing: '0.15em', fontWeight: 600 }}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {form.role === 'student'
                ? '학부모의 초대 코드를 알고 있다면 입력하세요.'
                : '자녀의 초대 코드를 알고 있다면 입력하세요.'}
              {' '}나중에 대시보드에서도 연결할 수 있습니다.
            </small>
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div className="login-footer">
          <p>이미 계정이 있으신가요? <Link to="/login" className="link">로그인</Link></p>
        </div>
      </div>
    </div>
  );
};

export default Register;

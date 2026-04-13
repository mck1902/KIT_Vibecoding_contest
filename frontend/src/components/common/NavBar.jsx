import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FiSun, FiMoon, FiLogOut, FiSettings } from 'react-icons/fi';
import { Coins } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { edupointAPI } from '../../services/api';
import './NavBar.css';

const NavBar = ({ theme, toggleTheme }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [studentEarned, setStudentEarned] = useState(null);

  // 학생 로그인 시 누적 포인트 조회 (페이지 이동 시마다 최신화)
  useEffect(() => {
    if (user?.role !== 'student' || !user?.studentId) {
      setStudentEarned(null);
      return;
    }
    edupointAPI.get(user.studentId)
      .then(data => {
        if (data.initialized) setStudentEarned(data.studentEarned ?? 0);
        else setStudentEarned(null);
      })
      .catch(() => setStudentEarned(null));
  }, [user?.studentId, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar glass">
      <div className="container nav-content">
        <Link to="/" className="logo">
          <span className="logo-accent">Edu</span>Watch
        </Link>
        <ul className="nav-links">
          <li><Link to="/features">기능소개</Link></li>
          {user?.role === 'parent' && <li><Link to="/parent">대시보드</Link></li>}
          {user?.role === 'student' && <li><Link to="/student">강의실</Link></li>}
          {!user && (
            <>
              <li><Link to="/parent">학부모</Link></li>
              <li><Link to="/student">학생</Link></li>
            </>
          )}
        </ul>
        <div className="nav-actions">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? <FiMoon size={20} /> : <FiSun size={20} />}
          </button>
          {user ? (
            <div className="nav-user">
              {studentEarned !== null && (
                <div className="nav-point-badge">
                  <span className="point-icon"><Coins size={16} fill="var(--button-bg, #f59e0b)" stroke="currentColor" strokeWidth={1.5} /></span>
                  <span className="point-value">{studentEarned.toLocaleString()}P</span>
                </div>
              )}
              <span className="nav-username">{user.name}</span>
              <Link
                to="/settings"
                className={`btn-settings${location.pathname === '/settings' ? ' active' : ''}`}
                title="설정"
              >
                <FiSettings size={18} />
              </Link>
              <button className="btn-logout" onClick={handleLogout} title="로그아웃">
                <FiLogOut size={18} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '8px' }}>로그인</Link>
          )}
        </div>
      </div>
    </nav>
  );
};

export default NavBar;

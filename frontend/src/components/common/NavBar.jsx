import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiSun, FiMoon, FiLogOut } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import './NavBar.css';

const NavBar = ({ theme, toggleTheme }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
              <span className="nav-username">{user.name}</span>
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

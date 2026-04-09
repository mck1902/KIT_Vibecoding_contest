/* 2026-04-08 수정: 라우팅 목적으로 react-router-dom 의 Link를 사용하도록 수정했습니다. */
import React from 'react';
import { Link } from 'react-router-dom';
import { FiSun, FiMoon } from 'react-icons/fi';
import './NavBar.css';

const NavBar = ({ theme, toggleTheme }) => {
  return (
    <nav className="navbar glass">
      <div className="container nav-content">
        <Link to="/" className="logo">
          <span className="logo-accent">Edu</span>Watch
        </Link>
        <ul className="nav-links">
          <li><Link to="/">기능소개</Link></li>
          <li><Link to="/parent">학부모 로그인</Link></li>
          <li><Link to="/student">학생 강의실</Link></li>
        </ul>
        <div className="nav-actions">
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'light' ? <FiMoon size={20} /> : <FiSun size={20} />}
          </button>
          <Link to="/login" className="btn-primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '8px' }}>로그인</Link>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;

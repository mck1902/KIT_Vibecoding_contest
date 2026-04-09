/* 2026-04-08 수정: react-router-dom 을 탑재하여 로그인/부모/학생 화면 라우터를 모두 연결했습니다. */
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from './components/common/NavBar';
import Footer from './components/common/Footer';
import Landing from './pages/Landing';
import Login from './pages/Login';
import ParentDashboard from './pages/ParentDashboard';
import StudentDashboard from './pages/StudentDashboard';
import SessionReport from './pages/SessionReport';

function App() {
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <Router>
      <div className="app-container">
        {/* 블러 배경 효과 (글래스모피즘 지원) */}
        <div className="bg-glow"></div>
        <div className="bg-glow right"></div>
        
        <NavBar theme={theme} toggleTheme={toggleTheme} />
        
        <div style={{ paddingTop: '70px', minHeight: 'calc(100vh - 150px)' }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/parent" element={<ParentDashboard />} />
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/report/:sessionId" element={<SessionReport />} />
          </Routes>
        </div>

        <Footer />
      </div>
    </Router>
  );
}

export default App;

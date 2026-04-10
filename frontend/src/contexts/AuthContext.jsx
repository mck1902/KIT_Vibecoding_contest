import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // 앱 시작 시 토큰 유효성 서버 검증
  useEffect(() => {
    const stored = localStorage.getItem('eduwatch_token');
    if (!stored) {
      setLoading(false);
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('invalid');
        return res.json();
      })
      .then((data) => {
        // /me가 반환한 새 토큰으로 교체 (stale token 방지)
        const freshToken = data.token || stored;
        setToken(freshToken);
        setUser(data.user);
        localStorage.setItem('eduwatch_token', freshToken);
        localStorage.setItem('eduwatch_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('eduwatch_token');
        localStorage.removeItem('eduwatch_user');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '로그인에 실패했습니다.');
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('eduwatch_token', data.token);
    localStorage.setItem('eduwatch_user', JSON.stringify(data.user));
    return data.user;
  }

  async function register(formData) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '회원가입에 실패했습니다.');
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('eduwatch_token', data.token);
    localStorage.setItem('eduwatch_user', JSON.stringify(data.user));
    return data.user;
  }

  function updateUser(newUser, newToken) {
    setUser(newUser);
    if (newToken) setToken(newToken);
    localStorage.setItem('eduwatch_user', JSON.stringify(newUser));
    if (newToken) localStorage.setItem('eduwatch_token', newToken);
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem('eduwatch_token');
    localStorage.removeItem('eduwatch_user');
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

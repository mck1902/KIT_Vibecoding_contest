import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { edupointAPI, authAPI } from '../services/api';
import { Coins, Target, Trophy, ArrowLeft } from 'lucide-react';
import './ParentPointSettings.css';

const CHARGE_OPTIONS = [1000, 5000, 10000];

const ParentPointSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [charging, setCharging] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // 설정 폼 상태
  const [targetRate, setTargetRate] = useState(70);
  const [rewardPerSession, setRewardPerSession] = useState(100);
  const [weeklyBonusCount, setWeeklyBonusCount] = useState(5);
  const [weeklyBonusReward, setWeeklyBonusReward] = useState(500);

  // 잔액
  const [balance, setBalance] = useState(0);
  const [studentEarned, setStudentEarned] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // 자녀 목록 로드
  useEffect(() => {
    authAPI.getChild()
      .then(data => {
        if (data.children?.length) {
          setChildren(data.children);
          setSelectedChild(data.children[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // 선택된 자녀의 포인트 설정 로드
  useEffect(() => {
    if (!selectedChild) return;
    setLoading(true);
    edupointAPI.get(selectedChild.studentId)
      .then(data => {
        setTargetRate(data.settings?.targetRate ?? 70);
        setRewardPerSession(data.settings?.rewardPerSession ?? 100);
        setWeeklyBonusCount(data.settings?.weeklyBonusCount ?? 5);
        setWeeklyBonusReward(data.settings?.weeklyBonusReward ?? 500);
        setBalance(data.balance ?? 0);
        setStudentEarned(data.studentEarned ?? 0);
        setInitialized(data.initialized ?? false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedChild]);

  const handleSave = async () => {
    if (!selectedChild) return;
    setSaving(true);
    setMessage({ text: '', type: '' });
    try {
      const data = await edupointAPI.updateSettings(selectedChild.studentId, {
        targetRate, rewardPerSession, weeklyBonusCount, weeklyBonusReward,
      });
      setBalance(data.balance ?? balance);
      setStudentEarned(data.studentEarned ?? studentEarned);
      setInitialized(true);
      setMessage({ text: '설정이 저장되었습니다. 변경된 주간 보너스 조건은 다음 주 월요일부터 적용됩니다.', type: 'success' });
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCharge = async (amount) => {
    if (!selectedChild) return;
    setCharging(true);
    setMessage({ text: '', type: '' });
    try {
      const data = await edupointAPI.charge(selectedChild.studentId, amount);
      setBalance(data.balance);
      setMessage({ text: `${amount.toLocaleString()}P 충전 완료!`, type: 'success' });
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setCharging(false);
    }
  };

  if (loading && children.length === 0) {
    return (
      <div className="ps-container container animate-fade-in">
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem' }}>불러오는 중...</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="ps-container container animate-fade-in">
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '3rem' }}>연결된 자녀가 없습니다. 먼저 자녀를 연결해주세요.</p>
        <button className="ps-btn secondary" onClick={() => navigate('/parent')} style={{ margin: '1rem auto', display: 'block' }}>대시보드로 이동</button>
      </div>
    );
  }

  return (
    <div className="ps-container container animate-fade-in">
      <header className="ps-header">
        <button className="ps-back-btn" onClick={() => navigate('/parent')}>
          <ArrowLeft size={18} /> 대시보드
        </button>
        <h2><Coins size={24} /> 에듀 포인트 설정</h2>
        {children.length > 1 && (
          <select
            className="ps-child-select"
            value={selectedChild?.studentId ?? ''}
            onChange={(e) => {
              const child = children.find(c => c.studentId === e.target.value);
              setSelectedChild(child);
              setMessage({ text: '', type: '' });
            }}
          >
            {children.map(c => (
              <option key={c.studentId} value={c.studentId}>{c.name}</option>
            ))}
          </select>
        )}
        {children.length === 1 && (
          <span className="ps-child-name">{selectedChild?.name}</span>
        )}
      </header>

      {/* 잔액 + 충전 */}
      <section className="ps-balance-section glass">
        <div className="ps-balance-info">
          <div className="ps-balance-item">
            <span className="ps-balance-label">예산 잔액</span>
            <span className="ps-balance-value">{balance.toLocaleString()}P</span>
          </div>
          <div className="ps-balance-item">
            <span className="ps-balance-label">{selectedChild?.name} 누적 획득</span>
            <span className="ps-balance-value earned">{studentEarned.toLocaleString()}P</span>
          </div>
        </div>
        <div className="ps-charge-row">
          {CHARGE_OPTIONS.map(amount => (
            <button
              key={amount}
              className="ps-charge-btn"
              onClick={() => handleCharge(amount)}
              disabled={charging || !initialized}
            >
              {amount.toLocaleString()}P 충전
            </button>
          ))}
        </div>
        {!initialized && (
          <p className="ps-notice">아래 설정을 먼저 저장해야 충전할 수 있습니다.</p>
        )}
      </section>

      {/* 목표 설정 */}
      <section className="ps-settings-section glass">
        <h3><Target size={18} /> 목표 설정</h3>

        <div className="ps-field">
          <label>목표 집중률</label>
          <div className="ps-slider-row">
            <input
              type="range" min={50} max={95} step={5}
              value={targetRate}
              onChange={(e) => setTargetRate(Number(e.target.value))}
            />
            <span className="ps-slider-value">{targetRate}%</span>
          </div>
        </div>

        <div className="ps-field">
          <label>세션당 보상 포인트</label>
          <input
            type="number" min={10} max={500} step={10}
            value={rewardPerSession}
            onChange={(e) => setRewardPerSession(Number(e.target.value))}
            className="ps-input"
          />
          <span className="ps-unit">P</span>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}><Trophy size={18} /> 주간 보너스 조건</h3>

        <div className="ps-field">
          <label>주간 달성 횟수</label>
          <input
            type="number" min={1} max={7} step={1}
            value={weeklyBonusCount}
            onChange={(e) => setWeeklyBonusCount(Number(e.target.value))}
            className="ps-input"
          />
          <span className="ps-unit">회 / 주</span>
        </div>

        <div className="ps-field">
          <label>주간 보너스 포인트</label>
          <input
            type="number" min={10} max={5000} step={10}
            value={weeklyBonusReward}
            onChange={(e) => setWeeklyBonusReward(Number(e.target.value))}
            className="ps-input"
          />
          <span className="ps-unit">P</span>
        </div>

        <button className="ps-btn primary" onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </section>

      {message.text && (
        <div className={`ps-message ${message.type}`}>{message.text}</div>
      )}
    </div>
  );
};

export default ParentPointSettings;

import React, { useState } from 'react';
import { edupointAPI } from '../../services/api';
import './PointBalance.css';

const CHARGE_OPTIONS = [1000, 5000, 10000];

const PointBalance = ({ studentId, edupoint, onUpdate }) => {
  const [charging, setCharging] = useState(false);

  const handleCharge = async (amount) => {
    if (charging) return;
    setCharging(true);
    try {
      await edupointAPI.charge(studentId, amount);
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setCharging(false);
    }
  };

  return (
    <div className="point-balance-card glass">
      <div className="point-balance-header">
        <span className="point-balance-label">에듀 포인트 잔액</span>
        <span className="point-balance-value">
          {edupoint.balance.toLocaleString()}P
        </span>
      </div>
      <div className="point-balance-earned">
        자녀 누적 획득: <strong>{edupoint.studentEarned.toLocaleString()}P</strong>
      </div>
      <div className="point-charge-buttons">
        {CHARGE_OPTIONS.map((amount) => (
          <button
            key={amount}
            className="point-charge-btn"
            onClick={() => handleCharge(amount)}
            disabled={charging}
          >
            +{amount.toLocaleString()}P
          </button>
        ))}
      </div>
    </div>
  );
};

export default PointBalance;

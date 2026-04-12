import React, { useState, useEffect } from 'react';
import { edupointAPI } from '../../services/api';
import './PointHistory.css';

const TYPE_LABELS = {
  earn: '세션 달성',
  charge: '충전',
  weekly_bonus: '주간 보너스',
  weekly_bonus_failed: '보너스 실패',
};

const TYPE_COLORS = {
  earn: 'var(--point-success)',
  charge: 'var(--point-gold)',
  weekly_bonus: 'var(--accent-color)',
  weekly_bonus_failed: 'var(--point-danger)',
};

const PointHistory = ({ studentId, refreshKey }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    edupointAPI.getHistory(studentId, { limit: 5 })
      .then(data => setHistory(data.history || []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [studentId, refreshKey]);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="point-history-card glass">
      <h4 className="point-history-title">최근 포인트 내역</h4>
      {loading && <p className="point-history-empty">불러오는 중...</p>}
      {!loading && history.length === 0 && (
        <p className="point-history-empty">아직 내역이 없습니다.</p>
      )}
      {!loading && history.length > 0 && (
        <ul className="point-history-list">
          {history.map((item) => (
            <li key={item._id} className="point-history-item">
              <div className="point-history-left">
                <span
                  className="point-history-type"
                  style={{ color: TYPE_COLORS[item.type] }}
                >
                  {TYPE_LABELS[item.type] || item.type}
                </span>
                <span className="point-history-date">{formatDate(item.createdAt)}</span>
              </div>
              <span className={`point-history-amount ${item.type === 'earn' || item.type === 'weekly_bonus' ? 'negative' : 'positive'}`}>
                {item.type === 'charge' ? '+' : '-'}{item.amount.toLocaleString()}P
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PointHistory;

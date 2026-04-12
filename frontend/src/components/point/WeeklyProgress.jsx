import React, { useState, useEffect } from 'react';
import { sessionAPI } from '../../services/api';
import './WeeklyProgress.css';

const WeeklyProgress = ({ studentId, edupoint, refreshKey }) => {
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const target = edupoint?.settings?.weeklyBonusCount || 5;
  const bonusReward = edupoint?.settings?.weeklyBonusReward || 500;

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    // 이번 주 포인트 획득 세션 수 계산 (pointAwarded === true)
    sessionAPI.getAll()
      .then(data => {
        if (!Array.isArray(data)) return;
        // KST 기준 이번 주 월요일 00:00 계산
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        const day = kstNow.getUTCDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(kstNow);
        monday.setUTCDate(monday.getUTCDate() + diffToMonday);
        monday.setUTCHours(0, 0, 0, 0);
        const weekStart = new Date(monday.getTime() - kstOffset);

        const count = data.filter(s =>
          s.studentId === studentId &&
          s.pointAwarded === true &&
          new Date(s.endTime) >= weekStart
        ).length;
        setWeeklyCount(count);
      })
      .catch(() => setWeeklyCount(0))
      .finally(() => setLoading(false));
  }, [studentId, refreshKey]);

  const progress = Math.min((weeklyCount / target) * 100, 100);
  const achieved = weeklyCount >= target;

  return (
    <div className="weekly-progress-card glass">
      <h4 className="weekly-progress-title">주간 보너스 현황</h4>
      {loading ? (
        <p className="weekly-progress-empty">불러오는 중...</p>
      ) : (
        <>
          <div className="weekly-progress-bar-wrap">
            <div
              className={`weekly-progress-bar ${achieved ? 'achieved' : ''}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="weekly-progress-info">
            <span className="weekly-progress-count">
              {weeklyCount} / {target}회 달성
            </span>
            {achieved ? (
              <span className="weekly-progress-bonus achieved">
                +{bonusReward.toLocaleString()}P 보너스 획득!
              </span>
            ) : (
              <span className="weekly-progress-bonus pending">
                {target - weeklyCount}회 더 달성하면 +{bonusReward.toLocaleString()}P
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WeeklyProgress;

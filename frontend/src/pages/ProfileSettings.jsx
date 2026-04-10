import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import './ProfileSettings.css';

const ROLE_LABEL = { student: '학생', parent: '학부모' };
const GRADE_LABEL = { middle: '중학생', high: '고등학생' };

const ProfileSettings = () => {
  const { user, updateUser } = useAuth();

  // 초대 코드 복사
  const [copied, setCopied] = useState(false);

  // 자녀 정보 (학부모 전용)
  const [children, setChildren] = useState([]);

  // 학부모 정보 (학생 전용)
  const [parentInfo, setParentInfo] = useState(null);
  const [unlinkStatus, setUnlinkStatus] = useState('idle'); // idle | loading | done
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);

  // 초대 코드 연결
  const [partnerCode, setPartnerCode] = useState('');
  const [linkStatus, setLinkStatus] = useState('idle');
  const [linkMessage, setLinkMessage] = useState('');

  // 이름 변경
  const [nameEdit, setNameEdit] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameStatus, setNameStatus] = useState('idle');
  const [nameMessage, setNameMessage] = useState('');

  // 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwStatus, setPwStatus] = useState('idle'); // idle | loading | success | error
  const [pwMessage, setPwMessage] = useState('');

  const isLinked = !!(user?.childStudentId);

  // 학부모인 경우 자녀 정보 조회
  useEffect(() => {
    if (user?.role !== 'parent' || !user?.childStudentId) return;
    authAPI.getChild()
      .then(data => { if (data.child) setChildInfo(data.child); })
      .catch(() => { });
  }, [user?.role, user?.childStudentId]);

  // 학생인 경우 연결된 학부모 정보 조회
  useEffect(() => {
    if (user?.role !== 'student') return;
    authAPI.getParent()
      .then(data => { if (data.parent) setParentInfo(data.parent); })
      .catch(() => { });
  }, [user?.role]);

  // ── 핸들러 ─────────────────────────────────────

  const handleCopy = () => {
    if (!user?.inviteCode) return;
    navigator.clipboard.writeText(user.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUnlink = async () => {
    setUnlinkStatus('loading');
    try {
      const data = await authAPI.unlink();
      if (data.token) updateUser(data.user, data.token);
      setParentInfo(null);
      setChildInfo(null);
      setUnlinkConfirm(false);
      setUnlinkStatus('done');
    } catch {
      setUnlinkStatus('idle');
      setUnlinkConfirm(false);
    }
  };

  const handleLink = async (e) => {
    e.preventDefault();
    if (!partnerCode.trim()) return;
    setLinkStatus('loading');
    setLinkMessage('');
    try {
      const { token, user: newUser } = await authAPI.link(partnerCode.trim().toUpperCase());
      updateUser(newUser, token);
      setLinkStatus('success');
      setLinkMessage('연결되었습니다!');
      setPartnerCode('');
      // 자녀 정보 새로고침
      if (newUser.role === 'parent') {
        authAPI.getChild().then(data => { if (data.child) setChildInfo(data.child); }).catch(() => { });
      }
    } catch (err) {
      setLinkStatus('error');
      setLinkMessage(err.message || '연결에 실패했습니다.');
    }
  };

  const handleNameSave = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setNameStatus('loading');
    setNameMessage('');
    try {
      const { token, user: newUser } = await authAPI.updateProfile({ name: newName.trim() });
      updateUser(newUser, token);
      setNameStatus('success');
      setNameMessage('이름이 변경되었습니다.');
      setNameEdit(false);
      setNewName('');
    } catch (err) {
      setNameStatus('error');
      setNameMessage(err.message || '이름 변경에 실패했습니다.');
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwStatus('error');
      setPwMessage('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (newPassword.length < 6) {
      setPwStatus('error');
      setPwMessage('새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    setPwStatus('loading');
    setPwMessage('');
    try {
      const { token, user: newUser } = await authAPI.updateProfile({ currentPassword, newPassword });
      updateUser(newUser, token);
      setPwStatus('success');
      setPwMessage('비밀번호가 성공적으로 변경되었습니다.');
    } catch (err) {
      setPwStatus('error');
      setPwMessage(err.message || '비밀번호 변경에 실패했습니다.');
    }
  };

  const resetPasswordForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwStatus('idle');
    setPwMessage('');
  };

  // ── 렌더 ──────────────────────────────────────

  return (
    <div className="settings-container container animate-fade-in">
      <h2 className="settings-title">프로필 설정</h2>

      {/* 계정 정보 */}
      <section className="settings-card glass">
        <h3 className="settings-section-title">계정 정보</h3>
        <div className="info-row">
          <span className="info-label">이름</span>
          <span className="info-value">{user?.name}</span>
        </div>
        <div className="info-row">
          <span className="info-label">이메일</span>
          <span className="info-value">{user?.email}</span>
        </div>
        <div className="info-row">
          <span className="info-label">역할</span>
          <span className="info-value role-badge">{ROLE_LABEL[user?.role] ?? user?.role}</span>
        </div>
      </section>

      {/* 연결된 자녀 정보 (학부모 전용) */}
      {user?.role === 'parent' && (
        <section className="settings-card glass">
          <h3 className="settings-section-title">연결된 자녀</h3>
          {childInfo ? (
            <div className="child-info">
              <div className="info-row">
                <span className="info-label">이름</span>
                <span className="info-value">{childInfo.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">학교급</span>
                <span className="info-value">{GRADE_LABEL[childInfo.gradeLevel] ?? '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">학생 ID</span>
                <span className="info-value info-value-mono">{childInfo.studentId}</span>
              </div>
            </div>
          ) : (
            <p className="settings-desc">연결된 자녀가 없습니다. 아래에서 자녀 초대 코드를 입력해주세요.</p>
          )}
        </section>
      )}

      {/* 내 초대 코드 */}
      <section className="settings-card glass">
        <h3 className="settings-section-title">내 초대 코드</h3>
        <p className="settings-desc">
          {user?.role === 'student'
            ? '학부모에게 이 코드를 알려주세요. 학부모가 가입 시 또는 설정에서 입력하면 연결됩니다.'
            : '자녀에게 이 코드를 알려주세요. 자녀가 가입 시 또는 설정에서 입력하면 연결됩니다.'}
        </p>
        <div className="invite-code-display">
          <span className="invite-code-value">{user?.inviteCode ?? '—'}</span>
          <button className="btn-copy" onClick={handleCopy} disabled={!user?.inviteCode}>
            {copied ? '복사됨 ✓' : '복사'}
          </button>
        </div>
      </section>

      {/* 상대방 초대 코드 등록 */}
      <section className="settings-card glass">
        <h3 className="settings-section-title">
          {user?.role === 'student' ? '학부모 연결' : '자녀 연결'}
        </h3>

        {/* 학생: 학부모 연결 정보 표시 */}
        {user?.role === 'student' && parentInfo && (
          <div className="linked-partner-box">
            <div className="linked-partner-info">
              <div className="linked-partner-row">
                <span className="linked-partner-label">학부모 이름</span>
                <span className="linked-partner-value">{parentInfo.name}</span>
              </div>
              <div className="linked-partner-row">
                <span className="linked-partner-label">초대 코드</span>
                <span className="linked-partner-value invite-code-mono">{parentInfo.inviteCode}</span>
              </div>
            </div>
            {!unlinkConfirm ? (
              <button
                className="btn-unlink"
                onClick={() => setUnlinkConfirm(true)}
              >
                연결 해제
              </button>
            ) : (
              <div className="unlink-confirm">
                <p className="unlink-confirm-msg">정말 해제하시겠습니까?</p>
                <div className="unlink-confirm-actions">
                  <button
                    className="btn-cancel"
                    onClick={() => setUnlinkConfirm(false)}
                    disabled={unlinkStatus === 'loading'}
                  >
                    취소
                  </button>
                  <button
                    className="btn-unlink-confirm"
                    onClick={handleUnlink}
                    disabled={unlinkStatus === 'loading'}
                  >
                    {unlinkStatus === 'loading' ? '해제 중...' : '해제'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 학부모: 자녀 연결됨 표시 */}
        {user?.role === 'parent' && isLinked && (
          <div className="linked-status">
            <span className="linked-dot"></span>
            <span>자녀와 연결되어 있습니다.</span>
          </div>
        )}

        {/* 미연결 안내 */}
        {!(user?.role === 'student' && parentInfo) && !isLinked && (
          <p className="settings-desc">
            {user?.role === 'student'
              ? '학부모의 초대 코드를 입력하면 계정이 연결됩니다.'
              : '자녀의 초대 코드를 입력하면 계정이 연결됩니다.'}
          </p>
        )}

        <form className="link-form" onSubmit={handleLink}>
          <input
            className="link-input"
            type="text"
            placeholder="초대 코드 6자리 (예: A3F9KZ)"
            value={partnerCode}
            onChange={(e) => {
              setPartnerCode(e.target.value.toUpperCase());
              setLinkStatus('idle');
              setLinkMessage('');
            }}
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
            disabled={user?.role === 'student' && !!parentInfo}
          />
          <button
            className="btn-link"
            type="submit"
            disabled={
              linkStatus === 'loading' ||
              partnerCode.length !== 6 ||
              (user?.role === 'student' && !!parentInfo)
            }
          >
            {linkStatus === 'loading' ? '연결 중...' : '연결하기'}
          </button>
        </form>
        {linkMessage && (
          <p className={`form-message ${linkStatus}`}>{linkMessage}</p>
        )}
      </section>

      {/* 이름 변경 */}
      <section className="settings-card glass">
        <div className="section-header">
          <h3 className="settings-section-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>이름 변경</h3>
          {!nameEdit && (
            <button className="btn-edit" onClick={() => { setNameEdit(true); setNewName(user?.name ?? ''); setNameMessage(''); }}>
              편집
            </button>
          )}
        </div>

        {nameEdit ? (
          <form className="profile-form" onSubmit={handleNameSave}>
            <input
              className="profile-input"
              type="text"
              placeholder="새 이름"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <div className="form-actions">
              <button type="button" className="btn-cancel" onClick={() => { setNameEdit(false); setNameMessage(''); }}>
                취소
              </button>
              <button type="submit" className="btn-save" disabled={nameStatus === 'loading' || !newName.trim()}>
                {nameStatus === 'loading' ? '저장 중...' : '저장'}
              </button>
            </div>
            {nameMessage && <p className={`form-message ${nameStatus}`}>{nameMessage}</p>}
          </form>
        ) : (
          <p className="current-value">{user?.name}</p>
        )}
        {!nameEdit && nameMessage && (
          <p className={`form-message ${nameStatus}`}>{nameMessage}</p>
        )}
      </section>

      {/* 비밀번호 변경 */}
      <section className="settings-card glass">
        <h3 className="settings-section-title">비밀번호 변경</h3>

        {pwStatus === 'success' ? (
          /* 성공 화면 — 확인 버튼으로만 닫힘 */
          <div className="pw-success-box">
            <span className="pw-success-icon">✓</span>
            <p className="pw-success-text">{pwMessage}</p>
            <button className="btn-save" onClick={resetPasswordForm}>확인</button>
          </div>
        ) : (
          <form className="profile-form" onSubmit={handlePasswordSave}>
            <input
              className="profile-input"
              type="password"
              placeholder="현재 비밀번호"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPwMessage(''); setPwStatus('idle'); }}
              autoComplete="current-password"
            />
            <input
              className="profile-input"
              type="password"
              placeholder="새 비밀번호 (6자 이상)"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPwMessage(''); setPwStatus('idle'); }}
              autoComplete="new-password"
            />
            <input
              className="profile-input"
              type="password"
              placeholder="새 비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPwMessage(''); setPwStatus('idle'); }}
              autoComplete="new-password"
            />
            <div className="form-actions">
              <button
                type="submit"
                className="btn-save"
                disabled={pwStatus === 'loading' || !currentPassword || !newPassword || !confirmPassword}
              >
                {pwStatus === 'loading' ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
            {pwMessage && <p className={`form-message ${pwStatus}`}>{pwMessage}</p>}
          </form>
        )}
      </section>
    </div>
  );
};

export default ProfileSettings;

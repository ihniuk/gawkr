import React, { useState } from 'react';
import { Lock, User, Key, X, ShieldCheck, UserCheck, CheckCircle, Smartphone } from 'lucide-react';
import { api } from '../api/client';
import { evaluatePasswordStrength } from '../utils/security';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'reset'
  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'
  const [challengeToken, setChallengeToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [savedCreds, setSavedCreds] = useState(() => {
    try {
      const s = localStorage.getItem('gawkr_saved_creds');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });
  const [username, setUsername] = useState(() => {
    try {
      const s = localStorage.getItem('gawkr_saved_creds');
      if (s) return JSON.parse(s).username || 'admin';
    } catch {}
    return 'admin';
  });
  const [password, setPassword] = useState(() => {
    try {
      const s = localStorage.getItem('gawkr_saved_creds');
      if (s) return JSON.parse(s).password || '';
    } catch {}
    return '';
  });
  const [rememberMe, setRememberMe] = useState(true);
  
  // Password change state
  const [changeUsername, setChangeUsername] = useState('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.login(username, password);
      if (res.require_2fa) {
        setChallengeToken(res.challenge_token);
        setStep('2fa');
        setTotpCode('');
        return;
      }
      if (rememberMe) {
        localStorage.setItem('gawkr_saved_creds', JSON.stringify({ username, password }));
      }
      onLoginSuccess(res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2fa = async (e) => {
    if (e) e.preventDefault();
    if (!totpCode.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.verify2faLogin(challengeToken, totpCode.trim());
      if (rememberMe) {
        localStorage.setItem('gawkr_saved_creds', JSON.stringify({ username, password }));
      }
      onLoginSuccess(res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Two-factor authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (user, pass) => {
    setUsername(user);
    setPassword(pass);
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    api.login(user, pass)
      .then(res => {
        if (res.require_2fa) {
          setChallengeToken(res.challenge_token);
          setStep('2fa');
          setTotpCode('');
          return;
        }
        onLoginSuccess(res);
        onClose();
      })
      .catch(err => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  const handleChangePassword = async (e) => {
    if (e) e.preventDefault();
    const strength = evaluatePasswordStrength(newPassword);
    if (!strength.valid) {
      setErrorMsg(strength.message || 'Password does not meet minimum strength requirements');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.changePassword(changeUsername, currentPassword, newPassword);
      setSuccessMsg('Password updated successfully! You can now log in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setUsername(changeUsername);
      setPassword('');
      setTimeout(() => {
        setActiveTab('login');
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: 'rgba(6, 182, 212, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Lock size={18} color="var(--accent-cyan)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Security Authentication</h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Role-Based Access Control</p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {/* Tab switch */}
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '8px',
          padding: '3px',
          marginBottom: '14px'
        }}>
          <button
            type="button"
            className="btn-glass"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '0.78rem',
              padding: '6px',
              background: activeTab === 'login' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: activeTab === 'login' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => { setActiveTab('login'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Sign In
          </button>
          <button
            type="button"
            className="btn-glass"
            style={{
              flex: 1,
              justifyContent: 'center',
              fontSize: '0.78rem',
              padding: '6px',
              background: activeTab === 'reset' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: activeTab === 'reset' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => { setActiveTab('reset'); setErrorMsg(''); setSuccessMsg(''); }}
          >
            Change Password
          </button>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            marginBottom: '14px'
          }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: 'var(--accent-emerald)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <CheckCircle size={14} /> {successMsg}
          </div>
        )}

        {step === '2fa' ? (
          <form onSubmit={handleVerify2fa}>
            <div style={{
              textAlign: 'center',
              marginBottom: '16px',
              padding: '12px',
              background: 'rgba(6, 182, 212, 0.08)',
              borderRadius: '8px',
              border: '1px solid rgba(6, 182, 212, 0.2)'
            }}>
              <Smartphone size={32} color="var(--accent-cyan)" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                Two-Factor Authentication
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                Enter the 6-digit verification code from your authenticator app, or an 8-character recovery code.
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="modal_totp" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Security Code
              </label>
              <input
                id="modal_totp"
                name="totpCode"
                type="text"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456 or ABCD-1234"
                className="glass-input"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                style={{
                  textAlign: 'center',
                  fontSize: '1.25rem',
                  letterSpacing: '0.15em',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--accent-cyan)'
                }}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: '10px' }}
              disabled={isLoading || !totpCode.trim()}
            >
              {isLoading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.76rem' }}
              onClick={() => { setStep('credentials'); setErrorMsg(''); }}
            >
              Back to Credentials
            </button>
          </form>
        ) : activeTab === 'login' ? (
          <>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor="modal_username" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Username</label>
                <input
                  id="modal_username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  className="glass-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label htmlFor="modal_password" style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Password</label>
                <input
                  id="modal_password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="glass-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                marginBottom: '14px',
                fontSize: '0.76rem',
                color: 'var(--text-muted)'
              }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span>Remember password for quick login</span>
              </label>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', marginBottom: '14px' }}
                disabled={isLoading}
              >
                {isLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            {/* Quick RBAC Switchers */}
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '12px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Quick Login Roles:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ justifyContent: 'center', fontSize: '0.76rem' }}
                  onClick={() => handleQuickLogin('admin', 'admin123')}
                >
                  <ShieldCheck size={14} color="var(--accent-cyan)" /> Admin Role
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ justifyContent: 'center', fontSize: '0.76rem' }}
                  onClick={() => handleQuickLogin('viewer', 'viewer123')}
                >
                  <UserCheck size={14} color="var(--accent-emerald)" /> User / Viewer
                </button>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleChangePassword}>
            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Account Username</label>
              <input
                type="text"
                className="glass-input"
                placeholder="e.g. admin or viewer"
                value={changeUsername}
                onChange={(e) => setChangeUsername(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Current Password</label>
              <input
                type="password"
                className="glass-input"
                placeholder="Enter existing password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>New Password (min 8 chars)</label>
                {newPassword && (
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: evaluatePasswordStrength(newPassword).color }}>
                    {evaluatePasswordStrength(newPassword).label}
                  </span>
                )}
              </div>
              <input
                type="password"
                className="glass-input"
                placeholder="At least 8 chars, 1 letter, 1 number"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              {newPassword && (
                <div style={{ display: 'flex', gap: '3px', marginTop: '6px' }}>
                  {[1, 2, 3, 4].map((step) => {
                    const st = evaluatePasswordStrength(newPassword);
                    const filled = st.score >= step;
                    return (
                      <div
                        key={step}
                        style={{
                          flex: 1,
                          height: '3px',
                          borderRadius: '2px',
                          background: filled ? st.color : 'rgba(255, 255, 255, 0.1)',
                          transition: 'background 0.2s ease'
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Confirm New Password</label>
              <input
                type="password"
                className="glass-input"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              disabled={isLoading}
            >
              <Key size={14} /> {isLoading ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

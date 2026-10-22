import React, { useState } from 'react';
import { Lock, User, Key, X, ShieldCheck, UserCheck } from 'lucide-react';
import { api } from '../api/client';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.login(username, password);
      onLoginSuccess(res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (user, pass) => {
    setUsername(user);
    setPassword(pass);
    setIsLoading(true);
    setErrorMsg('');
    api.login(user, pass)
      .then(res => {
        onLoginSuccess(res);
        onClose();
      })
      .catch(err => setErrorMsg(err.message))
      .finally(() => setIsLoading(false));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Username</label>
            <input
              type="text"
              className="glass-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Password</label>
            <input
              type="password"
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

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
      </div>
    </div>
  );
}

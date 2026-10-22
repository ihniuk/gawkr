import React, { useState, useEffect } from 'react';
import { 
  Sliders, HardDrive, Cpu, Bell, Save, CheckCircle, 
  AlertTriangle, Folder, RefreshCw, Send, Sparkles, 
  Eye, EyeOff, ShieldAlert, Zap, MessageSquare, Radio, Trash2, Video,
  Users, UserPlus, Key, Shield, ShieldCheck, UserCheck, X
} from 'lucide-react';
import { api, authStorage } from '../api/client';
import { evaluatePasswordStrength } from '../utils/security';

export default function ControlPanel({ isAdmin, currentUser }) {
  const [activeTab, setActiveTab] = useState('storage'); // 'storage', 'hardware', 'ai_vision', 'notifications', 'users'
  const [settings, setSettings] = useState(null);
  const [diskStats, setDiskStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // AI Vision Testing state
  const [isTestingVision, setIsTestingVision] = useState(false);
  const [visionTestResult, setVisionTestResult] = useState(null);

  // Notification Testing state
  const [testingService, setTestingService] = useState(null);
  const [testNotificationFeedback, setTestNotificationFeedback] = useState({});

  // Storage Purge state
  const [isPurgingStorage, setIsPurgingStorage] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);

  // Show/Hide API Key
  const [showApiKey, setShowApiKey] = useState(false);

  // Hardware Capabilities state
  const [hwCaps, setHwCaps] = useState(null);

  // User Management State
  const [usersList, setUsersList] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [userActionError, setUserActionError] = useState('');
  const [userActionSuccess, setUserActionSuccess] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('viewer');
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const activeUser = currentUser || authStorage.getUser() || { username: 'admin', role: 'admin' };

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await api.getSettings();
      const s = res.settings || {};
      if (!s.hardware) {
        s.hardware = {
          hw_accel_backend: 'auto',
          video_encoder: 'auto',
          encoding_preset: 'ultrafast',
          encoding_crf: 26
        };
      }
      setSettings(s);
      setDiskStats(res.disk_stats);
      try {
        const caps = await api.getHardwareCapabilities();
        setHwCaps(caps);
      } catch (e) {
        console.warn('Hardware capabilities probe error:', e);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load system settings');
    } finally {
      setIsLoading(false);
    }
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setUserActionError('');
    try {
      const list = await api.getUsers();
      setUsersList(list);
    } catch (err) {
      setUserActionError(err.message || 'Failed to load user list');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

  const handleCreateUser = async (e) => {
    if (e) e.preventDefault();
    if (!newUsername || newUsername.trim().length < 2) {
      setUserActionError('Username must be at least 2 characters long');
      return;
    }
    const st = evaluatePasswordStrength(newPassword);
    if (!st.valid) {
      setUserActionError(st.message || 'Password must be at least 8 characters long with letters and numbers');
      return;
    }

    setIsCreatingUser(true);
    setUserActionError('');
    setUserActionSuccess('');
    try {
      await api.createUser(newUsername.trim(), newPassword, newRole);
      setUserActionSuccess(`User account '${newUsername.trim()}' created successfully!`);
      setNewUsername('');
      setNewPassword('');
      setNewRole('viewer');
      await loadUsers();
      setTimeout(() => setUserActionSuccess(''), 4000);
    } catch (err) {
      setUserActionError(err.message || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleOpenResetModal = (targetUser) => {
    setResetModalUser(targetUser);
    setResetNewPassword('');
    setUserActionError('');
    setUserActionSuccess('');
  };

  const handleSubmitReset = async (e) => {
    if (e) e.preventDefault();
    if (!resetModalUser) return;
    const st = evaluatePasswordStrength(resetNewPassword);
    if (!st.valid) {
      setUserActionError(st.message || 'Password must be at least 8 characters long with letters and numbers');
      return;
    }

    setIsSubmittingReset(true);
    setUserActionError('');
    setUserActionSuccess('');
    try {
      await api.resetPassword(resetModalUser.username, resetNewPassword);
      setUserActionSuccess(`Password for '${resetModalUser.username}' updated successfully!`);
      setResetModalUser(null);
      setResetNewPassword('');
      setTimeout(() => setUserActionSuccess(''), 4000);
    } catch (err) {
      setUserActionError(err.message || 'Failed to update password');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleToggleRole = async (targetUser) => {
    const nextRole = targetUser.role === 'admin' ? 'viewer' : 'admin';
    const confirmMsg = targetUser.role === 'admin' 
      ? `Demote '${targetUser.username}' from Administrator to Viewer?` 
      : `Promote '${targetUser.username}' to Administrator?`;
    if (!window.confirm(confirmMsg)) return;

    setUserActionError('');
    setUserActionSuccess('');
    try {
      await api.updateUserRole(targetUser.username, nextRole);
      setUserActionSuccess(`Role for '${targetUser.username}' changed to '${nextRole}'`);
      await loadUsers();
      setTimeout(() => setUserActionSuccess(''), 4000);
    } catch (err) {
      setUserActionError(err.message || 'Failed to change user role');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`Are you sure you want to delete user account '${targetUser.username}'? This cannot be undone.`)) return;

    setUserActionError('');
    setUserActionSuccess('');
    try {
      await api.deleteUser(targetUser.username);
      setUserActionSuccess(`User account '${targetUser.username}' deleted.`);
      await loadUsers();
      setTimeout(() => setUserActionSuccess(''), 4000);
    } catch (err) {
      setUserActionError(err.message || 'Failed to delete user');
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage('');
    try {
      const res = await api.updateSettings(settings);
      setSettings(res.settings);
      setDiskStats(res.disk_stats);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAiVision = async () => {
    setIsTestingVision(true);
    setVisionTestResult(null);
    try {
      const res = await api.testAiVision(settings.ai_vision);
      setVisionTestResult(res);
    } catch (err) {
      setVisionTestResult({
        description: `Test failed: ${err.message}`,
        threat_level: 'Suspicious'
      });
    } finally {
      setIsTestingVision(false);
    }
  };

  const handleTestNotification = async (service, payload) => {
    setTestingService(service);
    try {
      await api.testNotification(service, payload);
      setTestNotificationFeedback({
        ...testNotificationFeedback,
        [service]: { success: true, message: 'Test alert delivered! Service auto-enabled (remember to click Save).' }
      });
      // Automatically enable service upon successful verification
      setSettings(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [service]: { ...prev.notifications[service], enabled: true }
        }
      }));
    } catch (err) {
      setTestNotificationFeedback({
        ...testNotificationFeedback,
        [service]: { success: false, message: err.message || 'Delivery failed' }
      });
    } finally {
      setTestingService(null);
    }
  };

  const handlePurgeStorageNow = async () => {
    setIsPurgingStorage(true);
    setPurgeResult(null);
    try {
      const res = await api.purgeStorage();
      setPurgeResult(res.result);
      const updated = await api.getSettings();
      setDiskStats(updated.disk_stats);
    } catch (err) {
      alert('Purge failed: ' + (err.message || err));
    } finally {
      setIsPurgingStorage(false);
    }
  };

  if (isLoading || !settings) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
        <RefreshCw size={18} className="animate-spin" />
        <span>Loading Control Panel configuration...</span>
      </div>
    );
  }

  const diskUsedPercent = diskStats ? Math.round((diskStats.disk_used_gb / diskStats.disk_total_gb) * 100) : 50;

  return (
    <div className="page-container">
      {/* Top Title Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sliders size={22} color="var(--accent-cyan)" />
            <span>NVR Control Panel & System Engine</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Configure local file storage destinations, external AI vision intelligence, and cross-application notifications.
          </p>
        </div>

        {/* Global Save Button */}
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {saveSuccess && (
              <span style={{ color: 'var(--accent-emerald)', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={15} /> Changes Saved!
              </span>
            )}
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        )}
      </div>

      {errorMessage && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          color: '#fb7185',
          padding: '12px 16px',
          borderRadius: '10px',
          fontSize: '0.85rem',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} /> {errorMessage}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        background: 'rgba(8, 12, 22, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '3px',
        gap: '3px',
        marginBottom: '20px',
        width: '100%',
        maxWidth: '820px'
      }}>
        <button
          className="btn-glass"
          style={{
            flex: '1 1 140px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'storage' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'storage' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('storage')}
        >
          <HardDrive size={14} /> Storage & Files
        </button>

        <button
          className="btn-glass"
          style={{
            flex: '1 1 140px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'hardware' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'hardware' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('hardware')}
        >
          <Zap size={14} /> Hardware & Codecs
        </button>

        <button
          className="btn-glass"
          style={{
            flex: '1 1 140px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'ai_vision' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'ai_vision' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('ai_vision')}
        >
          <Cpu size={14} /> AI Vision
        </button>

        <button
          className="btn-glass"
          style={{
            flex: '1 1 140px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'notifications' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'notifications' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={14} /> Notifications
        </button>

        <button
          className="btn-glass"
          style={{
            flex: '1 1 140px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'users' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'users' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('users')}
        >
          <Users size={14} /> Users & Access
        </button>
      </div>

      {/* ----------------- TAB 1: STORAGE & DIRECTORIES ----------------- */}
      {activeTab === 'storage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Disk Meter Widget */}
          {diskStats && (
            <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.94rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <HardDrive size={18} color="var(--accent-cyan)" />
                  <span>Server Primary Storage Meter</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  {diskStats.disk_free_gb} GB Free / {diskStats.disk_total_gb} GB Total
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{
                height: '14px',
                background: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '8px',
                overflow: 'hidden',
                position: 'relative',
                marginBottom: '14px'
              }}>
                <div style={{
                  width: `${diskUsedPercent}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 80%, #f43f5e 100%)',
                  borderRadius: '8px',
                  transition: 'width 0.4s ease'
                }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div className="glass-card" style={{ padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Recordings Directory Size</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                    {diskStats.recordings_size_mb} MB
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Snapshots Directory Size</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#34d399', marginTop: '2px' }}>
                    {diskStats.snapshots_size_mb} MB
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Storage Retention Quota</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#fbbf24', marginTop: '2px' }}>
                    {settings.storage.max_storage_gb} GB Max
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Directory Locations & Policies */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Folder size={17} color="var(--accent-cyan)" /> File Storage Locations & Retention Rules
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Custom Video Recordings Storage Path (H.264 MP4 Clips):
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.storage.recordings_dir}
                  onChange={(e) => setSettings({
                    ...settings,
                    storage: { ...settings.storage, recordings_dir: e.target.value }
                  })}
                  placeholder="e.g. D:\Surveillance\Recordings or \\NAS\NVR\Recordings"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  Custom High-Resolution Snapshots Path:
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.storage.snapshots_dir}
                  onChange={(e) => setSettings({
                    ...settings,
                    storage: { ...settings.storage, snapshots_dir: e.target.value }
                  })}
                  placeholder="e.g. D:\Surveillance\Snapshots"
                />
              </div>
            </div>

            {/* Retention Sliders */}
            <div className="two-col-grid" style={{ marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Retention Period (Days)</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                    {settings.storage.retention_days} Days
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="90"
                  step="1"
                  value={settings.storage.retention_days}
                  onChange={(e) => setSettings({
                    ...settings,
                    storage: { ...settings.storage, retention_days: parseInt(e.target.value) }
                  })}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Clips older than this threshold will be automatically pruned.
                </span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Maximum NVR Storage Quota</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8', fontWeight: 700 }}>
                    {settings.storage.max_storage_gb} GB
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="10"
                  value={settings.storage.max_storage_gb}
                  onChange={(e) => setSettings({
                    ...settings,
                    storage: { ...settings.storage, max_storage_gb: parseInt(e.target.value) }
                  })}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Circular buffer purges the oldest clips when this storage cap is exceeded.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="auto-purge-toggle"
                checked={settings.storage.auto_purge_enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  storage: { ...settings.storage, auto_purge_enabled: e.target.checked }
                })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-cyan)' }}
              />
              <label htmlFor="auto-purge-toggle" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                Enable Automatic Circular Buffer Pruning (Prevents server disk exhaustion)
              </label>
            </div>

            <div style={{
              marginTop: '18px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>Run Storage Purge & Quota Enforcement</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  Immediately deletes recordings older than retention days and enforces max storage capacity.
                </div>
              </div>
              <button
                type="button"
                className="btn-glass"
                onClick={handlePurgeStorageNow}
                disabled={isPurgingStorage}
                style={{ fontSize: '0.76rem', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.35)' }}
              >
                <Trash2 size={13} /> {isPurgingStorage ? 'Purging Old Files...' : 'Purge Old Storage Now'}
              </button>
            </div>

            {purgeResult && (
              <div style={{
                marginTop: '10px',
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.76rem',
                color: 'var(--accent-cyan)'
              }}>
                ✓ Cleanup completed: purged {purgeResult.deleted_events} events, {purgeResult.deleted_files} files (freed {purgeResult.freed_mb} MB).
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- TAB: HARDWARE & CODECS ----------------- */}
      {activeTab === 'hardware' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Host Probing Status Card */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={18} color="#f59e0b" /> Host Hardware & Video Acceleration Engine
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Auto-detected host processor cores, GPU compute availability, and FFmpeg media codecs.
                </p>
              </div>

              <div style={{
                fontSize: '0.74rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '6px',
                background: hwCaps?.nvidia?.available ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                border: hwCaps?.nvidia?.available ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(6, 182, 212, 0.35)',
                color: hwCaps?.nvidia?.available ? '#34d399' : 'var(--accent-cyan)'
              }}>
                {hwCaps?.nvidia?.available ? `NVIDIA Accelerated (${hwCaps.nvidia.name})` : 'CPU Software Mode Active'}
              </div>
            </div>

            {/* Hardware Metrics 3-Col Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              {/* CPU Tile */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Cpu size={16} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Host Processor (CPU)</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>
                  {hwCaps?.cpu?.cores || 4} Logical Cores
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                  {hwCaps?.cpu?.model || 'Generic x86_64 Processor'}
                </div>
              </div>

              {/* NVIDIA GPU Tile */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <ShieldAlert size={16} color={hwCaps?.nvidia?.available ? '#10b981' : 'var(--text-dim)'} />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>NVIDIA GPU (CUDA / NVENC)</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: hwCaps?.nvidia?.available ? '#34d399' : 'var(--text-dim)', marginBottom: '2px' }}>
                  {hwCaps?.nvidia?.available ? hwCaps.nvidia.name : 'Not Detected'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {hwCaps?.nvidia?.available 
                    ? `${Math.round(hwCaps.nvidia.memory_mb / 1024)} GB VRAM • Driver v${hwCaps.nvidia.driver_version}`
                    : 'System will encode via CPU without GPU dependencies'}
                </div>
              </div>

              {/* FFmpeg Engine Tile */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Zap size={16} color="#f59e0b" />
                  <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>FFmpeg Media Pipeline</span>
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff', marginBottom: '2px' }}>
                  {hwCaps?.ffmpeg?.found ? 'Installed & Ready' : 'Embedded Engine'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Encoders: {hwCaps?.ffmpeg?.has_nvenc ? 'nvenc ' : ''}{hwCaps?.ffmpeg?.has_x264 ? 'libx264 ' : ''}{hwCaps?.ffmpeg?.has_qsv ? 'qsv ' : ''}
                </div>
              </div>
            </div>

            {/* System Default Codec Selector */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '18px' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '6px' }}>
                System-Wide Default Encoding Engine
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                Choose the default hardware acceleration engine applied to all video event recordings and new cameras.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                {[
                  {
                    id: 'auto',
                    title: 'Auto-Detect',
                    subtitle: 'Recommended',
                    desc: 'Uses NVIDIA / Intel hardware acceleration if present, with automatic fallback to CPU software.',
                    icon: Zap,
                    color: '#f59e0b',
                    badge: hwCaps?.nvidia?.available ? 'GPU Accelerated' : 'CPU Software Mode'
                  },
                  {
                    id: 'cpu',
                    title: 'CPU Only',
                    subtitle: 'Software libx264',
                    desc: 'Optimized multi-threaded CPU software encoding. Guaranteed compatibility without requiring a dedicated GPU.',
                    icon: Cpu,
                    color: 'var(--accent-cyan)',
                    badge: `${hwCaps?.cpu?.cores || 4} Host Cores`
                  },
                  {
                    id: 'nvdec',
                    title: 'NVIDIA GPU',
                    subtitle: 'NVENC / NVDEC',
                    desc: hwCaps?.nvidia?.available 
                      ? `Hardware offload via ${hwCaps.nvidia.name}.`
                      : 'NVIDIA hardware acceleration. (Notice: No NVIDIA GPU detected on this host).',
                    icon: ShieldAlert,
                    color: '#10b981',
                    badge: hwCaps?.nvidia?.available ? 'Ready & Available' : 'GPU Not Found'
                  },
                  {
                    id: 'qsv',
                    title: 'Intel QuickSync',
                    subtitle: 'QSV Engine',
                    desc: 'Hardware offload for Intel Core / Arc iGPUs and CPUs supporting QuickSync Video.',
                    icon: Video,
                    color: '#6366f1',
                    badge: hwCaps?.ffmpeg?.has_qsv ? 'QSV Ready' : 'Intel iGPU Mode'
                  }
                ].map(engine => {
                  const IconComp = engine.icon;
                  const currentBackend = settings.hardware?.hw_accel_backend || 'auto';
                  const isSelected = currentBackend === engine.id;
                  return (
                    <div
                      key={engine.id}
                      onClick={() => setSettings({
                        ...settings,
                        hardware: { ...(settings.hardware || {}), hw_accel_backend: engine.id }
                      })}
                      style={{
                        background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? `2px solid ${engine.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '10px',
                        padding: '14px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: isSelected ? engine.color : 'rgba(255, 255, 255, 0.06)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isSelected ? '#000' : 'var(--text-muted)'
                            }}>
                              <IconComp size={16} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                                {engine.title}
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {engine.subtitle}
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: engine.color }} />
                          )}
                        </div>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: '10px' }}>
                          {engine.desc}
                        </p>
                      </div>
                      <div style={{
                        fontSize: '0.66rem',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: isSelected ? engine.color : 'var(--text-dim)',
                        alignSelf: 'flex-start'
                      }}>
                        {engine.badge}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Performance Preset & Quality Controls */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Default System Encoding Preset
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                      {(settings.hardware?.encoding_preset || 'ultrafast').toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[
                      { id: 'ultrafast', label: 'Ultrafast', desc: 'Lowest CPU load' },
                      { id: 'veryfast', label: 'Very Fast', desc: 'Balanced' },
                      { id: 'fast', label: 'Fast', desc: 'Better compression' },
                      { id: 'medium', label: 'Medium', desc: 'Maximum compression' }
                    ].map(p => {
                      const curPreset = settings.hardware?.encoding_preset || 'ultrafast';
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="btn-glass"
                          onClick={() => setSettings({
                            ...settings,
                            hardware: { ...(settings.hardware || {}), encoding_preset: p.id }
                          })}
                          style={{
                            padding: '8px',
                            fontSize: '0.72rem',
                            flexDirection: 'column',
                            gap: '2px',
                            textAlign: 'center',
                            background: curPreset === p.id ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                            borderColor: curPreset === p.id ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.08)',
                            color: curPreset === p.id ? '#fff' : 'var(--text-muted)'
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>{p.label}</span>
                          <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>{p.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      Default Video Clip Quality (CRF)
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#f59e0b', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      CRF {settings.hardware?.encoding_crf ?? 26} {(settings.hardware?.encoding_crf ?? 26) <= 22 ? '(Crisp/High Bitrate)' : ((settings.hardware?.encoding_crf ?? 26) <= 27 ? '(Optimal Balanced)' : '(High Compression)')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="18"
                    max="32"
                    step="1"
                    value={settings.hardware?.encoding_crf ?? 26}
                    onChange={(e) => setSettings({
                      ...settings,
                      hardware: { ...(settings.hardware || {}), encoding_crf: parseInt(e.target.value) }
                    })}
                    style={{ width: '100%', accentColor: '#f59e0b' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    <span>18 (Highest Quality / Larger Files)</span>
                    <span>26 (Sweet Spot Default)</span>
                    <span>32 (Smallest Size / Lower Quality)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: AI VISION ENHANCEMENT ----------------- */}
      {activeTab === 'ai_vision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} color="#a855f7" /> External AI Vision Intelligence
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Connect an LLM Vision API (Google Gemini, OpenAI GPT-4o, or Local Ollama) to generate natural language scene descriptions and threat assessments for confirmed detections.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>Enable Vision API:</span>
                <input
                  type="checkbox"
                  checked={settings.ai_vision.enabled}
                  onChange={(e) => setSettings({
                    ...settings,
                    ai_vision: { ...settings.ai_vision, enabled: e.target.checked }
                  })}
                  style={{ width: '20px', height: '20px', accentColor: '#a855f7' }}
                />
              </div>
            </div>

            {/* Provider Selector Cards */}
            <div className="provider-grid" style={{ marginBottom: '20px' }}>
              {[
                { id: 'gemini', name: 'Google Gemini', desc: 'gemini-1.5-flash / pro', icon: Sparkles, color: '#06b6d4' },
                { id: 'openai', name: 'OpenAI GPT-4o', desc: 'gpt-4o / gpt-4o-mini', icon: Zap, color: '#10b981' },
                { id: 'ollama', name: 'Local Ollama', desc: 'llama3.2-vision / llava', icon: Cpu, color: '#a855f7' },
                { id: 'custom', name: 'Custom Vision API', desc: 'OpenAI-compatible HTTP', icon: Radio, color: '#f59e0b' }
              ].map(p => (
                <div
                  key={p.id}
                  onClick={() => setSettings({
                    ...settings,
                    ai_vision: {
                      ...settings.ai_vision,
                      provider: p.id,
                      model_name: p.id === 'gemini' ? 'gemini-1.5-flash' : p.id === 'openai' ? 'gpt-4o-mini' : p.id === 'ollama' ? 'llama3.2-vision' : settings.ai_vision.model_name
                    }
                  })}
                  style={{
                    background: settings.ai_vision.provider === p.id ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.03)',
                    border: settings.ai_vision.provider === p.id ? '1px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    padding: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <p.icon size={18} color={p.color} style={{ marginBottom: '6px' }} />
                  <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.desc}</div>
                </div>
              ))}
            </div>

            {/* API Credentials */}
            <div className="two-col-grid" style={{ marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  {settings.ai_vision.provider === 'ollama' ? 'Ollama Base URL' : 'API Key'}
                </label>
                {settings.ai_vision.provider === 'ollama' ? (
                  <input
                    type="text"
                    className="glass-input"
                    value={settings.ai_vision.base_url || 'http://localhost:11434'}
                    onChange={(e) => setSettings({
                      ...settings,
                      ai_vision: { ...settings.ai_vision, base_url: e.target.value }
                    })}
                  />
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="glass-input"
                      value={settings.ai_vision.api_key}
                      onChange={(e) => setSettings({
                        ...settings,
                        ai_vision: { ...settings.ai_vision, api_key: e.target.value }
                      })}
                      placeholder="Enter API Key (sk-... or AIza...)"
                    />
                    <button
                      type="button"
                      className="btn-glass"
                      style={{ position: 'absolute', right: '6px', top: '5px', padding: '4px 8px', border: 'none' }}
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Model Name
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.ai_vision.model_name}
                  onChange={(e) => setSettings({
                    ...settings,
                    ai_vision: { ...settings.ai_vision, model_name: e.target.value }
                  })}
                  placeholder="e.g. gemini-1.5-flash"
                />
              </div>
            </div>

            {/* Custom Endpoint URL (for custom provider) */}
            {settings.ai_vision.provider === 'custom' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Base Endpoint URL
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.ai_vision.base_url}
                  onChange={(e) => setSettings({
                    ...settings,
                    ai_vision: { ...settings.ai_vision, base_url: e.target.value }
                  })}
                  placeholder="https://api.together.xyz/v1 or https://openrouter.ai/api/v1"
                />
              </div>
            )}

            {/* Custom Prompt Instructions */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Vision Prompt & Threat Assessment Instructions
              </label>
              <textarea
                className="glass-input"
                rows={3}
                value={settings.ai_vision.prompt_template}
                onChange={(e) => setSettings({
                  ...settings,
                  ai_vision: { ...settings.ai_vision, prompt_template: e.target.value }
                })}
              />
            </div>

            {/* Test Connection Button */}
            <button
              className="btn-glass"
              onClick={handleTestAiVision}
              disabled={isTestingVision}
              style={{ borderColor: 'rgba(168, 85, 247, 0.4)', color: '#d8b4fe' }}
            >
              <Sparkles size={14} color="#a855f7" className={isTestingVision ? 'animate-spin' : ''} />
              {isTestingVision ? 'Testing Vision API Connection...' : 'Test Vision API Live Connection'}
            </button>

            {/* Live Test Feedback Box */}
            {visionTestResult && (
              <div style={{
                marginTop: '16px',
                background: 'rgba(168, 85, 247, 0.1)',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                borderRadius: '10px',
                padding: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#d8b4fe' }}>AI Vision Response Preview:</span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontFamily: 'var(--font-mono)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: visionTestResult.threat_level === 'Threat' ? '#ef4444' : visionTestResult.threat_level === 'Suspicious' ? '#f59e0b' : '#10b981',
                    color: '#fff',
                    fontWeight: 700
                  }}>
                    {visionTestResult.threat_level?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                  "{visionTestResult.description}"
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- TAB 3: APPLICATION NOTIFICATIONS ----------------- */}
      {activeTab === 'notifications' && (
        <div className="control-panel-grid">
          {/* 1. Telegram */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Send size={18} color="#38bdf8" />
                <span style={{ fontWeight: 700, fontSize: '0.94rem' }}>Telegram Bot Alerts</span>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.telegram.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    telegram: { ...settings.notifications.telegram, enabled: e.target.checked }
                  }
                })}
                style={{ width: '18px', height: '18px', accentColor: '#38bdf8' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Bot Token</label>
                <input
                  type="password"
                  className="glass-input"
                  value={settings.notifications.telegram.bot_token}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      telegram: { ...settings.notifications.telegram, bot_token: e.target.value }
                    }
                  })}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWxYZ"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Target Chat ID</label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.notifications.telegram.chat_id}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      telegram: { ...settings.notifications.telegram, chat_id: e.target.value }
                    }
                  })}
                  placeholder="e.g. -100123456789 or 987654321"
                />
              </div>
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleTestNotification('telegram', settings.notifications.telegram)}
              disabled={testingService === 'telegram'}
            >
              <Send size={13} /> {testingService === 'telegram' ? 'Sending Test...' : 'Send Test Telegram Alert'}
            </button>

            {testNotificationFeedback.telegram && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.76rem',
                color: testNotificationFeedback.telegram.success ? '#34d399' : '#fb7185'
              }}>
                {testNotificationFeedback.telegram.message}
              </div>
            )}
          </div>

          {/* 2. Discord Webhook */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#818cf8" />
                <span style={{ fontWeight: 700, fontSize: '0.94rem' }}>Discord Channel Webhook</span>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.discord.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    discord: { ...settings.notifications.discord, enabled: e.target.checked }
                  }
                })}
                style={{ width: '18px', height: '18px', accentColor: '#818cf8' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Webhook URL</label>
              <input
                type="password"
                className="glass-input"
                value={settings.notifications.discord.webhook_url}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    discord: { ...settings.notifications.discord, webhook_url: e.target.value }
                  }
                })}
                placeholder="https://discord.com/api/webhooks/..."
              />
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleTestNotification('discord', settings.notifications.discord)}
              disabled={testingService === 'discord'}
            >
              <MessageSquare size={13} /> {testingService === 'discord' ? 'Sending...' : 'Send Test Discord Embed'}
            </button>

            {testNotificationFeedback.discord && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.76rem',
                color: testNotificationFeedback.discord.success ? '#34d399' : '#fb7185'
              }}>
                {testNotificationFeedback.discord.message}
              </div>
            )}
          </div>

          {/* 3. Slack Webhook */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={18} color="#ec4899" />
                <span style={{ fontWeight: 700, fontSize: '0.94rem' }}>Slack Alerts Webhook</span>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.slack.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    slack: { ...settings.notifications.slack, enabled: e.target.checked }
                  }
                })}
                style={{ width: '18px', height: '18px', accentColor: '#ec4899' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Webhook URL</label>
              <input
                type="password"
                className="glass-input"
                value={settings.notifications.slack.webhook_url}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    slack: { ...settings.notifications.slack, webhook_url: e.target.value }
                  }
                })}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleTestNotification('slack', settings.notifications.slack)}
              disabled={testingService === 'slack'}
            >
              <MessageSquare size={13} /> {testingService === 'slack' ? 'Sending...' : 'Send Test Slack Alert'}
            </button>

            {testNotificationFeedback.slack && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.76rem',
                color: testNotificationFeedback.slack.success ? '#34d399' : '#fb7185'
              }}>
                {testNotificationFeedback.slack.message}
              </div>
            )}
          </div>

          {/* 4. Pushover */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} color="#f59e0b" />
                <span style={{ fontWeight: 700, fontSize: '0.94rem' }}>Pushover Mobile Push</span>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.pushover.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    pushover: { ...settings.notifications.pushover, enabled: e.target.checked }
                  }
                })}
                style={{ width: '18px', height: '18px', accentColor: '#f59e0b' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>User Key</label>
                <input
                  type="password"
                  className="glass-input"
                  value={settings.notifications.pushover.user_key}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      pushover: { ...settings.notifications.pushover, user_key: e.target.value }
                    }
                  })}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>API Token / App Key</label>
                <input
                  type="password"
                  className="glass-input"
                  value={settings.notifications.pushover.api_token}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      pushover: { ...settings.notifications.pushover, api_token: e.target.value }
                    }
                  })}
                />
              </div>
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleTestNotification('pushover', settings.notifications.pushover)}
              disabled={testingService === 'pushover'}
            >
              <Bell size={13} /> {testingService === 'pushover' ? 'Sending...' : 'Send Test Mobile Push'}
            </button>

            {testNotificationFeedback.pushover && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.76rem',
                color: testNotificationFeedback.pushover.success ? '#34d399' : '#fb7185'
              }}>
                {testNotificationFeedback.pushover.message}
              </div>
            )}
          </div>

          {/* 5. Home Assistant / MQTT Auto-Discovery */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={18} color="#10b981" />
                <span style={{ fontWeight: 700, fontSize: '0.94rem' }}>Home Assistant / MQTT</span>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.mqtt?.enabled || false}
                onChange={(e) => setSettings({
                  ...settings,
                  notifications: {
                    ...settings.notifications,
                    mqtt: { ...settings.notifications.mqtt, enabled: e.target.checked }
                  }
                })}
                style={{ width: '18px', height: '18px', accentColor: '#10b981' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>MQTT Broker URL / Host</label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.notifications.mqtt?.broker_url || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      mqtt: { ...settings.notifications.mqtt, broker_url: e.target.value }
                    }
                  })}
                  placeholder="e.g. 192.168.1.50:1883 or localhost:1883"
                />
              </div>

              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Topic Prefix</label>
                <input
                  type="text"
                  className="glass-input"
                  value={settings.notifications.mqtt?.topic_prefix || 'homeassistant/nvr'}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      mqtt: { ...settings.notifications.mqtt, topic_prefix: e.target.value }
                    }
                  })}
                  placeholder="homeassistant/nvr"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="ha-disc-toggle"
                  checked={settings.notifications.mqtt?.ha_discovery ?? true}
                  onChange={(e) => setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      mqtt: { ...settings.notifications.mqtt, ha_discovery: e.target.checked }
                    }
                  })}
                  style={{ accentColor: '#10b981' }}
                />
                <label htmlFor="ha-disc-toggle" style={{ fontSize: '0.74rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Publish Home Assistant Auto-Discovery entities (binary_sensor & AI sensors)
                </label>
              </div>
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => handleTestNotification('mqtt', settings.notifications.mqtt)}
              disabled={testingService === 'mqtt'}
            >
              <Radio size={13} /> {testingService === 'mqtt' ? 'Publishing Discovery...' : 'Test MQTT Connection & HA Discovery'}
            </button>

            {testNotificationFeedback.mqtt && (
              <div style={{
                marginTop: '10px',
                fontSize: '0.76rem',
                color: testNotificationFeedback.mqtt.success ? '#34d399' : '#fb7185'
              }}>
                {testNotificationFeedback.mqtt.message}
              </div>
            )}
          </div>
        </div>
      )}
      {/* ----------------- TAB 5: USERS & ACCESS MANAGEMENT ----------------- */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Action Alerts */}
          {userActionSuccess && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--accent-emerald)',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <CheckCircle size={16} /> {userActionSuccess}
            </div>
          )}

          {userActionError && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fb7185',
              padding: '12px 16px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} /> {userActionError}
            </div>
          )}

          {/* Reset Password Dialog Modal */}
          {resetModalUser && (
            <div className="modal-overlay" onClick={() => setResetModalUser(null)} style={{ zIndex: 1100 }}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(6, 182, 212, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Key size={16} color="var(--accent-cyan)" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Reset Password</h3>
                      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Target: @{resetModalUser.username}</p>
                    </div>
                  </div>
                  <button className="btn-glass" onClick={() => setResetModalUser(null)} style={{ padding: '6px' }}><X size={15} /></button>
                </div>

                <form onSubmit={handleSubmitReset}>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        New Password (min 8 chars)
                      </label>
                      {resetNewPassword && (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: evaluatePasswordStrength(resetNewPassword).color }}>
                          {evaluatePasswordStrength(resetNewPassword).label}
                        </span>
                      )}
                    </div>
                    <input
                      type="password"
                      className="glass-input"
                      placeholder="At least 8 chars, 1 letter, 1 number"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      autoFocus
                      required
                    />
                    {resetNewPassword && (
                      <div style={{ display: 'flex', gap: '3px', marginTop: '6px' }}>
                        {[1, 2, 3, 4].map((step) => {
                          const st = evaluatePasswordStrength(resetNewPassword);
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

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn-glass"
                      onClick={() => setResetModalUser(null)}
                      disabled={isSubmittingReset}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isSubmittingReset}
                    >
                      <Key size={14} /> {isSubmittingReset ? 'Saving...' : 'Set New Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? 'minmax(0, 1.8fr) minmax(0, 1.2fr)' : '1fr', gap: '20px' }}>
            {/* Users Table Card */}
            <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={18} color="var(--accent-cyan)" />
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 700 }}>System User Accounts</h3>
                  <span style={{
                    fontSize: '0.7rem',
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {usersList.length} users
                  </span>
                </div>
                <button
                  className="btn-glass"
                  onClick={loadUsers}
                  disabled={isLoadingUsers}
                  style={{ fontSize: '0.74rem', padding: '6px 10px' }}
                >
                  <RefreshCw size={12} className={isLoadingUsers ? 'spin' : ''} /> Refresh
                </button>
              </div>

              {isLoadingUsers && usersList.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Loading registered user accounts...
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 8px', fontWeight: 600 }}>User</th>
                        <th style={{ padding: '10px 8px', fontWeight: 600 }}>Role</th>
                        <th style={{ padding: '10px 8px', fontWeight: 600 }}>Registered</th>
                        <th style={{ padding: '10px 8px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.map((u) => {
                        const isSelf = activeUser.username === u.username;
                        const isOnlyAdmin = u.role === 'admin' && usersList.filter(x => x.role === 'admin').length <= 1;

                        return (
                          <tr key={u.username} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: u.role === 'admin' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                  color: u.role === 'admin' ? 'var(--accent-cyan)' : 'var(--accent-emerald)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.74rem',
                                  fontWeight: 800,
                                  textTransform: 'uppercase'
                                }}>
                                  {u.username.slice(0, 2)}
                                </div>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{u.username}</span>
                                    {isSelf && (
                                      <span style={{
                                        fontSize: '0.62rem',
                                        background: 'rgba(6, 182, 212, 0.15)',
                                        color: 'var(--accent-cyan)',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        fontWeight: 700
                                      }}>
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td style={{ padding: '12px 8px' }}>
                              {u.role === 'admin' ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(6, 182, 212, 0.12)',
                                  border: '1px solid rgba(6, 182, 212, 0.25)',
                                  color: 'var(--accent-cyan)',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 700
                                }}>
                                  <Shield size={11} /> Admin
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                  color: 'var(--accent-emerald)',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 600
                                }}>
                                  <UserCheck size={11} /> Viewer
                                </span>
                              )}
                            </td>

                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.74rem' }}>
                              {u.created_at ? new Date(u.created_at * 1000).toLocaleDateString() : 'System Default'}
                            </td>

                            <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                {/* Reset Password (Admins can reset any user; viewers can reset their own) */}
                                {(isAdmin || isSelf) && (
                                  <button
                                    className="btn-glass"
                                    onClick={() => handleOpenResetModal(u)}
                                    title={`Reset password for ${u.username}`}
                                    style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                                  >
                                    <Key size={12} color="var(--accent-cyan)" /> Reset Pass
                                  </button>
                                )}

                                {/* Role Switch (Admin only, not self, not only admin) */}
                                {isAdmin && (
                                  <button
                                    className="btn-glass"
                                    onClick={() => handleToggleRole(u)}
                                    disabled={isSelf || isOnlyAdmin}
                                    title={isSelf ? "Cannot change your own role" : (isOnlyAdmin ? "Cannot demote last admin" : `Switch role to ${u.role === 'admin' ? 'viewer' : 'admin'}`)}
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '0.72rem',
                                      gap: '4px',
                                      opacity: (isSelf || isOnlyAdmin) ? 0.4 : 1
                                    }}
                                  >
                                    <ShieldCheck size={12} /> {u.role === 'admin' ? 'Demote' : 'Promote'}
                                  </button>
                                )}

                                {/* Delete User (Admin only, not self, not only admin) */}
                                {isAdmin && (
                                  <button
                                    className="btn-glass"
                                    onClick={() => handleDeleteUser(u)}
                                    disabled={isSelf || isOnlyAdmin}
                                    title={isSelf ? "Cannot delete your own account" : (isOnlyAdmin ? "Cannot delete sole admin" : `Delete user ${u.username}`)}
                                    style={{
                                      padding: '4px 6px',
                                      color: '#fb7185',
                                      opacity: (isSelf || isOnlyAdmin) ? 0.35 : 1
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Add New User Card (Admin Only) */}
            {isAdmin && (
              <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <UserPlus size={18} color="var(--accent-cyan)" />
                  <h3 style={{ fontSize: '0.96rem', fontWeight: 700 }}>Add New User Account</h3>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Grant family members, security personnel, or monitoring clients access to Gawkr NVR with dedicated credentials.
                </p>

                <form onSubmit={handleCreateUser}>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Username
                    </label>
                    <input
                      type="text"
                      className="glass-input"
                      placeholder="e.g. guard1, patrick, guest"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        Initial Password (min 8 chars)
                      </label>
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
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Authorization Role
                    </label>
                    <select
                      className="glass-input"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      <option value="viewer" style={{ background: '#0e1626' }}>Viewer (Live Stream & Clip Review Only)</option>
                      <option value="admin" style={{ background: '#0e1626' }}>Administrator (Full System & User Control)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    disabled={isCreatingUser}
                  >
                    <UserPlus size={14} /> {isCreatingUser ? 'Creating Account...' : 'Create User Account'}
                  </button>
                </form>

                {/* Role Reference Card */}
                <div style={{
                  marginTop: '18px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  lineHeight: '1.45'
                }}>
                  <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>Role Permissions Guide:</div>
                  <div>• <b style={{ color: 'var(--accent-cyan)' }}>Admin:</b> Add/remove cameras, tripwire zones, storage purge, AI settings, Telegram alerts, and user accounts.</div>
                  <div style={{ marginTop: '3px' }}>• <b style={{ color: 'var(--accent-emerald)' }}>Viewer:</b> Monitor real-time matrix streams, search past AI clips, and reset personal password.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

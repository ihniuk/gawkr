import React, { useState, useEffect } from 'react';
import { 
  Sliders, HardDrive, Cpu, Bell, Save, CheckCircle, 
  AlertTriangle, Folder, RefreshCw, Send, Sparkles, 
  Eye, EyeOff, ShieldAlert, Zap, MessageSquare, Radio, Trash2, Video,
  Users, UserPlus, Key, Shield, ShieldCheck, UserCheck, X,
  Brain, Package, Truck, User, Plus, Edit2, Tag, Check, Info,
  Camera, Upload, Image as ImageIcon,
  Terminal, Globe, Activity, Filter, Search, FileText, Lock
} from 'lucide-react';
import { api, authStorage } from '../api/client';
import { evaluatePasswordStrength } from '../utils/security';

export default function ControlPanel({ isAdmin, currentUser, initialMemoryData, onClearInitialMemoryData }) {
  const [activeTab, setActiveTab] = useState('storage'); // 'storage', 'hardware', 'ai_vision', 'ai_memory', 'notifications', 'users'
  const [settings, setSettings] = useState(null);
  const [diskStats, setDiskStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // AI Memory state
  const [memoryFilter, setMemoryFilter] = useState('all'); // 'all', 'courier', 'person', 'vehicle', 'custom'
  const [isEditingMemory, setIsEditingMemory] = useState(false);
  const [editingMemoryItem, setEditingMemoryItem] = useState(null);
  const [memoryForm, setMemoryForm] = useState({
    id: '',
    category: 'courier',
    name: '',
    cues: '',
    action_note: '',
    threat_bias: 'Safe',
    enabled: true,
    image_url: ''
  });
  const [memoryActionFeedback, setMemoryActionFeedback] = useState('');
  const [isExtractingCues, setIsExtractingCues] = useState(false);
  const [isUploadingMemoryImage, setIsUploadingMemoryImage] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [recentSnapshots, setRecentSnapshots] = useState([]);
  const [isLoadingRecentSnapshots, setIsLoadingRecentSnapshots] = useState(false);

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

  // Global AI Threshold State
  const [isApplyingGlobal, setIsApplyingGlobal] = useState(false);
  const [applyGlobalFeedback, setApplyGlobalFeedback] = useState('');

  // System Logs State
  const [systemLogs, setSystemLogs] = useState([]);
  const [logSeverityFilter, setLogSeverityFilter] = useState('ALL'); // 'ALL', 'CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG'
  const [logComponentFilter, setLogComponentFilter] = useState('ALL');
  const [logSearchTerm, setLogSearchTerm] = useState('');
  const [logLimit, setLogLimit] = useState(250);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logAutoRefresh, setLogAutoRefresh] = useState(true);
  const [logActionFeedback, setLogActionFeedback] = useState('');

  // Security Login Audit State
  const [loginAuditData, setLoginAuditData] = useState({ stats: null, audit_logs: [] });
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [auditFilter, setAuditFilter] = useState('all'); // 'all', 'success', 'failed'
  const [auditActionFeedback, setAuditActionFeedback] = useState('');

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
      if (!s.detection) {
        s.detection = {
          global_confidence_threshold: 0.50,
          person_min_confidence: 0.45,
          vehicle_min_confidence: 0.60,
          animal_min_confidence: 0.45
        };
      }
      if (!s.ai_memory) {
        s.ai_memory = {
          enabled: true,
          items: [
            {
              id: 'mem_amazon',
              category: 'courier',
              name: 'Amazon Delivery',
              cues: 'Blue Prime van, Mercedes/Ford van, courier wearing blue/dark vest carrying boxes or packages with Amazon smile logo',
              action_note: 'Package delivery / courier drop-off',
              threat_bias: 'Safe',
              enabled: true
            },
            {
              id: 'mem_royalmail',
              category: 'courier',
              name: 'Royal Mail',
              cues: 'Red Royal Mail van, or postal worker wearing bright red hi-vis vest/jacket with Royal Mail crest delivering post or packages',
              action_note: 'Postal delivery / mail drop',
              threat_bias: 'Safe',
              enabled: true
            },
            {
              id: 'mem_dpd',
              category: 'courier',
              name: 'DPD / Evri',
              cues: 'White van with red cube DPD logo, or courier delivering parcels',
              action_note: 'Courier package delivery',
              threat_bias: 'Safe',
              enabled: true
            }
          ]
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

  const loadSystemLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getSystemLogs({
        level: logSeverityFilter,
        component: logComponentFilter,
        search: logSearchTerm,
        limit: logLimit
      });
      setSystemLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load system logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear system logs from memory and database?')) return;
    try {
      await api.clearSystemLogs();
      setSystemLogs([]);
      setLogActionFeedback('✓ System logs cleared.');
      setTimeout(() => setLogActionFeedback(''), 3000);
    } catch (err) {
      alert('Failed to clear logs: ' + (err.message || err));
    }
  };

  const loadLoginAudit = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await api.getLoginAudit(150);
      setLoginAuditData(res || { stats: null, audit_logs: [] });
    } catch (err) {
      console.error('Failed to load login audit:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleClearLoginAudit = async () => {
    if (!window.confirm('Clear all security login audit history?')) return;
    try {
      await api.clearLoginAudit();
      setLoginAuditData({
        stats: { total_recorded: 0, failed_attempts_24h: 0, successful_logins_24h: 0 },
        audit_logs: []
      });
      setAuditActionFeedback('✓ Login audit history cleared.');
      setTimeout(() => setAuditActionFeedback(''), 3000);
    } catch (err) {
      alert('Failed to clear audit logs: ' + (err.message || err));
    }
  };

  const formatUserAgent = (ua) => {
    if (!ua) return 'Unknown Client';
    if (ua.includes('Gawkr')) return 'Gawkr Android App';
    if (ua.includes('Android')) return 'Android Browser';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS Safari';
    if (ua.includes('Macintosh')) return 'macOS / Safari/Chrome';
    if (ua.includes('Windows')) return 'Windows Desktop';
    if (ua.includes('Linux')) return 'Linux Desktop';
    return ua.length > 25 ? `${ua.slice(0, 25)}...` : ua;
  };

  const formatStorageSize = (mb) => {
    if (mb === undefined || mb === null) return '0 MB';
    if (mb >= 1024) {
      const gb = mb / 1024;
      return `${gb.toFixed(2)} GB (${Math.round(mb).toLocaleString()} MB)`;
    }
    return `${Number(mb).toLocaleString()} MB`;
  };

  const isPrivateIp = (ip) => {
    if (!ip) return false;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.2') ||
      ip.startsWith('172.3') ||
      ip.startsWith('fe80:') ||
      ip.toLowerCase() === 'localhost'
    );
  };

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
      loadLoginAudit();
    } else if (activeTab === 'logs') {
      loadSystemLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadSystemLogs();
    }
  }, [logSeverityFilter, logComponentFilter, logLimit]);

  useEffect(() => {
    if (activeTab !== 'logs' || !logAutoRefresh) return;
    const interval = setInterval(() => {
      loadSystemLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [activeTab, logAutoRefresh, logSeverityFilter, logComponentFilter, logLimit, logSearchTerm]);

  const handleApplyGlobalThreshold = async () => {
    if (!settings) return;
    setIsApplyingGlobal(true);
    setApplyGlobalFeedback('');
    try {
      // First save current system settings so any slider adjustment persists
      await api.updateSettings(settings);
      const res = await api.applyGlobalThreshold();
      setApplyGlobalFeedback(`✓ Applied ${Math.round(res.threshold * 100)}% threshold to all ${res.updated_cameras} registered cameras!`);
      setTimeout(() => setApplyGlobalFeedback(''), 4500);
    } catch (err) {
      setApplyGlobalFeedback(`✕ Failed: ${err.message}`);
    } finally {
      setIsApplyingGlobal(false);
    }
  };

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

  // AI Memory Handlers
  const handleQuickAddPreset = (type) => {
    let preset = null;
    if (type === 'amazon') {
      preset = {
        category: 'courier',
        name: 'Amazon Delivery',
        cues: 'Blue Prime van, Mercedes/Ford delivery van, driver wearing dark blue or black vest carrying cardboard parcels or boxes with smile logo',
        action_note: 'Package delivery / courier drop-off to porch',
        threat_bias: 'Safe'
      };
    } else if (type === 'royalmail') {
      preset = {
        category: 'courier',
        name: 'Royal Mail',
        cues: 'Red Royal Mail van, or postal worker wearing bright red hi-vis vest/jacket with Royal Mail crest delivering post or packages',
        action_note: 'Postal delivery / letter drop',
        threat_bias: 'Safe'
      };
    } else if (type === 'dpd') {
      preset = {
        category: 'courier',
        name: 'DPD / Evri Delivery',
        cues: 'White van with red cube DPD logo, or courier delivering parcels in courier attire',
        action_note: 'Courier parcel drop',
        threat_bias: 'Safe'
      };
    } else if (type === 'resident') {
      preset = {
        category: 'person',
        name: 'Resident',
        cues: 'Household resident, walking up driveway or to front door, carrying keys or bags',
        action_note: 'Resident arriving home',
        threat_bias: 'Safe'
      };
    } else if (type === 'vehicle') {
      preset = {
        category: 'vehicle',
        name: 'Household Vehicle',
        cues: 'Recognized family car maneuvering into driveway or parking bay',
        action_note: 'Resident vehicle movement',
        threat_bias: 'Safe'
      };
    } else if (type === 'visitor') {
      preset = {
        category: 'person',
        name: 'Regular Contractor (e.g. Window Cleaner / Gardener)',
        cues: 'Service contractor carrying ladder, hose, or gardening tools, working around perimeter',
        action_note: 'Scheduled property maintenance / contractor visit',
        threat_bias: 'Safe'
      };
    }

    if (preset) {
      setMemoryForm({
        id: '',
        ...preset,
        enabled: true,
        image_url: ''
      });
      setEditingMemoryItem(null);
      setIsEditingMemory(true);
    }
  };

  useEffect(() => {
    if (initialMemoryData) {
      setActiveTab('ai_memory');
      const targetUrl = initialMemoryData.image_url || '';
      setMemoryForm({
        id: '',
        category: initialMemoryData.category || 'custom',
        name: initialMemoryData.name || '',
        cues: initialMemoryData.cues || '',
        action_note: initialMemoryData.action_note || '',
        threat_bias: initialMemoryData.threat_bias || 'Safe',
        enabled: true,
        image_url: targetUrl
      });
      setEditingMemoryItem(null);
      setIsEditingMemory(true);
      if (targetUrl && !initialMemoryData.cues) {
        handleExtractCues(targetUrl);
      }
      if (onClearInitialMemoryData) {
        onClearInitialMemoryData();
      }
    }
  }, [initialMemoryData]);

  const handleExtractCues = async (snapshotPath) => {
    const targetPath = snapshotPath || memoryForm.image_url;
    if (!targetPath) return;

    setIsExtractingCues(true);
    try {
      const profile = await api.extractAIMemoryCues({ snapshot_path: targetPath });
      setMemoryForm(prev => ({
        ...prev,
        name: prev.name && prev.name !== 'Recognized Subject' ? prev.name : (profile.name || prev.name || 'Recognized Subject'),
        category: profile.category || prev.category || 'custom',
        cues: profile.cues || prev.cues,
        action_note: profile.action_note || prev.action_note,
        threat_bias: profile.threat_bias || prev.threat_bias || 'Safe'
      }));
      setMemoryActionFeedback('✨ AI Vision analyzed snapshot and extracted visual identifying cues!');
      setTimeout(() => setMemoryActionFeedback(''), 4000);
    } catch (err) {
      console.error('Failed to extract cues from snapshot:', err);
      alert('Could not extract cues: ' + (err.message || err));
    } finally {
      setIsExtractingCues(false);
    }
  };

  const handleImageFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingMemoryImage(true);
    try {
      const res = await api.uploadAIMemoryImage(file);
      setMemoryForm(prev => ({
        ...prev,
        image_url: res.snapshot_url
      }));
      await handleExtractCues(res.snapshot_url);
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to upload image: ' + (err.message || err));
    } finally {
      setIsUploadingMemoryImage(false);
      e.target.value = '';
    }
  };

  const handleOpenSnapshotPicker = async () => {
    setIsLoadingRecentSnapshots(true);
    setIsPickerOpen(true);
    try {
      const res = await api.getRecentMemorySnapshots(30);
      setRecentSnapshots(res.snapshots || []);
    } catch (err) {
      console.error('Failed to load recent snapshots:', err);
    } finally {
      setIsLoadingRecentSnapshots(false);
    }
  };

  const handleSelectRecentSnapshot = async (snapshot) => {
    setIsPickerOpen(false);
    setMemoryForm(prev => ({
      ...prev,
      image_url: snapshot.snapshot_url,
      name: prev.name || (snapshot.ai_description && !snapshot.ai_description.startsWith('AI') ? snapshot.ai_description.slice(0, 32) : '')
    }));
    await handleExtractCues(snapshot.snapshot_url);
  };

  const handleOpenAddCustomMemory = () => {
    setMemoryForm({
      id: '',
      category: 'courier',
      name: '',
      cues: '',
      action_note: '',
      threat_bias: 'Safe',
      enabled: true,
      image_url: ''
    });
    setEditingMemoryItem(null);
    setIsEditingMemory(true);
  };

  const handleOpenEditMemory = (item) => {
    setMemoryForm({
      id: item.id || '',
      category: item.category || 'courier',
      name: item.name || '',
      cues: item.cues || '',
      action_note: item.action_note || '',
      threat_bias: item.threat_bias || 'Safe',
      enabled: item.enabled ?? true,
      image_url: item.image_url || ''
    });
    setEditingMemoryItem(item);
    setIsEditingMemory(true);
  };

  const handleSaveMemoryItem = async (e) => {
    if (e) e.preventDefault();
    if (!memoryForm.name.trim() || !memoryForm.cues.trim()) {
      alert('Please provide an entity name and visual identifying cues.');
      return;
    }

    const currentItems = settings.ai_memory?.items || [];
    let updatedItems;

    if (editingMemoryItem) {
      updatedItems = currentItems.map(item => 
        item.id === editingMemoryItem.id ? { ...memoryForm, id: item.id } : item
      );
    } else {
      const newItem = {
        ...memoryForm,
        id: `mem_${Date.now().toString(36)}`
      };
      updatedItems = [newItem, ...currentItems];
    }

    const updatedSettings = {
      ...settings,
      ai_memory: {
        ...(settings.ai_memory || { enabled: true }),
        items: updatedItems
      }
    };

    setSettings(updatedSettings);
    setIsEditingMemory(false);
    setEditingMemoryItem(null);

    try {
      await api.updateSettings(updatedSettings);
      setMemoryActionFeedback(`✓ "${memoryForm.name}" saved to AI Memory!`);
      setTimeout(() => setMemoryActionFeedback(''), 3500);
    } catch (err) {
      console.error('Failed to auto-save AI memory:', err);
    }
  };

  const handleToggleMemoryItem = async (itemId) => {
    const currentItems = settings.ai_memory?.items || [];
    const updatedItems = currentItems.map(item => 
      item.id === itemId ? { ...item, enabled: !item.enabled } : item
    );

    const updatedSettings = {
      ...settings,
      ai_memory: {
        ...(settings.ai_memory || { enabled: true }),
        items: updatedItems
      }
    };

    setSettings(updatedSettings);
    try {
      await api.updateSettings(updatedSettings);
    } catch (err) {
      console.error('Failed to toggle AI memory item:', err);
    }
  };

  const handleDeleteMemoryItem = async (itemId, name) => {
    if (!window.confirm(`Are you sure you want to remove "${name}" from AI Memory?`)) return;

    const currentItems = settings.ai_memory?.items || [];
    const updatedItems = currentItems.filter(item => item.id !== itemId);

    const updatedSettings = {
      ...settings,
      ai_memory: {
        ...(settings.ai_memory || { enabled: true }),
        items: updatedItems
      }
    };

    setSettings(updatedSettings);
    try {
      await api.updateSettings(updatedSettings);
      setMemoryActionFeedback(`Removed "${name}" from AI Memory.`);
      setTimeout(() => setMemoryActionFeedback(''), 3500);
    } catch (err) {
      console.error('Failed to delete AI memory item:', err);
    }
  };

  const handleResetMemoryDefaults = async () => {
    if (!window.confirm('Reset AI Memory to default templates (Amazon, Royal Mail, DPD)? Existing custom entries will be replaced.')) return;

    try {
      const res = await api.resetAIMemoryDefaults();
      const updatedSettings = {
        ...settings,
        ai_memory: res.ai_memory
      };
      setSettings(updatedSettings);
      setMemoryActionFeedback('✓ AI Memory reset to default templates.');
      setTimeout(() => setMemoryActionFeedback(''), 3500);
    } catch (err) {
      alert('Failed to reset AI memory: ' + (err.message || err));
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
        maxWidth: '960px'
      }}>
        <button
          className="btn-glass"
          style={{
            flex: '1 1 120px',
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
            flex: '1 1 120px',
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
            flex: '1 1 120px',
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
            flex: '1 1 120px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'ai_memory' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'ai_memory' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('ai_memory')}
        >
          <Brain size={14} /> AI Memory
        </button>

        <button
          className="btn-glass"
          style={{
            flex: '1 1 120px',
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
            flex: '1 1 120px',
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

        <button
          className="btn-glass"
          style={{
            flex: '1 1 120px',
            border: 'none',
            borderRadius: '8px',
            background: activeTab === 'logs' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
            color: activeTab === 'logs' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: '0.8rem',
            justifyContent: 'center',
            padding: '8px 10px'
          }}
          onClick={() => setActiveTab('logs')}
        >
          <Terminal size={14} /> System Logs
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
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Recordings Directory Size {diskStats.recordings_count !== undefined && `(${diskStats.recordings_count.toLocaleString()} clips)`}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                    {formatStorageSize(diskStats.recordings_size_mb)}
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '12px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Snapshots Directory Size {diskStats.snapshots_count !== undefined && `(${diskStats.snapshots_count.toLocaleString()} frames)`}
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#34d399', marginTop: '2px' }}>
                    {formatStorageSize(diskStats.snapshots_size_mb)}
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
                  placeholder="e.g. /app/data/recordings or D:\Surveillance\Recordings"
                />
                {diskStats && diskStats.recordings_dir && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Active Server Location: <code style={{ color: 'var(--accent-cyan)' }}>{diskStats.recordings_dir}</code>
                  </div>
                )}
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
                  placeholder="e.g. /app/data/snapshots or D:\Surveillance\Snapshots"
                />
                {diskStats && diskStats.snapshots_dir && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Active Server Location: <code style={{ color: '#34d399' }}>{diskStats.snapshots_dir}</code>
                  </div>
                )}
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
          {/* Master Global AI Detection & Alert Threshold Card */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Cpu size={18} color="var(--accent-cyan)" /> Master AI Detection & Alert Sensitivity
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Global confidence baseline across all surveillance feeds. Cameras set to "Use Global" follow this threshold automatically.
                </p>
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    className="btn-glass"
                    onClick={handleApplyGlobalThreshold}
                    disabled={isApplyingGlobal}
                    style={{ fontSize: '0.78rem', color: 'var(--accent-cyan)', borderColor: 'rgba(6, 182, 212, 0.4)' }}
                  >
                    <Sliders size={13} className={isApplyingGlobal ? 'spin' : ''} />
                    <span>{isApplyingGlobal ? 'Applying to Cameras...' : 'Apply Global Threshold to All Cameras'}</span>
                  </button>
                </div>
              )}
            </div>

            {applyGlobalFeedback && (
              <div style={{
                background: applyGlobalFeedback.startsWith('✓') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                border: `1px solid ${applyGlobalFeedback.startsWith('✓') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                color: applyGlobalFeedback.startsWith('✓') ? 'var(--accent-emerald)' : '#fb7185',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                {applyGlobalFeedback}
              </div>
            )}

            {/* Global Slider */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  System-Wide Confidence Threshold
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '6px',
                  background: (settings.detection?.global_confidence_threshold ?? 0.50) <= 0.40 ? 'rgba(6, 182, 212, 0.15)' : ((settings.detection?.global_confidence_threshold ?? 0.50) >= 0.70 ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.15)'),
                  color: (settings.detection?.global_confidence_threshold ?? 0.50) <= 0.40 ? 'var(--accent-cyan)' : ((settings.detection?.global_confidence_threshold ?? 0.50) >= 0.70 ? '#c084fc' : 'var(--accent-emerald)')
                }}>
                  {Math.round((settings.detection?.global_confidence_threshold ?? 0.50) * 100)}% {(settings.detection?.global_confidence_threshold ?? 0.50) <= 0.40 ? '(High Sensitivity)' : ((settings.detection?.global_confidence_threshold ?? 0.50) >= 0.70 ? '(Strict Filter)' : '(Balanced)')}
                </span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.95"
                step="0.05"
                value={settings.detection?.global_confidence_threshold ?? 0.50}
                onChange={(e) => setSettings({
                  ...settings,
                  detection: {
                    ...(settings.detection || {}),
                    global_confidence_threshold: parseFloat(e.target.value)
                  }
                })}
                style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>20% (Ultra sensitive, catches faint/distant movement)</span>
                <span>50% (Recommended default)</span>
                <span>95% (Maximum precision, strict)</span>
              </div>
            </div>

            {/* Granular Object Class Baselines */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Person Baseline Sensitivity</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--accent-emerald)', fontWeight: 700 }}>
                    {Math.round((settings.detection?.person_min_confidence ?? 0.45) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.30"
                  max="0.75"
                  step="0.05"
                  value={settings.detection?.person_min_confidence ?? 0.45}
                  onChange={(e) => setSettings({
                    ...settings,
                    detection: {
                      ...(settings.detection || {}),
                      person_min_confidence: parseFloat(e.target.value)
                    }
                  })}
                  style={{ width: '100%', accentColor: 'var(--accent-emerald)' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Ensures low-contrast night walkers and approaching individuals are caught reliably.
                </span>
              </div>

              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Vehicle Clutter Filter Threshold</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#38bdf8', fontWeight: 700 }}>
                    {Math.round((settings.detection?.vehicle_min_confidence ?? 0.60) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.45"
                  max="0.85"
                  step="0.05"
                  value={settings.detection?.vehicle_min_confidence ?? 0.60}
                  onChange={(e) => setSettings({
                    ...settings,
                    detection: {
                      ...(settings.detection || {}),
                      vehicle_min_confidence: parseFloat(e.target.value)
                    }
                  })}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                  Filters out wheelie bins, lampposts, and yard clutter from falsely triggering vehicle alerts.
                </span>
              </div>
            </div>
          </div>

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

      {/* ----------------- TAB: AI MEMORY & KNOWN ENTITIES ----------------- */}
      {activeTab === 'ai_memory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Master Switch & Overview Card */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(168, 85, 247, 0.15)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc'
                }}>
                  <Brain size={24} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    AI Recognition Memory & Known Entities
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Teach Gawkr to identify familiar visitors, delivery couriers, residents, and vehicles so notifications name them directly.
                  </p>
                </div>
              </div>

              {/* Master Toggle & Add Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <input
                    type="checkbox"
                    checked={settings.ai_memory?.enabled ?? true}
                    onChange={(e) => {
                      const updated = {
                        ...settings,
                        ai_memory: {
                          ...(settings.ai_memory || {}),
                          enabled: e.target.checked,
                          items: settings.ai_memory?.items || []
                        }
                      };
                      setSettings(updated);
                    }}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {settings.ai_memory?.enabled ?? true ? 'AI Memory Active' : 'AI Memory Paused'}
                  </span>
                </label>

                {isAdmin && (
                  <button 
                    className="btn-primary" 
                    onClick={handleOpenAddCustomMemory}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
                  >
                    <Plus size={15} /> Add Entity
                  </button>
                )}
              </div>
            </div>

            {/* Status & Feedback message */}
            {memoryActionFeedback && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Check size={16} /> {memoryActionFeedback}
              </div>
            )}

            {/* Quick Presets Bar */}
            {isAdmin && (
              <div style={{
                marginTop: '12px',
                paddingTop: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>
                  Quick Presets:
                </span>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => handleQuickAddPreset('amazon')}
                >
                  <Truck size={12} color="#f59e0b" style={{ marginRight: '4px' }} /> + Amazon
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => handleQuickAddPreset('royal_mail')}
                >
                  <Truck size={12} color="#ef4444" style={{ marginRight: '4px' }} /> + Royal Mail
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => handleQuickAddPreset('dpd')}
                >
                  <Truck size={12} color="#06b6d4" style={{ marginRight: '4px' }} /> + DPD / Evri
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => handleQuickAddPreset('resident')}
                >
                  <User size={12} color="#10b981" style={{ marginRight: '4px' }} /> + Family Resident
                </button>
                <button
                  type="button"
                  className="btn-glass"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', borderRadius: '6px' }}
                  onClick={() => handleQuickAddPreset('vehicle')}
                >
                  <Package size={12} color="#a855f7" style={{ marginRight: '4px' }} /> + Household Vehicle
                </button>
                
                <div style={{ marginLeft: 'auto' }}>
                  <button
                    type="button"
                    className="btn-glass"
                    style={{ fontSize: '0.72rem', padding: '4px 10px', color: 'var(--text-muted)' }}
                    onClick={handleResetMemoryDefaults}
                    title="Reset to default templates"
                  >
                    <RefreshCw size={11} style={{ marginRight: '4px' }} /> Reset Defaults
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Category Filter Tabs */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px'
          }}>
            {[
              { id: 'all', label: 'All Entities' },
              { id: 'courier', label: 'Couriers & Delivery' },
              { id: 'person', label: 'Residents & Family' },
              { id: 'vehicle', label: 'Household Vehicles' },
              { id: 'custom', label: 'Custom' }
            ].map(tab => {
              const count = tab.id === 'all'
                ? (settings.ai_memory?.items || []).length
                : (settings.ai_memory?.items || []).filter(i => i.category === tab.id).length;
              const isActive = memoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  className="btn-glass"
                  onClick={() => setMemoryFilter(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.78rem',
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.03)',
                    borderColor: isActive ? 'rgba(168, 85, 247, 0.45)' : 'rgba(255,255,255,0.08)',
                    color: isActive ? '#d8b4fe' : 'var(--text-muted)'
                  }}
                >
                  {tab.label} <span style={{ opacity: 0.7, fontSize: '0.72rem', marginLeft: '4px' }}>({count})</span>
                </button>
              );
            })}
          </div>

          {/* Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
          }}>
            {(settings.ai_memory?.items || [])
              .filter(item => memoryFilter === 'all' || item.category === memoryFilter)
              .map(item => {
                const isItemEnabled = item.enabled ?? true;
                const categoryColor = item.category === 'courier' ? '#f59e0b'
                  : item.category === 'person' ? '#10b981'
                  : item.category === 'vehicle' ? '#a855f7' : '#06b6d4';
                const threatColor = item.threat_bias === 'Suspicious' ? '#f59e0b'
                  : item.threat_bias === 'High' ? '#ef4444' : '#10b981';

                return (
                  <div
                    key={item.id}
                    className="glass-panel"
                    style={{
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: isItemEnabled ? 1 : 0.6,
                      border: isItemEnabled ? '1px solid rgba(255, 255, 255, 0.12)' : '1px dashed rgba(255, 255, 255, 0.08)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div>
                      {/* Top Row: Category Pill, Threat Bias Pill & Toggle */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '5px',
                            background: `${categoryColor}20`,
                            color: categoryColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            {item.category === 'courier' && <Truck size={11} />}
                            {item.category === 'person' && <User size={11} />}
                            {item.category === 'vehicle' && <Package size={11} />}
                            {item.category === 'custom' && <Tag size={11} />}
                            {item.category}
                          </span>

                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: `${threatColor}20`,
                            color: threatColor
                          }}>
                            {item.threat_bias}
                          </span>
                        </div>

                        {isAdmin && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.72rem', color: isItemEnabled ? 'var(--text-main)' : 'var(--text-muted)' }}>
                            <input
                              type="checkbox"
                              checked={isItemEnabled}
                              onChange={() => handleToggleMemoryItem(item.id)}
                              style={{ accentColor: 'var(--accent-cyan)' }}
                            />
                            <span>{isItemEnabled ? 'Active' : 'Muted'}</span>
                          </label>
                        )}
                      </div>

                      {/* Optional Reference Snapshot */}
                      {item.image_url && (
                        <div style={{
                          width: '100%',
                          height: '110px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          marginBottom: '10px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          background: '#000'
                        }}>
                          <img
                            src={item.image_url}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}

                      {/* Entity Name */}
                      <h4 style={{ fontSize: '0.98rem', fontWeight: 800, marginBottom: '8px', color: '#fff' }}>
                        {item.name}
                      </h4>

                      {/* Visual Cues */}
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        marginBottom: '8px',
                        fontSize: '0.78rem',
                        lineHeight: '1.35',
                        color: 'var(--text-muted)'
                      }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-cyan)', display: 'block', marginBottom: '2px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Visual Identifiers / Cues
                        </span>
                        {item.cues}
                      </div>

                      {/* Action Note */}
                      {item.action_note && (
                        <div style={{
                          background: 'rgba(168, 85, 247, 0.08)',
                          border: '1px solid rgba(168, 85, 247, 0.15)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          fontSize: '0.75rem',
                          color: '#d8b4fe',
                          lineHeight: '1.3'
                        }}>
                          <span style={{ fontWeight: 700, display: 'block', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.8 }}>
                            Naming Directive
                          </span>
                          "{item.action_note}"
                        </div>
                      )}
                    </div>

                    {/* Bottom Actions */}
                    {isAdmin && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        gap: '6px',
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)'
                      }}>
                        <button
                          type="button"
                          className="btn-glass"
                          onClick={() => handleOpenEditMemory(item)}
                          style={{ padding: '4px 8px', fontSize: '0.74rem' }}
                          title="Edit Entity"
                        >
                          <Edit2 size={12} style={{ marginRight: '4px' }} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn-glass"
                          onClick={() => handleDeleteMemoryItem(item.id, item.name)}
                          style={{ padding: '4px 8px', fontSize: '0.74rem', color: '#fb7185' }}
                          title="Delete Entity"
                        >
                          <Trash2 size={12} style={{ marginRight: '4px' }} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Empty state */}
          {(!settings.ai_memory?.items || settings.ai_memory.items.filter(i => memoryFilter === 'all' || i.category === memoryFilter).length === 0) && (
            <div className="glass-panel" style={{
              borderRadius: '12px',
              padding: '36px',
              textAlign: 'center',
              color: 'var(--text-muted)'
            }}>
              <Brain size={36} style={{ margin: '0 auto 12px auto', opacity: 0.4, color: '#a855f7' }} />
              <h4 style={{ fontSize: '0.96rem', fontWeight: 700, marginBottom: '6px' }}>No memory entities in this category</h4>
              <p style={{ fontSize: '0.8rem', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                Teach Gawkr who to look out for by clicking "+ Add Entity" or selecting one of the quick presets above.
              </p>
              {isAdmin && (
                <button className="btn-primary" onClick={handleOpenAddCustomMemory} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>
                  <Plus size={14} style={{ marginRight: '4px' }} /> Add Entity
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ----------------- AI MEMORY EDIT / CREATE MODAL ----------------- */}
      {isEditingMemory && (
        <div className="modal-overlay" onClick={() => setIsEditingMemory(false)} style={{ zIndex: 1100 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px', width: '92%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Brain size={20} color="#a855f7" />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {editingMemoryItem ? 'Edit Recognized Entity' : 'Add Recognized Entity'}
                  </h3>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Instruct AI vision how to recognize and label this subject
                  </p>
                </div>
              </div>
              <button className="btn-glass" onClick={() => setIsEditingMemory(false)} style={{ padding: '6px' }}>
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveMemoryItem} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Snapshot Reference & Auto-Learn */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Camera size={14} color="var(--accent-cyan)" />
                    <span>Reference Snapshot & AI Auto-Learn</span>
                  </label>
                  {memoryForm.image_url && (
                    <button
                      type="button"
                      className="btn-glass"
                      style={{ fontSize: '0.7rem', padding: '2px 8px', color: '#fb7185' }}
                      onClick={() => setMemoryForm(prev => ({ ...prev, image_url: '' }))}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {memoryForm.image_url ? (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{
                      width: '100px',
                      height: '68px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: '#000',
                      flexShrink: 0
                    }}>
                      <img
                        src={memoryForm.image_url}
                        alt="Reference Snapshot"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {memoryForm.image_url.split('/').pop()}
                      </span>
                      <button
                        type="button"
                        className="btn-glass"
                        onClick={() => handleExtractCues(memoryForm.image_url)}
                        disabled={isExtractingCues}
                        style={{
                          fontSize: '0.76rem',
                          padding: '6px 10px',
                          background: 'rgba(168, 85, 247, 0.2)',
                          borderColor: 'rgba(168, 85, 247, 0.4)',
                          color: '#d8b4fe',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Sparkles size={13} className={isExtractingCues ? 'animate-spin' : ''} />
                        {isExtractingCues ? 'Analyzing Snapshot with AI...' : 'Auto-Extract Cues with AI'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      Pick a camera snapshot or upload an image. The AI will inspect it and automatically extract visual identifying cues for you.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn-glass"
                        onClick={handleOpenSnapshotPicker}
                        style={{ fontSize: '0.76rem', padding: '6px 12px', flex: '1 1 140px' }}
                      >
                        <Camera size={13} style={{ marginRight: '6px' }} /> Pick from Camera Events
                      </button>

                      <label className="btn-glass" style={{ fontSize: '0.76rem', padding: '6px 12px', flex: '1 1 120px', cursor: 'pointer', textAlign: 'center' }}>
                        <Upload size={13} style={{ marginRight: '6px' }} />
                        {isUploadingMemoryImage ? 'Uploading...' : 'Upload Image'}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleImageFileUpload}
                          disabled={isUploadingMemoryImage}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* Category */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Category
                </label>
                <select
                  value={memoryForm.category}
                  onChange={(e) => setMemoryForm({ ...memoryForm, category: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                >
                  <option value="courier">Courier / Delivery Service</option>
                  <option value="person">Resident / Frequent Visitor</option>
                  <option value="vehicle">Household / Regular Vehicle</option>
                  <option value="custom">Custom Entity</option>
                </select>
              </div>

              {/* Entity Name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Entity Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Amazon Delivery, Royal Mail, Resident: Sarah"
                  value={memoryForm.name}
                  onChange={(e) => setMemoryForm({ ...memoryForm, name: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
              </div>

              {/* Visual Identifiers / Cues */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Visual Cues & Identifiers *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g., Navy blue uniform or van, Prime arrow logo, high-vis vest, carrying parcels or cardboard boxes"
                  value={memoryForm.cues}
                  onChange={(e) => setMemoryForm({ ...memoryForm, cues: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.82rem', resize: 'vertical' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Colors, logos, clothing, packages, or specific visual signs the camera will see.
                </span>
              </div>

              {/* AI Naming Directive */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  AI Naming & Event Directive (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Explicitly identify as 'Amazon delivery driver delivering a parcel'"
                  value={memoryForm.action_note}
                  onChange={(e) => setMemoryForm({ ...memoryForm, action_note: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Tells the AI model how to formulate the event summary sentence.
                </span>
              </div>

              {/* Threat Bias */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>
                  Threat Bias Level
                </label>
                <select
                  value={memoryForm.threat_bias}
                  onChange={(e) => setMemoryForm({ ...memoryForm, threat_bias: e.target.value })}
                  className="input-field"
                  style={{ width: '100%', fontSize: '0.82rem' }}
                >
                  <option value="Safe">Safe (Normal routine activity - bias toward Safe)</option>
                  <option value="Suspicious">Suspicious (Watch closely - flag for review)</option>
                  <option value="High">High Alert (Immediate threat warning)</option>
                </select>
              </div>

              {/* Active Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={memoryForm.enabled}
                  onChange={(e) => setMemoryForm({ ...memoryForm, enabled: e.target.checked })}
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span>Enable this recognition in AI vision analysis</span>
              </label>

              {/* Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn-glass"
                  onClick={() => setIsEditingMemory(false)}
                  style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ fontSize: '0.82rem', padding: '6px 16px' }}
                >
                  <Save size={14} style={{ marginRight: '4px' }} /> Save Entity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- RECENT SNAPSHOT PICKER MODAL ----------------- */}
      {isPickerOpen && (
        <div className="modal-overlay" onClick={() => setIsPickerOpen(false)} style={{ zIndex: 1200 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '94%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="var(--accent-cyan)" />
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Choose Snapshot from Camera Events</h3>
              </div>
              <button className="btn-glass" onClick={() => setIsPickerOpen(false)} style={{ padding: '6px' }}>
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Click on any captured frame to use as the visual reference and automatically extract visual identifying cues.
            </p>

            {isLoadingRecentSnapshots ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto' }} />
                <span>Loading recent camera snapshots...</span>
              </div>
            ) : recentSnapshots.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <span>No camera event snapshots recorded yet.</span>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '10px',
                overflowY: 'auto',
                maxHeight: '440px',
                paddingRight: '4px'
              }}>
                {recentSnapshots.map((snap, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSelectRecentSnapshot(snap)}
                    style={{
                      cursor: 'pointer',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      background: 'rgba(0, 0, 0, 0.4)',
                      transition: 'transform 0.15s ease, border-color 0.15s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-cyan)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'}
                  >
                    <div style={{ width: '100%', height: '85px', background: '#000' }}>
                      <img
                        src={snap.snapshot_url}
                        alt="Event Snapshot"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ padding: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 700, color: '#fff', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {snap.camera_name || 'Camera'}
                      </span>
                      <span style={{ fontSize: '0.64rem', opacity: 0.7 }}>
                        {snap.timestamp ? new Date(snap.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                ))}
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

            {/* Security & Login Audit Trail */}
            <div className="glass-panel" style={{ borderRadius: '14px', padding: '22px' }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '16px'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="var(--accent-cyan)" />
                    <h3 style={{ fontSize: '0.96rem', fontWeight: 700 }}>Security & Login Audit Trail</h3>
                    {loginAuditData.stats && (
                      <span className="hud-chip" style={{ color: 'var(--accent-cyan)' }}>
                        {loginAuditData.stats.total_recorded} Attempts Recorded
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Real-time authentication activity log capturing client IPs, device signatures, and access statuses.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {auditActionFeedback && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
                      {auditActionFeedback}
                    </span>
                  )}
                  <button
                    className="btn-glass"
                    onClick={loadLoginAudit}
                    disabled={isLoadingAudit}
                    style={{ fontSize: '0.74rem', padding: '5px 10px' }}
                  >
                    <RefreshCw size={12} className={isLoadingAudit ? 'animate-spin' : ''} /> Refresh
                  </button>
                  {isAdmin && (
                    <button
                      className="btn-glass"
                      onClick={handleClearLoginAudit}
                      style={{ fontSize: '0.74rem', padding: '5px 10px', color: '#fb7185' }}
                    >
                      <Trash2 size={12} /> Clear Audit
                    </button>
                  )}
                </div>
              </div>

              {/* KPI Summary Cards */}
              {loginAuditData.stats && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px'
                }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: '8px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Successful Logins (24h)</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)', marginTop: '3px' }}>
                      {loginAuditData.stats.successful_logins_24h}
                    </div>
                  </div>

                  <div style={{
                    background: loginAuditData.stats.failed_attempts_24h > 0 ? 'rgba(244, 63, 94, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: loginAuditData.stats.failed_attempts_24h > 0 ? '1px solid rgba(244, 63, 94, 0.25)' : '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: '8px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: loginAuditData.stats.failed_attempts_24h > 0 ? '#fb7185' : 'var(--text-muted)' }}>
                      Failed Attempts (24h)
                    </div>
                    <div style={{
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      color: loginAuditData.stats.failed_attempts_24h > 0 ? '#fb7185' : 'var(--text-muted)',
                      marginTop: '3px'
                    }}>
                      {loginAuditData.stats.failed_attempts_24h}
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: '8px',
                    padding: '12px 14px'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Security Status</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: loginAuditData.stats.failed_attempts_24h > 3 ? '#fb7185' : 'var(--accent-cyan)', marginTop: '5px' }}>
                      {loginAuditData.stats.failed_attempts_24h > 3 ? '⚠️ Suspicious Activity' : '🛡️ Protected'}
                    </div>
                  </div>
                </div>
              )}

              {/* Filter controls */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                {[
                  { id: 'all', label: 'All Events' },
                  { id: 'success', label: 'Successful Logins' },
                  { id: 'failed', label: 'Failed Attempts' }
                ].map(f => (
                  <button
                    key={f.id}
                    className="btn-glass"
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.72rem',
                      background: auditFilter === f.id ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                      borderColor: auditFilter === f.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                      color: auditFilter === f.id ? 'var(--accent-cyan)' : 'var(--text-muted)'
                    }}
                    onClick={() => setAuditFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Audit Table */}
              <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '8px 10px' }}>Timestamp</th>
                      <th style={{ padding: '8px 10px' }}>User</th>
                      <th style={{ padding: '8px 10px' }}>Source IP</th>
                      <th style={{ padding: '8px 10px' }}>Network</th>
                      <th style={{ padding: '8px 10px' }}>Device / Client</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                      <th style={{ padding: '8px 10px' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!loginAuditData.audit_logs || loginAuditData.audit_logs.length === 0) ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                          No login audit logs recorded yet.
                        </td>
                      </tr>
                    ) : (
                      loginAuditData.audit_logs
                        .filter(l => {
                          if (auditFilter === 'success') return l.status === 'SUCCESS';
                          if (auditFilter === 'failed') return l.status === 'FAILED';
                          return true;
                        })
                        .map(log => {
                          const isLan = isPrivateIp(log.ip_address);
                          const isFailed = log.status === 'FAILED';
                          const timeStr = new Date(log.timestamp * 1000).toLocaleString();

                          return (
                            <tr key={log.id} style={{
                              borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                              background: isFailed ? 'rgba(244, 63, 94, 0.04)' : 'transparent'
                            }}>
                              <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                {timeStr}
                              </td>
                              <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                                @{log.username}
                              </td>
                              <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#93c5fd' }}>
                                {log.ip_address || 'unknown'}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{
                                  fontSize: '0.68rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: 600,
                                  background: isLan ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: isLan ? '#34d399' : '#fb7185',
                                  border: `1px solid ${isLan ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                                }}>
                                  {isLan ? 'LAN (Internal)' : 'WAN (External)'}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }} title={log.user_agent}>
                                {formatUserAgent(log.user_agent)}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: isFailed ? '#fb7185' : 'var(--accent-emerald)'
                                }}>
                                  {isFailed ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                                  {log.status}
                                </span>
                              </td>
                              <td style={{ padding: '8px 10px', color: isFailed ? '#fb7185' : 'var(--text-muted)', fontSize: '0.72rem' }}>
                                {log.failure_reason || '—'}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 7: SYSTEM LOGS ----------------- */}
      {activeTab === 'logs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Panel */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={20} color="var(--accent-cyan)" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>System Logs & Diagnostics</h3>
                  <span className="hud-chip" style={{ color: 'var(--accent-cyan)' }}>
                    {systemLogs.length} Entries
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Real-time operational logging feed across API, video ingestion pipelines, AI models, and background storage workers.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {logActionFeedback && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>
                    {logActionFeedback}
                  </span>
                )}

                {/* Auto Refresh Toggle */}
                <button
                  className="btn-glass"
                  onClick={() => setLogAutoRefresh(!logAutoRefresh)}
                  style={{
                    fontSize: '0.74rem',
                    padding: '6px 10px',
                    borderColor: logAutoRefresh ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                    color: logAutoRefresh ? 'var(--accent-cyan)' : 'var(--text-muted)'
                  }}
                >
                  <Activity size={12} className={logAutoRefresh ? 'animate-pulse' : ''} />
                  {logAutoRefresh ? 'Auto-Refresh ON (4s)' : 'Auto-Refresh OFF'}
                </button>

                <button
                  className="btn-glass"
                  onClick={loadSystemLogs}
                  disabled={isLoadingLogs}
                  style={{ fontSize: '0.74rem', padding: '6px 10px' }}
                >
                  <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} /> Refresh
                </button>

                {isAdmin && (
                  <button
                    className="btn-glass"
                    onClick={handleClearLogs}
                    style={{ fontSize: '0.74rem', padding: '6px 10px', color: '#fb7185' }}
                  >
                    <Trash2 size={12} /> Clear Logs
                  </button>
                )}
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              paddingTop: '12px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {/* Severity Level Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Level:</span>
                <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'ALL', label: 'ALL' },
                    { id: 'CRITICAL', label: 'CRITICAL', color: '#fb7185' },
                    { id: 'ERROR', label: 'ERROR', color: '#fb7185' },
                    { id: 'WARNING', label: 'WARNING', color: '#f59e0b' },
                    { id: 'INFO', label: 'INFO', color: '#38bdf8' },
                    { id: 'DEBUG', label: 'DEBUG', color: '#94a3b8' }
                  ].map(lvl => (
                    <button
                      key={lvl.id}
                      className="btn-glass"
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.72rem',
                        background: logSeverityFilter === lvl.id ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                        borderColor: logSeverityFilter === lvl.id ? (lvl.color || 'var(--accent-cyan)') : 'rgba(255, 255, 255, 0.08)',
                        color: logSeverityFilter === lvl.id ? (lvl.color || 'var(--accent-cyan)') : 'var(--text-muted)',
                        fontWeight: logSeverityFilter === lvl.id ? 700 : 500
                      }}
                      onClick={() => setLogSeverityFilter(lvl.id)}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Component Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Component:</span>
                <select
                  value={logComponentFilter}
                  onChange={(e) => setLogComponentFilter(e.target.value)}
                  className="glass-input"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.76rem' }}
                >
                  <option value="ALL">All Components</option>
                  <option value="system">system</option>
                  <option value="auth">auth</option>
                  <option value="security">security</option>
                  <option value="stream">stream</option>
                  <option value="detector">detector</option>
                  <option value="gemini">gemini</option>
                  <option value="telegram">telegram</option>
                  <option value="storage">storage</option>
                </select>
              </div>

              {/* Search text */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 200px' }}>
                <Search size={14} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Filter logs by keyword..."
                  value={logSearchTerm}
                  onChange={(e) => setLogSearchTerm(e.target.value)}
                  className="glass-input"
                  style={{ padding: '4px 8px', fontSize: '0.76rem', width: '100%' }}
                />
                {logSearchTerm && (
                  <button
                    className="btn-glass"
                    onClick={() => setLogSearchTerm('')}
                    style={{ padding: '4px 6px', fontSize: '0.7rem' }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Limit dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Limit:</span>
                <select
                  value={logLimit}
                  onChange={(e) => setLogLimit(Number(e.target.value))}
                  className="glass-input"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: '0.76rem' }}
                >
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                </select>
              </div>
            </div>
          </div>

          {/* Terminal / Log Viewer */}
          <div style={{
            background: '#040711',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            overflow: 'hidden',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: '0.76rem',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
          }}>
            {/* Terminal bar header */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.04)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '8px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fb7185', display: 'inline-block' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                  stdout / journald buffer
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {systemLogs.length} rows loaded
              </span>
            </div>

            {/* Log Rows feed */}
            <div style={{
              maxHeight: '520px',
              overflowY: 'auto',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {systemLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  {isLoadingLogs ? 'Loading system logs...' : 'No system logs matching current filters.'}
                </div>
              ) : (
                systemLogs.map((item, idx) => {
                  const lvl = (item.level || 'INFO').toUpperCase();
                  let lvlColor = '#38bdf8';
                  let lvlBg = 'rgba(56, 189, 248, 0.12)';
                  if (lvl === 'CRITICAL' || lvl === 'ERROR') {
                    lvlColor = '#fb7185';
                    lvlBg = 'rgba(244, 63, 94, 0.15)';
                  } else if (lvl === 'WARNING' || lvl === 'WARN') {
                    lvlColor = '#f59e0b';
                    lvlBg = 'rgba(245, 158, 11, 0.15)';
                  } else if (lvl === 'DEBUG') {
                    lvlColor = '#94a3b8';
                    lvlBg = 'rgba(148, 163, 184, 0.1)';
                  }

                  const timeStr = item.created_at
                    ? item.created_at.split('T')[1]?.slice(0, 12) || item.created_at
                    : (item.timestamp ? new Date(item.timestamp * 1000).toLocaleTimeString() : '');

                  return (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        background: (lvl === 'ERROR' || lvl === 'CRITICAL') ? 'rgba(244, 63, 94, 0.05)' : 'transparent',
                        lineHeight: '1.45',
                        wordBreak: 'break-word'
                      }}
                    >
                      {/* Timestamp */}
                      <span style={{ color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>
                        {timeStr}
                      </span>

                      {/* Level Badge */}
                      <span style={{
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: lvlBg,
                        color: lvlColor,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        flexShrink: 0,
                        textAlign: 'center',
                        minWidth: '58px'
                      }}>
                        {lvl}
                      </span>

                      {/* Component */}
                      <span style={{ color: '#c084fc', whiteSpace: 'nowrap', flexShrink: 0, fontSize: '0.72rem' }}>
                        [{item.component || 'system'}]
                      </span>

                      {/* Message */}
                      <span style={{ color: '#e2e8f0', flex: 1 }}>
                        {item.message}
                        {item.extra && Object.keys(item.extra).length > 0 && (
                          <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '0.7rem' }}>
                            {JSON.stringify(item.extra)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

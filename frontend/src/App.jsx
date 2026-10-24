import React, { useState, useEffect, useRef } from 'react';
import Navbar from './components/Navbar';
import CameraGrid from './components/CameraGrid';
import ContextMenu from './components/ContextMenu';
import DiscoveryModal from './components/DiscoveryModal';
import ZoneEditorModal from './components/ZoneEditorModal';
import CameraSettingsModal from './components/CameraSettingsModal';
import TelemetryModal from './components/TelemetryModal';
import EventDrawer from './components/EventDrawer';
import LoginModal from './components/LoginModal';
import VideoPlaybackModal from './components/VideoPlaybackModal';
import ClipReviewPage from './components/ClipReviewPage';
import ControlPanel from './components/ControlPanel';
import DailyBriefingPage from './components/DailyBriefingPage';
import { api, authStorage } from './api/client';
import { NvrWebSocket } from './api/ws';
import { ShieldAlert, CheckCircle, Bell, X, Shield, Lock, Smartphone } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(authStorage.getUser() || null);
  const [cameras, setCameras] = useState([]);
  const [telemetryMap, setTelemetryMap] = useState({});
  const [events, setEvents] = useState([]);
  const [drawerAlerts, setDrawerAlerts] = useState([]);
  const [layout, setLayout] = useState('auto');
  const [currentTab, setCurrentTab] = useState('live'); // 'live' or 'clips'
  
  // Modals & Drawers state
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [activeZoneModalCamera, setActiveZoneModalCamera] = useState(null);
  const [activeSettingsCamera, setActiveSettingsCamera] = useState(null);
  const [activeTelemetryCamera, setActiveTelemetryCamera] = useState(null);
  const [activePlaybackEvent, setActivePlaybackEvent] = useState(null);
  
  // Right Click Context Menu
  const [contextMenu, setContextMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
    camera: null
  });

  // Toast Notification state
  const [activeToast, setActiveToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  // Initial load
  const loadInitialData = async () => {
    try {
      if (!authStorage.getToken()) {
        setUser(null);
        return;
      }

      const camList = await api.getCameras();
      setCameras(camList);

      const recentEvents = await api.getEvents(50);
      setEvents(recentEvents);
      const clearedAt = Number(localStorage.getItem('nvr_drawer_cleared_at') || 0);
      setDrawerAlerts(recentEvents.filter(e => (e.timestamp * 1000) > clearedAt));
    } catch (err) {
      console.error("Initial load error:", err);
      if (err.message === 'Unauthorized') {
        setUser(null);
      }
    }
  };

  useEffect(() => {
    // 1. Check for single sign-on parameters from Android APK URL or Native Bridge
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('auth_token') || params.get('token');
    const urlUser = params.get('user');
    const urlRole = params.get('role');

    if (urlToken) {
      authStorage.setToken(urlToken);
      const userData = { username: urlUser || 'admin', role: urlRole || 'admin' };
      authStorage.setUser(userData);
      setUser(userData);
      // Clean query params from URL without page reload
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (window.GawkrBridge && typeof window.GawkrBridge.getAuthToken === 'function') {
      try {
        const bToken = window.GawkrBridge.getAuthToken();
        const bUser = window.GawkrBridge.getUsername();
        const bRole = window.GawkrBridge.getRole();
        if (bToken) {
          authStorage.setToken(bToken);
          const userData = { username: bUser || 'admin', role: bRole || 'admin' };
          authStorage.setUser(userData);
          setUser(userData);
        }
      } catch (e) {
        console.warn("GawkrBridge lookup:", e);
      }
    }

    loadInitialData();

    // Listen for auth expiration
    const handleAuthExpired = () => {
      setUser(null);
      setIsLoginOpen(true);
    };
    window.addEventListener('auth_expired', handleAuthExpired);

    // Setup WebSocket for Real-Time AI Alerts and Live Telemetry
    const wsClient = new NvrWebSocket((msg) => {
      if (msg.type === 'DETECTION_ALERT' && msg.event) {
        setEvents(prev => {
          const existingIdx = prev.findIndex(e => e.id === msg.event.id);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = { ...next[existingIdx], ...msg.event };
            return next;
          }
          return [msg.event, ...prev.slice(0, 99)];
        });

        setDrawerAlerts(prev => {
          const existingIdx = prev.findIndex(e => e.id === msg.event.id);
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = { ...next[existingIdx], ...msg.event };
            return next;
          }
          return [msg.event, ...prev.slice(0, 49)];
        });

        // If the playback modal is viewing this event, update it live as soon as the clip is encoded!
        setActivePlaybackEvent(current => {
          if (current && current.id === msg.event.id) {
            return { ...current, ...msg.event };
          }
          return current;
        });

        triggerToastNotification(msg.event);
      } else if (msg.type === 'TELEMETRY_UPDATE' && msg.telemetry) {
        setTelemetryMap(prev => ({
          ...prev,
          [msg.telemetry.camera_id]: msg.telemetry
        }));
      }
    });

    wsClient.connect();
    return () => wsClient.disconnect();
  }, []);

  const triggerToastNotification = (event) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setActiveToast(event);
    toastTimeoutRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 6000);
  };

  // Context Menu Handlers
  const handleOpenContextMenu = (x, y, camera) => {
    setContextMenu({ isOpen: true, x, y, camera });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, camera: null });
  };

  const handleTakeSnapshot = async (cam) => {
    try {
      const snapUrl = await api.captureSnapshot(cam.id);
      const a = document.createElement('a');
      a.href = snapUrl;
      a.download = `Snapshot_${cam.name.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      alert("Snapshot failed: " + err.message);
    }
  };

  const handleToggleRecording = async (cam) => {
    const nextMode = cam.settings?.recording_mode === 'continuous' ? 'ai_event' : 
                     cam.settings?.recording_mode === 'ai_event' ? 'disabled' : 'continuous';
    try {
      const updated = await api.updateCamera(cam.id, {
        settings: { ...cam.settings, recording_mode: nextMode }
      });
      setCameras(cameras.map(c => c.id === cam.id ? updated : c));
    } catch (err) {
      alert("Failed to toggle recording: " + err.message);
    }
  };

  const handleRestartStream = async (cam) => {
    try {
      await api.restartCamera(cam.id);
      // Reload camera list
      const camList = await api.getCameras();
      setCameras(camList);
    } catch (err) {
      alert("Failed to restart stream: " + err.message);
    }
  };

  const handleTriggerTestAlert = async (cam) => {
    try {
      const res = await api.triggerTestAlert(cam.id);
      if (res && res.event) {
        setEvents(prev => [res.event, ...prev.slice(0, 49)]);
        triggerToastNotification(res.event);
      }
    } catch (err) {
      alert("Failed to trigger test alert: " + err.message);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    try {
      await api.deleteEvent(eventId);
      setEvents(events.filter(e => e.id !== eventId));
    } catch (err) {
      alert("Failed to delete event: " + err.message);
    }
  };

  const handleClearDrawerAlerts = () => {
    setDrawerAlerts([]);
    localStorage.setItem('nvr_drawer_cleared_at', Date.now().toString());
  };

  const handleDeleteCamera = async (cam) => {
    if (window.confirm(`Are you sure you want to remove ${cam.name}?`)) {
      try {
        await api.deleteCamera(cam.id);
        setCameras(cameras.filter(c => c.id !== cam.id));
      } catch (err) {
        alert("Failed to delete camera: " + err.message);
      }
    }
  };

  const handleCameraUpdated = (updatedCam) => {
    setCameras(cameras.map(c => c.id === updatedCam.id ? updatedCam : c));
  };

  const handleCameraAdded = (newCam) => {
    setCameras([...cameras, newCam]);
  };

  const handleLogout = () => {
    authStorage.clearToken();
    authStorage.clearUser();
    setUser(null);
    setIsLoginOpen(true);
  };

  const handleTabChange = (newTab) => {
    setCurrentTab(newTab);
    if (newTab === 'clips') {
      api.getEvents(50).then(evts => setEvents(evts)).catch(() => {});
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        user={user}
        layout={layout}
        setLayout={setLayout}
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        alertCount={drawerAlerts.length}
        onOpenDiscovery={() => setIsDiscoveryOpen(true)}
        onOpenEvents={() => setIsEventDrawerOpen(true)}
        onOpenLogin={() => setIsLoginOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area: Live Surveillance Matrix vs Clip Review & Timeline vs Control Panel */}
      <main style={{ flex: 1, display: 'flex' }}>
        {!user ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
            <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '36px 28px', textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
                border: '1px solid rgba(6, 182, 212, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}>
                <Shield size={32} color="var(--accent-cyan)" />
              </div>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
                GAWK<span style={{ color: 'var(--accent-cyan)' }}>R</span> Surveillance
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', margin: '0 0 24px' }}>
                Sign in to view live camera feeds and security matrix.
              </p>

              <button
                className="btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '0.94rem', justifyContent: 'center', marginBottom: '24px' }}
                onClick={() => setIsLoginOpen(true)}
              >
                <Lock size={16} /> Sign In to Access Cameras
              </button>

              {/* Mobile-friendly Android App Card */}
              <div style={{
                padding: '18px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Smartphone size={20} color="var(--accent-emerald)" />
                  <span style={{ fontWeight: 700, fontSize: '0.90rem', color: 'var(--accent-emerald)' }}>Gawkr Mobile for Android</span>
                </div>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>
                  Native background push notifications with intruder snapshot previews
                </p>
                <a
                  href="/api/download/gawkr.apk"
                  download="gawkr.apk"
                  className="btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'var(--accent-emerald)',
                    color: '#fff',
                    textDecoration: 'none',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.84rem',
                    width: '100%'
                  }}
                >
                  <Smartphone size={16} /> Download APK (v1.0.0)
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            {currentTab === 'live' && (
              <CameraGrid
                cameras={cameras}
                telemetryMap={telemetryMap}
                layout={layout}
                isAdmin={isAdmin}
                onContextMenu={handleOpenContextMenu}
                onTakeSnapshot={handleTakeSnapshot}
                onOpenTelemetry={(cam) => setActiveTelemetryCamera(cam)}
                onOpenZones={(cam) => setActiveZoneModalCamera(cam)}
                onOpenAiSettings={(cam) => setActiveSettingsCamera(cam)}
                onOpenDiscovery={() => setIsDiscoveryOpen(true)}
              />
            )}
            {currentTab === 'clips' && (
              <ClipReviewPage
                events={events}
                cameras={cameras}
                isAdmin={isAdmin}
                onPlayEvent={(evt) => setActivePlaybackEvent(evt)}
                onDeleteEvent={handleDeleteEvent}
                onRefreshEvents={loadInitialData}
              />
            )}
            {currentTab === 'control_panel' && (
              <ControlPanel isAdmin={isAdmin} currentUser={user} />
            )}
            {currentTab === 'briefing' && (
              <DailyBriefingPage isAdmin={isAdmin} />
            )}
          </>
        )}
      </main>

      {/* Right-Click Context Menu */}
      {contextMenu.isOpen && contextMenu.camera && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          camera={contextMenu.camera}
          isAdmin={isAdmin}
          onClose={handleCloseContextMenu}
          onTakeSnapshot={handleTakeSnapshot}
          onOpenZones={(cam) => setActiveZoneModalCamera(cam)}
          onOpenAiSettings={(cam) => setActiveSettingsCamera(cam)}
          onToggleRecording={handleToggleRecording}
          onRestartStream={handleRestartStream}
          onTriggerTestAlert={handleTriggerTestAlert}
          onOpenSettings={(cam) => setActiveSettingsCamera(cam)}
          onOpenTelemetry={(cam) => setActiveTelemetryCamera(cam)}
          onDeleteCamera={handleDeleteCamera}
        />
      )}

      {/* Discovery Modal */}
      {isDiscoveryOpen && (
        <DiscoveryModal
          onClose={() => setIsDiscoveryOpen(false)}
          onCameraAdded={handleCameraAdded}
        />
      )}

      {/* Detection Zone / Tripwire Editor Modal */}
      {activeZoneModalCamera && (
        <ZoneEditorModal
          camera={activeZoneModalCamera}
          onClose={() => setActiveZoneModalCamera(null)}
          onSaveSuccess={handleCameraUpdated}
        />
      )}

      {/* Camera & AI Configuration Modal */}
      {activeSettingsCamera && (
        <CameraSettingsModal
          camera={activeSettingsCamera}
          onClose={() => setActiveSettingsCamera(null)}
          onSaveSuccess={handleCameraUpdated}
        />
      )}

      {/* Telemetry Diagnostics Modal */}
      {activeTelemetryCamera && (
        <TelemetryModal
          camera={activeTelemetryCamera}
          telemetry={telemetryMap[activeTelemetryCamera.id]}
          onClose={() => setActiveTelemetryCamera(null)}
        />
      )}

      {/* Side Events Drawer */}
      <EventDrawer
        isOpen={isEventDrawerOpen}
        onClose={() => setIsEventDrawerOpen(false)}
        events={drawerAlerts}
        onSelectEvent={(evt) => {
          setActivePlaybackEvent(evt);
        }}
        onClearEvents={handleClearDrawerAlerts}
      />

      {/* Video & Snapshot Playback Modal */}
      {activePlaybackEvent && (
        <VideoPlaybackModal
          event={activePlaybackEvent}
          onClose={() => setActivePlaybackEvent(null)}
        />
      )}

      {/* Login / RBAC Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={(userData) => {
          setUser(userData);
          loadInitialData();
        }}
      />

      {/* Real-time Toast Notification Banner */}
      {activeToast && (
        <div className="toast-notification">
          {activeToast.snapshot_url && (
            <img 
              src={activeToast.snapshot_url} 
              alt="Snapshot" 
              style={{ width: '60px', height: '40px', borderRadius: '6px', objectFit: 'cover' }} 
            />
          )}
          <div 
            style={{ flex: 1, cursor: 'pointer' }}
            onClick={() => setActivePlaybackEvent(activeToast)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.84rem' }}>
              <ShieldAlert size={15} /> AI Alert: {activeToast.objects?.[0]?.label?.toUpperCase() || 'OBJECT'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Detected at <strong>{activeToast.camera_name}</strong> • <em>Click to Inspect Clip</em>
            </div>
          </div>
          <button 
            onClick={() => setActiveToast(null)}
            className="btn-glass" 
            style={{ padding: '4px', border: 'none' }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

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
import { ShieldAlert, CheckCircle, Bell, X } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(authStorage.getUser() || { username: 'admin', role: 'admin' });
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
      // Auto-authenticate as admin if no valid token
      if (!authStorage.getToken()) {
        const auth = await api.login('admin', 'admin123');
        setUser({ username: auth.username, role: auth.role });
      }

      const camList = await api.getCameras();
      setCameras(camList);

      const recentEvents = await api.getEvents(50);
      setEvents(recentEvents);
      const clearedAt = Number(localStorage.getItem('nvr_drawer_cleared_at') || 0);
      setDrawerAlerts(recentEvents.filter(e => (e.timestamp * 1000) > clearedAt));
    } catch (err) {
      console.error("Initial load error:", err);
    }
  };

  useEffect(() => {
    loadInitialData();

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

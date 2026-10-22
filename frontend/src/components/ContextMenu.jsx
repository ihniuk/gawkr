import React, { useEffect, useRef } from 'react';
import { 
  Camera, Crosshair, Cpu, RefreshCw, Disc, 
  Settings, Activity, Maximize2, Trash2, ShieldAlert, Zap
} from 'lucide-react';

export default function ContextMenu({
  x,
  y,
  camera,
  isAdmin,
  onClose,
  onTakeSnapshot,
  onOpenZones,
  onOpenAiSettings,
  onToggleRecording,
  onRestartStream,
  onTriggerTestAlert,
  onOpenSettings,
  onOpenTelemetry,
  onDeleteCamera
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow screen
  const menuWidth = Math.min(260, window.innerWidth - 20);
  const menuHeight = 380;
  const adjustedX = Math.max(10, Math.min(x, window.innerWidth - menuWidth - 10));
  const adjustedY = Math.max(10, Math.min(y, window.innerHeight - menuHeight - 10));

  return (
    <div 
      ref={menuRef}
      className="context-menu-container"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ 
        padding: '6px 12px 8px 12px', 
        fontSize: '0.74rem', 
        fontFamily: 'var(--font-mono)', 
        color: 'var(--accent-cyan)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>{camera.name.slice(0, 20)}</span>
        <span style={{ color: camera.is_online ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
          {camera.is_online ? '● LIVE' : '○ OFFLINE'}
        </span>
      </div>

      <button className="context-menu-item" onClick={() => { onTakeSnapshot(camera); onClose(); }}>
        <Camera size={15} color="#38bdf8" />
        <span>Take 4K Snapshot</span>
      </button>

      <button className="context-menu-item" onClick={() => { onOpenZones(camera); onClose(); }}>
        <Crosshair size={15} color="#10b981" />
        <span>Detection Zones & Tripwires</span>
      </button>

      <button className="context-menu-item" onClick={() => { onOpenAiSettings(camera); onClose(); }}>
        <Cpu size={15} color="#a855f7" />
        <span>AI Inference & Classes</span>
      </button>

      <button className="context-menu-item" onClick={() => { onToggleRecording(camera); onClose(); }}>
        <Disc size={15} color={camera.settings?.recording_mode !== 'disabled' ? '#f43f5e' : '#94a3b8'} />
        <span>Recording: {camera.settings?.recording_mode || 'ai_event'}</span>
      </button>

      <div className="context-menu-separator" />

      <button className="context-menu-item" onClick={() => { onOpenTelemetry(camera); onClose(); }}>
        <Activity size={15} color="#f59e0b" />
        <span>Stream Telemetry & NVDEC</span>
      </button>

      <button className="context-menu-item" onClick={() => { onRestartStream(camera); onClose(); }}>
        <RefreshCw size={15} color="#06b6d4" />
        <span>Restart Video Pipeline</span>
      </button>

      <button className="context-menu-item" onClick={() => { onTriggerTestAlert(camera); onClose(); }}>
        <Zap size={15} color="#eab308" />
        <span>Trigger Test AI Alert & Clip</span>
      </button>

      {isAdmin && (
        <>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={() => { onOpenSettings(camera); onClose(); }}>
            <Settings size={15} color="#94a3b8" />
            <span>Camera Settings & Credentials</span>
          </button>

          <button className="context-menu-item danger" onClick={() => { onDeleteCamera(camera); onClose(); }}>
            <Trash2 size={15} color="#f43f5e" />
            <span>Remove Camera</span>
          </button>
        </>
      )}
    </div>
  );
}

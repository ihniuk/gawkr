import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, Maximize2, Activity, Disc, Cpu, ShieldCheck, 
  AlertCircle, RefreshCw, Layers, MoreVertical 
} from 'lucide-react';
import { api } from '../api/client';

export default function CameraTile({
  camera,
  telemetry,
  isAdmin,
  onContextMenu,
  onTakeSnapshot,
  onOpenTelemetry,
  onOpenZones,
  onOpenAiSettings
}) {
  const [streamUrl, setStreamUrl] = useState('');
  const [streamError, setStreamError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const containerRef = useRef(null);
  const touchTimerRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const refreshStreamTicket = async () => {
    try {
      const res = await api.getStreamTicket(camera.id);
      if (res && res.ticket) {
        setStreamError(false);
        setStreamUrl(`/api/cameras/${camera.id}/stream?ticket=${res.ticket}`);
      }
    } catch (err) {
      console.error("Stream ticket error:", err);
      setStreamError(true);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = setTimeout(refreshStreamTicket, 3000);
    }
  };

  const handleStreamError = () => {
    setStreamError(true);
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(refreshStreamTicket, 2000);
  };

  useEffect(() => {
    refreshStreamTicket();
    const timer = setInterval(refreshStreamTicket, 240000);
    return () => clearInterval(timer);
  }, [camera.id]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, camera);
  };

  // Touch Long-Press Detection for mobile devices
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    touchTimerRef.current = setTimeout(() => {
      onContextMenu(touch.clientX, touch.clientY, camera);
    }, 550);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    }
  };

  const fps = telemetry?.fps ?? 25.0;
  const bitrate = telemetry?.bitrate_kbps ?? 1840;
  const resolution = telemetry?.resolution ?? "1920x1080";
  const aiLatency = telemetry?.ai_latency_ms ?? 5.2;

  return (
    <div 
      ref={containerRef}
      className="glass-card"
      style={{
        position: 'relative',
        borderRadius: isMobile ? '12px' : '14px',
        overflow: 'hidden',
        aspectRatio: '16/9',
        backgroundColor: '#050811',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isHovered 
          ? '0 12px 30px rgba(0,0,0,0.8), 0 0 20px rgba(6, 182, 212, 0.25)' 
          : '0 4px 20px rgba(0,0,0,0.5)',
        border: isHovered ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
        transition: 'all 0.2s ease',
        cursor: 'default',
        touchAction: 'manipulation'
      }}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Video Feed */}
      {streamUrl && !streamError ? (
        <img 
          src={streamUrl} 
          alt={camera.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={handleStreamError}
        />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          color: 'var(--text-dim)',
          padding: '16px',
          textAlign: 'center'
        }}>
          <AlertCircle size={28} color="#f43f5e" />
          <span style={{ fontSize: '0.8rem' }}>Stream Inactive or Connecting...</span>
          <button className="btn-glass" onClick={refreshStreamTicket} style={{ fontSize: '0.72rem', padding: '4px 8px' }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Top HUD Glass Bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: isMobile ? '6px 10px' : '10px 12px',
        background: 'linear-gradient(to bottom, rgba(7, 10, 18, 0.88) 0%, transparent 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none'
      }}>
        {/* Camera Name & Live Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: camera.is_online ? 'var(--accent-emerald)' : 'var(--accent-rose)',
            boxShadow: camera.is_online ? '0 0 8px var(--accent-emerald)' : 'none'
          }} />
          <span style={{ fontWeight: 700, fontSize: isMobile ? '0.78rem' : '0.85rem', color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
            {camera.name}
          </span>
        </div>

        {/* AI & Recording Status Badges + Mobile Menu Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', pointerEvents: 'auto' }}>
          {camera.settings?.ai_enabled && (
            <div className="hud-chip" style={{ color: '#38bdf8', fontSize: isMobile ? '0.62rem' : '0.7rem' }}>
              <Cpu size={10} /> AI: {aiLatency}ms
            </div>
          )}
          {camera.settings?.recording_mode !== 'disabled' && (
            <div className="hud-chip" style={{ color: '#f43f5e', fontSize: isMobile ? '0.62rem' : '0.7rem' }}>
              <Disc size={10} /> REC
            </div>
          )}

          {/* Kebab Context Menu Trigger for Touch / Mobile */}
          <button
            className="btn-glass"
            style={{ padding: '4px 6px', borderRadius: '6px', marginLeft: '2px' }}
            title="Camera Options"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu(rect.left, rect.bottom + 6, camera);
            }}
          >
            <MoreVertical size={14} color="var(--accent-cyan)" />
          </button>
        </div>
      </div>

      {/* Bottom Telemetry HUD */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: isMobile ? '6px 10px' : '8px 12px',
        background: 'linear-gradient(to top, rgba(7, 10, 18, 0.92) 0%, transparent 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span className="hud-chip">{fps} FPS</span>
          <span className="hud-chip">{bitrate} Kbps</span>
          {!isMobile && <span className="hud-chip">{resolution}</span>}
        </div>

        {/* Quick action controls (Always visible or on hover) */}
        <div style={{
          display: 'flex',
          gap: '5px',
          opacity: isMobile ? 1 : (isHovered ? 1 : 0),
          transition: 'opacity 0.15s ease'
        }}>
          <button 
            className="btn-glass" 
            style={{ padding: '4px 7px', fontSize: '0.7rem' }}
            title="Take Snapshot"
            onClick={() => onTakeSnapshot(camera)}
          >
            <Camera size={13} />
          </button>
          {!isMobile && (
            <>
              <button 
                className="btn-glass" 
                style={{ padding: '4px 7px', fontSize: '0.7rem' }}
                title="Configure Zones"
                onClick={() => onOpenZones(camera)}
              >
                <Layers size={13} />
              </button>
              <button 
                className="btn-glass" 
                style={{ padding: '4px 7px', fontSize: '0.7rem' }}
                title="Stream Diagnostics"
                onClick={() => onOpenTelemetry(camera)}
              >
                <Activity size={13} />
              </button>
            </>
          )}
          <button 
            className="btn-glass" 
            style={{ padding: '4px 7px', fontSize: '0.7rem' }}
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

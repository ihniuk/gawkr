import React from 'react';
import { Bell, X, ShieldAlert, Clock, Video, ExternalLink, Trash2 } from 'lucide-react';

export default function EventDrawer({ isOpen, onClose, events, onSelectEvent, onClearEvents }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 'min(380px, 100vw)',
      background: 'rgba(11, 16, 28, 0.96)',
      backdropFilter: 'blur(28px)',
      WebkitBackdropFilter: 'blur(28px)',
      borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.7)',
      zIndex: 998,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>AI Detection Feed</h3>
          <span className="hud-chip" style={{ color: 'var(--accent-cyan)' }}>{events.length}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            className="btn-glass"
            onClick={onClearEvents}
            disabled={!events || events.length === 0}
            title="Clear alerts"
            style={{
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontSize: '0.78rem',
              color: (!events || events.length === 0) ? 'rgba(255, 255, 255, 0.3)' : 'var(--text-muted)',
              cursor: (!events || events.length === 0) ? 'not-allowed' : 'pointer'
            }}
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }} title="Close"><X size={16} /></button>
        </div>
      </div>

      {/* Events List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {events.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            marginTop: '40px',
            fontSize: '0.86rem'
          }}>
            No recent AI events detected. Active detection logs and snapshots will populate here in real-time.
          </div>
        ) : (
          events.map((evt) => {
            const timeStr = new Date(evt.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <div
                key={evt.id}
                className="glass-card"
                style={{
                  borderRadius: '10px',
                  padding: '10px',
                  display: 'flex',
                  gap: '10px',
                  cursor: 'pointer'
                }}
                onClick={() => onSelectEvent && onSelectEvent(evt)}
              >
                {/* Snapshot Thumbnail */}
                <div style={{
                  width: '84px',
                  height: '56px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  background: '#040711',
                  flexShrink: 0,
                  position: 'relative'
                }}>
                  <img
                    src={evt.snapshot_url}
                    alt="Event Snapshot"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  {evt.video_clip_url ? (
                    <span style={{
                      position: 'absolute',
                      bottom: '3px',
                      right: '3px',
                      background: 'rgba(6, 182, 212, 0.85)',
                      color: '#fff',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      padding: '1px 4px',
                      borderRadius: '3px'
                    }}>
                      ▶ CLIP
                    </span>
                  ) : (
                    <span style={{
                      position: 'absolute',
                      bottom: '3px',
                      right: '3px',
                      background: 'rgba(0, 0, 0, 0.65)',
                      color: '#94a3b8',
                      fontSize: '0.62rem',
                      padding: '1px 4px',
                      borderRadius: '3px'
                    }}>
                      SNAP
                    </span>
                  )}
                </div>

                {/* Event Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {evt.camera_name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {timeStr}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {evt.objects?.map((obj, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: '0.68rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          background: obj.is_stationary ? 'rgba(148, 163, 184, 0.15)' : (obj.label === 'person' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                          color: obj.is_stationary ? '#94a3b8' : (obj.label === 'person' ? '#38bdf8' : '#fbbf24'),
                          border: '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        {obj.label.toUpperCase()} {obj.is_stationary ? '[PARKED]' : `${Math.round(obj.confidence * 100)}%`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

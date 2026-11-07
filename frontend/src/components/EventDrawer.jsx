import React, { useState, useEffect } from 'react';
import { Bell, X, ShieldAlert, Clock, Video, ExternalLink, Trash2, Smartphone } from 'lucide-react';

export default function EventDrawer({ isOpen, onClose, events, onSelectEvent, onClearEvents }) {
  const [showIosModal, setShowIosModal] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Click-away backdrop overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 997,
          cursor: 'pointer'
        }}
      />

      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(410px, 92vw)',
        background: 'rgba(11, 16, 28, 0.97)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: '-10px 0 45px rgba(0, 0, 0, 0.75)',
        zIndex: 998,
        display: 'flex',
        flexDirection: 'column',
        animation: 'slideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          {/* Top Bar: Title & High-Visibility Close Button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <Bell size={18} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              <h3 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, whiteSpace: 'nowrap' }}>AI Detection Feed</h3>
              <span className="hud-chip" style={{ color: 'var(--accent-cyan)', flexShrink: 0 }}>{events.length}</span>
            </div>

            <button
              type="button"
              className="btn-glass"
              onClick={onClose}
              title="Close feed (Esc)"
              aria-label="Close"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.12)',
                borderColor: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                transition: 'all 0.15s ease'
              }}
            >
              <X size={16} />
              <span>Close</span>
            </button>
          </div>

          {/* Action Toolbar Row: APK, iOS, Clear */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px'
          }}>
            <a
              href="/gawkr.apk"
              download="gawkr.apk"
              className="btn-glass"
              title="Download Gawkr Android App (APK)"
              style={{
                flex: 1,
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: 'var(--accent-emerald, #10b981)',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                background: 'rgba(16, 185, 129, 0.08)',
                textDecoration: 'none',
                borderRadius: '7px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              <Smartphone size={13} />
              <span>Android APK</span>
            </a>

            <button
              type="button"
              className="btn-glass"
              title="Install Gawkr on iOS (iPhone / iPad)"
              onClick={() => setShowIosModal(true)}
              style={{
                flex: 1,
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: '#38bdf8',
                borderColor: 'rgba(56, 189, 248, 0.35)',
                background: 'rgba(56, 189, 248, 0.08)',
                cursor: 'pointer',
                borderRadius: '7px',
                whiteSpace: 'nowrap'
              }}
            >
              <Smartphone size={13} />
              <span>iOS App</span>
            </button>

            <button
              type="button"
              className="btn-glass"
              onClick={onClearEvents}
              disabled={!events || events.length === 0}
              title="Clear all alerts"
              style={{
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                fontSize: '0.76rem',
                fontWeight: 600,
                color: (!events || events.length === 0) ? 'rgba(255, 255, 255, 0.3)' : '#fb7185',
                borderColor: (!events || events.length === 0) ? 'rgba(255, 255, 255, 0.08)' : 'rgba(244, 63, 94, 0.3)',
                background: (!events || events.length === 0) ? 'transparent' : 'rgba(244, 63, 94, 0.08)',
                cursor: (!events || events.length === 0) ? 'not-allowed' : 'pointer',
                borderRadius: '7px',
                whiteSpace: 'nowrap'
              }}
            >
              <Trash2 size={13} />
              <span>Clear</span>
            </button>
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

        {/* iOS Installation Guide Modal */}
        {showIosModal && (
          <div className="modal-overlay" onClick={() => setShowIosModal(false)} style={{ zIndex: 1300 }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px', width: '92%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8'
                  }}>
                    <Smartphone size={18} />
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Install Gawkr on iPhone / iPad</h3>
                </div>
                <button className="btn-glass" onClick={() => setShowIosModal(false)} style={{ padding: '6px' }}>
                  <X size={15} />
                </button>
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.4' }}>
                Apple blocks downloading raw installer files (.ipa) directly from websites like Android does, but Gawkr can be installed directly from Safari with <strong>full-screen standalone app mode</strong> and <strong>lockscreen push notifications</strong>:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>1</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Open this Gawkr address in <strong>Safari</strong> on your iPhone or iPad.</span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>2</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Tap the <strong>Share</strong> button <span style={{ fontSize: '0.9rem' }}>⎋</span> (the square with an arrow pointing up at the bottom toolbar).</span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>3</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Scroll down and tap <strong>"Add to Home Screen"</strong>, then tap <strong>Add</strong> in the top-right.</span>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ background: 'var(--accent-cyan)', color: '#000', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>4</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>Tap <strong>Gawkr</strong> on your Home Screen — it launches as a full-screen app with lockscreen notifications enabled (iOS 16.4+).</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-primary" onClick={() => setShowIosModal(false)} style={{ fontSize: '0.82rem', padding: '6px 16px' }}>
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

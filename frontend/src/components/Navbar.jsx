import React, { useState, useEffect } from 'react';
import { 
  Shield, Radio, Bell, LayoutGrid, Grid, Square, 
  User, LogOut, Lock, Video, Sparkles, Film, Sliders, Smartphone
} from 'lucide-react';

export default function Navbar({
  user,
  layout,
  setLayout,
  currentTab,
  setCurrentTab,
  alertCount,
  onOpenDiscovery,
  onOpenEvents,
  onOpenLogin,
  onLogout
}) {
  const isAdmin = user?.role === 'admin';
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      {/* Top Main Navbar */}
      <nav className="glass-panel" style={{
        position: 'sticky',
        top: 0,
        zIndex: 900,
        padding: isMobile ? '10px 14px' : '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        {/* Brand & Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: isMobile ? '32px' : '36px',
            height: isMobile ? '32px' : '36px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25) 0%, rgba(16, 185, 129, 0.25) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }} onClick={() => setCurrentTab('live')}>
            <Shield size={isMobile ? 18 : 20} color="var(--accent-cyan)" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: isMobile ? '0.95rem' : '1.08rem', letterSpacing: '-0.02em', cursor: 'pointer' }} onClick={() => setCurrentTab('live')}>
                GAWK<span style={{ color: 'var(--accent-cyan)' }}>R</span>
              </span>
              <span style={{
                fontSize: '0.60rem',
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                background: 'rgba(6, 182, 212, 0.15)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                padding: '1px 5px',
                borderRadius: '4px'
              }}>
                AI NVR
              </span>
            </div>
            {!isMobile && (
              <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-emerald)', display: 'inline-block' }} />
                <span>Having a gawk so you don't have to</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Tabs (Visible ONLY when logged in and not on mobile) */}
        {!isMobile && user && (
          <div style={{
            display: 'flex',
            background: 'rgba(8, 12, 22, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '3px',
            gap: '2px'
          }}>
            <button
              className="btn-glass"
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: '8px',
                background: currentTab === 'live' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                color: currentTab === 'live' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.82rem'
              }}
              onClick={() => setCurrentTab('live')}
            >
              <Video size={14} /> Live Matrix
            </button>
            <button
              className="btn-glass"
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: '8px',
                background: currentTab === 'clips' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                color: currentTab === 'clips' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.82rem'
              }}
              onClick={() => setCurrentTab('clips')}
            >
              <Film size={14} /> Review Clips & Timeline
            </button>
            <button
              className="btn-glass"
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: '8px',
                background: currentTab === 'briefing' ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                color: currentTab === 'briefing' ? '#c084fc' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.82rem'
              }}
              onClick={() => setCurrentTab('briefing')}
            >
              <Sparkles size={14} /> AI Briefing
            </button>
            <button
              className="btn-glass"
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: '8px',
                background: currentTab === 'control_panel' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                color: currentTab === 'control_panel' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.82rem'
              }}
              onClick={() => setCurrentTab('control_panel')}
            >
              <Sliders size={14} /> Control Panel
            </button>
          </div>
        )}

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {user && isAdmin && currentTab === 'live' && (
            <button className="btn-primary" onClick={onOpenDiscovery} style={{ padding: isMobile ? '6px 10px' : '8px 14px', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>
              <Radio size={14} />
              <span>{isMobile ? 'Scan' : 'Discover Cameras'}</span>
            </button>
          )}

          {/* Layout Switcher (Visible only when logged in) */}
          {user && !isMobile && currentTab === 'live' && (
            <div style={{
              display: 'flex',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '2px'
            }}>
              <button
                className="btn-glass"
                style={{
                  padding: '5px 8px',
                  border: 'none',
                  background: layout === '1x1' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: layout === '1x1' ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}
                onClick={() => setLayout('1x1')}
                title="Single Camera (1x1)"
              >
                <Square size={13} />
              </button>
              <button
                className="btn-glass"
                style={{
                  padding: '5px 8px',
                  border: 'none',
                  background: layout === '2x2' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: layout === '2x2' ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}
                onClick={() => setLayout('2x2')}
                title="Quad View (2x2)"
              >
                <Grid size={13} />
              </button>
              <button
                className="btn-glass"
                style={{
                  padding: '5px 8px',
                  border: 'none',
                  background: layout === 'auto' ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: layout === 'auto' ? 'var(--accent-cyan)' : 'var(--text-muted)'
                }}
                onClick={() => setLayout('auto')}
                title="Matrix Grid"
              >
                <LayoutGrid size={13} />
              </button>
            </div>
          )}

          {/* Events Bell (Visible only when logged in) */}
          {user && (
            <button
              className="btn-glass"
              onClick={onOpenEvents}
              style={{ position: 'relative', padding: isMobile ? '6px 8px' : '7px 12px' }}
              title="Open Alerts Feed"
            >
              <Bell size={15} color={alertCount > 0 ? "var(--accent-cyan)" : "var(--text-main)"} />
              {!isMobile && <span>Alerts</span>}
              {alertCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: 'var(--accent-rose)',
                  color: '#fff',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {alertCount}
                </span>
              )}
            </button>
          )}

          {/* User Role */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div 
                onClick={onOpenLogin}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '5px 8px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                title="Switch User Role"
              >
                <User size={13} color="var(--accent-cyan)" />
                {!isMobile && <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{user.username}</span>}
                <span style={{
                  fontSize: '0.62rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 4px',
                  borderRadius: '4px',
                  background: isAdmin ? 'rgba(6, 182, 212, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                  color: isAdmin ? '#38bdf8' : '#34d399'
                }}>
                  {user.role.toUpperCase()}
                </span>
              </div>
              <button className="btn-glass" onClick={onLogout} title="Sign Out" style={{ padding: '6px' }}>
                <LogOut size={13} color="var(--text-muted)" />
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={onOpenLogin} style={{ padding: '6px 10px', fontSize: '0.78rem' }}>
              <Lock size={13} /> Sign In
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar (Visible only when logged in on screens <= 768px) */}
      {isMobile && user && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          background: 'rgba(8, 12, 22, 0.95)',
          backdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '8px 12px 12px 12px',
          boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.8)'
        }}>
          <button
            onClick={() => setCurrentTab('live')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: currentTab === 'live' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: '0.72rem',
              fontWeight: currentTab === 'live' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            <Video size={18} />
            <span>Live Grid</span>
          </button>

          <button
            onClick={() => setCurrentTab('clips')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: currentTab === 'clips' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: '0.72rem',
              fontWeight: currentTab === 'clips' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            <Film size={18} />
            <span>Clips & Review</span>
          </button>

          <button
            onClick={() => setCurrentTab('briefing')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: currentTab === 'briefing' ? '#c084fc' : 'var(--text-muted)',
              fontSize: '0.72rem',
              fontWeight: currentTab === 'briefing' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            <Sparkles size={18} />
            <span>Briefing</span>
          </button>

          <button
            onClick={() => setCurrentTab('control_panel')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              background: 'transparent',
              border: 'none',
              color: currentTab === 'control_panel' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              fontSize: '0.72rem',
              fontWeight: currentTab === 'control_panel' ? 700 : 500,
              cursor: 'pointer'
            }}
          >
            <Sliders size={18} />
            <span>Control Panel</span>
          </button>
        </div>
      )}
    </>
  );
}

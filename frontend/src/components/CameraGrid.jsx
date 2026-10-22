import React, { useState, useEffect } from 'react';
import CameraTile from './CameraTile';
import { Radio, Plus, Video } from 'lucide-react';

export default function CameraGrid({
  cameras,
  telemetryMap,
  layout,
  isAdmin,
  onContextMenu,
  onTakeSnapshot,
  onOpenTelemetry,
  onOpenZones,
  onOpenAiSettings,
  onOpenDiscovery
}) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!cameras || cameras.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '65vh',
        gap: '18px',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{
          width: '74px',
          height: '74px',
          borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.1)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Video size={36} color="var(--accent-cyan)" />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>No Surveillance Feeds Active</h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '0.9rem' }}>
          Scan your local network to auto-discover ONVIF/RTSP cameras with point-and-click ease.
        </p>
        {isAdmin && (
          <button className="btn-primary" onClick={onOpenDiscovery} style={{ marginTop: '6px' }}>
            <Radio size={16} /> Scan Local Subnet for Cameras
          </button>
        )}
      </div>
    );
  }

  // Determine grid template columns based on layout choice and mobile screen
  let gridStyle = {
    display: 'grid',
    gap: isMobile ? '12px' : '16px',
    padding: isMobile ? '10px 8px' : '16px',
    width: '100%'
  };

  if (isMobile || layout === '1x1') {
    gridStyle.gridTemplateColumns = '1fr';
  } else if (layout === '2x2') {
    gridStyle.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  } else if (layout === '3x3') {
    gridStyle.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
  } else {
    // Auto responsive desktop
    gridStyle.gridTemplateColumns = 'repeat(auto-fit, minmax(440px, 1fr))';
  }

  return (
    <div style={gridStyle}>
      {cameras.map((camera) => (
        <CameraTile
          key={camera.id}
          camera={camera}
          telemetry={telemetryMap[camera.id]}
          isAdmin={isAdmin}
          onContextMenu={onContextMenu}
          onTakeSnapshot={onTakeSnapshot}
          onOpenTelemetry={onOpenTelemetry}
          onOpenZones={onOpenZones}
          onOpenAiSettings={onOpenAiSettings}
        />
      ))}
    </div>
  );
}

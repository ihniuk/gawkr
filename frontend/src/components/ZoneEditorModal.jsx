import React, { useState, useRef, useEffect } from 'react';
import { Crosshair, X, Save, RotateCcw, Trash2, RefreshCw, Video, Camera as CameraIcon, AlertCircle, Check } from 'lucide-react';
import { api } from '../api/client';

export default function ZoneEditorModal({ camera, onClose, onSaveSuccess }) {
  const existingZone = camera.settings?.zones?.[0];
  const [points, setPoints] = useState(
    existingZone?.points || [
      [0.1, 0.4],
      [0.85, 0.4],
      [0.95, 0.95],
      [0.05, 0.95]
    ]
  );
  const [zoneName, setZoneName] = useState(existingZone?.name || "Entry Tripwire");
  const [isSaving, setIsSaving] = useState(false);
  const [streamTicket, setStreamTicket] = useState('');
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [isLoadingFrame, setIsLoadingFrame] = useState(true);
  const [frameMode, setFrameMode] = useState('snapshot'); // 'snapshot' or 'live'
  const [streamError, setStreamError] = useState(false);
  const canvasRef = useRef(null);
  const activeBlobUrlRef = useRef(null);

  const loadCameraFeed = async () => {
    setIsLoadingFrame(true);
    setStreamError(false);

    // 1. Fetch pristine snapshot frame directly from camera worker
    try {
      const snapUrl = await api.captureSnapshot(camera.id);
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
      activeBlobUrlRef.current = snapUrl;
      setSnapshotUrl(snapUrl);
    } catch (e) {
      console.warn("Could not capture direct snapshot:", e);
    }

    // 2. Fetch stream ticket for live stream mode
    try {
      const res = await api.getStreamTicket(camera.id);
      if (res && res.ticket) {
        setStreamTicket(res.ticket);
      }
    } catch (e) {
      console.warn("Could not fetch stream ticket:", e);
    } finally {
      setIsLoadingFrame(false);
    }
  };

  useEffect(() => {
    loadCameraFeed();
    return () => {
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, [camera.id]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    if (points.length >= 10) {
      alert("Maximum 10 polygon vertices supported per zone.");
      return;
    }
    setPoints([...points, [Number(x.toFixed(3)), Number(y.toFixed(3))]]);
  };

  const handleUndo = () => {
    if (points.length > 0) {
      setPoints(points.slice(0, -1));
    }
  };

  const handleReset = () => {
    setPoints([]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedSettings = {
        ...camera.settings,
        zones: [
          {
            id: existingZone?.id || `zone_${Date.now()}`,
            name: zoneName.trim() || "Detection Zone",
            points: points.length >= 3 ? points : [],
            color: '#10b981',
            enabled: true,
            classes: ['person', 'car']
          }
        ]
      };
      const updated = await api.updateCamera(camera.id, { settings: updatedSettings });
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      alert(err.message || "Failed to save zone");
    } finally {
      setIsSaving(false);
    }
  };

  // Draw overlay polygon on HTML canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(points[0][0] * w, points[0][1] * h);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] * w, points[i][1] * h);
      }
      if (points.length >= 3) {
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fill();
      }

      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Draw vertices circles
      points.forEach(([px, py], index) => {
        ctx.beginPath();
        ctx.arc(px * w, py * h, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`P${index + 1}`, px * w + 8, py * h - 8);
      });
    }
  }, [points]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Crosshair size={22} color="var(--accent-emerald)" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI Detection Zone & Tripwire Editor</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Click anywhere on the camera frame to place polygon points. Events only trigger inside this boundary.
              </p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {/* View Mode & Frame Refresh Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          padding: '6px 10px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '4px' }}>Feed Source:</span>
            <button
              type="button"
              className="btn-glass"
              style={{
                fontSize: '0.74rem',
                padding: '4px 9px',
                background: frameMode === 'snapshot' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                borderColor: frameMode === 'snapshot' ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.1)',
                color: frameMode === 'snapshot' ? '#38bdf8' : 'var(--text-muted)'
              }}
              onClick={() => setFrameMode('snapshot')}
            >
              <CameraIcon size={12} /> Still Snapshot
            </button>
            <button
              type="button"
              className="btn-glass"
              style={{
                fontSize: '0.74rem',
                padding: '4px 9px',
                background: frameMode === 'live' ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                borderColor: frameMode === 'live' ? 'var(--accent-emerald)' : 'rgba(255, 255, 255, 0.1)',
                color: frameMode === 'live' ? '#10b981' : 'var(--text-muted)'
              }}
              onClick={() => {
                setFrameMode('live');
                setStreamError(false);
              }}
            >
              <Video size={12} /> Live Stream
            </button>
          </div>

          <button
            type="button"
            className="btn-glass"
            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
            onClick={loadCameraFeed}
            disabled={isLoadingFrame}
            title="Capture new camera frame"
          >
            <RefreshCw size={12} className={isLoadingFrame ? "spin" : ""} /> Refresh Frame
          </button>
        </div>

        {/* Live Canvas View */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: '10px',
          overflow: 'hidden',
          backgroundColor: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          marginBottom: '16px'
        }}>
          {/* Background Camera Feed (Live or Snapshot) */}
          {frameMode === 'live' && streamTicket && !streamError ? (
            <img
              src={`/api/cameras/${camera.id}/stream?ticket=${streamTicket}`}
              alt={camera.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={() => {
                console.warn("Live stream failed, falling back to snapshot");
                setStreamError(true);
              }}
            />
          ) : snapshotUrl ? (
            <img
              src={snapshotUrl}
              alt={camera.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              gap: '10px',
              color: 'var(--text-muted)'
            }}>
              {isLoadingFrame ? (
                <>
                  <RefreshCw size={28} className="spin" color="var(--accent-cyan)" />
                  <span style={{ fontSize: '0.82rem' }}>Loading camera frame...</span>
                </>
              ) : (
                <>
                  <AlertCircle size={28} color="#f43f5e" />
                  <span style={{ fontSize: '0.82rem' }}>Camera feed unavailable.</span>
                  <button className="btn-glass" onClick={loadCameraFeed} style={{ fontSize: '0.74rem', padding: '4px 10px' }}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </>
              )}
            </div>
          )}

          {/* Interactive HTML5 Drawing Canvas Layer */}
          <canvas
            ref={canvasRef}
            width={720}
            height={405}
            onClick={handleCanvasClick}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: 'crosshair',
              zIndex: 10
            }}
          />
        </div>

        {/* Zone Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Zone Name:</label>
            <input
              type="text"
              className="glass-input"
              style={{ maxWidth: '220px' }}
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
            />
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ({points.length} points placed)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn-glass" onClick={handleUndo} disabled={points.length === 0} title="Undo last vertex">
              <RotateCcw size={14} /> Undo Point
            </button>
            <button className="btn-glass" onClick={handleReset} disabled={points.length === 0} title="Clear all points">
              <Trash2 size={14} color="#f43f5e" /> Clear
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>
              <Save size={14} /> {isSaving ? 'Saving...' : 'Save Zone'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

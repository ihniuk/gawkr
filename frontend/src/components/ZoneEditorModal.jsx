import React, { useState, useRef, useEffect } from 'react';
import { Crosshair, X, Save, RotateCcw, Check, Layers } from 'lucide-react';
import { api } from '../api/client';

export default function ZoneEditorModal({ camera, onClose, onSaveSuccess }) {
  const [points, setPoints] = useState(
    camera.settings?.zones?.[0]?.points || [
      [0.1, 0.4],
      [0.85, 0.4],
      [0.95, 0.95],
      [0.05, 0.95]
    ]
  );
  const [zoneName, setZoneName] = useState(camera.settings?.zones?.[0]?.name || "Entry Tripwire");
  const [isSaving, setIsSaving] = useState(false);
  const [streamTicket, setStreamTicket] = useState('');
  const canvasRef = useRef(null);

  useEffect(() => {
    api.getStreamTicket(camera.id).then(res => {
      if (res && res.ticket) setStreamTicket(res.ticket);
    }).catch(console.error);
  }, [camera.id]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    if (points.length >= 8) {
      alert("Maximum 8 polygon vertices supported per zone.");
      return;
    }
    setPoints([...points, [Number(x.toFixed(3)), Number(y.toFixed(3))]]);
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
            id: camera.settings?.zones?.[0]?.id || `zone_${Date.now()}`,
            name: zoneName,
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
        ctx.font = '10px monospace';
        ctx.fillText(`P${index + 1}`, px * w + 8, py * h - 8);
      });
    }
  }, [points]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Crosshair size={20} color="var(--accent-emerald)" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI Detection Zone & Tripwire Editor</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Click anywhere on the camera frame to place polygon points. Events only trigger inside this boundary.
              </p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {/* Live Canvas View */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: '10px',
          overflow: 'hidden',
          backgroundColor: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          marginBottom: '16px'
        }}>
          {streamTicket && (
            <img
              src={`/api/cameras/${camera.id}/stream?ticket=${streamTicket}`}
              alt={camera.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
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
              cursor: 'crosshair'
            }}
          />
        </div>

        {/* Zone Controls */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
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

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-glass" onClick={handleReset}>
              <RotateCcw size={14} /> Clear Points
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

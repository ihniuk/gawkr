import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, Plus, Trash2, Eye, EyeOff, Check, AlertCircle,
  RotateCcw, Sparkles, Layers, Sliders, Lock
} from 'lucide-react';
import { api } from '../api/client';

export default function ZoneEditor({ camera, zones, onChange }) {
  const [snapshotUrl, setSnapshotUrl] = useState(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [newPoints, setNewPoints] = useState([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState('include'); // 'include', 'exclude', 'privacy_mask'
  const svgRef = useRef(null);

  useEffect(() => {
    loadSnapshot();
  }, [camera.id]);

  const loadSnapshot = async () => {
    setIsLoadingSnapshot(true);
    try {
      const url = await api.captureSnapshot(camera.id);
      setSnapshotUrl(url);
    } catch (e) {
      console.warn("Could not load pristine snapshot, falling back to stream url", e);
    } finally {
      setIsLoadingSnapshot(false);
    }
  };

  const handleSvgClick = (e) => {
    if (!isDrawing) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setNewPoints([...newPoints, [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]]);
  };

  const startNewZone = (type = 'include') => {
    setIsDrawing(true);
    setNewZoneType(type);
    setNewPoints([]);
    setNewZoneName(
      type === 'exclude' ? 'Road / Sidewalk' :
      type === 'privacy_mask' ? 'Privacy Mask' : 'Front Driveway'
    );
  };

  const cancelDrawing = () => {
    setIsDrawing(false);
    setNewPoints([]);
  };

  const undoLastPoint = () => {
    if (newPoints.length > 0) {
      setNewPoints(newPoints.slice(0, -1));
    }
  };

  const finishZone = () => {
    if (newPoints.length < 3) return;
    const color = (
      newZoneType === 'exclude' ? '#f59e0b' :
      newZoneType === 'privacy_mask' ? '#64748b' : '#10b981'
    );

    const newZone = {
      id: `zone_${Date.now().toString(36)}`,
      name: newZoneName.trim() || (newZoneType === 'exclude' ? 'Exclusion Zone' : 'Detection Zone'),
      points: newPoints,
      color,
      classes: ['person', 'car'],
      enabled: true,
      zone_type: newZoneType
    };

    onChange([...zones, newZone]);
    setIsDrawing(false);
    setNewPoints([]);
    setActiveZoneId(newZone.id);
  };

  const deleteZone = (zoneId) => {
    onChange(zones.filter(z => z.id !== zoneId));
    if (activeZoneId === zoneId) setActiveZoneId(null);
  };

  const toggleZone = (zoneId) => {
    onChange(zones.map(z => z.id === zoneId ? { ...z, enabled: !z.enabled } : z));
  };

  const pointsToSvgPath = (pts) => {
    if (!pts || pts.length === 0) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0] * 1000} ${p[1] * 1000}`).join(' ') + ' Z';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Instructions & Quick Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.03)',
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Layers size={14} color="var(--accent-cyan)" />
            <span>Interactive Point-and-Click Detection Zones</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {isDrawing
              ? 'Click anywhere on the snapshot below to plot zone boundary vertices (min 3 points)'
              : 'Define active monitoring areas, ignore high-traffic roads, or black out privacy areas'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {!isDrawing ? (
            <>
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '5px 10px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
                onClick={() => startNewZone('include')}
              >
                <Plus size={13} /> + Detection Zone
              </button>
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '5px 10px', borderColor: 'rgba(245, 158, 11, 0.4)', color: '#f59e0b' }}
                onClick={() => startNewZone('exclude')}
              >
                <Plus size={13} /> + Exclusion Zone
              </button>
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '5px 10px', borderColor: 'rgba(148, 163, 184, 0.4)', color: '#94a3b8' }}
                onClick={() => startNewZone('privacy_mask')}
              >
                <Lock size={12} /> + Privacy Mask
              </button>
            </>
          ) : (
            <>
              <input
                type="text"
                className="glass-input"
                style={{ width: '140px', padding: '4px 8px', fontSize: '0.74rem' }}
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="Zone Name"
              />
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '5px 9px' }}
                onClick={undoLastPoint}
                disabled={newPoints.length === 0}
                title="Undo point"
              >
                <RotateCcw size={13} /> Undo
              </button>
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '5px 9px', color: '#f43f5e' }}
                onClick={cancelDrawing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '0.74rem', padding: '5px 12px' }}
                onClick={finishZone}
                disabled={newPoints.length < 3}
              >
                <Check size={13} /> Finish Zone ({newPoints.length} pts)
              </button>
            </>
          )}
        </div>
      </div>

      {/* Interactive Visual Canvas Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: '#070a13',
        borderRadius: '10px',
        overflow: 'hidden',
        border: isDrawing ? '2px dashed var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.1)',
        cursor: isDrawing ? 'crosshair' : 'default',
        userSelect: 'none'
      }}>
        {/* Background snapshot */}
        {snapshotUrl ? (
          <img
            src={snapshotUrl}
            alt="Camera Snapshot"
            style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.9 }}
          />
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            color: 'var(--text-dim)',
            gap: '8px'
          }}>
            <Shield size={36} opacity={0.3} />
            <span style={{ fontSize: '0.8rem' }}>{isLoadingSnapshot ? 'Capturing camera frame...' : 'Snapshot Preview Canvas'}</span>
          </div>
        )}

        {/* SVG Drawing Layer (normalized 1000x1000) */}
        <svg
          ref={svgRef}
          onClick={handleSvgClick}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 10
          }}
        >
          {/* Render existing zones */}
          {zones.map((zone) => {
            if (!zone.points || zone.points.length < 3) return null;
            const isExclude = zone.zone_type === 'exclude';
            const isPrivacy = zone.zone_type === 'privacy_mask';
            const isSelected = activeZoneId === zone.id;

            const strokeColor = isPrivacy ? '#475569' : isExclude ? '#f59e0b' : (zone.color || '#10b981');
            const fillColor = isPrivacy ? 'rgba(15, 17, 23, 0.92)' : isExclude ? 'rgba(245, 158, 11, 0.22)' : 'rgba(16, 185, 129, 0.2)';

            // Centroid for label
            const avgX = (zone.points.reduce((acc, p) => acc + p[0], 0) / zone.points.length) * 1000;
            const avgY = (zone.points.reduce((acc, p) => acc + p[1], 0) / zone.points.length) * 1000;

            return (
              <g key={zone.id} onClick={(e) => { e.stopPropagation(); setActiveZoneId(zone.id); }} style={{ cursor: 'pointer' }}>
                <path
                  d={pointsToSvgPath(zone.points)}
                  fill={zone.enabled ? fillColor : 'rgba(100, 100, 100, 0.08)'}
                  stroke={zone.enabled ? strokeColor : '#555'}
                  strokeWidth={isSelected ? '4' : '2'}
                  strokeDasharray={zone.enabled ? 'none' : '6 6'}
                />
                {/* Vertex handles */}
                {zone.points.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p[0] * 1000}
                    cy={p[1] * 1000}
                    r={isSelected ? 6 : 4}
                    fill={strokeColor}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                ))}
                {/* Zone Label Badge */}
                <text
                  x={avgX}
                  y={avgY}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="24"
                  fontWeight="bold"
                  fontFamily="sans-serif"
                  style={{
                    filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.9))',
                    pointerEvents: 'none'
                  }}
                >
                  {isPrivacy ? '🔒 PRIVACY MASK' : isExclude ? `🚫 ${zone.name}` : `🎯 ${zone.name}`}
                </text>
              </g>
            );
          })}

          {/* Render in-progress polygon being drawn */}
          {isDrawing && newPoints.length > 0 && (
            <g>
              {newPoints.length >= 3 && (
                <path
                  d={pointsToSvgPath(newPoints)}
                  fill={newZoneType === 'privacy_mask' ? 'rgba(15, 17, 23, 0.85)' : newZoneType === 'exclude' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(6, 182, 212, 0.25)'}
                  stroke={newZoneType === 'privacy_mask' ? '#94a3b8' : newZoneType === 'exclude' ? '#f59e0b' : '#06b6d4'}
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              )}
              {/* Lines between in-progress points */}
              {newPoints.map((p, i) => {
                if (i === 0) return null;
                const prev = newPoints[i - 1];
                return (
                  <line
                    key={i}
                    x1={prev[0] * 1000}
                    y1={prev[1] * 1000}
                    x2={p[0] * 1000}
                    y2={p[1] * 1000}
                    stroke="#38bdf8"
                    strokeWidth="2.5"
                  />
                );
              })}
              {/* Points */}
              {newPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p[0] * 1000}
                  cy={p[1] * 1000}
                  r="6"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              ))}
            </g>
          )}
        </svg>

        {/* Drawing Hint HUD */}
        {isDrawing && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 15, 28, 0.85)',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: '4px 14px',
            fontSize: '0.72rem',
            color: '#38bdf8',
            zIndex: 20,
            pointerEvents: 'none'
          }}>
            {newPoints.length === 0
              ? 'Click anywhere on frame to place 1st point'
              : newPoints.length < 3
              ? `Plotted ${newPoints.length} points (need at least 3)`
              : `Plotted ${newPoints.length} points — click "Finish Zone" to save`}
          </div>
        )}
      </div>

      {/* Configured Zones Card List */}
      <div>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>
          CONFIGURED ZONES ({zones.length})
        </div>

        {zones.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
            fontSize: '0.76rem',
            color: 'var(--text-dim)'
          }}>
            No custom zones defined. The camera monitors the entire camera frame.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
            {zones.map((zone) => {
              const isExclude = zone.zone_type === 'exclude';
              const isPrivacy = zone.zone_type === 'privacy_mask';
              const isSelected = activeZoneId === zone.id;

              return (
                <div
                  key={zone.id}
                  onClick={() => setActiveZoneId(zone.id)}
                  className="glass-card"
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid var(--accent-cyan)' : '1px solid rgba(255, 255, 255, 0.06)',
                    background: isSelected ? 'rgba(6, 182, 212, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: isPrivacy ? '#64748b' : isExclude ? '#f59e0b' : (zone.color || '#10b981')
                    }} />
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>{zone.name}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                        {isPrivacy ? 'Privacy Mask (Blackout)' : isExclude ? 'Exclusion (Ignore alerts)' : 'Detection Zone (Include)'} • {zone.points?.length || 0} pts
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      className="btn-glass"
                      style={{ padding: '4px', color: zone.enabled ? '#10b981' : 'var(--text-dim)' }}
                      onClick={(e) => { e.stopPropagation(); toggleZone(zone.id); }}
                      title={zone.enabled ? 'Zone Active' : 'Zone Muted'}
                    >
                      {zone.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      type="button"
                      className="btn-glass"
                      style={{ padding: '4px', color: '#f43f5e' }}
                      onClick={(e) => { e.stopPropagation(); deleteZone(zone.id); }}
                      title="Delete Zone"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

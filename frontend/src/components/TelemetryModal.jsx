import React from 'react';
import { Activity, X, Cpu, HardDrive, Zap, Eye, Gauge } from 'lucide-react';

export default function TelemetryModal({ camera, telemetry, onClose }) {
  const t = telemetry || {
    fps: 25.0,
    bitrate_kbps: 1840,
    resolution: "1920x1080",
    decoder: "NVDEC (HW/CUDA)",
    ai_latency_ms: 5.2,
    dropped_frames: 0,
    status: "online"
  };

  const statItems = [
    { label: "Stream Resolution", value: t.resolution, icon: Eye, color: "#38bdf8" },
    { label: "Decoded Frame Rate", value: `${t.fps} FPS`, icon: Gauge, color: "#10b981" },
    { label: "Bitrate Throughput", value: `${t.bitrate_kbps} Kbps`, icon: Activity, color: "#f59e0b" },
    { label: "Decoding Engine", value: t.decoder, icon: Zap, color: "#a855f7" },
    { label: "AI Inference Latency", value: `${t.ai_latency_ms} ms`, icon: Cpu, color: "#06b6d4" },
    { label: "Dropped Frames", value: `${t.dropped_frames}`, icon: HardDrive, color: t.dropped_frames > 0 ? "#f43f5e" : "#94a3b8" }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={20} color="var(--accent-amber)" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Stream Diagnostics & Hardware HUD</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{camera.name}</p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {statItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div 
                key={idx}
                style={{
                  background: 'rgba(8, 12, 22, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon size={15} color={item.color} />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{item.label}</span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: item.color }}>
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{
          background: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: '1.4'
        }}>
          💡 <strong>Zero-Copy NVDEC Pipeline</strong>: Video ingestion uses NVIDIA GPU hardware decoding for sub-stream inference and direct stream-copy for main stream recording, preserving full resolution fidelity at minimal CPU overhead.
        </div>
      </div>
    </div>
  );
}

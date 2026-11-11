import React, { useState, useEffect } from 'react';
import { Timer, X, Play, Square, Trash2, Film, Clock, Sparkles } from 'lucide-react';
import { api } from '../api/client';

export default function TimelapseModal({ camera, telemetry, onClose, onStatusChange }) {
  const isActive = Boolean(telemetry?.timelapse_active);

  const [intervalSeconds, setIntervalSeconds] = useState(10);
  const [outputFps, setOutputFps] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [title, setTitle] = useState(`${camera.name} Time-Lapse`);

  const [statusData, setStatusData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await api.getTimelapseStatus(camera.id);
        if (active) setStatusData(res);
      } catch (e) {}
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [camera.id, isActive]);

  const handleStart = async (e) => {
    if (e) e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.startTimelapse(camera.id, {
        interval_seconds: Math.max(1, Number(intervalSeconds) || 10),
        output_fps: Number(outputFps) || 30,
        duration_minutes: Number(durationMinutes) || 0,
        title: title.trim() || `${camera.name} Time-Lapse`
      });
      setStatusData(res);
      if (onStatusChange) onStatusChange(camera.id, res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to start time-lapse');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStop = async (compile = true) => {
    if (!compile && !window.confirm('Discard all captured time-lapse frames without creating a video?')) {
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.stopTimelapse(camera.id, compile);
      setStatusData(res);
      if (onStatusChange) onStatusChange(camera.id, res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to stop time-lapse');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Output preview metrics for 1 hour of real-time capture
  const safeInterval = Math.max(1, Number(intervalSeconds) || 10);
  const framesPerHour = Math.floor(3600 / safeInterval);
  const clipSecondsPerHour = (framesPerHour / Math.max(1, outputFps)).toFixed(1);

  const activeFlag = statusData ? statusData.active : isActive;
  const activeFrames = statusData?.frame_count ?? telemetry?.timelapse_frames ?? 0;
  const activeElapsed = statusData?.elapsed_seconds ?? 0;

  const formatElapsed = (sec) => {
    const s = Math.floor(sec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="glass-panel modal-container"
        style={{
          maxWidth: '520px',
          width: '94vw',
          padding: '24px',
          borderRadius: '16px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(168, 85, 247, 0.2)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Timer size={18} color="#c084fc" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>
                {activeFlag ? 'Active Time-Lapse Session' : 'Start Camera Time-Lapse'}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {camera.name} • High-Resolution H.264 Capture
              </div>
            </div>
          </div>
          <button className="btn-glass modal-close" onClick={onClose} style={{ padding: '6px', borderRadius: '8px' }}>
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            fontSize: '0.8rem',
            marginBottom: '14px'
          }}>
            {errorMsg}
          </div>
        )}

        {activeFlag ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              background: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.28)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#e9d5ff' }}>
                  {statusData?.title || telemetry?.timelapse_title || `${camera.name} Time-Lapse`}
                </span>
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  background: 'rgba(168, 85, 247, 0.25)',
                  color: '#d8b4fe',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  ● CAPTURING
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '4px' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Frames</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#fff' }}>
                    {activeFrames}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Interval</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                    {statusData?.interval_seconds ?? telemetry?.timelapse_interval ?? 10}s
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Elapsed</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#c084fc' }}>
                    {formatElapsed(activeElapsed)}
                  </div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Stopping and compiling will stitch all captured frames into a smooth MP4 clip and save it directly to <strong>Review Clips &amp; Timeline</strong>.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                className="btn-glass"
                disabled={isSubmitting}
                onClick={() => handleStop(false)}
                style={{ color: '#fb7185', borderColor: 'rgba(244, 63, 94, 0.3)', padding: '9px 14px', fontSize: '0.82rem' }}
              >
                <Trash2 size={14} /> Discard
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={isSubmitting}
                onClick={() => handleStop(true)}
                style={{ padding: '9px 18px', fontSize: '0.84rem', fontWeight: 700 }}
              >
                <Square size={14} /> {isSubmitting ? 'Stopping...' : 'Stop & Compile MP4'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleStart} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Label */}
            <div>
              <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                TIME-LAPSE TITLE
              </label>
              <input
                type="text"
                className="glass-input"
                style={{ width: '100%', padding: '9px 12px', fontSize: '0.84rem' }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${camera.name} Time-Lapse`}
              />
            </div>

            {/* Capture Interval */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  CAPTURE INTERVAL (1 FRAME EVERY)
                </label>
                <span style={{ fontSize: '0.74rem', fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                  {safeInterval}s
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {[
                  { label: '5s', val: 5 },
                  { label: '10s', val: 10 },
                  { label: '30s', val: 30 },
                  { label: '1m', val: 60 },
                  { label: '5m', val: 300 },
                  { label: '15m', val: 900 }
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    className="btn-glass"
                    onClick={() => setIntervalSeconds(opt.val)}
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      background: Number(intervalSeconds) === opt.val ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                      borderColor: Number(intervalSeconds) === opt.val ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                      color: Number(intervalSeconds) === opt.val ? 'var(--accent-cyan)' : 'var(--text-muted)'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={86400}
                  className="glass-input"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(e.target.value)}
                  style={{ width: '74px', padding: '4px 8px', fontSize: '0.76rem', textAlign: 'center' }}
                  title="Custom interval in seconds"
                />
              </div>
            </div>

            {/* Playback FPS & Auto-Stop Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  PLAYBACK SPEED
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[24, 30, 60].map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      className="btn-glass"
                      onClick={() => setOutputFps(fps)}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        justifyContent: 'center',
                        background: outputFps === fps ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                        borderColor: outputFps === fps ? '#c084fc' : 'rgba(255,255,255,0.1)',
                        color: outputFps === fps ? '#e9d5ff' : 'var(--text-muted)'
                      }}
                    >
                      {fps} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  AUTO-STOP LIMIT
                </label>
                <select
                  className="glass-input"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px 10px', fontSize: '0.78rem' }}
                >
                  <option value={0}>Manual Stop (Unlimited)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={240}>4 Hours</option>
                  <option value={720}>12 Hours</option>
                  <option value={1440}>24 Hours</option>
                </select>
              </div>
            </div>

            {/* Preview Estimate */}
            <div style={{
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.22)',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.76rem',
              color: 'var(--text-muted)'
            }}>
              <Sparkles size={15} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
              <span>
                1 hour of capture at <strong>{safeInterval}s</strong> intervals yields <strong>{framesPerHour} frames</strong> &rarr; <strong>{clipSecondsPerHour}s</strong> MP4 clip at {outputFps} FPS.
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
              <button type="button" className="btn-glass" onClick={onClose} style={{ padding: '9px 14px', fontSize: '0.82rem' }}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting}
                style={{ padding: '9px 18px', fontSize: '0.84rem', fontWeight: 700 }}
              >
                <Play size={14} /> {isSubmitting ? 'Starting...' : 'Start Time-Lapse'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

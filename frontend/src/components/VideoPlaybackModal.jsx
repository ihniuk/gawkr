import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Play, Download, Camera, Film, Clock, 
  ShieldCheck, AlertCircle, RefreshCw, Volume2, VolumeX 
} from 'lucide-react';
import { api } from '../api/client';

export default function VideoPlaybackModal({ event: initialEvent, onClose }) {
  const [currentEvent, setCurrentEvent] = useState(initialEvent);
  const [activeTab, setActiveTab] = useState(initialEvent?.video_clip_url ? 'video' : 'snapshot');
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isMuted, setIsMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [isWaitingForClip, setIsWaitingForClip] = useState(!initialEvent?.video_clip_url);
  const pollTimerRef = useRef(null);

  // Sync and auto-resolve clip URL when parent event changes
  useEffect(() => {
    if (initialEvent) {
      setVideoError(false);
      const expectedClipUrl = initialEvent.video_clip_url || `/api/recordings/${initialEvent.camera_id}_${initialEvent.id}.mp4`;
      
      // Check if clip file is already ready on disk
      fetch(expectedClipUrl, { method: 'HEAD' })
        .then(res => {
          if (res.ok) {
            setCurrentEvent({ ...initialEvent, video_clip_url: expectedClipUrl });
            setIsWaitingForClip(false);
            setActiveTab('video');
          } else {
            setCurrentEvent(initialEvent);
            setIsWaitingForClip(true);
          }
        })
        .catch(() => {
          setCurrentEvent(initialEvent);
          setIsWaitingForClip(true);
        });
    }
  }, [initialEvent?.id, initialEvent?.video_clip_url]);

  // If clip is not ready yet, poll for it every 1.5 seconds (up to 12s)
  useEffect(() => {
    if (isWaitingForClip && currentEvent) {
      const expectedClipUrl = `/api/recordings/${currentEvent.camera_id}_${currentEvent.id}.mp4`;
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts += 1;
        if (attempts > 8) {
          clearInterval(interval);
          setIsWaitingForClip(false);
          return;
        }
        try {
          const res = await fetch(expectedClipUrl, { method: 'HEAD' });
          if (res.ok) {
            setCurrentEvent(prev => ({ ...prev, video_clip_url: expectedClipUrl }));
            setIsWaitingForClip(false);
            setVideoError(false);
            setActiveTab('video');
            clearInterval(interval);
          }
        } catch (e) {
          // ignore poll error
        }
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [currentEvent?.id, isWaitingForClip]);

  if (!currentEvent) return null;

  const timeStr = new Date(currentEvent.timestamp * 1000).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    const video = document.getElementById('event-video-player');
    if (video) video.playbackRate = speed;
  };

  const toggleMute = () => {
    const video = document.getElementById('event-video-player');
    if (video) {
      video.muted = !video.muted;
      setIsMuted(video.muted);
    }
  };

  const handleRetryVideo = () => {
    setVideoError(false);
    const video = document.getElementById('event-video-player');
    if (video) {
      video.load();
      video.play().catch(() => {});
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px', padding: '20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>AI Event Playback & Inspection</h3>
              <span className="hud-chip" style={{ color: 'var(--accent-cyan)' }}>{currentEvent.camera_name}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={12} /> {timeStr}
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {/* Media Switcher Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            className="btn-glass"
            style={{
              padding: '6px 14px',
              backgroundColor: activeTab === 'video' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              borderColor: activeTab === 'video' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
              color: activeTab === 'video' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('video')}
          >
            <Film size={14} /> Recorded H.264 Clip {currentEvent.video_clip_url ? '✓' : ''}
          </button>
          <button
            className="btn-glass"
            style={{
              padding: '6px 14px',
              backgroundColor: activeTab === 'snapshot' ? 'rgba(6, 182, 212, 0.2)' : 'transparent',
              borderColor: activeTab === 'snapshot' ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
              color: activeTab === 'snapshot' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => setActiveTab('snapshot')}
          >
            <Camera size={14} /> High-Res Snapshot
          </button>
        </div>

        {/* Media Screen Container */}
        <div style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: '#030712',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.7)',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {activeTab === 'video' ? (
            currentEvent.video_clip_url && !videoError ? (
              <video
                key={`${currentEvent.id}_${currentEvent.video_clip_url}`}
                id="event-video-player"
                src={currentEvent.video_clip_url}
                controls
                autoPlay
                muted={isMuted}
                playsInline
                preload="auto"
                onError={(e) => {
                  console.error('Video error:', e);
                  setVideoError(true);
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : isWaitingForClip ? (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <RefreshCw size={28} className="animate-spin" color="var(--accent-cyan)" />
                <span style={{ fontSize: '0.88rem', color: '#fff' }}>
                  Processing & Encoding H.264 Video Clip...
                </span>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', maxWidth: '380px' }}>
                  Capturing post-roll frames from stream and finalizing MP4. Will begin playback automatically in a few seconds.
                </span>
                <button className="btn-glass" onClick={() => setActiveTab('snapshot')} style={{ marginTop: '6px' }}>
                  <Camera size={14} /> View Snapshot While Waiting
                </button>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-muted)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px'
              }}>
                <AlertCircle size={32} color="var(--accent-amber)" />
                <span style={{ fontSize: '0.88rem', color: '#fff' }}>
                  {videoError ? 'Video clip playback error or file still finalizing.' : 'Clip recording was not enabled for this event.'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {videoError && (
                    <button className="btn-primary" onClick={handleRetryVideo} style={{ fontSize: '0.78rem' }}>
                      <RefreshCw size={13} /> Retry Video
                    </button>
                  )}
                  <button className="btn-glass" onClick={() => setActiveTab('snapshot')}>
                    <Camera size={14} /> View High-Res Snapshot
                  </button>
                </div>
              </div>
            )
          ) : (
            <img
              src={currentEvent.snapshot_url}
              alt="Event Frame"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </div>

        {/* AI Vision Intelligence Analysis Box */}
        {currentEvent.ai_description && (
          <div style={{
            background: 'rgba(168, 85, 247, 0.1)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(168, 85, 247, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ShieldCheck size={18} color="#d8b4fe" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#d8b4fe' }}>AI Vision Enhancement Summary:</span>
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: currentEvent.threat_level === 'Threat' ? '#ef4444' : currentEvent.threat_level === 'Suspicious' ? '#f59e0b' : '#10b981',
                  color: '#fff'
                }}>
                  {currentEvent.threat_level?.toUpperCase() || 'SAFE'}
                </span>
              </div>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-main)', margin: 0, lineHeight: '1.4' }}>
                "{currentEvent.ai_description}"
              </p>
            </div>
          </div>
        )}

        {/* Video Speed Controls & Details Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'rgba(8, 12, 22, 0.5)',
          padding: '12px 14px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {/* Detected Objects Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Classified Targets:</span>
            {currentEvent.objects?.map((obj, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: obj.label === 'person' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                  color: obj.label === 'person' ? '#38bdf8' : '#fbbf24',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}
              >
                {obj.label.toUpperCase()} {Math.round(obj.confidence * 100)}%
              </span>
            ))}
          </div>

          {/* Action & Speed Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeTab === 'video' && currentEvent.video_clip_url && (
              <>
                <button
                  className="btn-glass"
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                  style={{ padding: '6px', border: 'none' }}
                >
                  {isMuted ? <VolumeX size={15} color="var(--text-muted)" /> : <Volume2 size={15} color="var(--accent-cyan)" />}
                </button>

                <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px' }}>
                  {[0.5, 1.0, 2.0].map(s => (
                    <button
                      key={s}
                      className="btn-glass"
                      style={{
                        padding: '3px 7px',
                        fontSize: '0.72rem',
                        border: 'none',
                        background: playbackSpeed === s ? 'rgba(6, 182, 212, 0.3)' : 'transparent',
                        color: playbackSpeed === s ? '#38bdf8' : 'var(--text-muted)'
                      }}
                      onClick={() => handleSpeedChange(s)}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </>
            )}

            {currentEvent.video_clip_url && (
              <a
                href={currentEvent.video_clip_url}
                download={`clip_${currentEvent.camera_name}_${currentEvent.id}.mp4`}
                className="btn-glass"
                style={{ textDecoration: 'none', fontSize: '0.76rem', padding: '6px 12px' }}
              >
                <Download size={13} /> Save MP4
              </a>
            )}
            <a
              href={currentEvent.snapshot_url}
              download={`snapshot_${currentEvent.camera_name}_${currentEvent.id}.jpg`}
              className="btn-glass"
              style={{ textDecoration: 'none', fontSize: '0.76rem', padding: '6px 12px' }}
            >
              <Download size={13} /> Save JPEG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

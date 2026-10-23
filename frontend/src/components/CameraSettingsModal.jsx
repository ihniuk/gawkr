import React, { useState, useEffect } from 'react';
import { 
  Settings, X, Save, Cpu, Disc, Video, 
  Layers, CheckCircle, AlertTriangle, Play, RefreshCw, 
  Sliders, Shield, Lock, Radio, Zap, Monitor, Activity, Check
} from 'lucide-react';
import { api } from '../api/client';
import ZoneEditor from './ZoneEditor';

export default function CameraSettingsModal({ camera, onClose, onSaveSuccess }) {
  const [activeTab, setActiveTab] = useState('streams'); // 'streams', 'ai', 'zones', 'recording'

  // Network & Stream state
  const [name, setName] = useState(camera.name);
  const [ip, setIp] = useState(camera.ip || '');
  const [port, setPort] = useState(camera.port || 554);
  const [username, setUsername] = useState(camera.username || '');
  const [password, setPassword] = useState('');
  const [mainStreamUrl, setMainStreamUrl] = useState(camera.main_stream_url || '');
  const [subStreamUrl, setSubStreamUrl] = useState(camera.sub_stream_url || '');
  
  // Stream probing & profile discovery
  const [discoveredStreams, setDiscoveredStreams] = useState([]);
  const [isProbingStreams, setIsProbingStreams] = useState(false);
  const [probeMessage, setProbeMessage] = useState('');
  const [showManualInputs, setShowManualInputs] = useState(false);

  // Stream live test state
  const [testingStreamUrl, setTestingStreamUrl] = useState(null);
  const [streamTestFeedback, setStreamTestFeedback] = useState({});

  // AI Settings
  const [useGlobal, setUseGlobal] = useState(camera.settings?.use_global_threshold ?? true);
  const [confidence, setConfidence] = useState(camera.settings?.confidence_threshold || 0.50);
  const [globalThreshold, setGlobalThreshold] = useState(0.50);
  const [cooldown, setCooldown] = useState(camera.settings?.alert_cooldown_seconds || 45);
  const [minFrames, setMinFrames] = useState(camera.settings?.min_confirmation_frames || 4);
  const [aiEnabled, setAiEnabled] = useState(camera.settings?.ai_enabled ?? true);
  const [recordingMode, setRecordingMode] = useState(camera.settings?.recording_mode || 'ai_event');
  const [enabledClasses, setEnabledClasses] = useState(
    camera.settings?.enabled_classes || ['person', 'car', 'motorcycle', 'dog', 'cat']
  );

  // Hardware Acceleration & Codec Settings
  const [hwAccelBackend, setHwAccelBackend] = useState(camera.settings?.hw_accel_backend || 'auto');
  const [encodingPreset, setEncodingPreset] = useState(camera.settings?.encoding_preset || 'ultrafast');
  const [encodingCrf, setEncodingCrf] = useState(camera.settings?.encoding_crf ?? 26);
  const [hwCaps, setHwCaps] = useState(null);

  useEffect(() => {
    api.getHardwareCapabilities()
      .then(data => setHwCaps(data))
      .catch(err => console.warn('Could not fetch hardware capabilities:', err));

    api.getSettings()
      .then(res => {
        const g = res.settings?.detection?.global_confidence_threshold;
        if (g !== undefined) setGlobalThreshold(g);
      })
      .catch(() => {});
  }, []);

  // Zones & Privacy Masks
  const [zones, setZones] = useState(camera.settings?.zones || []);
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Probes streams from camera on demand
  const handleProbeStreams = async () => {
    setIsProbingStreams(true);
    setProbeMessage('');
    setErrorMsg('');
    try {
      const res = await api.verifyCredentials({
        ip: ip || camera.ip,
        onvif_port: camera.onvif_port || 80,
        rtsp_port: Number(port) || 554,
        username: username || camera.username,
        password: password || camera.password
      });

      if (res && res.success && res.profiles && res.profiles.length > 0) {
        setDiscoveredStreams(res.profiles);
        setProbeMessage(`Discovered ${res.profiles.length} verified stream profiles from ${res.vendor || 'camera'}!`);
      } else {
        setDiscoveredStreams([]);
        setErrorMsg(res?.message || 'Authentication failed: Incorrect username or password.');
      }
    } catch (err) {
      setProbeMessage(`Probe failed: ${err.message || 'Check IP or camera credentials'}`);
    } finally {
      setIsProbingStreams(false);
    }
  };

  const handleTestStream = async (url) => {
    if (!url) return;
    setTestingStreamUrl(url);
    try {
      const res = await api.testStream(url);
      setStreamTestFeedback(prev => ({
        ...prev,
        [url]: { success: res.success, message: res.message, resolution: res.resolution, fps: res.fps }
      }));
    } catch (err) {
      setStreamTestFeedback(prev => ({
        ...prev,
        [url]: { success: false, message: err.message || 'Connection failed' }
      }));
    } finally {
      setTestingStreamUrl(null);
    }
  };

  const toggleClass = (cls) => {
    if (enabledClasses.includes(cls)) {
      setEnabledClasses(enabledClasses.filter(c => c !== cls));
    } else {
      setEnabledClasses([...enabledClasses, cls]);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMsg('');
    try {
      const updateData = {
        name,
        ip,
        port: Number(port),
        username,
        main_stream_url: mainStreamUrl,
        sub_stream_url: subStreamUrl,
        settings: {
          ...camera.settings,
          confidence_threshold: Number(confidence),
          use_global_threshold: useGlobal,
          alert_cooldown_seconds: Number(cooldown),
          min_confirmation_frames: Number(minFrames),
          ai_enabled: aiEnabled,
          recording_mode: recordingMode,
          enabled_classes: enabledClasses,
          zones: zones,
          hw_accel_backend: hwAccelBackend,
          video_encoder: hwAccelBackend === 'cpu' ? 'libx264' : (hwAccelBackend === 'nvdec' ? 'h264_nvenc' : (hwAccelBackend === 'qsv' ? 'h264_qsv' : 'auto')),
          encoding_preset: encodingPreset,
          encoding_crf: Number(encodingCrf),
          use_hw_accel: hwAccelBackend !== 'cpu'
        }
      };
      if (password) {
        updateData.password = password;
      }
      const updated = await api.updateCamera(camera.id, updateData);
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update camera');
    } finally {
      setIsSaving(false);
    }
  };

  const allClasses = ['person', 'car', 'motorcycle', 'bus', 'truck', 'dog', 'cat', 'bicycle'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '820px', width: '95%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} color="var(--accent-cyan)" />
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Camera Configuration</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{camera.name} ({camera.ip || 'Virtual'})</p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: '10px',
          marginBottom: '16px',
          overflowX: 'auto'
        }}>
          {[
            { id: 'streams', label: 'Streams & Network', icon: Video, color: 'var(--accent-cyan)' },
            { id: 'codecs', label: 'Hardware & Codecs', icon: Zap, color: '#f59e0b' },
            { id: 'ai', label: 'AI & Sensitivity', icon: Cpu, color: '#a855f7' },
            { id: 'recording', label: 'Recording Profile', icon: Disc, color: '#f43f5e' },
            { id: 'zones', label: `Zones & Privacy (${zones.length})`, icon: Layers, color: '#10b981' }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="btn-glass"
                style={{
                  padding: '7px 14px',
                  fontSize: '0.78rem',
                  fontWeight: isActive ? 700 : 500,
                  background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  borderColor: isActive ? tab.color : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon size={14} color={isActive ? tab.color : 'currentColor'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={15} /> {errorMsg}
          </div>
        )}

        {/* TAB 1: Streams & Network */}
        {activeTab === 'streams' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Video size={14} /> STREAM PROFILES & RTSP ASSIGNMENT
              </div>
              
              <button
                type="button"
                className="btn-glass"
                style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                onClick={handleProbeStreams}
                disabled={isProbingStreams}
                title="Query ONVIF & RTSP profiles from this camera"
              >
                <RefreshCw size={11} className={isProbingStreams ? 'animate-spin' : ''} />
                <span>{isProbingStreams ? 'Querying Camera...' : 'List Available Streams'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '8px' }}>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Camera Name</label>
                <input type="text" className="glass-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>IP Address</label>
                <input type="text" className="glass-input" value={ip} onChange={(e) => setIp(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>RTSP Port</label>
                <input type="number" className="glass-input" value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Username</label>
                <input type="text" className="glass-input" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Update Password (optional)</label>
                <input type="password" className="glass-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>

            {probeMessage && (
              <div style={{
                background: 'rgba(6, 182, 212, 0.1)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: '7px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                color: 'var(--accent-cyan)',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle size={14} /> {probeMessage}
              </div>
            )}

            {/* Discovered Selectable Stream Cards */}
            {discoveredStreams.length > 0 && (
              <div style={{
                background: 'rgba(8, 12, 22, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={13} color="var(--accent-cyan)" />
                  <span>Detected Streams (Click to Assign to Main or Sub Pipeline):</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {discoveredStreams.map((prof, idx) => {
                    const isMain = mainStreamUrl === prof.rtsp_url;
                    const isSub = subStreamUrl === prof.rtsp_url;
                    const isTesting = testingStreamUrl === prof.rtsp_url;
                    const testResult = streamTestFeedback[prof.rtsp_url];

                    return (
                      <div
                        key={prof.token || idx}
                        className="glass-card"
                        style={{
                          borderRadius: '8px',
                          padding: '9px 12px',
                          border: (isMain || isSub) ? '1px solid rgba(6, 182, 212, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                          background: (isMain && isSub) ? 'rgba(6, 182, 212, 0.12)' : isMain ? 'rgba(6, 182, 212, 0.08)' : isSub ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff' }}>{prof.name}</span>
                            <span className="hud-chip" style={{ fontSize: '0.64rem', padding: '1px 5px', color: 'var(--accent-cyan)' }}>
                              {prof.resolution}
                            </span>
                            <span style={{ fontSize: '0.62rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                              {prof.encoding}
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '4px' }}>
                            {isMain && (
                              <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                background: 'rgba(6, 182, 212, 0.25)',
                                color: 'var(--accent-cyan)',
                                border: '1px solid rgba(6, 182, 212, 0.4)',
                                padding: '1px 5px',
                                borderRadius: '4px'
                              }}>
                                ● MAIN
                              </span>
                            )}
                            {isSub && (
                              <span style={{
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                fontFamily: 'var(--font-mono)',
                                background: 'rgba(16, 185, 129, 0.25)',
                                color: 'var(--accent-emerald)',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                padding: '1px 5px',
                                borderRadius: '4px'
                              }}>
                                ● SUB
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.7rem',
                          color: 'var(--text-dim)',
                          background: 'rgba(4, 7, 14, 0.6)',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          marginBottom: '6px',
                          wordBreak: 'break-all'
                        }}>
                          {prof.rtsp_url.replace(/:([^:@]+)@/, ':••••@')}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn-glass"
                              style={{
                                fontSize: '0.72rem',
                                padding: '3px 8px',
                                color: isMain ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                borderColor: isMain ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)'
                              }}
                              onClick={() => setMainStreamUrl(prof.rtsp_url)}
                            >
                              {isMain ? '✓ Active Main (4K/HD)' : 'Set as Main'}
                            </button>

                            <button
                              type="button"
                              className="btn-glass"
                              style={{
                                fontSize: '0.72rem',
                                padding: '3px 8px',
                                color: isSub ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                borderColor: isSub ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.08)'
                              }}
                              onClick={() => setSubStreamUrl(prof.rtsp_url)}
                            >
                              {isSub ? '✓ Active Sub (Fast AI)' : 'Set as Sub'}
                            </button>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {testResult && (
                              <span style={{
                                fontSize: '0.7rem',
                                color: testResult.success ? '#10b981' : '#f43f5e',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}>
                                {testResult.success ? `✓ Decoded: ${testResult.resolution} @ ${testResult.fps}fps` : `✕ ${testResult.message}`}
                              </span>
                            )}

                            <button
                              type="button"
                              className="btn-glass"
                              style={{ fontSize: '0.7rem', padding: '3px 7px' }}
                              onClick={() => handleTestStream(prof.rtsp_url)}
                              disabled={isTesting}
                              title="Test stream frame decoding"
                            >
                              <Play size={10} className={isTesting ? 'animate-spin' : ''} />
                              <span>{isTesting ? 'Testing...' : 'Test Stream'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual RTSP URLs Drawer */}
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                className="btn-glass"
                style={{ fontSize: '0.74rem', padding: '3px 8px', color: 'var(--text-muted)' }}
                onClick={() => setShowManualInputs(!showManualInputs)}
              >
                {showManualInputs ? '▾ Hide Manual Stream URLs' : '▸ Edit Stream URLs Manually'}
              </button>

              {showManualInputs && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      Main Stream RTSP URL (High-Res Snapshot & Recording)
                    </label>
                    <input
                      type="text"
                      className="glass-input"
                      value={mainStreamUrl}
                      onChange={(e) => setMainStreamUrl(e.target.value)}
                      placeholder="rtsp://admin:pass@ip:554/stream1"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>
                      Sub Stream RTSP URL (Low-Latency Matrix & AI Inference)
                    </label>
                    <input
                      type="text"
                      className="glass-input"
                      value={subStreamUrl}
                      onChange={(e) => setSubStreamUrl(e.target.value)}
                      placeholder="rtsp://admin:pass@ip:554/stream2"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Hardware Acceleration & Codecs */}
        {activeTab === 'codecs' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={14} /> HARDWARE ACCELERATION & ENCODING ENGINE
              </div>
              {hwCaps?.nvidia?.available ? (
                <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <Check size={12} /> {hwCaps.nvidia.name} Detected
                </span>
              ) : (
                <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(6, 182, 212, 0.1)', padding: '3px 8px', borderRadius: '4px', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                  <Cpu size={12} /> CPU Software Encoding Ready ({hwCaps?.cpu?.cores || 4} Cores)
                </span>
              )}
            </div>

            {/* Hardware Selection Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              {[
                {
                  id: 'auto',
                  title: 'Auto-Detect',
                  subtitle: 'Recommended',
                  desc: 'Uses NVIDIA / Intel GPU acceleration if present, with automatic fallback to CPU software.',
                  icon: Zap,
                  accentColor: '#f59e0b',
                  badge: hwCaps?.nvidia?.available ? 'GPU Accelerated' : 'CPU Software Mode',
                  active: hwAccelBackend === 'auto'
                },
                {
                  id: 'cpu',
                  title: 'CPU Only',
                  subtitle: 'Software libx264',
                  desc: 'Pure software encoding using CPU cores. Zero GPU dependency, perfectly suited for non-NVIDIA systems.',
                  icon: Cpu,
                  accentColor: 'var(--accent-cyan)',
                  badge: `${hwCaps?.cpu?.cores || 4} Host Cores`,
                  active: hwAccelBackend === 'cpu'
                },
                {
                  id: 'nvdec',
                  title: 'NVIDIA GPU',
                  subtitle: 'NVENC / NVDEC',
                  desc: hwCaps?.nvidia?.available 
                    ? `Hardware accelerated pipeline using ${hwCaps.nvidia.name}.`
                    : 'NVIDIA hardware acceleration. (Notice: No NVIDIA GPU detected on this host).',
                  icon: Shield,
                  accentColor: '#10b981',
                  badge: hwCaps?.nvidia?.available ? 'Ready & Available' : 'GPU Not Found',
                  active: hwAccelBackend === 'nvdec'
                },
                {
                  id: 'qsv',
                  title: 'Intel QuickSync',
                  subtitle: 'QSV Engine',
                  desc: 'Hardware offload for Intel Core / Arc iGPUs and CPUs supporting QuickSync Video.',
                  icon: Video,
                  accentColor: '#6366f1',
                  badge: hwCaps?.ffmpeg?.has_qsv ? 'QSV Ready' : 'Intel iGPU Mode',
                  active: hwAccelBackend === 'qsv'
                }
              ].map(engine => {
                const IconComponent = engine.icon;
                const isSelected = engine.active;
                return (
                  <div
                    key={engine.id}
                    onClick={() => setHwAccelBackend(engine.id)}
                    style={{
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? `2px solid ${engine.accentColor}` : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '10px',
                      padding: '14px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '6px',
                            background: isSelected ? engine.accentColor : 'rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isSelected ? '#000' : 'var(--text-muted)'
                          }}>
                            <IconComponent size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-main)' }}>
                              {engine.title}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {engine.subtitle}
                            </div>
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: engine.accentColor }} />
                        )}
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: '10px' }}>
                        {engine.desc}
                      </p>
                    </div>
                    <div style={{
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? engine.accentColor : 'var(--text-dim)',
                      alignSelf: 'flex-start'
                    }}>
                      {engine.badge}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Performance Preset & Quality CRF Sliders */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Encoding Performance Preset
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>
                    {encodingPreset.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'ultrafast', label: 'Ultrafast', desc: 'Lowest CPU overhead' },
                    { id: 'veryfast', label: 'Very Fast', desc: 'Recommended balance' },
                    { id: 'fast', label: 'Fast', desc: 'Higher compression' },
                    { id: 'medium', label: 'Medium', desc: 'Maximum compression' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn-glass"
                      onClick={() => setEncodingPreset(p.id)}
                      style={{
                        padding: '8px',
                        fontSize: '0.72rem',
                        flexDirection: 'column',
                        gap: '2px',
                        textAlign: 'center',
                        background: encodingPreset === p.id ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        borderColor: encodingPreset === p.id ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.08)',
                        color: encodingPreset === p.id ? '#fff' : 'var(--text-muted)'
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{p.label}</span>
                      <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>{p.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Video Clip Quality (CRF: Constant Rate Factor)
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#f59e0b', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    CRF {encodingCrf} {encodingCrf <= 22 ? '(Crisp/High Bitrate)' : (encodingCrf <= 27 ? '(Optimal Balanced)' : '(High Compression)')}
                  </span>
                </div>
                <input
                  type="range"
                  min="18"
                  max="32"
                  step="1"
                  value={encodingCrf}
                  onChange={(e) => setEncodingCrf(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#f59e0b' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  <span>18 (Highest Quality / Larger Files)</span>
                  <span>26 (Sweet Spot)</span>
                  <span>32 (Smallest Size / Lower Quality)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: AI & Sensitivity */}
        {activeTab === 'ai' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a855f7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Cpu size={14} /> ONNX REAL-TIME INFERENCE ENGINE
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', color: '#fff' }}>
                <span>Enable AI Analysis</span>
                <input 
                  type="checkbox" 
                  checked={aiEnabled} 
                  onChange={(e) => setAiEnabled(e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: '#a855f7' }}
                />
              </label>
            </div>

            {/* AI Alert Threshold Strategy: Global vs Custom */}
            <div style={{ marginBottom: '14px', background: 'rgba(255, 255, 255, 0.02)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sliders size={13} color="var(--accent-cyan)" />
                    <span>AI Detection Threshold Policy</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Choose whether this camera follows system global sensitivity or a custom threshold.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn-glass"
                    style={{
                      fontSize: '0.72rem',
                      padding: '4px 10px',
                      background: useGlobal ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                      color: useGlobal ? 'var(--accent-cyan)' : 'var(--text-muted)',
                      borderColor: useGlobal ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                      fontWeight: useGlobal ? 700 : 500
                    }}
                    onClick={() => setUseGlobal(true)}
                  >
                    ● Use Global ({Math.round(globalThreshold * 100)}%)
                  </button>
                  <button
                    type="button"
                    className="btn-glass"
                    style={{
                      fontSize: '0.72rem',
                      padding: '4px 10px',
                      background: !useGlobal ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                      color: !useGlobal ? '#c084fc' : 'var(--text-muted)',
                      borderColor: !useGlobal ? '#a855f7' : 'rgba(255,255,255,0.08)',
                      fontWeight: !useGlobal ? 700 : 500
                    }}
                    onClick={() => setUseGlobal(false)}
                  >
                    Custom Camera Threshold
                  </button>
                </div>
              </div>

              {useGlobal ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '10px 12px', background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    Active policy: <b style={{ color: 'var(--accent-cyan)' }}>Inheriting Global System Threshold ({Math.round(globalThreshold * 100)}%)</b>.
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Configured in Control Panel</span>
                </div>
              ) : (
                <div style={{ paddingTop: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Camera Individual Threshold:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: '#c084fc', fontWeight: 700 }}>
                      {Math.round(confidence * 100)}% {confidence <= 0.40 ? '(High Sensitivity)' : (confidence >= 0.70 ? '(Strict Filter)' : '(Balanced)')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.20"
                    max="0.95"
                    step="0.05"
                    value={confidence}
                    onChange={(e) => setConfidence(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#a855f7' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    <span>20% (Ultra Sensitive, catches faint / distant activity)</span>
                    <span>50% (Standard)</span>
                    <span>95% (Maximum Precision, requires direct view)</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Alert Cooldown</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{cooldown}s</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="180"
                  step="5"
                  value={cooldown}
                  onChange={(e) => setCooldown(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#38bdf8' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Prevents repetitive spam notifications</span>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Persistence Filter</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: '#10b981' }}>{minFrames} frames</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="10"
                  step="1"
                  value={minFrames}
                  onChange={(e) => setMinFrames(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#10b981' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Rejects single-frame glitches & shadows</span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Target Identification Classes
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {allClasses.map(cls => (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => toggleClass(cls)}
                    className="btn-glass"
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      backgroundColor: enabledClasses.includes(cls) ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.03)',
                      borderColor: enabledClasses.includes(cls) ? '#a855f7' : 'rgba(255,255,255,0.08)',
                      color: enabledClasses.includes(cls) ? '#f3e8ff' : 'var(--text-muted)'
                    }}
                  >
                    {enabledClasses.includes(cls) ? '✓ ' : '+ '}{cls.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Detection Zones & Privacy Canvas */}
        {activeTab === 'zones' && (
          <div style={{ marginBottom: '18px' }}>
            <ZoneEditor
              camera={camera}
              zones={zones}
              onChange={setZones}
            />
          </div>
        )}

        {/* TAB 4: Recording Profile */}
        {activeTab === 'recording' && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f43f5e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Disc size={14} /> STORAGE RECORDING POLICY
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
              {[
                { id: 'ai_event', label: 'AI Event Only', desc: 'Captures pre-roll + post-roll clip only when person/car is confirmed' },
                { id: 'continuous', label: 'Continuous 24/7', desc: 'Continuous rolling circular buffer with automated FIFO retention' },
                { id: 'disabled', label: 'Disabled', desc: 'Live monitoring only, no video clip or event snapshot storage' }
              ].map(m => (
                <div
                  key={m.id}
                  onClick={() => setRecordingMode(m.id)}
                  style={{
                    background: recordingMode === m.id ? 'rgba(244, 63, 94, 0.18)' : 'rgba(255,255,255,0.03)',
                    border: recordingMode === m.id ? '1px solid #f43f5e' : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    padding: '12px',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.84rem', color: recordingMode === m.id ? '#fda4af' : 'var(--text-main)' }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.3 }}>
                    {m.desc}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Note: Global retention days and storage limits are configured in the <strong>Control Panel</strong>. The background retention worker automatically purges footage to prevent disk overflow.
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Changes to streams will hot-restart ingestion automatically.
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-glass" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={handleSave} disabled={isSaving}>
              <Save size={15} /> {isSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

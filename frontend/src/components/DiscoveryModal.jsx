import React, { useState } from 'react';
import { 
  Radio, X, CheckCircle, AlertTriangle, ShieldCheck, 
  Video, Eye, Plus, Server, Sparkles, KeyRound, 
  Layers, Film, Cpu, Disc, Check, Play, RefreshCw, Sliders
} from 'lucide-react';
import { api } from '../api/client';

export default function DiscoveryModal({ onClose, onCameraAdded }) {
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [hasScanned, setHasScanned] = useState(false);
  
  // Selected device verification state
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [cameraName, setCameraName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Selected streams to choose from
  const [selectedMainStream, setSelectedMainStream] = useState('');
  const [selectedSubStream, setSelectedSubStream] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Stream testing state
  const [testingStreamUrl, setTestingStreamUrl] = useState(null);
  const [streamTestFeedback, setStreamTestFeedback] = useState({});

  const handleScan = async () => {
    setIsScanning(true);
    setErrorMsg('');
    try {
      const res = await api.scanNetwork();
      setDiscoveredDevices(res.devices || []);
      setHasScanned(true);
    } catch (err) {
      setErrorMsg(err.message || 'Scan failed. Ensure network permits local broadcast.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDevice = (dev) => {
    setSelectedDevice(dev);
    setCameraName(`${dev.vendor} (${dev.ip})`);
    setVerifyResult(null);
    setSelectedMainStream('');
    setSelectedSubStream('');
    setStreamTestFeedback({});
    setErrorMsg('');
  };

  const handleVerify = async () => {
    if (!selectedDevice) return;
    setIsVerifying(true);
    setErrorMsg('');
    try {
      const res = await api.verifyCredentials({
        ip: selectedDevice.ip,
        onvif_port: selectedDevice.onvif_port || 80,
        rtsp_port: selectedDevice.rtsp_port || 554,
        username,
        password
      });

      if (!res.success) {
        setErrorMsg(res.message || 'Authentication failed: Incorrect username or password.');
        setVerifyResult(null);
        setSelectedMainStream('');
        setSelectedSubStream('');
        return;
      }

      setVerifyResult(res);
      setSelectedMainStream(res.suggested_main_url || res.profiles?.[0]?.rtsp_url || '');
      setSelectedSubStream(res.suggested_sub_url || res.profiles?.[1]?.rtsp_url || res.profiles?.[0]?.rtsp_url || '');
    } catch (err) {
      setErrorMsg(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
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

  const handleAddCamera = async () => {
    if (!selectedDevice || !verifyResult) return;
    try {
      const newCam = await api.createCamera({
        name: cameraName || `${selectedDevice.vendor} Camera`,
        ip: selectedDevice.ip,
        port: selectedDevice.rtsp_port || 554,
        onvif_port: selectedDevice.onvif_port || 80,
        username,
        password,
        main_stream_url: selectedMainStream || verifyResult.suggested_main_url,
        sub_stream_url: selectedSubStream || verifyResult.suggested_sub_url,
        vendor: verifyResult.vendor || selectedDevice.vendor,
        model: verifyResult.model || selectedDevice.model,
        is_simulation: false
      });
      onCameraAdded(newCam);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to add camera');
    }
  };

  const handleAddDemoCamera = async () => {
    try {
      const demoCam = await api.createCamera({
        name: `High-Speed AI Camera ${Math.floor(Math.random() * 90 + 10)}`,
        ip: "192.168.1.188",
        port: 554,
        onvif_port: 80,
        username: "admin",
        password: "••••",
        main_stream_url: "rtsp://192.168.1.188:554/live/ch0",
        sub_stream_url: "rtsp://192.168.1.188:554/live/ch1",
        vendor: "Axis Communications",
        model: "M3058-PLVE Panoramic",
        is_simulation: true
      });
      onCameraAdded(demoCam);
      onClose();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.15)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Radio size={20} color="var(--accent-cyan)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Local Network Camera Discovery</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Point-and-click ONVIF & RTSP detection with stream profile selection
              </p>
            </div>
          </div>
          <button className="btn-glass" onClick={onClose} style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            color: '#fb7185',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.82rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={16} /> {errorMsg}
          </div>
        )}

        {/* Scan Controls */}
        <div style={{
          background: 'rgba(8, 12, 22, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px' }}>
              Broadcast ONVIF Probe & LAN Sweep
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Probes UDP 3702, SSDP multicast and local RTSP 554 ports
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={handleScan} disabled={isScanning}>
              <Radio size={15} className={isScanning ? 'animate-spin' : ''} />
              {isScanning ? 'Scanning Subnet...' : 'Scan Network'}
            </button>
            <button className="btn-glass" onClick={handleAddDemoCamera} title="Add virtual test feed">
              <Sparkles size={14} color="#a855f7" /> Test Feed
            </button>
          </div>
        </div>

        {/* Radar Animation during scan */}
        {isScanning && (
          <div style={{
            height: '140px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
          }}>
            <div className="radar-ring" />
            <div className="radar-ring" style={{ animationDelay: '0.7s' }} />
            <div className="radar-ring" style={{ animationDelay: '1.4s' }} />
            <Radio size={28} color="var(--accent-cyan)" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '12px' }}>
              Scanning local network interfaces...
            </span>
          </div>
        )}

        {/* Results List */}
        {!isScanning && hasScanned && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              DISCOVERED CAMERAS ({discoveredDevices.length})
            </div>

            {discoveredDevices.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '24px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '8px',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                No hardware cameras found on current LAN broadcast. You can add a simulated camera or manual RTSP stream below.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {discoveredDevices.map((dev) => (
                  <div
                    key={dev.ip}
                    onClick={() => handleSelectDevice(dev)}
                    style={{
                      background: selectedDevice?.ip === dev.ip ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: selectedDevice?.ip === dev.ip ? '1px solid var(--accent-cyan)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Video size={18} color="var(--accent-cyan)" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{dev.ip}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {dev.vendor} • RTSP Port {dev.rtsp_port} • ONVIF Port {dev.onvif_port}
                        </div>
                      </div>
                    </div>
                    <span className="btn-glass" style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                      Select & Login
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Credential Verification Form for Selected Device */}
        {selectedDevice && (
          <div style={{
            background: 'rgba(8, 12, 22, 0.7)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            marginTop: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <KeyRound size={16} color="var(--accent-cyan)" />
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                Verify Camera Login & Query Streams for {selectedDevice.ip}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Camera Username
                </label>
                <input
                  type="text"
                  className="glass-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Camera Password
                </label>
                <input
                  type="password"
                  className="glass-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              className="btn-glass"
              style={{ width: '100%', justifyContent: 'center', marginBottom: '14px' }}
              onClick={handleVerify}
              disabled={isVerifying}
            >
              <ShieldCheck size={15} color="var(--accent-cyan)" />
              {isVerifying ? 'Probing Streams & Authentication...' : 'Verify Login & List Available Streams'}
            </button>

            {/* Stream Profiles Selection Section */}
            {verifyResult && (
              <div style={{
                background: 'rgba(10, 16, 28, 0.85)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                {/* Status banner */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontWeight: 700, fontSize: '0.88rem' }}>
                    <CheckCircle size={16} /> {verifyResult.message}
                  </div>
                  <span className="hud-chip" style={{ color: 'var(--accent-cyan)', fontSize: '0.72rem' }}>
                    {verifyResult.profiles?.length || 0} Streams Discovered
                  </span>
                </div>

                {/* Stream Profile Cards List */}
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} color="var(--accent-cyan)" />
                    <span>Selectable Camera Streams:</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '2px' }}>
                    {verifyResult.profiles?.map((prof, idx) => {
                      const isMain = selectedMainStream === prof.rtsp_url;
                      const isSub = selectedSubStream === prof.rtsp_url;
                      const isTesting = testingStreamUrl === prof.rtsp_url;
                      const testResult = streamTestFeedback[prof.rtsp_url];

                      return (
                        <div
                          key={prof.token || idx}
                          className="glass-card"
                          style={{
                            borderRadius: '8px',
                            padding: '10px 12px',
                            border: (isMain || isSub) ? '1px solid rgba(6, 182, 212, 0.45)' : '1px solid rgba(255, 255, 255, 0.08)',
                            background: (isMain && isSub) ? 'rgba(6, 182, 212, 0.12)' : isMain ? 'rgba(6, 182, 212, 0.09)' : isSub ? 'rgba(16, 185, 129, 0.09)' : 'rgba(255, 255, 255, 0.02)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{prof.name}</span>
                                <span className="hud-chip" style={{ fontSize: '0.66rem', color: 'var(--accent-cyan)' }}>
                                  {prof.resolution}
                                </span>
                                <span style={{ fontSize: '0.64rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                                  {prof.encoding}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {prof.description}
                              </div>
                            </div>

                            {/* Active Assignment Badges */}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {isMain && (
                                <span style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(6, 182, 212, 0.25)',
                                  color: 'var(--accent-cyan)',
                                  border: '1px solid rgba(6, 182, 212, 0.4)',
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  ● MAIN (REC)
                                </span>
                              )}
                              {isSub && (
                                <span style={{
                                  fontSize: '0.66rem',
                                  fontWeight: 700,
                                  fontFamily: 'var(--font-mono)',
                                  background: 'rgba(16, 185, 129, 0.25)',
                                  color: 'var(--accent-emerald)',
                                  border: '1px solid rgba(16, 185, 129, 0.4)',
                                  padding: '2px 6px',
                                  borderRadius: '4px'
                                }}>
                                  ● SUB (AI)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* URL Text */}
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.72rem',
                            color: 'var(--text-dim)',
                            background: 'rgba(4, 7, 14, 0.6)',
                            padding: '4px 8px',
                            borderRadius: '5px',
                            marginBottom: '8px',
                            wordBreak: 'break-all'
                          }}>
                            {prof.rtsp_url.replace(/:([^:@]+)@/, ':••••@')}
                          </div>

                          {/* Action Buttons: Choose for Main / Choose for Sub / Test */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                className="btn-glass"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  background: isMain ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                                  borderColor: isMain ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                                  color: isMain ? 'var(--accent-cyan)' : 'var(--text-muted)'
                                }}
                                onClick={() => setSelectedMainStream(prof.rtsp_url)}
                              >
                                <Disc size={11} color={isMain ? "var(--accent-cyan)" : "currentColor"} />
                                <span>{isMain ? 'Active Main Stream' : 'Use as Main Stream'}</span>
                              </button>

                              <button
                                className="btn-glass"
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '0.72rem',
                                  background: isSub ? 'rgba(16, 185, 129, 0.25)' : 'transparent',
                                  borderColor: isSub ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.1)',
                                  color: isSub ? 'var(--accent-emerald)' : 'var(--text-muted)'
                                }}
                                onClick={() => setSelectedSubStream(prof.rtsp_url)}
                              >
                                <Cpu size={11} color={isSub ? "var(--accent-emerald)" : "currentColor"} />
                                <span>{isSub ? 'Active Sub Stream' : 'Use as Sub Stream'}</span>
                              </button>
                            </div>

                            <button
                              className="btn-glass"
                              style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                              onClick={() => handleTestStream(prof.rtsp_url)}
                              disabled={isTesting}
                              title="Test RTSP Frame Decoding"
                            >
                              <Play size={10} className={isTesting ? 'animate-spin' : ''} />
                              <span>{isTesting ? 'Testing...' : 'Test Stream'}</span>
                            </button>
                          </div>

                          {/* Stream test feedback */}
                          {testResult && (
                            <div style={{
                              marginTop: '6px',
                              fontSize: '0.72rem',
                              color: testResult.success ? '#34d399' : '#fb7185',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              {testResult.success ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                              <span>{testResult.message}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pipeline Assignment Configuration & Custom Edit */}
                <div style={{
                  background: 'rgba(6, 182, 212, 0.05)',
                  border: '1px solid rgba(6, 182, 212, 0.2)',
                  borderRadius: '8px',
                  padding: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Sliders size={14} color="var(--accent-cyan)" />
                      <span>Assigned Stream Pipeline:</span>
                    </div>

                    <button
                      className="btn-glass"
                      style={{ padding: '2px 8px', fontSize: '0.7rem', border: 'none' }}
                      onClick={() => setIsCustomMode(!isCustomMode)}
                    >
                      {isCustomMode ? 'Hide Custom Inputs' : 'Edit Stream URLs Manually'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                        1. Main Stream (High-Fidelity 4K/1080p Recording & Snapshots):
                      </label>
                      <input
                        type="text"
                        className="glass-input"
                        style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}
                        value={selectedMainStream}
                        onChange={(e) => setSelectedMainStream(e.target.value)}
                        placeholder="rtsp://admin:pass@ip:554/Streaming/Channels/101"
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                        2. Sub Stream (Sub-300ms Low-Latency for AI Inference & Matrix):
                      </label>
                      <input
                        type="text"
                        className="glass-input"
                        style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}
                        value={selectedSubStream}
                        onChange={(e) => setSelectedSubStream(e.target.value)}
                        placeholder="rtsp://admin:pass@ip:554/Streaming/Channels/102"
                      />
                    </div>
                  </div>
                </div>

                {/* Display Name & Add Button */}
                <div>
                  <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px' }}>
                    Surveillance Matrix Display Name:
                  </label>
                  <input
                    type="text"
                    className="glass-input"
                    value={cameraName}
                    onChange={(e) => setCameraName(e.target.value)}
                    style={{ marginBottom: '10px' }}
                  />

                  <button
                    className="btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={handleAddCamera}
                  >
                    <Plus size={16} /> Add to Surveillance Matrix
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

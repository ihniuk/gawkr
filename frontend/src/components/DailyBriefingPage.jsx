import React, { useState, useEffect } from 'react';
import {
  Sparkles, Shield, RefreshCw, AlertTriangle, CheckCircle,
  Clock, Camera, User, Car, Send, Layers, Calendar
} from 'lucide-react';
import { api } from '../api/client';

export default function DailyBriefingPage({ isAdmin }) {
  const [briefing, setBriefing] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dispatchStatus, setDispatchStatus] = useState('');

  useEffect(() => {
    loadBriefing();
  }, []);

  const loadBriefing = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getDailyBriefing();
      setBriefing(data);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate security briefing');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setErrorMsg('');
    try {
      const data = await api.generateDailyBriefing();
      setBriefing(data);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to synthesize briefing');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDispatchTelegram = async () => {
    if (!briefing) return;
    setDispatchStatus('Dispatching to Telegram...');
    try {
      const text = `📋 *GAWKR DAILY BRIEFING (${briefing.date})*\n\n${briefing.briefing_text}\n\n📊 *Stats:* ${briefing.stats.total_events} events • ${briefing.stats.persons} persons • ${briefing.stats.vehicles} vehicles • Status: *${briefing.stats.threat_level}*`;
      await api.testNotification('telegram', {
        bot_token: '', // Server uses saved global config if omitted
        chat_id: '',
        text
      });
      setDispatchStatus('✓ Dispatched successfully to Telegram!');
      setTimeout(() => setDispatchStatus(''), 4000);
    } catch (err) {
      setDispatchStatus(`Failed to dispatch: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
        <RefreshCw size={18} className="animate-spin" />
        <span>Synthesizing 24-Hour AI Security Intelligence...</span>
      </div>
    );
  }

  const threatColor = (
    briefing?.stats?.threat_level === 'Threat' ? '#f43f5e' :
    briefing?.stats?.threat_level === 'Suspicious' ? '#f59e0b' : '#10b981'
  );

  return (
    <div className="page-container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
      {/* Title Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={18} color="#c084fc" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                Daily AI Security Briefing
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={12} /> {briefing?.date} • Last {briefing?.period_hours || 24} Hours
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-glass"
            onClick={handleDispatchTelegram}
            title="Dispatch briefing to Telegram"
            style={{ fontSize: '0.8rem' }}
          >
            <Send size={14} color="#38bdf8" /> Dispatch to Telegram
          </button>
          {isAdmin && (
            <button
              className="btn-primary"
              onClick={handleRefresh}
              disabled={isRefreshing}
              style={{ fontSize: '0.8rem' }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              <span>{isRefreshing ? 'Synthesizing...' : 'Re-Synthesize Digest'}</span>
            </button>
          )}
        </div>
      </div>

      {dispatchStatus && (
        <div style={{
          background: 'rgba(6, 182, 212, 0.1)',
          border: '1px solid rgba(6, 182, 212, 0.3)',
          color: 'var(--accent-cyan)',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '0.82rem',
          marginBottom: '16px'
        }}>
          {dispatchStatus}
        </div>
      )}

      {errorMsg && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          color: '#fb7185',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '0.84rem',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertTriangle size={16} /> {errorMsg}
        </div>
      )}

      {/* Security Status KPI Tiles */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '12px',
        marginBottom: '20px'
      }}>
        {/* Perimeter Verdict */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Perimeter Posture</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: threatColor,
              boxShadow: `0 0 12px ${threatColor}`
            }} />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
              {briefing?.stats?.threat_level?.toUpperCase() || 'SAFE'}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            {briefing?.stats?.threats === 0 ? 'Zero unverified perimeter breaches' : `${briefing?.stats?.threats} threat anomalies`}
          </div>
        </div>

        {/* 24h Verified Events */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Total Events Confirmed</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
            {briefing?.stats?.total_events || 0}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Across {briefing?.stats?.cameras_active || 0} active camera streams
          </div>
        </div>

        {/* Persons Logged */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Persons Detected</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <User size={18} color="#a855f7" />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#f3e8ff' }}>
              {briefing?.stats?.persons || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Visitors, deliveries, family members
          </div>
        </div>

        {/* Vehicles Logged */}
        <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Vehicles Detected</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Car size={18} color="#38bdf8" />
            <span style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: '#e0f2fe' }}>
              {briefing?.stats?.vehicles || 0}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Cars, courier vans, motorcycles
          </div>
        </div>
      </div>

      {/* Main Executive Intelligence Summary Card */}
      <div className="glass-panel" style={{
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '20px',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        background: 'linear-gradient(180deg, rgba(168, 85, 247, 0.05) 0%, rgba(6, 182, 212, 0.03) 100%)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Sparkles size={18} color="#c084fc" />
          <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#fff' }}>
            AI Executive Intelligence Synthesis
          </h3>
          <span className="hud-chip" style={{ fontSize: '0.66rem', color: 'var(--accent-cyan)' }}>
            Gemini Flash Multimodal
          </span>
        </div>

        <div style={{
          fontSize: '0.95rem',
          lineHeight: 1.6,
          color: '#e2e8f0',
          background: 'rgba(8, 12, 22, 0.55)',
          padding: '18px 20px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          fontStyle: 'normal'
        }}>
          {briefing?.briefing_text}
        </div>
      </div>

      {/* Camera Breakdown Table */}
      {briefing?.camera_breakdown && Object.keys(briefing.camera_breakdown).length > 0 && (
        <div className="glass-panel" style={{ borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={16} color="var(--accent-cyan)" />
            <span>Activity Breakdown by Camera Zone</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
            {Object.entries(briefing.camera_breakdown).map(([camName, count]) => (
              <div
                key={camName}
                className="glass-card"
                style={{
                  padding: '12px 16px',
                  borderRadius: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#fff' }}>{camName}</div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: 'rgba(6, 182, 212, 0.15)',
                  color: 'var(--accent-cyan)',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}>
                  {count} events
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

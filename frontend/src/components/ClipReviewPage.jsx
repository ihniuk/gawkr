import React, { useState, useMemo, useEffect } from 'react';
import { 
  Film, LayoutGrid, Clock, Calendar, Filter, 
  Download, Play, Trash2, Camera, Search, ChevronRight, 
  Layers, CheckCircle, Eye, RefreshCw, Sparkles, Brain
} from 'lucide-react';

export default function ClipReviewPage({
  events,
  cameras,
  isAdmin,
  onPlayEvent,
  onDeleteEvent,
  onRefreshEvents,
  onAddToMemory
}) {
  const [viewMode, setViewMode] = useState('mosaic'); // 'mosaic', 'timeline', 'list'
  const [selectedCameraId, setSelectedCameraId] = useState('all');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState('today'); // 'today', 'yesterday', 'all'
  const [hoveredEvent, setHoveredEvent] = useState(null);
  const [timelineCursor, setTimelineCursor] = useState(null);

  // Automatically refresh event metadata on page open to ensure all finalized MP4 clips are loaded
  useEffect(() => {
    if (onRefreshEvents) {
      onRefreshEvents();
    }
  }, []);

  // Filter events based on selections
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const yesterdayStart = todayStart - 86400;

    return events.filter(evt => {
      // Camera filter
      if (selectedCameraId !== 'all' && evt.camera_id !== selectedCameraId) {
        return false;
      }
      // Class filter
      if (selectedClass !== 'all') {
        const hasClass = evt.objects?.some(o => o.label.toLowerCase() === selectedClass.toLowerCase());
        if (!hasClass) return false;
      }
      // Date filter
      if (selectedDateFilter === 'today') {
        if (evt.timestamp < todayStart) return false;
      } else if (selectedDateFilter === 'yesterday') {
        if (evt.timestamp < yesterdayStart || evt.timestamp >= todayStart) return false;
      }
      return true;
    });
  }, [events, selectedCameraId, selectedClass, selectedDateFilter]);

  // Group events by date & hour for the mosaic view
  const groupedEvents = useMemo(() => {
    const groups = {};
    filteredEvents.forEach(evt => {
      const d = new Date(evt.timestamp * 1000);
      const dateKey = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      const hourKey = `${dateKey} • ${d.getHours().toString().padStart(2, '0')}:00 - ${(d.getHours() + 1).toString().padStart(2, '0')}:00`;
      
      if (!groups[hourKey]) {
        groups[hourKey] = [];
      }
      groups[hourKey].push(evt);
    });
    return groups;
  }, [filteredEvents]);

  // Timeline hours (0 to 23)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="page-container">
      {/* Top Header & Filter Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* Title */}
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Film size={22} color="var(--accent-cyan)" />
            <span>Surveillance Clip Archive</span>
            <span className="hud-chip" style={{ color: 'var(--accent-cyan)' }}>{filteredEvents.length} Clips</span>
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Browse and inspect high-fidelity H.264 video clips and AI classifications across all cameras.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div style={{
          display: 'flex',
          background: 'rgba(8, 12, 22, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '10px',
          padding: '3px',
          gap: '2px',
          width: 'auto'
        }}>
          <button
            className="btn-glass"
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '7px',
              background: viewMode === 'mosaic' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: viewMode === 'mosaic' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => setViewMode('mosaic')}
          >
            <LayoutGrid size={14} /> <span>Mosaic</span>
          </button>
          <button
            className="btn-glass"
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '7px',
              background: viewMode === 'timeline' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: viewMode === 'timeline' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => setViewMode('timeline')}
          >
            <Clock size={14} /> <span>Timeline</span>
          </button>
          <button
            className="btn-glass"
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '7px',
              background: viewMode === 'list' ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
              color: viewMode === 'list' ? 'var(--accent-cyan)' : 'var(--text-muted)'
            }}
            onClick={() => setViewMode('list')}
          >
            <Layers size={14} /> <span>List</span>
          </button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="glass-panel" style={{
        borderRadius: '12px',
        padding: '12px 14px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', flex: 1 }}>
          {/* Camera Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Camera:</span>
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="glass-input"
              style={{ width: 'auto', padding: '5px 8px', fontSize: '0.78rem' }}
            >
              <option value="all">All Cameras ({cameras.length})</option>
              {cameras.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Target Classification Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Target:</span>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="glass-input"
              style={{ width: 'auto', padding: '5px 8px', fontSize: '0.78rem' }}
            >
              <option value="all">All Targets</option>
              <option value="person">Person</option>
              <option value="car">Vehicle / Car</option>
              <option value="dog">Dog / Cat</option>
            </select>
          </div>

          {/* Date Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Period:</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'all', label: 'All' }
              ].map(d => (
                <button
                  key={d.id}
                  className="btn-glass"
                  style={{
                    padding: '4px 8px',
                    fontSize: '0.74rem',
                    background: selectedDateFilter === d.id ? 'rgba(6, 182, 212, 0.25)' : 'transparent',
                    borderColor: selectedDateFilter === d.id ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                    color: selectedDateFilter === d.id ? 'var(--accent-cyan)' : 'var(--text-muted)'
                  }}
                  onClick={() => setSelectedDateFilter(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        <button className="btn-glass" onClick={onRefreshEvents} style={{ fontSize: '0.76rem', padding: '6px 12px' }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* VIEW 1: TIMELINE VIEW */}
      {viewMode === 'timeline' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 24-Hour Scrubbing Axis Bar */}
          <div className="glass-panel" style={{ borderRadius: '14px', padding: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--accent-cyan)" />
                <span>24-Hour Activity Heatmap</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8' }} /> Person
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }} /> Vehicle
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }} /> Animal
                </span>
              </div>
            </div>

            {/* Scrollable Container for 24h Axis on Mobile */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '6px' }}>
              <div style={{ minWidth: '640px' }}>
                {/* 24h Visual Bar */}
                <div style={{
                  position: 'relative',
                  height: '56px',
                  background: 'rgba(4, 7, 14, 0.85)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  overflow: 'hidden',
                  marginBottom: '10px',
                  display: 'flex'
                }}>
                  {/* Hour Grid Columns */}
                  {hours.map(h => (
                    <div
                      key={h}
                      style={{
                        flex: 1,
                        borderRight: '1px solid rgba(255, 255, 255, 0.04)',
                        height: '100%',
                        position: 'relative'
                      }}
                    />
                  ))}

                  {/* Event Markers positioned by time of day */}
                  {filteredEvents.map(evt => {
                    const d = new Date(evt.timestamp * 1000);
                    const secondOfDay = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
                    const leftPercent = (secondOfDay / 86400) * 100;
                    const isPerson = evt.objects?.some(o => o.label === 'person');
                    const isVehicle = evt.objects?.some(o => o.label === 'car' || o.label === 'motorcycle');
                    const markerColor = isPerson ? '#38bdf8' : isVehicle ? '#fbbf24' : '#a855f7';

                    return (
                      <div
                        key={evt.id}
                        onClick={() => onPlayEvent(evt)}
                        onMouseEnter={() => setHoveredEvent(evt)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        style={{
                          position: 'absolute',
                          left: `${leftPercent}%`,
                          top: '10px',
                          bottom: '10px',
                          width: '6px',
                          borderRadius: '3px',
                          backgroundColor: markerColor,
                          cursor: 'pointer',
                          boxShadow: `0 0 10px ${markerColor}`,
                          transition: 'all 0.15s ease',
                          zIndex: hoveredEvent?.id === evt.id ? 10 : 2
                        }}
                        title={`${evt.camera_name} • ${d.toLocaleTimeString()}`}
                      />
                    );
                  })}
                </div>

                {/* Hour Labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  {hours.filter(h => h % 2 === 0).map(h => (
                    <span key={h}>{h.toString().padStart(2, '0')}:00</span>
                  ))}
                  <span>23:59</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Event Feed Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredEvents.map(evt => {
              const d = new Date(evt.timestamp * 1000);
              return (
                <div
                  key={evt.id}
                  className="glass-card"
                  style={{
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: 'pointer'
                  }}
                  onClick={() => onPlayEvent(evt)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 240px' }}>
                    <div style={{
                      width: '96px',
                      height: '58px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#040711',
                      flexShrink: 0,
                      position: 'relative'
                    }}>
                      <img
                        src={evt.snapshot_url}
                        alt="Snapshot"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: '3px',
                        right: '3px',
                        background: 'rgba(6, 182, 212, 0.85)',
                        color: '#fff',
                        fontSize: '0.6rem',
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}>
                        <Play size={8} /> PLAY
                      </div>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '2px' }}>
                        {evt.camera_name}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px' }}>
                        <span>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {d.toLocaleTimeString()}</span>
                        <span>•</span>
                        <span style={{ color: evt.video_clip_url ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                          {evt.video_clip_url ? 'MP4 Clip' : 'Snapshot'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', flex: '1 1 auto' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {evt.objects?.map((obj, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: '0.68rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: obj.label === 'person' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                            color: obj.label === 'person' ? '#38bdf8' : '#fbbf24',
                            border: '1px solid rgba(255,255,255,0.08)'
                          }}
                        >
                          {obj.label.toUpperCase()} {Math.round(obj.confidence * 100)}%
                        </span>
                      ))}
                    </div>

                    <button
                      className="btn-glass"
                      style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                      onClick={(e) => { e.stopPropagation(); onPlayEvent(evt); }}
                    >
                      <Play size={12} color="var(--accent-cyan)" /> Play
                    </button>
                    {onAddToMemory && (
                      <button
                        className="btn-glass"
                        style={{ padding: '6px 8px', color: '#d8b4fe' }}
                        title="Add this snapshot to AI Memory"
                        onClick={(e) => { e.stopPropagation(); onAddToMemory(evt); }}
                      >
                        <Brain size={13} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        className="btn-glass"
                        style={{ padding: '6px 8px' }}
                        title="Delete Clip"
                        onClick={(e) => { e.stopPropagation(); onDeleteEvent(evt.id); }}
                      >
                        <Trash2 size={13} color="#f43f5e" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: MOSAIC VIEW (Time-Grouped Cards) */}
      {viewMode === 'mosaic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
          {Object.keys(groupedEvents).length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted)',
              fontSize: '0.92rem'
            }}>
              No recorded clips match the current filters. Confirmed detection clips will appear here automatically.
            </div>
          ) : (
            Object.entries(groupedEvents).map(([hourTitle, clipList]) => (
              <div key={hourTitle}>
                {/* Time Group Heading */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
                }}>
                  <Clock size={15} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                    {hourTitle}
                  </span>
                  <span className="hud-chip" style={{ fontSize: '0.66rem', padding: '1px 5px' }}>
                    {clipList.length}
                  </span>
                </div>

                {/* Mosaic Cards Grid */}
                <div className="responsive-grid-mosaic">
                  {clipList.map(evt => {
                    const d = new Date(evt.timestamp * 1000);
                    return (
                      <div
                        key={evt.id}
                        className="glass-card"
                        style={{
                          borderRadius: '12px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => onPlayEvent(evt)}
                      >
                        {/* Video / Snapshot Preview Area */}
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '16/9',
                          backgroundColor: '#040711',
                          overflow: 'hidden'
                        }}>
                          <img
                            src={evt.snapshot_url}
                            alt="Preview"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />

                          {/* Hover Play Icon Overlay */}
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(4, 7, 14, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: 0.9,
                            transition: 'all 0.2s ease'
                          }}>
                            <div style={{
                              width: '42px',
                              height: '42px',
                              borderRadius: '50%',
                              background: 'rgba(6, 182, 212, 0.85)',
                              boxShadow: '0 0 16px rgba(6, 182, 212, 0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Play size={18} color="#ffffff" style={{ marginLeft: '2px' }} />
                            </div>
                          </div>

                          {/* Bottom Badges */}
                          <div style={{
                            position: 'absolute',
                            bottom: '8px',
                            left: '8px',
                            right: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}>
                            <span className="hud-chip" style={{ fontSize: '0.68rem', background: 'rgba(0,0,0,0.8)' }}>
                              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span style={{
                              fontSize: '0.64rem',
                              fontFamily: 'var(--font-mono)',
                              background: evt.video_clip_url ? 'rgba(6, 182, 212, 0.9)' : 'rgba(255, 255, 255, 0.12)',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 700
                            }}>
                              {evt.video_clip_url ? 'MP4 CLIP' : 'SNAPSHOT'}
                            </span>
                          </div>
                        </div>

                        {/* Card Info */}
                        <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff' }}>
                              {evt.camera_name}
                            </div>
                            {onAddToMemory && (
                              <button
                                className="btn-glass"
                                style={{ padding: '3px 6px', border: 'none', color: '#d8b4fe' }}
                                title="Add to AI Memory"
                                onClick={(e) => { e.stopPropagation(); onAddToMemory(evt); }}
                              >
                                <Brain size={13} />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                className="btn-glass"
                                style={{ padding: '3px 6px', border: 'none' }}
                                title="Delete Clip"
                                onClick={(e) => { e.stopPropagation(); onDeleteEvent(evt.id); }}
                              >
                                <Trash2 size={13} color="#f43f5e" />
                              </button>
                            )}
                          </div>

                          {/* Classification badges */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {evt.objects?.map((obj, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: '0.68rem',
                                  fontFamily: 'var(--font-mono)',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: obj.label === 'person' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                  color: obj.label === 'person' ? '#38bdf8' : '#fbbf24',
                                  border: '1px solid rgba(255,255,255,0.06)'
                                }}
                              >
                                {obj.label.toUpperCase()} {Math.round(obj.confidence * 100)}%
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW 3: DENSE LIST VIEW */}
      {viewMode === 'list' && (
        <div className="glass-panel" style={{ borderRadius: '14px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <th style={{ padding: '12px 14px' }}>Thumbnail</th>
                <th style={{ padding: '12px 14px' }}>Camera</th>
                <th style={{ padding: '12px 14px' }}>Timestamp</th>
                <th style={{ padding: '12px 14px' }}>Detected Class</th>
                <th style={{ padding: '12px 14px' }}>Confidence</th>
                <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(evt => {
                const d = new Date(evt.timestamp * 1000);
                const primaryObj = evt.objects?.[0] || { label: 'Motion', confidence: 0.8 };
                return (
                  <tr
                    key={evt.id}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      transition: 'background 0.15s ease',
                      cursor: 'pointer'
                    }}
                    onClick={() => onPlayEvent(evt)}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(6, 182, 212, 0.08)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '8px 14px', width: '90px' }}>
                      <img
                        src={evt.snapshot_url}
                        alt="Snapshot"
                        style={{ width: '70px', height: '42px', borderRadius: '4px', objectFit: 'cover' }}
                      />
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600 }}>{evt.camera_name}</td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {d.toLocaleDateString([], { month: 'short', day: 'numeric' })} {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        background: primaryObj.label === 'person' ? 'rgba(6, 182, 212, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                        color: primaryObj.label === 'person' ? '#38bdf8' : '#fbbf24'
                      }}>
                        {primaryObj.label.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                      {Math.round(primaryObj.confidence * 100)}%
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        className="btn-primary"
                        style={{ padding: '4px 10px', fontSize: '0.74rem' }}
                        onClick={(e) => { e.stopPropagation(); onPlayEvent(evt); }}
                      >
                        <Play size={11} /> Play
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

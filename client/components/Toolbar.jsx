'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, X, Lock, Globe, Search, Minus, Camera, Maximize2, Settings } from 'lucide-react';

export default function Toolbar({
  wsRef,
  isActive,
  currentUrl,
  tabs = [],
  onSwitchTab,
  onCloseTab,
  onNewTab,
  onOpenSettings,
  zoom = 100,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onScreenshot,
  onToggleFullscreen
}) {
  const [inputUrl, setInputUrl] = useState('');
  const [editing, setEditing]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setInputUrl(currentUrl || '');
  }, [currentUrl, editing]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, [wsRef]);

  const navigate = useCallback((e) => {
    e.preventDefault();
    if (!isActive || !inputUrl.trim()) return;
    send({ type: 'navigate', url: inputUrl.trim() });
    setEditing(false);
    inputRef.current?.blur();
  }, [isActive, inputUrl, send]);

  const getSecurityIcon = () => {
    if (!currentUrl) return <Search className="w-3.5 h-3.5 text-text-muted" />;
    if (currentUrl.startsWith('https://')) return <Lock className="w-3.5 h-3.5 text-brand-teal" />;
    return <Globe className="w-3.5 h-3.5 text-text-secondary" />;
  };

  const secIcon = getSecurityIcon();

  return (
    <div className="flex flex-col w-full bg-bg-surface border-b border-white/5 shrink-0 select-none">
      {/* Row 1: macOS dots & Tab Bar */}
      <div className="flex items-center h-11 bg-bg-base/70 border-b border-white/5 shrink-0">
        {/* macOS traffic light window controls */}
        <div className="flex gap-2 items-center px-4 shrink-0 h-full group">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] shadow-[inset_0_0_1px_#e0443e,0_1px_2px_rgba(0,0,0,0.15)] group-hover:scale-105 transition-transform duration-100" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] shadow-[inset_0_0_1px_#dfa123,0_1px_2px_rgba(0,0,0,0.15)] group-hover:scale-105 transition-transform duration-100" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] shadow-[inset_0_0_1px_#1aab29,0_1px_2px_rgba(0,0,0,0.15)] group-hover:scale-105 transition-transform duration-100" />
        </div>

        {isActive && tabs.length > 0 && (
          <div className="flex items-end h-full flex-1 overflow-x-auto scrollbar-none pr-4">
            <div className="flex items-end gap-1.5 h-full">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`flex items-center gap-2 h-9 px-4 rounded-t-md border-t border-x text-sm font-semibold cursor-pointer max-width-[160px] min-w-[100px] select-none transition-all duration-200 ${
                    tab.isActive
                      ? 'bg-bg-surface text-text-primary border-white/10 shadow-[0_-2px_10px_rgba(0,0,0,0.2)]'
                      : 'bg-white/[0.02] text-text-secondary border-transparent hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                  onClick={() => !tab.isActive && onSwitchTab?.(tab.id)}
                >
                  <span className="shrink-0 opacity-60">
                    <Globe className="w-3.5 h-3.5" />
                  </span>
                  <span className="flex-1 truncate pr-1" title={tab.title}>
                    {tab.title || 'New Tab'}
                  </span>
                  <button
                    className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-brand-red transition-colors duration-150"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseTab?.(tab.id);
                    }}
                    title="Close tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              
              <button
                id="btn-new-tab"
                className="flex items-center justify-center w-6 h-6 rounded-full bg-white/[0.04] text-text-muted hover:bg-white/[0.12] hover:text-text-primary mb-2 ml-1.5 transition-colors duration-150"
                onClick={onNewTab}
                title="New tab"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Navigation & Address Bar */}
      <div className="flex items-center gap-3 h-12 px-3 bg-bg-surface border-t border-white/[0.02] w-full">
        {/* Navigation arrow buttons */}
        <div className="flex items-center gap-1">
          <button
            id="btn-back"
            className="flex items-center justify-center w-9 h-9 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-secondary cursor-pointer disabled:cursor-default transition-all duration-100"
            onClick={() => send({ type: 'go-back' })}
            disabled={!isActive}
            title="Back (Alt+←)"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <button
            id="btn-forward"
            className="flex items-center justify-center w-9 h-9 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-secondary cursor-pointer disabled:cursor-default transition-all duration-100"
            onClick={() => send({ type: 'go-forward' })}
            disabled={!isActive}
            title="Forward (Alt+→)"
          >
            <ArrowRight className="w-4.5 h-4.5" />
          </button>
          <button
            id="btn-reload"
            className="flex items-center justify-center w-9 h-9 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-text-secondary cursor-pointer disabled:cursor-default transition-all duration-100"
            onClick={() => send({ type: 'reload' })}
            disabled={!isActive}
            title="Reload (Ctrl+R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Address Input Form */}
        <form className="flex-1 relative min-w-0" onSubmit={navigate}>
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none flex items-center z-10">
            {secIcon}
          </div>
          <input
            ref={inputRef}
            id="url-input"
            className="w-full h-9 pl-10 pr-4 bg-bg-elevated border border-white/5 rounded-full text-text-primary font-mono text-sm outline-none transition-all duration-150 hover:bg-bg-hover focus:bg-bg-hover focus:border-brand-primary/50 focus:shadow-[0_0_0_3px_rgba(79,110,247,0.15)] disabled:opacity-40 disabled:hover:bg-bg-elevated"
            type="text"
            value={inputUrl}
            onChange={(e) => { setInputUrl(e.target.value); setEditing(true); }}
            onFocus={(e) => { setEditing(true); e.target.select(); }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setEditing(false);
                setInputUrl(currentUrl || '');
                inputRef.current?.blur();
              }
            }}
            placeholder={isActive ? 'Search or enter URL…' : 'Start a session to browse'}
            disabled={!isActive}
            autoComplete="off"
            spellCheck="false"
          />
        </form>

        {/* Zoom Controls */}
        {isActive && (
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/5 rounded-md px-1.5 h-8">
            <button
              type="button"
              className="flex items-center justify-center w-5 h-5 rounded text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-30 transition-colors"
              onClick={onZoomOut}
              disabled={zoom <= 50}
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span
              className="text-xs font-bold font-mono text-text-secondary hover:text-text-primary cursor-pointer select-none min-w-[36px] text-center"
              onClick={onZoomReset}
              title="Reset zoom"
            >
              {zoom}%
            </span>
            <button
              type="button"
              className="flex items-center justify-center w-5 h-5 rounded text-text-secondary hover:bg-white/5 hover:text-text-primary disabled:opacity-30 transition-colors"
              onClick={onZoomIn}
              disabled={zoom >= 200}
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Screenshot Capture Action */}
        <button
          type="button"
          className="flex items-center justify-center w-7.5 h-7.5 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 transition-colors"
          onClick={onScreenshot}
          disabled={!isActive}
          title="Capture Screenshot"
        >
          <Camera className="w-4 h-4" />
        </button>

        {/* Fullscreen Toggle Action */}
        <button
          type="button"
          className="flex items-center justify-center w-7.5 h-7.5 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 transition-colors"
          onClick={onToggleFullscreen}
          disabled={!isActive}
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {/* Settings Action Center Toggle */}
        <button
          type="button"
          className="flex items-center justify-center w-7.5 h-7.5 rounded text-text-secondary hover:bg-bg-hover hover:text-text-primary disabled:opacity-25 hover:rotate-12 transition-transform duration-200"
          onClick={onOpenSettings}
          disabled={!isActive}
          title="Open Action Center"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { Play, Square, Globe, AlertCircle, Info, CheckCircle2, Activity, Database, Terminal, Settings } from 'lucide-react';

import Toolbar from '../components/Toolbar';
import StatusBar from '../components/StatusBar';
import ControlPanel from '../components/ControlPanel';

const BrowserViewer = dynamic(() => import('../components/BrowserViewer'), { ssr: false });
const ConsoleDrawer = dynamic(() => import('../components/ConsoleDrawer'), { ssr: false });

const WS_URL  = 'ws://localhost:4000/ws';
const API_URL = 'http://localhost:4000';

export default function HomePage() {
  const [status, setStatus]         = useState('idle'); // idle | starting | connected | stopping | error
  const [url, setUrl]               = useState('');
  const [title, setTitle]           = useState('');
  const [fps, setFps]               = useState(0);
  const [containerId, setCid]       = useState(null);
  const [statusMsg, setStatusMsg]   = useState('');
  const [toasts, setToasts]         = useState([]);
  const [latency, setLatency]       = useState(0);

  const [tabs, setTabs]             = useState([]);
  const [logs, setLogs]             = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [zoom, setZoom]             = useState(100);
  const [device, setDevice]         = useState('desktop');

  const wsRef       = useRef(null);
  const reconnTimer = useRef(null);
  const toastSeq    = useRef(0);
  const pingRef     = useRef(null);

  const streaming = status === 'connected';
  const busy      = status === 'starting' || status === 'stopping';

  const toast = useCallback((message, type = 'info') => {
    const id = ++toastSeq.current;
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  useEffect(() => {
    if (!streaming) { setLatency(0); return; }
    pingRef.current = setInterval(async () => {
      const t0 = performance.now();
      try {
        await fetch(`${API_URL}/api/status`);
        setLatency(Math.round(performance.now() - t0));
      } catch { setLatency(-1); }
    }, 3000);
    return () => clearInterval(pingRef.current);
  }, [streaming]);

  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      clearTimeout(reconnTimer.current);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case 'session-started':
            setStatus('connected');
            toast('Browser session is live', 'success');
            break;
          case 'session-stopped':
            setStatus('idle');
            setUrl(''); 
            setTitle(''); 
            setCid(null);
            setTabs([]);
            setLogs([]);
            setZoom(100);
            setDevice('desktop');
            toast('Session ended', 'info');
            break;
          case 'session-active':  
            setStatus('connected'); 
            break;
          case 'session-idle':    
            setStatus('idle'); 
            break;
          case 'status':          
            setStatusMsg(msg.message || ''); 
            break;
          case 'url-changed':
            if (msg.url)   setUrl(msg.url);
            if (msg.title) setTitle(msg.title);
            break;
          case 'tab-list':
            setTabs(msg.tabs || []);
            break;
          case 'console-log':
            setLogs(prev => [...prev.slice(-199), { ...msg.log, timestamp: Date.now() }]);
            break;
          case 'clipboard-copy':
            break;
          case 'error':
            setStatus('error');
            toast(msg.message, 'error');
            setTimeout(() => setStatus('idle'), 5000);
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      reconnTimer.current = setTimeout(connectWS, 2500);
    };
  }, [toast]);

  useEffect(() => {
    connectWS();
    return () => { clearTimeout(reconnTimer.current); wsRef.current?.close(); };
  }, [connectWS]);

  const handleStart = useCallback(async () => {
    setStatus('starting');
    setStatusMsg('Checking Docker configuration…');
    setLogs([]);
    setTabs([]);
    setZoom(100);
    setDevice('desktop');
    try {
      const res = await fetch(`${API_URL}/api/start`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Start failed');
      const sr = await fetch(`${API_URL}/api/status`);
      const sd = await sr.json();
      setCid(sd.containerId);
    } catch (err) {
      setStatus('error');
      toast(`Launch failed: ${err.message}`, 'error');
      setTimeout(() => setStatus('idle'), 5000);
    } finally {
      setStatusMsg('');
    }
  }, [toast]);

  const handleStop = useCallback(async () => {
    setStatus('stopping');
    setStatusMsg('Stopping session…');
    try {
      await fetch(`${API_URL}/api/stop`, { method: 'POST' });
      setTabs([]);
      setLogs([]);
      setZoom(100);
      setDevice('desktop');
      setIsSettingsOpen(false);
    } catch (err) {
      toast(`Stop error: ${err.message}`, 'error');
      setStatus('idle');
    } finally {
      setStatusMsg('');
    }
  }, [toast]);

  const sendWS = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => {
      const next = Math.min(200, prev + 10);
      sendWS({ type: 'zoom', scale: next / 100 });
      return next;
    });
  }, [sendWS]);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const next = Math.max(50, prev - 10);
      sendWS({ type: 'zoom', scale: next / 100 });
      return next;
    });
  }, [sendWS]);

  const handleZoomReset = useCallback(() => {
    setZoom(100);
    sendWS({ type: 'zoom', scale: 1.0 });
  }, [sendWS]);

  const handleScreenshot = useCallback(async () => {
    if (!streaming) return;
    toast('Capturing screenshot…', 'info');
    try {
      const res = await fetch(`${API_URL}/api/screenshot`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Capture failed');
      
      const link = document.createElement('a');
      link.href = `data:image/png;base64,${data.data}`;
      link.download = `nexus-screenshot-${Date.now()}.png`;
      link.click();
      toast('Screenshot downloaded!', 'success');
    } catch (err) {
      toast(`Screenshot failed: ${err.message}`, 'error');
    }
  }, [streaming, toast]);

  const handleToggleFullscreen = useCallback(() => {
    const el = document.getElementById('browser-canvas');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  const runScript = useCallback((scriptId) => {
    if (!streaming) return;
    toast(`Running script on backend...`, 'info');
    sendWS({ type: 'run-script', scriptId });
  }, [streaming, sendWS, toast]);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        if (streaming) handleStop();
        else if (status === 'idle') handleStart();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [streaming, status, handleStart, handleStop]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base relative font-sans text-text-primary antialiased selection:bg-brand-primary-dim selection:text-brand-primary-light w-full">
      {/* Background gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_15%_-20%,rgba(79,110,247,0.06),transparent_55%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_85%_120%,rgba(108,92,231,0.04),transparent_55%)] pointer-events-none z-0" />

      {/* Left Workspace Sidebar */}
      <aside className="w-64 bg-bg-surface border-r border-white/5 flex flex-col shrink-0 z-20 relative">
        {/* Brand header */}
        <div className="h-13 px-4 border-b border-white/5 flex items-center gap-2.5 shrink-0">
          <div className="flex items-center justify-center w-7 h-7 bg-gradient-to-br from-brand-primary to-brand-secondary rounded text-white shadow-[0_0_12px_rgba(79,110,247,0.2)]">
            <Globe className="w-4 h-4" />
          </div>
          <span className="text-base font-bold tracking-tight text-text-primary">Nexus Workspace</span>
        </div>

        {/* Workspace connection state widget */}
        <div className="p-4 border-b border-white/5 flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              status === 'connected' ? 'bg-brand-teal animate-pulse' :
              status === 'starting' ? 'bg-brand-amber animate-pulse' :
              'bg-text-muted'
            }`} />
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Connection State</span>
          </div>
          
          <div className="bg-bg-base/40 border border-white/5 p-3 rounded-md flex flex-col gap-2 font-mono text-sm text-text-secondary">
            <div className="flex justify-between">
              <span className="text-text-muted">Docker Node:</span>
              <span className={containerId ? "text-brand-teal font-bold" : "text-text-muted"}>
                {containerId ? 'Online' : 'Offline'}
              </span>
            </div>
            {containerId && (
              <div className="flex justify-between">
                <span className="text-text-muted">Container:</span>
                <span className="truncate max-w-[100px]" title={containerId}>{containerId}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-muted">Latency:</span>
              <span>{latency > 0 ? `${latency}ms` : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 scrollbar-none">
          {/* Quick Nav */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Workspace Presets</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Google', url: 'https://www.google.com' },
                { name: 'GitHub', url: 'https://github.com' },
                { name: 'Hacker News', url: 'https://news.ycombinator.com' },
                { name: 'Wikipedia', url: 'https://wikipedia.org' }
              ].map(b => (
                <button
                  key={b.name}
                  className="h-9 px-2.5 bg-bg-elevated hover:bg-bg-hover border border-white/5 hover:border-white/10 rounded text-left text-sm font-semibold text-text-secondary hover:text-text-primary transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
                  disabled={!streaming}
                  onClick={() => sendWS({ type: 'navigate', url: b.url })}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          {/* Automation Scripts */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Automation Scripts</span>
            <div className="flex flex-col gap-2.5">
              {[
                {
                  id: 'wikipedia-crawler',
                  title: 'Wikipedia Random Crawler',
                  desc: 'Crawls a random Wikipedia page, counts internal links, and extracts the summary.',
                },
                {
                  id: 'seo-auditor',
                  title: 'SEO & Performance Auditor',
                  desc: 'Navigates to/audits current page, analyzing meta tags, load timing, and resource metrics.',
                },
                {
                  id: 'hn-scraper',
                  title: 'Hacker News Scraper',
                  desc: 'Navigates to Y Combinator Hacker News and scrapes the top 5 articles with stats.',
                }
              ].map((s) => (
                <div key={s.id} className="bg-bg-elevated/40 border border-white/5 hover:border-white/10 p-3 rounded-md flex flex-col gap-1.5 transition-all duration-150">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-text-primary truncate">{s.title}</span>
                    <button
                      className="p-1 rounded bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary-light active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
                      disabled={!streaming}
                      onClick={() => runScript(s.id)}
                      title="Run script"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative z-10">
        {/* Main Header */}
        <header className="flex items-center justify-between h-13 px-4 bg-bg-surface border-b border-white/5 shrink-0 z-40 relative">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight text-slate-100">Orchestration Interface</span>
            <span className="text-xs font-mono text-text-muted bg-bg-elevated border border-white/5 px-1.5 py-0.5 rounded tracking-wide">v1.1</span>
          </div>

          <div className="flex items-center gap-2">
            {(status === 'idle' || status === 'error') && (
              <button
                id="btn-start"
                className="flex items-center gap-2 h-8 px-4 bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold text-xs rounded-md shadow-md shadow-brand-primary-glow hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-primary-glow/55 active:translate-y-0 transition-all duration-150 disabled:opacity-50"
                onClick={handleStart}
                disabled={busy}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Launch Session
              </button>
            )}
            {busy && (
              <button className="flex items-center gap-2.5 h-8 px-4 bg-bg-elevated border border-white/5 text-text-secondary font-semibold text-xs rounded-md disabled:opacity-60" disabled>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: '0.3s' }} />
                </div>
                {status === 'starting' ? 'Starting…' : 'Stopping…'}
              </button>
            )}
            {streaming && (
              <button
                id="btn-stop"
                className="flex items-center gap-2 h-8 px-4 bg-brand-red-dim border border-brand-red/20 text-brand-red font-semibold text-xs rounded-md hover:bg-brand-red/20 hover:border-brand-red/30 hover:text-red-300 active:scale-95 transition-all duration-150"
                onClick={handleStop}
              >
                <Square className="w-3 h-3 fill-current" />
                Disconnect
              </button>
            )}
          </div>
        </header>

        {/* Main layout content */}
        <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
          <main className="flex-1 flex flex-col p-4 overflow-hidden h-full">
            <div className="flex justify-center items-center w-full h-full relative">
              <div
                className="relative w-full h-full flex flex-col transition-all duration-300 ease-out"
                style={{
                  maxWidth: device === 'iphone12'
                    ? 'calc((100vh - 120px) * 390 / 844)'
                    : device === 'pixel5'
                    ? 'calc((100vh - 120px) * 393 / 851)'
                    : 'calc((100vh - 120px) * 16 / 9)'
                }}
              >
                <div className={`relative flex-1 rounded-lg overflow-hidden shadow-2xl transition-all duration-500 animated-gradient-border ${streaming ? 'active shadow-brand-primary-glow/30' : ''}`}>
                  <div className="absolute inset-[2px] rounded-[10px] bg-black overflow-hidden flex flex-col z-10">
                    {streaming && (
                      <Toolbar
                        wsRef={wsRef}
                        isActive={streaming}
                        currentUrl={url}
                        tabs={tabs}
                        onSwitchTab={(id) => sendWS({ type: 'switch-tab', id })}
                        onCloseTab={(id) => sendWS({ type: 'close-tab', id })}
                        onNewTab={() => sendWS({ type: 'new-tab' })}
                        onOpenSettings={() => setIsSettingsOpen(!isSettingsOpen)}
                        zoom={zoom}
                        onZoomIn={handleZoomIn}
                        onZoomOut={handleZoomOut}
                        onZoomReset={handleZoomReset}
                        onScreenshot={handleScreenshot}
                        onToggleFullscreen={handleToggleFullscreen}
                      />
                    )}

                    <BrowserViewer
                      wsRef={wsRef}
                      isStreaming={streaming}
                      onFpsUpdate={setFps}
                      onUrlChange={(u, t) => { setUrl(u); if (t) setTitle(t); }}
                      onClipboardCopy={() => toast('Synced remote text to clipboard', 'success')}
                      device={device}
                    />

                    {!streaming && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg-surface z-20">
                        {busy ? (
                          <div className="flex flex-col items-center gap-5 animate-fade-in">
                            <div className="relative w-14 h-14">
                              <svg className="animate-spin" width="56" height="56" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(79,110,247,0.15)" strokeWidth="3"/>
                                <circle cx="28" cy="28" r="24" fill="none" stroke="url(#loading-grad)" strokeWidth="3" strokeLinecap="round" strokeDasharray="40 120" />
                                <defs>
                                  <linearGradient id="loading-grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#4f6ef7"/>
                                    <stop offset="100%" stopColor="#6c5ce7"/>
                                  </linearGradient>
                                </defs>
                              </svg>
                            </div>
                            <p className="text-sm font-semibold font-mono text-text-secondary tracking-wide">{statusMsg || 'Initializing…'}</p>
                            <div className="flex gap-6 mt-1 text-xs font-mono text-text-muted">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${statusMsg.includes('Docker') || statusMsg.includes('Checking') ? 'bg-brand-primary animate-pulse' : statusMsg ? 'bg-brand-teal' : 'bg-brand-primary animate-pulse'}`} />
                                Container
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${statusMsg.includes('Chromium') ? 'bg-brand-primary animate-pulse' : statusMsg.includes('Connecting') ? 'bg-brand-teal' : 'bg-white/10'}`} />
                                Chromium
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${statusMsg.includes('Connecting') ? 'bg-brand-primary animate-pulse' : 'bg-white/10'}`} />
                                CDP Link
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-5 animate-fade-in px-6 text-center">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                              <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/5 rounded-full animate-pulse" />
                              <Globe className="w-12 h-12 text-brand-primary-light filter drop-shadow-[0_0_12px_rgba(79,110,247,0.4)]" />
                            </div>
                            <div>
                              <h1 className="text-2xl font-extrabold tracking-tight leading-tight">
                                Remote Browser<br/>
                                <span className="bg-gradient-to-r from-brand-primary-light to-brand-teal bg-clip-text text-transparent">Control Workspace</span>
                              </h1>
                              <p className="text-sm text-text-secondary font-medium mt-2 max-w-[320px] leading-relaxed">
                                Launch an isolated Chromium browser inside Docker and control it in real-time.
                              </p>
                            </div>
                            <button
                              id="btn-start-center"
                              className="flex items-center gap-2 h-11 px-7 rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-extrabold text-sm shadow-md shadow-brand-primary-glow hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-primary-glow/55 active:translate-y-0 active:scale-98 transition-all duration-200 mt-2"
                              onClick={handleStart}
                            >
                              <Play className="w-4 h-4 fill-current" />
                              Launch Browser
                            </button>
                            <div className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
                              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-xs font-bold">Ctrl</kbd>
                              <span>+</span>
                              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-xs font-bold">Shift</kbd>
                              <span>+</span>
                              <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-xs font-bold">B</kbd>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {streaming && (
                      <ConsoleDrawer
                        logs={logs}
                        onClear={() => setLogs([])}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Dynamic Action Center Panel Drawer */}
          <AnimatePresence>
            {isSettingsOpen && (
              <ControlPanel
                wsRef={wsRef}
                isActive={streaming}
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                device={device}
                setDevice={setDevice}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Footer Status Bar */}
        <StatusBar
          status={status}
          fps={fps}
          containerId={containerId}
          latency={latency}
          title={title}
        />
      </div>

      {/* Toast Alert Notification System */}
      <div className="fixed bottom-10 right-4 flex flex-col-reverse gap-2 z-[1000] pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-2.5 bg-bg-elevated border border-white/5 rounded-md shadow-lg text-xs text-text-primary backdrop-blur-md border-l-4 transition-all duration-300 ${
              t.type === 'success' ? 'border-l-brand-teal' : t.type === 'error' ? 'border-l-brand-red' : 'border-l-brand-primary'
            }`}
          >
            <span className={t.type === 'success' ? 'text-brand-teal' : t.type === 'error' ? 'text-brand-red' : 'text-brand-primary-light'}>
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4" />}
              {t.type === 'info' && <Info className="w-4 h-4" />}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

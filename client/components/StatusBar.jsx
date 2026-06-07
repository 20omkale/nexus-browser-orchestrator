'use client';

import { Activity, Database, AlertCircle, RefreshCw, FileText, Keyboard, Zap } from 'lucide-react';

export default function StatusBar({ status, fps, containerId, latency, title }) {
  const statusConfig = {
    idle:      { icon: <Activity className="w-3.5 h-3.5 text-text-muted" />, label: 'Ready', colorClass: 'text-text-muted' },
    starting:  { icon: <RefreshCw className="w-3.5 h-3.5 text-brand-amber animate-spin" />, label: 'Starting', colorClass: 'text-brand-amber' },
    connected: { icon: <Activity className="w-3.5 h-3.5 text-brand-teal animate-pulse" />, label: 'Streaming', colorClass: 'text-brand-teal' },
    stopping:  { icon: <RefreshCw className="w-3.5 h-3.5 text-brand-amber animate-spin" />, label: 'Stopping', colorClass: 'text-brand-amber' },
    error:     { icon: <AlertCircle className="w-3.5 h-3.5 text-brand-red" />, label: 'Error', colorClass: 'text-brand-red' },
  }[status] || { icon: <Activity className="w-3.5 h-3.5" />, label: 'Ready', colorClass: '' };

  const fpsClass = fps >= 20 ? 'text-brand-teal font-bold' : fps >= 10 ? 'text-brand-amber font-bold' : fps > 0 ? 'text-brand-red font-bold' : 'text-text-muted';

  return (
    <footer className="flex items-center justify-between h-8 px-4 bg-bg-surface border-t border-white/5 shrink-0 z-50 text-sm font-mono text-text-secondary select-none">
      <div className="flex items-center gap-0">
        {/* Connection status */}
        <div className="flex items-center gap-1.5 px-3 border-r border-white/5 h-8">
          {statusConfig.icon}
          <span className={`font-bold ${statusConfig.colorClass}`}>{statusConfig.label}</span>
        </div>

        {/* Container ID */}
        {containerId && (
          <div className="flex items-center gap-1.5 px-3 border-r border-white/5 h-8 text-sm tracking-wider">
            <Database className="w-3.5 h-3.5 opacity-60" />
            <span>{containerId}</span>
          </div>
        )}

        {/* FPS */}
        {status === 'connected' && (
          <div className={`flex items-center gap-1 px-3 border-r border-white/5 h-8 font-bold ${fpsClass}`}>
            <Zap className="w-3.5 h-3.5 opacity-80" />
            {fps} FPS
          </div>
        )}

        {/* Latency */}
        {status === 'connected' && latency > 0 && (
          <div className={`flex items-center gap-1.5 px-3 border-r border-white/5 h-8 ${latency > 200 ? 'text-brand-red' : 'text-text-secondary'}`}>
            <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" />
            <span>{latency}ms</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0">
        {/* Page title */}
        {status === 'connected' && title && (
          <div className="flex items-center gap-1.5 px-3 border-l border-white/5 h-8 text-text-secondary font-sans truncate max-w-[320px]" title={title}>
            <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
            <span className="truncate">{title}</span>
          </div>
        )}

        {/* Tech stack */}
        <div className="flex items-center gap-1 px-3 border-l border-white/5 h-8">
          <span>Docker</span>
          <span className="opacity-30">·</span>
          <span>CDP</span>
          <span className="opacity-30">·</span>
          <span>WS</span>
        </div>

        {/* Shortcut hint */}
        {status === 'connected' && (
          <div className="flex items-center gap-1.5 px-3 border-l border-white/5 h-8">
            <Keyboard className="w-4 h-4 opacity-60" />
            <kbd className="px-1 rounded bg-white/5 border border-white/10 text-xs font-bold">Ctrl</kbd>
            <kbd className="px-1 rounded bg-white/5 border border-white/10 text-xs font-bold">Shift</kbd>
            <kbd className="px-1 rounded bg-white/5 border border-white/10 text-xs font-bold">B</kbd>
          </div>
        )}
      </div>
    </footer>
  );
}

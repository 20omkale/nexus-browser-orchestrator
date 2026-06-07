'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Terminal, Trash2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export default function ConsoleDrawer({ logs, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('all'); // all | error | warning | log
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    return logs.reduce((acc, log) => {
      if (log.type === 'error') acc.errors++;
      else if (log.type === 'warning') acc.warnings++;
      else acc.logs++;
      return acc;
    }, { errors: 0, warnings: 0, logs: 0 });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filter === 'error' && log.type !== 'error') return false;
      if (filter === 'warning' && log.type !== 'warning') return false;
      if (filter === 'log' && ['error', 'warning'].includes(log.type)) return false;

      if (search.trim()) {
        const query = search.toLowerCase();
        return log.text.toLowerCase().includes(query) || (log.location?.url || '').toLowerCase().includes(query);
      }
      return true;
    });
  }, [logs, filter, search]);

  return (
    <motion.div
      animate={{ height: isOpen ? 250 : 36 }}
      transition={{ type: 'spring', damping: 26, stiffness: 220 }}
      className="absolute bottom-0 left-0 right-0 w-full bg-bg-base/95 backdrop-blur-md border-t border-white/5 flex flex-col z-50 overflow-hidden"
    >
      {/* Console Header Bar */}
      <div
        className="flex items-center justify-between h-11 px-4 cursor-pointer hover:bg-white/[0.04] border-b border-white/5 select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronUp className="w-5 h-5 text-slate-400" />}
          <span className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Terminal className="w-4.5 h-4.5 text-brand-primary-light" /> Developer Console
          </span>
          <div className="flex gap-2 items-center ml-2">
            {counts.errors > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#ef4444]/15 border border-[#ef4444]/30 text-[#f87171] text-xs font-bold">
                <AlertCircle className="w-3.5 h-3.5" /> {counts.errors}
              </span>
            )}
            {counts.warnings > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#f59e0b]/15 border border-[#f59e0b]/30 text-[#fbbf24] text-xs font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-[#fbbf24]" /> {counts.warnings}
              </span>
            )}
            {counts.logs > 0 && (
              <span className="px-2.5 py-0.5 rounded bg-white/10 text-slate-300 text-xs font-bold">
                {counts.logs}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {isOpen && (
            <>
              <input
                type="text"
                className="h-8 px-3 bg-white/[0.05] border border-white/10 rounded text-sm text-slate-100 outline-none focus:border-brand-primary placeholder:text-slate-500"
                placeholder="Filter logs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                className="p-1.5 rounded text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-colors"
                onClick={onClear}
                title="Clear console"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Console Content List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Filter Tabs */}
            <div className="flex gap-2 px-4 py-2 border-b border-white/5 bg-black/25 shrink-0">
              {['all', 'error', 'warning', 'log'].map((t) => (
                <button
                  key={t}
                  className={`text-sm font-semibold px-3 py-1 rounded capitalize transition-all duration-150 ${
                    filter === t
                      ? 'bg-white/10 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => setFilter(t)}
                >
                  {t === 'log' ? 'Logs' : t === 'all' ? 'All' : t + 's'}
                </button>
              ))}
            </div>

            {/* Logs List scroll wrapper */}
            <div className="flex-1 overflow-y-auto p-2.5 font-mono text-[14px] leading-relaxed bg-[#0a0e1a]">
              {filteredLogs.length === 0 ? (
                <div className="text-slate-500 py-12 text-center text-sm">No console messages.</div>
              ) : (
                filteredLogs.map((log, index) => {
                  const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '';
                  
                  let lineClass = 'text-slate-200 border-transparent';
                  let icon = <Info className="w-4 h-4 text-slate-400" />;
                  
                  if (log.type === 'error') {
                    lineClass = 'text-[#fca5a5] bg-[#ef4444]/10 border-l-2 border-[#ef4444]';
                    icon = <AlertCircle className="w-4 h-4 text-[#f87171] shrink-0" />;
                  } else if (log.type === 'warning') {
                    lineClass = 'text-[#ffe066] bg-[#f59e0b]/10 border-l-2 border-[#f59e0b]';
                    icon = <AlertTriangle className="w-4 h-4 text-[#fbbf24] shrink-0" />;
                  }

                  return (
                    <div key={index} className={`flex items-start gap-3 py-2 px-3.5 border-b border-white/[0.02] rounded-sm transition-colors hover:bg-white/[0.02] ${lineClass}`}>
                      <span className="text-slate-500 font-normal shrink-0 select-none">[{time}]</span>
                      <span className="shrink-0 mt-0.5">
                        {icon}
                      </span>
                      <span className="flex-1 break-all whitespace-pre-wrap font-medium">{log.text}</span>
                      {log.location?.url && (
                        <span className="text-xs text-slate-400 truncate max-w-[200px] text-right font-sans hover:text-slate-200 transition-colors cursor-help shrink-0" title={`${log.location.url}:${log.location.lineNumber || 0}`}>
                          {log.location.url.split('/').pop() || 'index.js'}:{log.location.lineNumber || 0}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { MousePointer2 } from 'lucide-react';

const BTN_MAP = { 0: 'left', 1: 'middle', 2: 'right' };

export default function BrowserViewer({ wsRef, isStreaming, onFpsUpdate, onUrlChange, onClipboardCopy, device = 'desktop' }) {
  const containerRef  = useRef(null);
  const canvasRef     = useRef(null);
  const imgRef        = useRef(null);
  const frameCount    = useRef(0);
  const fpsInterval   = useRef(null);
  const resizeTimer   = useRef(null);
  
  const [focused, setFocused] = useState(false);
  const [cursors, setCursors] = useState({}); // clientId -> { x, y }
  const [remoteSize, setRemoteSize] = useState({ w: 1280, h: 720 });

  useEffect(() => { imgRef.current = new Image(); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

    const handleMsg = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'frame' && imgRef.current) {
          const img = imgRef.current;
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
          frameCount.current++;
        } else if (msg.type === 'url-changed') {
          onUrlChange?.(msg.url || '', msg.title || '');
        } else if (msg.type === 'clipboard-copy') {
          navigator.clipboard.writeText(msg.text).catch(() => {});
          onClipboardCopy?.(msg.text);
        } else if (msg.type === 'cursor-update') {
          setCursors(prev => ({
            ...prev,
            [msg.clientId]: { x: msg.x, y: msg.y }
          }));
        } else if (msg.type === 'cursor-remove') {
          setCursors(prev => {
            const next = { ...prev };
            delete next[msg.clientId];
            return next;
          });
        } else if (msg.type === 'resized') {
          if (canvas) {
            canvas.width = msg.width;
            canvas.height = msg.height;
          }
          setRemoteSize({ w: msg.width, h: msg.height });
        }
      } catch {}
    };

    const ws = wsRef.current;
    if (ws) {
      ws.addEventListener('message', handleMsg);
      return () => ws.removeEventListener('message', handleMsg);
    }
  }, [wsRef, onUrlChange, onClipboardCopy]);

  useEffect(() => {
    if (!isStreaming) {
      frameCount.current = 0;
      onFpsUpdate?.(0);
      setCursors({});
      return;
    }
    fpsInterval.current = setInterval(() => {
      onFpsUpdate?.(frameCount.current);
      frameCount.current = 0;
    }, 1000);
    return () => clearInterval(fpsInterval.current);
  }, [isStreaming, onFpsUpdate]);

  useEffect(() => {
    if (!isStreaming || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0 || device !== 'desktop') return;
      const { width, height } = entries[0].contentRect;
      
      const scaledW = Math.max(640, Math.min(1920, Math.round(width)));
      const scaledH = Math.max(360, Math.min(1080, Math.round(height)));

      clearTimeout(resizeTimer.current);
      resizeTimer.current = setTimeout(() => {
        const ws = wsRef.current;
        if (ws?.readyState === WebSocket.OPEN) {
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = scaledW;
            canvas.height = scaledH;
          }
          setRemoteSize({ w: scaledW, h: scaledH });
          ws.send(JSON.stringify({ type: 'resize', width: scaledW, height: scaledH }));
        }
      }, 250);
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer.current);
    };
  }, [isStreaming, wsRef, device]);

  const toRemote = useCallback((e) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: Math.round((e.clientX - r.left) * (remoteSize.w / r.width)),
      y: Math.round((e.clientY - r.top)  * (remoteSize.h / r.height)),
    };
  }, [remoteSize]);

  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, [wsRef]);

  const onMove = useCallback((e) => {
    if (!isStreaming) return;
    const { x, y } = toRemote(e);
    send({ type: 'mousemove', x, y });
  }, [isStreaming, toRemote, send]);

  const onDown = useCallback((e) => {
    if (!isStreaming) return;
    e.preventDefault();
    canvasRef.current?.focus();
    const { x, y } = toRemote(e);
    send({ type: 'mousedown', x, y, button: BTN_MAP[e.button] || 'left', clickCount: e.detail || 1 });
  }, [isStreaming, toRemote, send]);

  const onUp = useCallback((e) => {
    if (!isStreaming) return;
    const { x, y } = toRemote(e);
    send({ type: 'mouseup', x, y, button: BTN_MAP[e.button] || 'left' });
  }, [isStreaming, toRemote, send]);

  const onCtxMenu = useCallback((e) => e.preventDefault(), []);

  const onWheel = useCallback((e) => {
    if (!isStreaming) return;
    e.preventDefault();
    const { x, y } = toRemote(e);
    send({ type: 'scroll', x, y, deltaX: Math.round(e.deltaX), deltaY: Math.round(e.deltaY) });
  }, [isStreaming, toRemote, send]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const modifiers = (e) => {
    let m = 0;
    if (e.altKey)   m |= 1;
    if (e.ctrlKey)  m |= 2;
    if (e.metaKey)  m |= 4;
    if (e.shiftKey) m |= 8;
    return m;
  };

  const onKeyDown = useCallback((e) => {
    if (!isStreaming) return;
    if (['F5', 'F12'].includes(e.key)) return;
    if (e.ctrlKey && ['r', 'l', 't', 'w'].includes(e.key.toLowerCase())) return;
    e.preventDefault();
    send({ type: 'keydown', key: e.key, code: e.code, keyCode: e.keyCode || e.which, modifiers: modifiers(e) });
  }, [isStreaming, send]);

  const onKeyUp = useCallback((e) => {
    if (!isStreaming) return;
    send({ type: 'keyup', key: e.key, code: e.code, keyCode: e.keyCode || e.which, modifiers: modifiers(e) });
  }, [isStreaming, send]);

  const onPaste = useCallback((e) => {
    if (!isStreaming) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text');
    if (text) {
      send({ type: 'paste', text });
    }
  }, [isStreaming, send]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 w-full bg-black overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        id="browser-canvas"
        className={`w-full h-full block outline-none object-contain ${
          isStreaming ? 'cursor-default' : 'cursor-crosshair'
        } ${
          focused && isStreaming ? 'ring-2 ring-brand-primary ring-inset' : ''
        }`}
        width={remoteSize.w}
        height={remoteSize.h}
        tabIndex={0}
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onContextMenu={onCtxMenu}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      {/* Collaborative Cursor Overlays */}
      {isStreaming && Object.entries(cursors).map(([cid, pos]) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = rect.width / remoteSize.w;
        const scaleY = rect.height / remoteSize.h;
        
        const x = pos.x * scaleX;
        const y = pos.y * scaleY;

        return (
          <div
            key={cid}
            className="absolute pointer-events-none z-[9999] transition-[left,top] duration-75 flex flex-col items-start"
            style={{
              left: `${x}px`,
              top: `${y}px`,
              transform: 'translate(-2px, -2px)',
            }}
          >
            <div className="flex items-center text-brand-teal fill-brand-teal filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              <MousePointer2 className="w-4.5 h-4.5 stroke-white stroke-[1.5]" />
            </div>
            <span className="mt-1 ml-4 px-1.5 py-0.5 rounded bg-brand-teal text-[9px] font-bold text-black shadow-md whitespace-nowrap">
              User #{cid}
            </span>
          </div>
        );
      })}
    </div>
  );
}

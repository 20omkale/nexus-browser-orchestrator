'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Monitor, Smartphone, Wifi, WifiOff, Sun, Moon, Image, ImageOff, Trash2 } from 'lucide-react';

export default function ControlPanel({ wsRef, isActive, isOpen, onClose, device, setDevice }) {
  const [network, setNetwork] = useState('none');
  const [colorScheme, setColorScheme] = useState('light');
  const [blockImages, setBlockImages] = useState(false);

  const sendSettings = useCallback((updatedSettings) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'update-settings',
        settings: updatedSettings
      }));
    }
  }, [wsRef]);

  const handleDeviceChange = (val) => {
    setDevice(val);
    sendSettings({ deviceEmulation: val });
  };

  const handleNetworkChange = (val) => {
    setNetwork(val);
    sendSettings({ networkThrottling: val });
  };

  const handleColorSchemeChange = (val) => {
    setColorScheme(val);
    sendSettings({ colorScheme: val });
  };

  const handleBlockImagesToggle = () => {
    const nextVal = !blockImages;
    setBlockImages(nextVal);
    sendSettings({ blockImages: nextVal });
  };

  const clearData = (type) => {
    if (!isActive) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'clear-data',
        options: {
          cookies: type === 'cookies' || type === 'all',
          cache: type === 'cache' || type === 'all'
        }
      }));
    }
  };

  if (!isOpen) return null;

  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 220 }}
      className="fixed top-0 right-0 w-[300px] h-screen bg-bg-surface/90 backdrop-blur-md border-l border-white/5 flex flex-col z-[100] shadow-[0_0_40px_rgba(0,0,0,0.5)]"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-white/5 shrink-0">
        <h3 className="text-sm font-bold text-text-primary uppercase tracking-widest">Action Center</h3>
        <button
          className="p-1 rounded text-text-muted hover:bg-white/5 hover:text-text-primary transition-colors"
          onClick={onClose}
          title="Close panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Panel Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Device Emulation */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Monitor className="w-4 h-4" /> Device Emulation
          </h4>
          <div className="relative">
            <select
              value={device}
              onChange={(e) => handleDeviceChange(e.target.value)}
              disabled={!isActive}
              className="w-full h-10 px-3 bg-white/[0.02] border border-white/5 rounded-md text-text-secondary font-sans text-sm font-semibold outline-none cursor-pointer hover:border-brand-primary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <option value="desktop">🖥️ Desktop (1280x720)</option>
              <option value="iphone12">📱 iPhone 12 (390x844)</option>
              <option value="pixel5">📱 Pixel 5 (393x851)</option>
            </select>
          </div>
        </div>

        {/* Network Throttling */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Wifi className="w-4 h-4" /> Network Throttling
          </h4>
          <div className="relative">
            <select
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value)}
              disabled={!isActive}
              className="w-full h-10 px-3 bg-white/[0.02] border border-white/5 rounded-md text-text-secondary font-sans text-sm font-semibold outline-none cursor-pointer hover:border-brand-primary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <option value="none">⚡ No Throttling</option>
              <option value="fast3g">🌐 Fast 3G</option>
              <option value="slow3g">🐢 Slow 3G</option>
              <option value="offline">🔌 Offline</option>
            </select>
          </div>
        </div>

        {/* prefers-color-scheme */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Moon className="w-4 h-4" /> prefers-color-scheme
          </h4>
          <div className="relative">
            <select
              value={colorScheme}
              onChange={(e) => handleColorSchemeChange(e.target.value)}
              disabled={!isActive}
              className="w-full h-10 px-3 bg-white/[0.02] border border-white/5 rounded-md text-text-secondary font-sans text-sm font-semibold outline-none cursor-pointer hover:border-brand-primary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <option value="light">☀️ Light Scheme</option>
              <option value="dark">🌙 Dark Scheme</option>
            </select>
          </div>
        </div>

        {/* Image Blocker Toggle */}
        <div className="flex flex-col gap-2">
          <div
            className={`flex items-center justify-between h-9 cursor-pointer select-none transition-opacity duration-150 ${
              isActive ? 'opacity-100' : 'opacity-50 cursor-not-allowed'
            }`}
            onClick={isActive ? handleBlockImagesToggle : undefined}
          >
            <span className="text-sm font-bold text-text-secondary flex items-center gap-1.5">
              {blockImages ? <ImageOff className="w-4 h-4 text-brand-red" /> : <Image className="w-4 h-4 text-brand-teal" />}
              Block Images
            </span>
            <button
              className={`relative w-10 h-6 rounded-full p-0.5 transition-colors duration-200 outline-none ${
                blockImages ? 'bg-brand-primary' : 'bg-white/10'
              }`}
              disabled={!isActive}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="block w-5 h-5 rounded-full bg-white shadow-md"
                style={{
                  marginLeft: blockImages ? '16px' : '0px'
                }}
              />
            </button>
          </div>
          <p className="text-xs text-text-muted leading-relaxed">
            Blocks image downloads at the container level to accelerate load times and conserve local network bandwidth.
          </p>
        </div>

        <div className="h-px bg-white/5 my-2" />

        {/* Privacy Cleaners */}
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Privacy & Cache
          </h4>
          <div className="flex flex-col gap-2 mt-1">
            <button
              className="w-full h-10 border border-white/5 bg-white/[0.02] text-text-secondary text-sm font-bold rounded-md hover:bg-white/[0.08] hover:border-brand-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              onClick={() => clearData('cookies')}
              disabled={!isActive}
            >
              Clear Cookies
            </button>
            <button
              className="w-full h-10 border border-white/5 bg-white/[0.02] text-text-secondary text-sm font-bold rounded-md hover:bg-white/[0.08] hover:border-brand-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              onClick={() => clearData('cache')}
              disabled={!isActive}
            >
              Clear Cache
            </button>
            <button
              className="w-full h-10 border border-brand-red/20 bg-brand-red-dim text-brand-red text-sm font-bold rounded-md hover:bg-brand-red/20 hover:border-brand-red hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              onClick={() => clearData('all')}
              disabled={!isActive}
            >
              Clear All Data
            </button>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}

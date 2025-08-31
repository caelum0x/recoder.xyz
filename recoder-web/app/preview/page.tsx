'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Monitor, Smartphone, Tablet, RotateCcw, RotateCw, 
  ZoomIn, ZoomOut, Maximize, Minimize, Eye, EyeOff,
  Play, Pause, RefreshCw, Share, Download, Settings,
  Code, Globe, Wifi, WifiOff, Clock, Activity,
  MousePointer, TouchpadIcon, Keyboard, Gamepad2,
  Zap, Bug, CheckCircle,
  ArrowLeft, ArrowRight, Home, ExternalLink, Copy
} from 'lucide-react';

export default function LivePreviewPage() {
  const [deviceType, setDeviceType] = useState('desktop');
  const [orientation, setOrientation] = useState('portrait');
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [networkCondition, setNetworkCondition] = useState('fast-3g');
  const [browser, setBrowser] = useState('chrome');
  const [url, setUrl] = useState('http://localhost:3000');
  const [logs, setLogs] = useState([]);
  const [performance, setPerformance] = useState({
    loadTime: 1.2,
    fcp: 0.8,
    lcp: 1.1,
    cls: 0.02,
    fid: 15
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [history, setHistory] = useState(['http://localhost:3000']);
  const [historyIndex, setHistoryIndex] = useState(0);

  const devicePresets = {
    desktop: { width: 1200, height: 800, userAgent: 'desktop' },
    tablet: { width: 768, height: 1024, userAgent: 'tablet' },
    mobile: { width: 375, height: 667, userAgent: 'mobile' },
    'mobile-large': { width: 414, height: 896, userAgent: 'mobile' },
    'iphone-se': { width: 375, height: 667, userAgent: 'iPhone' },
    'iphone-12': { width: 390, height: 844, userAgent: 'iPhone' },
    'iphone-14-pro': { width: 393, height: 852, userAgent: 'iPhone' },
    'samsung-s20': { width: 360, height: 800, userAgent: 'Android' },
    'ipad': { width: 768, height: 1024, userAgent: 'iPad' },
    'ipad-pro': { width: 1024, height: 1366, userAgent: 'iPad' }
  };

  const networkConditions = {
    'offline': { download: 0, upload: 0, latency: 0 },
    'slow-3g': { download: 500, upload: 500, latency: 400 },
    'fast-3g': { download: 1600, upload: 750, latency: 150 },
    '4g': { download: 9000, upload: 9000, latency: 170 },
    'wifi': { download: 30000, upload: 15000, latency: 2 }
  };

  const currentDevice = devicePresets[deviceType];
  const deviceWidth = orientation === 'landscape' && deviceType !== 'desktop' 
    ? currentDevice.height 
    : currentDevice.width;
  const deviceHeight = orientation === 'landscape' && deviceType !== 'desktop' 
    ? currentDevice.width 
    : currentDevice.height;

  const handleRefresh = () => {
    if (iframeRef.current) {
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
      }, 10);
    }
  };

  const handleNavigate = (newUrl) => {
    setUrl(newUrl);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setUrl(history[newIndex]);
    }
  };

  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setUrl(history[newIndex]);
    }
  };

  const handleZoomChange = (delta) => {
    const newZoom = Math.max(25, Math.min(200, zoom + delta));
    setZoom(newZoom);
  };

  const recentPages = [
    { title: 'Home Page', url: 'http://localhost:3000', status: 'success' },
    { title: 'About Us', url: 'http://localhost:3000/about', status: 'success' },
    { title: 'Contact', url: 'http://localhost:3000/contact', status: 'warning' },
    { title: 'Dashboard', url: 'http://localhost:3000/dashboard', status: 'error' }
  ];

  const consoleMessages = [
    { type: 'log', message: 'App initialized successfully', time: '14:32:01' },
    { type: 'warning', message: 'Deprecated API usage detected', time: '14:32:05' },
    { type: 'error', message: 'Failed to load image: favicon.ico', time: '14:32:06' },
    { type: 'info', message: 'Hot reload triggered', time: '14:32:12' }
  ];

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col">
      {/* Top Toolbar */}
      <div className="bg-slate-800 border-b border-slate-700 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-blue-400">Live Preview</h1>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsPlaying(!isPlaying)}
              className={`p-2 rounded ${isPlaying ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            
            <button 
              onClick={handleRefresh}
              className="p-2 bg-blue-600 hover:bg-blue-700 rounded"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            
            <button className="p-2 bg-purple-600 hover:bg-purple-700 rounded">
              <Share className="w-4 h-4" />
            </button>
            
            <button className="p-2 bg-gray-600 hover:bg-gray-700 rounded">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Device and Settings Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Device Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Device</label>
            <select 
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
            >
              <optgroup label="Desktop">
                <option value="desktop">Desktop (1200×800)</option>
              </optgroup>
              <optgroup label="Tablets">
                <option value="tablet">Generic Tablet</option>
                <option value="ipad">iPad (768×1024)</option>
                <option value="ipad-pro">iPad Pro (1024×1366)</option>
              </optgroup>
              <optgroup label="Mobile">
                <option value="mobile">Generic Mobile</option>
                <option value="iphone-se">iPhone SE</option>
                <option value="iphone-12">iPhone 12</option>
                <option value="iphone-14-pro">iPhone 14 Pro</option>
                <option value="samsung-s20">Samsung Galaxy S20</option>
              </optgroup>
            </select>
          </div>

          {/* Network Condition */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Network</label>
            <select 
              value={networkCondition}
              onChange={(e) => setNetworkCondition(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
            >
              <option value="wifi">WiFi</option>
              <option value="4g">4G</option>
              <option value="fast-3g">Fast 3G</option>
              <option value="slow-3g">Slow 3G</option>
              <option value="offline">Offline</option>
            </select>
          </div>

          {/* Browser */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Browser</label>
            <select 
              value={browser}
              onChange={(e) => setBrowser(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white"
            >
              <option value="chrome">Chrome</option>
              <option value="firefox">Firefox</option>
              <option value="safari">Safari</option>
              <option value="edge">Edge</option>
            </select>
          </div>

          {/* Zoom Controls */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Zoom</label>
            <div className="flex items-center space-x-2">
              <button 
                onClick={() => handleZoomChange(-25)}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm px-2">{zoom}%</span>
              <button 
                onClick={() => handleZoomChange(25)}
                className="p-2 bg-slate-700 hover:bg-slate-600 rounded"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              
              {deviceType !== 'desktop' && (
                <button 
                  onClick={() => setOrientation(orientation === 'portrait' ? 'landscape' : 'portrait')}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded ml-2"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col">
          {/* URL Bar */}
          <div className="p-4 border-b border-slate-700">
            <div className="flex items-center space-x-2 mb-3">
              <button 
                onClick={handleBack}
                disabled={historyIndex === 0}
                className="p-1 text-slate-400 hover:text-white disabled:opacity-50"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={handleForward}
                disabled={historyIndex === history.length - 1}
                className="p-1 text-slate-400 hover:text-white disabled:opacity-50"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleNavigate('http://localhost:3000')}
                className="p-1 text-slate-400 hover:text-white"
              >
                <Home className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleNavigate(url)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                placeholder="Enter URL..."
              />
              <button 
                onClick={() => navigator.clipboard.writeText(url)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button 
                onClick={() => window.open(url, '_blank')}
                className="p-2 text-slate-400 hover:text-white"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Performance</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Load Time</span>
                <span className="text-xs text-green-400">{performance.loadTime}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">First Contentful Paint</span>
                <span className="text-xs text-green-400">{performance.fcp}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Largest Contentful Paint</span>
                <span className="text-xs text-yellow-400">{performance.lcp}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Cumulative Layout Shift</span>
                <span className="text-xs text-green-400">{performance.cls}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">First Input Delay</span>
                <span className="text-xs text-green-400">{performance.fid}ms</span>
              </div>
            </div>
          </div>

          {/* Recent Pages */}
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Recent Pages</h3>
            <div className="space-y-2">
              {recentPages.map((page, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between p-2 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700"
                  onClick={() => handleNavigate(page.url)}
                >
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${
                      page.status === 'success' ? 'bg-green-400' :
                      page.status === 'warning' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <span className="text-xs text-slate-300 truncate">{page.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Console */}
          <div className="flex-1 p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Console</h3>
            <div className="space-y-1 text-xs font-mono max-h-40 overflow-y-auto">
              {consoleMessages.map((msg, index) => (
                <div 
                  key={index}
                  className={`flex items-start space-x-2 ${
                    msg.type === 'error' ? 'text-red-400' :
                    msg.type === 'warning' ? 'text-yellow-400' :
                    msg.type === 'info' ? 'text-blue-400' : 'text-slate-400'
                  }`}
                >
                  <span className="text-slate-500">[{msg.time}]</span>
                  <span>{msg.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-slate-700 flex items-center justify-center p-8 relative">
          {/* Device Frame */}
          <div className="relative">
            {/* Device Bezel for Mobile/Tablet */}
            {deviceType !== 'desktop' && (
              <div 
                className="bg-slate-800 rounded-lg shadow-2xl p-4"
                style={{
                  width: deviceWidth * (zoom / 100) + 32,
                  height: deviceHeight * (zoom / 100) + 32
                }}
              >
                {/* Device Header */}
                <div className="bg-slate-900 rounded-t-md h-6 flex items-center justify-center mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-1 h-1 bg-slate-600 rounded-full" />
                    <div className="w-8 h-1 bg-slate-600 rounded-full" />
                    <div className="w-1 h-1 bg-slate-600 rounded-full" />
                  </div>
                </div>
                
                {/* Screen */}
                <div 
                  className="bg-white rounded overflow-hidden"
                  style={{
                    width: deviceWidth * (zoom / 100),
                    height: deviceHeight * (zoom / 100) - 32
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    src={url}
                    className="w-full h-full border-0"
                    style={{
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                      width: deviceWidth,
                      height: deviceHeight - 32
                    }}
                    title="Live Preview"
                  />
                </div>
              </div>
            )}

            {/* Desktop View */}
            {deviceType === 'desktop' && (
              <div 
                className="bg-white rounded-lg shadow-2xl overflow-hidden"
                style={{
                  width: deviceWidth * (zoom / 100),
                  height: deviceHeight * (zoom / 100)
                }}
              >
                <iframe
                  ref={iframeRef}
                  src={url}
                  className="w-full h-full border-0"
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top left',
                    width: deviceWidth,
                    height: deviceHeight
                  }}
                  title="Live Preview"
                />
              </div>
            )}

            {/* Device Info Overlay */}
            <div className="absolute -top-8 left-0 bg-slate-800 px-3 py-1 rounded text-xs text-slate-300">
              {deviceWidth} × {deviceHeight} ({zoom}%)
            </div>

            {/* Network Status */}
            <div className="absolute -top-8 right-0 bg-slate-800 px-3 py-1 rounded text-xs text-slate-300 flex items-center space-x-2">
              {networkCondition === 'offline' ? (
                <WifiOff className="w-3 h-3 text-red-400" />
              ) : (
                <Wifi className="w-3 h-3 text-green-400" />
              )}
              <span>{networkConditions[networkCondition].download}kb/s</span>
            </div>
          </div>

          {/* Floating Controls */}
          <div className="absolute bottom-4 right-4 bg-slate-800 rounded-lg p-2 flex items-center space-x-2">
            <button 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-slate-400 hover:text-white"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
            
            <button className="p-2 text-slate-400 hover:text-white">
              <Download className="w-4 h-4" />
            </button>
            
            <button className="p-2 text-slate-400 hover:text-white">
              <Code className="w-4 h-4" />
            </button>
          </div>

          {/* Loading Overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 bg-slate-900/75 flex items-center justify-center">
              <div className="bg-slate-800 rounded-lg p-6 text-center">
                <Pause className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-slate-400">Preview Paused</p>
                <button 
                  onClick={() => setIsPlaying(true)}
                  className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
                >
                  Resume
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="bg-slate-800 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Activity className="w-3 h-3 text-green-400" />
            <span className="text-slate-400">Live</span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-slate-400">Last updated: {new Date().toLocaleTimeString()}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="text-slate-400">
            {deviceType} • {networkCondition} • {browser}
          </span>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400">Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

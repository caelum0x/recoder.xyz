'use client';

import { useState, useEffect, useRef } from 'react';
const RECODER_ECOSYSTEM_APPS = [
  { id: 'web', label: 'Recoder Web', description: 'AI-powered coding platform', href: 'https://recoder.xyz' },
  { id: 'app', label: 'Recoder App', description: 'Dashboard & settings', href: 'https://app.recoder.xyz' },
  { id: 'agency', label: 'Recoder Agency', description: 'AI agent workflows', href: 'https://agency.recoder.xyz' },
  { id: 'studio', label: 'Giselle Studio', description: 'Visual workflow designer', href: 'https://studio.giselles.ai' },
];

export function AppSwitcher() {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [currentHost, setCurrentHost] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentHost(window.location.hostname);
    }
  }, []);

  const isCurrentApp = (href: string) => {
    try {
      return currentHost === new URL(href).hostname;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 transition-all"
        aria-label="Switch app"
        title="Recoder Platform"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-56 py-2 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-50">
          <div className="px-4 py-1.5 text-xs text-gray-500 font-medium">Recoder Platform</div>
          {RECODER_ECOSYSTEM_APPS.map((app) => {
            const isCurrent = isCurrentApp(app.href);
            return (
            <a
              key={app.id}
              href={app.href}
              onClick={() => setShowMenu(false)}
              className={`w-full px-4 py-2 flex items-center justify-between hover:bg-white/10 transition-colors ${
                isCurrent ? 'text-orange-500' : 'text-gray-300'
              }`}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium">{app.label}</span>
                <span className="text-[11px] text-gray-500">{app.description}</span>
              </div>
              {isCurrent && (
                <div className="w-2 h-2 bg-orange-500 rounded-full" />
              )}
            </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

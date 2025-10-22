/**
 * ThemeToggle Component
 * Toggle button for switching between light, dark, and system themes
 */

'use client';

import { useThemeContext } from './ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export function ThemeToggle() {
  const { theme, setTheme, mounted } = useThemeContext();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="w-9 h-9 bg-white/5 rounded-lg animate-pulse" />
    );
  }

  const themes = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  const currentTheme = themes.find(t => t.value === theme) || themes[1];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 transition-all"
        aria-label="Toggle theme"
        title={`Current theme: ${currentTheme.label}`}
      >
        <CurrentIcon className="w-4 h-4 text-gray-400" />
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 py-2 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-xl z-50">
          {themes.map((themeOption) => {
            const Icon = themeOption.icon;
            const isActive = theme === themeOption.value;
            
            return (
              <button
                key={themeOption.value}
                onClick={() => {
                  setTheme(themeOption.value);
                  setShowMenu(false);
                }}
                className={`w-full px-4 py-2 flex items-center space-x-3 hover:bg-white/10 transition-colors ${
                  isActive ? 'text-orange-500' : 'text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{themeOption.label}</span>
                {isActive && (
                  <div className="ml-auto w-2 h-2 bg-orange-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * ThemeSelector — Compact dropdown for selecting the active theme.
 * Placed in the chat header alongside ModelSelector.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useThemes } from '~/lib/hooks/useThemes';

export function ThemeSelector() {
  const {
    builtinThemes,
    customThemes,
    projectThemeId,
    setProjectTheme,
    removeProjectTheme,
  } = useThemes();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [isOpen]);

  const currentThemeName = useCallback(() => {
    if (!projectThemeId) return 'No Theme';
    const builtin = builtinThemes.find(t => t.id === projectThemeId);
    if (builtin) return builtin.name;
    const custom = customThemes.find(t => t.id === projectThemeId);
    if (custom) return custom.name;
    return 'Unknown';
  }, [projectThemeId, builtinThemes, customThemes]);

  const handleSelect = useCallback(async (themeId: string | null) => {
    if (themeId) {
      await setProjectTheme(themeId);
    } else {
      await removeProjectTheme();
    }
    setIsOpen(false);
  }, [setProjectTheme, removeProjectTheme]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-1 transition-colors"
        title="Design Theme"
      >
        <div className="i-ph:palette text-sm text-purple-500" />
        <span className="max-w-[80px] truncate">{currentThemeName()}</span>
        <div className="i-ph:caret-down text-[10px]" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-2 shadow-lg z-50 overflow-hidden">
          <div className="max-h-64 overflow-auto py-1">
            {/* No theme */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-recoder-elements-background-depth-1 transition-colors ${
                !projectThemeId ? 'text-purple-500 font-medium' : 'text-recoder-elements-textSecondary'
              }`}
            >
              No Theme
            </button>

            {/* Divider */}
            <div className="border-t border-recoder-elements-borderColor my-1" />

            {/* Built-in themes */}
            <div className="px-3 py-1 text-[10px] text-recoder-elements-textSecondary font-medium uppercase tracking-wider">
              Built-in
            </div>
            {builtinThemes.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleSelect(theme.id)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-recoder-elements-background-depth-1 transition-colors ${
                  projectThemeId === theme.id ? 'text-purple-500 font-medium' : 'text-recoder-elements-textPrimary'
                }`}
              >
                {theme.name}
              </button>
            ))}

            {/* Custom themes */}
            {customThemes.length > 0 && (
              <>
                <div className="border-t border-recoder-elements-borderColor my-1" />
                <div className="px-3 py-1 text-[10px] text-recoder-elements-textSecondary font-medium uppercase tracking-wider">
                  Custom
                </div>
                {customThemes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleSelect(theme.id)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-recoder-elements-background-depth-1 transition-colors ${
                      projectThemeId === theme.id ? 'text-purple-500 font-medium' : 'text-recoder-elements-textPrimary'
                    }`}
                  >
                    {theme.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { getSwitcherApps, RECODER_SETTINGS_URLS } from '@recoder/ecosystem-config';

const currentAppId = 'web';
const apps = getSwitcherApps();

export function AppSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 bg-transparent text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary hover:bg-recoder-elements-background-depth-3 rounded-md transition-colors"
        title="Switch App"
        aria-label="Switch between Recoder apps"
      >
        <div className="i-ph:squares-four text-xl" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg shadow-lg z-50 py-1">
          {apps.map((app) => {
            const isCurrent = app.id === currentAppId;
            return (
              <a
                key={app.id}
                href={app.href}
                className={`flex flex-col gap-0.5 px-3 py-2 text-sm transition-colors ${
                  isCurrent
                    ? 'bg-recoder-elements-background-depth-3 text-recoder-elements-textPrimary'
                    : 'text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary'
                }`}
                onClick={() => setOpen(false)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">{app.label}</span>
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  )}
                </div>
                <span className="text-xs opacity-60 truncate">{app.description}</span>
              </a>
            );
          })}
          <div className="my-1 border-t border-recoder-elements-borderColor" />
          <a
            href={RECODER_SETTINGS_URLS.home.main}
            className="flex items-center justify-between px-3 py-2 text-sm text-recoder-elements-textSecondary transition-colors hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary"
            onClick={() => setOpen(false)}
          >
            <span className="font-medium truncate">Account Settings</span>
            <div className="i-ph:gear text-base opacity-60" />
          </a>
          <a
            href={RECODER_SETTINGS_URLS.home.security}
            className="flex items-center justify-between px-3 py-2 text-sm text-recoder-elements-textSecondary transition-colors hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary"
            onClick={() => setOpen(false)}
          >
            <span className="font-medium truncate">Security</span>
            <div className="i-ph:shield-check text-base opacity-60" />
          </a>
          <a
            href={RECODER_SETTINGS_URLS.home.aiProviders}
            className="flex items-center justify-between px-3 py-2 text-sm text-recoder-elements-textSecondary transition-colors hover:bg-recoder-elements-background-depth-3 hover:text-recoder-elements-textPrimary"
            onClick={() => setOpen(false)}
          >
            <span className="font-medium truncate">AI Providers</span>
            <div className="i-ph:key text-base opacity-60" />
          </a>
        </div>
      )}
    </div>
  );
}

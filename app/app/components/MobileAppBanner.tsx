'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const DISMISS_COOKIE = 'recoder-app-banner-dismissed';
const DISMISS_DAYS = 7;

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function detectPlatform(): 'ios' | 'android' | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}

export function MobileAppBanner() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    const dismissed = getCookie(DISMISS_COOKIE);
    const detected = detectPlatform();
    if (!dismissed && detected) {
      setPlatform(detected);
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setCookie(DISMISS_COOKIE, 'true', DISMISS_DAYS);
    setShow(false);
  };

  if (!show || !platform) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-background/95 backdrop-blur border-t shadow-lg md:hidden"
      style={{ paddingBottom: 'calc(var(--safe-area-bottom, 0px) + 12px)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="text-lg font-bold text-primary">R</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Recoder</div>
          <div className="text-xs text-muted-foreground">
            {platform === 'ios' ? 'Open in the App Store' : 'Open in Google Play'}
          </div>
        </div>
        <a
          href={
            platform === 'ios'
              ? 'https://apps.apple.com/app/recoder'
              : 'https://play.google.com/store/apps/details?id=xyz.recoder'
          }
          className="flex-shrink-0 rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open
        </a>
        <button
          onClick={dismiss}
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

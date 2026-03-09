'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    // Check initial state
    setIsOffline(!navigator.onLine);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className={cn(
      "fixed top-0 left-0 right-0 z-[100]",
      "flex items-center justify-center gap-2 py-1.5 px-4",
      "bg-amber-500/90 text-white text-sm font-medium",
      "animate-in slide-in-from-top duration-300"
    )}>
      <WifiOff className="h-4 w-4" />
      <span>You are offline — some features may be unavailable</span>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { pwaManager } from '@/lib/pwa/pwa-init';

export default function PWAInitializer() {
  useEffect(() => {
    // PWA is already initialized in pwa-init.ts
    // This component just ensures it runs in the app context
    
    const handlePWAUpdate = (event: CustomEvent) => {
      console.log('PWA update available:', event.detail);
      // You could show a toast or notification here
    };

    const handlePerformanceUpdate = (event: CustomEvent) => {
      console.log('Performance metrics updated:', event.detail);
      // You could update UI components here
    };

    // Listen for PWA events
    window.addEventListener('pwa-update-available', handlePWAUpdate as EventListener);
    window.addEventListener('pwa-performance-update', handlePerformanceUpdate as EventListener);

    return () => {
      window.removeEventListener('pwa-update-available', handlePWAUpdate as EventListener);
      window.removeEventListener('pwa-performance-update', handlePerformanceUpdate as EventListener);
    };
  }, []);

  return null; // This component doesn't render anything
}
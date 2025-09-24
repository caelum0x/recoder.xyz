'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOnline: boolean;
  isStandalone: boolean;
  isServiceWorkerSupported: boolean;
  isIOS: boolean;
  installPrompt: BeforeInstallPromptEvent | null;
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isOnline: true,
    isStandalone: false,
    isServiceWorkerSupported: false,
    isIOS: false,
    installPrompt: null,
  });

  useEffect(() => {
    // Check device capabilities
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isServiceWorkerSupported = 'serviceWorker' in navigator;
    const isOnline = navigator.onLine;

    setState(prev => ({
      ...prev,
      isIOS,
      isStandalone,
      isServiceWorkerSupported,
      isOnline,
      isInstalled: isStandalone,
    }));

    // Register service worker
    if (isServiceWorkerSupported && process.env.NODE_ENV === 'production') {
      registerServiceWorker();
    }

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setState(prev => ({
        ...prev,
        isInstallable: true,
        installPrompt: promptEvent,
      }));
    };

    // Listen for app installation
    const handleAppInstalled = () => {
      console.log('PWA installed');
      setState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
        installPrompt: null,
      }));
      toast.success('App installed successfully!');
    };

    // Listen for online/offline changes
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      toast.success('Back online!');
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      toast.info('You\'re offline. Some features may be limited.');
    };

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const installApp = async () => {
    if (!state.installPrompt) return false;

    try {
      await state.installPrompt.prompt();
      const { outcome } = await state.installPrompt.userChoice;
      
      setState(prev => ({
        ...prev,
        installPrompt: null,
        isInstallable: false,
      }));

      return outcome === 'accepted';
    } catch (error) {
      console.error('Install failed:', error);
      toast.error('Install failed. Please try again.');
      return false;
    }
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      console.log('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  };

  const showNotification = (title: string, options?: NotificationOptions) => {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      console.log('Notifications not supported');
      return;
    }

    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification(title, {
          icon: '/icon-192',
          badge: '/icon-192',
          // Note: vibrate is not part of standard NotificationOptions
          ...options,
        } as any);
      });
    }
  };

  return {
    ...state,
    installApp,
    requestNotificationPermission,
    showNotification,
  };
}

async function registerServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            toast.info('New app version available!', {
              action: {
                label: 'Update',
                onClick: () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                }
              }
            });
          }
        });
      }
    });

    // Background sync registration
    if ('sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        // Note: sync property may not be available in all browsers
        await (registration as any).sync?.register('background-sync');
        console.log('Background sync registered');
      } catch (error) {
        console.log('Background sync registration failed:', error);
      }
    }

    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    throw error;
  }
}
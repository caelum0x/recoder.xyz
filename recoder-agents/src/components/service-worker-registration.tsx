'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // When a new SW is found, force it to activate immediately
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New SW installed while old one is still controlling — skip waiting
              newWorker.postMessage('SKIP_WAITING');
            }
          });
        });

        // Check for updates on every page load
        reg.update().catch(() => {
          // Silently ignore update check failures (e.g. offline)
        });
      })
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });

    // When a new SW takes over, reload to pick up fresh assets
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  return null;
}

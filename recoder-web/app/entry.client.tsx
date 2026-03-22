import * as Sentry from '@sentry/browser';
import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

// Initialize Sentry for client-side error tracking (no-op if DSN not set)
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,

    // Disable performance monitoring to stay within free tier limits
    tracesSampleRate: 0,

    // Environment
    environment: import.meta.env.MODE || 'development',

    // Ignore common noise errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      'fb_xd_fragment',
      // ISP "optimizing" proxies
      'bmi_SafeAddOnload',
      'EBCallBackMessageReceived',
      'conduitPage',
      // Network errors
      'NetworkError',
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'AbortError',
      // ResizeObserver noise
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
    ],

    // Filter sensitive data before sending
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });
}

const rootElement = document.getElementById('root');

if (rootElement) {
  startTransition(() => {
    hydrateRoot(rootElement, <RemixBrowser />);
  });
} else {
  console.error('Root element not found. Retrying after DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    const retryRoot = document.getElementById('root');
    if (retryRoot) {
      startTransition(() => {
        hydrateRoot(retryRoot, <RemixBrowser />);
      });
    } else {
      console.error('Root element still not found after DOMContentLoaded.');
    }
  });
}

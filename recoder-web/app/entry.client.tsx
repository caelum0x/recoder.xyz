import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

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

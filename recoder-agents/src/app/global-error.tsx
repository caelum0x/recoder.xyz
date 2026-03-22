'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#0a0a0a', color: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px 20px' }}>
          <img src="/logo.png" alt="Recoder" width={48} height={48} style={{ marginBottom: '24px', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: '14px', color: '#888', margin: '0 0 24px' }}>An unexpected error occurred. Please try again.</p>
          <button onClick={reset} style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', background: '#f97316', color: '#fff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}

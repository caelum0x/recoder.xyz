'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <img src="/logo.png" alt="Recoder" className="w-12 h-12" />
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            A critical error occurred. Please try again.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium">Application Error</div>
              <div className="text-xs text-muted-foreground">
                {error.digest ? `Error ID: ${error.digest}` : 'Unexpected failure'}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => reset()}
          className="w-full px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { ErrorBoundaryFallback } from '@/components/ui/error-boundary';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return <ErrorBoundaryFallback error={error} reset={reset} variant="page" />;
}

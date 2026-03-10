'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBg } from '@/components/ui/animated-bg';
import { RecoderLogo } from '@/components/sidebar/recoder-logo';
import { ErrorBoundaryFallback } from '@/components/ui/error-boundary';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="w-full relative overflow-hidden min-h-[100dvh]">
      <div className="relative flex flex-col items-center w-full px-3 sm:px-6 min-h-[100dvh] justify-center py-8">
        <AnimatedBg variant="hero" />

        <div className="relative z-10 w-full max-w-[456px] flex flex-col items-center gap-5 sm:gap-8">
          <RecoderLogo size={28} className="sm:w-8 sm:h-8" />

          <ErrorBoundaryFallback error={error} reset={reset} variant="page" />

          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full h-12 rounded-lg font-medium"
          >
            <Link href="/" className="flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

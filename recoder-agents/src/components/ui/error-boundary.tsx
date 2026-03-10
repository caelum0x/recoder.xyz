'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  WifiOff,
  LogIn,
  ServerCrash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export interface ErrorBoundaryFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: 'page' | 'inline';
}

const FEEDBACK_URL = 'https://github.com/recoder-xyz/feedback/issues';

function getFriendlyError(error: Error & { digest?: string }): {
  title: string;
  message: string;
  icon: React.ComponentType<{ className?: string }>;
} {
  const msg = error.message?.toLowerCase() ?? '';

  if (
    msg.includes('networkerror') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('connection')
  ) {
    return {
      title: 'Connection lost',
      message:
        'We couldn\'t reach the server. Please check your internet connection and try again.',
      icon: WifiOff,
    };
  }

  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('session expired')) {
    return {
      title: 'Session expired',
      message: 'Your session has expired. Please sign in again to continue.',
      icon: LogIn,
    };
  }

  if (msg.includes('403') || msg.includes('forbidden') || msg.includes('permission')) {
    return {
      title: 'Access denied',
      message: 'You don\'t have permission to view this page.',
      icon: AlertCircle,
    };
  }

  if (msg.includes('500') || msg.includes('internal server')) {
    return {
      title: 'Something went wrong',
      message:
        'We\'re experiencing a server issue. Our team has been notified and is working on a fix.',
      icon: ServerCrash,
    };
  }

  return {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
    icon: AlertCircle,
  };
}

export function ErrorBoundaryFallback({
  error,
  reset,
  variant = 'page',
}: ErrorBoundaryFallbackProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const friendly = getFriendlyError(error);
  const Icon = friendly.icon;

  if (variant === 'inline') {
    return (
      <Card className="w-full bg-card border border-border">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10">
              <Icon className="h-4 w-4 text-red-500" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h3 className="text-sm font-medium text-foreground">
                {friendly.title}
              </h3>
              <p className="text-xs text-foreground/60">{friendly.message}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={reset} size="sm" className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Try Again
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-foreground/50">
              <Link
                href={FEEDBACK_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Report Issue
              </Link>
            </Button>
          </div>
          {(error.message || error.digest) && (
            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-foreground/40 hover:text-foreground/60 transition-colors"
                >
                  {detailsOpen ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  Error details
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <pre className="mt-2 text-[11px] text-foreground/40 bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {error.digest && `Error ID: ${error.digest}\n`}
                  {error.message}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>
    );
  }

  // Page variant
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            'bg-red-500/10'
          )}
        >
          <Icon className="h-8 w-8 text-red-500" />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-xl font-semibold text-foreground">
            {friendly.title}
          </h2>
          <p className="text-sm text-foreground/60 max-w-sm">
            {friendly.message}
          </p>
        </div>

        <div className="flex gap-3 w-full">
          <Button onClick={reset} className="flex-1 gap-2">
            <RotateCcw className="h-4 w-4" />
            Try Again
          </Button>
          <Button
            asChild
            variant="outline"
            className="flex-1 gap-2 text-foreground/70"
          >
            <Link
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              Report Issue
            </Link>
          </Button>
        </div>

        {(error.message || error.digest) && (
          <Collapsible
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            className="w-full"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/60 transition-colors mx-auto"
              >
                {detailsOpen ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                View error details
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-3 text-[11px] text-foreground/40 bg-muted/50 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all border border-border/50">
                {error.digest && `Error ID: ${error.digest}\n`}
                {error.message}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

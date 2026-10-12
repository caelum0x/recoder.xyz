'use client';

import Link from 'next/link';
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';

interface BillingShellProps {
  title: string;
  description?: string;
  backLink?: string;
  backText?: string;
  children: React.ReactNode;
}

export function BillingShell({
  title,
  description,
  backLink = '/dashboard',
  backText = 'Back to Dashboard',
  children,
}: BillingShellProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto max-w-4xl px-6 py-16 md:py-24">
        <Link
          href={backLink}
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          {backText}
        </Link>
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold">{title}</h1>
          {description ? <p className="mt-2 text-gray-400">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function BillingLoadingBlock() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-8 text-gray-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span>Loading your billing details…</span>
    </div>
  );
}

interface BillingErrorBlockProps {
  message: string;
  onRetry?: () => void;
}

export function BillingErrorBlock({ message, onRetry }: BillingErrorBlockProps) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-300 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-red-100">{message}</p>
          {onRetry ? (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium hover:border-white/40 transition-colors"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

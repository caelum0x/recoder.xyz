'use client';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';

interface ReactivateButtonProps {
  onReactivated: () => void;
  className?: string;
}

/**
 * Resumes a subscription scheduled to cancel. The server (gated on the payment
 * provider) is authoritative; on success we ask the parent to refresh so the UI
 * reflects the real, provider-confirmed state rather than an optimistic guess.
 */
export function ReactivateButton({ onReactivated, className }: ReactivateButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reactivate = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/subscription/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok || !json?.success) {
        setError(json?.error || 'Could not reactivate the subscription. Please try again.');
        return;
      }
      onReactivated();
    } catch {
      setError('Could not reactivate the subscription. Please check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <button
        onClick={reactivate}
        disabled={pending}
        className={
          className ??
          'inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-neutral-200 disabled:opacity-60'
        }
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        {pending ? 'Reactivating…' : 'Resume subscription'}
      </button>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}

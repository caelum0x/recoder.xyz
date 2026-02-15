/**
 * TokenCounter
 *
 * Compact indicator that shows how much of the model's context window
 * the current conversation is using.  Clicking it reveals a detailed
 * breakdown (system prompt, history, code context, latest message).
 *
 * Inspired by dyad's token counting UI pattern.
 */

import { useStore } from '@nanostores/react';
import { useState, useRef, useEffect } from 'react';
import { tokenBreakdownStore } from '~/lib/stores/token-usage';

export function TokenCounter() {
  const breakdown = useStore(tokenBreakdownStore);
  const [showDetails, setShowDetails] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the detail panel when clicking outside
  useEffect(() => {
    if (!showDetails) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowDetails(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDetails]);

  if (!breakdown) return null;

  const { percentage, total, limit } = breakdown;

  // Color thresholds: green < 50%, yellow 50-80%, red > 80%
  const color =
    percentage > 80
      ? 'text-red-400'
      : percentage > 50
        ? 'text-yellow-400'
        : 'text-bolt-elements-textSecondary';

  const barColor =
    percentage > 80
      ? 'bg-red-400'
      : percentage > 50
        ? 'bg-yellow-400'
        : 'bg-bolt-elements-borderColor';

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-1.5 text-xs ${color} hover:opacity-80 transition-opacity px-2 py-1 rounded`}
        title={`${formatK(total)} / ${formatK(limit)} tokens (${percentage}%)`}
      >
        {/* Mini progress bar */}
        <div className="w-12 h-1.5 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span>{formatK(total)}</span>
      </button>

      {showDetails && (
        <div className="absolute bottom-full right-0 mb-2 p-3 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-lg text-xs min-w-[220px] z-50">
          <div className="font-medium text-bolt-elements-textPrimary mb-2">
            Token Usage
          </div>

          <div className="space-y-1.5">
            <TokenRow
              label="System prompt"
              tokens={breakdown.systemPrompt}
              total={total}
            />
            <TokenRow
              label="Chat history"
              tokens={breakdown.messageHistory}
              total={total}
            />
            <TokenRow
              label="Code context"
              tokens={breakdown.codebaseContext}
              total={total}
            />
            <TokenRow
              label="Your message"
              tokens={breakdown.lastMessage}
              total={total}
            />
          </div>

          <div className="mt-2 pt-2 border-t border-bolt-elements-borderColor flex justify-between text-bolt-elements-textPrimary">
            <span>Total</span>
            <span>
              {formatK(total)} / {formatK(limit)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function TokenRow({
  label,
  tokens,
  total,
}: {
  label: string;
  tokens: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((tokens / total) * 100) : 0;

  return (
    <div className="flex justify-between text-bolt-elements-textSecondary">
      <span>{label}</span>
      <span>
        {formatK(tokens)} ({pct}%)
      </span>
    </div>
  );
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

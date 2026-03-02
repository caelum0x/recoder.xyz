import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface LoadingIndicatorProps {
  className?: string;
}

const LOADING_MESSAGES = [
  { text: 'Analyzing your request...', duration: 2000 },
  { text: 'Selecting optimal AI model...', duration: 1500 },
  { text: 'Planning project structure...', duration: 2000 },
  { text: 'Generating code...', duration: 3000 },
  { text: 'Creating components...', duration: 2500 },
  { text: 'Setting up configuration...', duration: 2000 },
  { text: 'Almost done...', duration: 1500 },
];

export function LoadingIndicator({ className }: LoadingIndicatorProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Cycle through loading messages
    const currentMessage = LOADING_MESSAGES[messageIndex];
    const timer = setTimeout(() => {
      if (messageIndex < LOADING_MESSAGES.length - 1) {
        setMessageIndex((prev) => prev + 1);
        setProgress(((messageIndex + 1) / LOADING_MESSAGES.length) * 100);
      }
    }, currentMessage.duration);

    return () => clearTimeout(timer);
  }, [messageIndex]);

  const currentMessage = LOADING_MESSAGES[messageIndex];

  return (
    <div className={classNames('flex flex-col items-center justify-center gap-4 p-6', className)}>
      {/* Spinning indicator */}
      <div className="i-svg-spinners:90-ring-with-bg text-4xl text-recoder-elements-loader-progress"></div>

      {/* Loading message */}
      <div className="text-center">
        <p className="text-lg font-medium text-recoder-elements-textPrimary mb-2">
          {currentMessage.text}
        </p>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-recoder-elements-background-depth-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-500 via-accent-400 to-accent-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress + 10, 95)}%` }}
        />
      </div>

      {/* Step indicator */}
      <div className="text-xs text-recoder-elements-textTertiary">
        Step {messageIndex + 1} of {LOADING_MESSAGES.length}
      </div>
    </div>
  );
}

// Simple version for inline loading (smaller)
export function InlineLoadingIndicator({ message = 'Processing...' }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 text-recoder-elements-textSecondary">
      <div className="i-svg-spinners:3-dots-fade text-xl"></div>
      <span className="text-sm">{message}</span>
    </div>
  );
}

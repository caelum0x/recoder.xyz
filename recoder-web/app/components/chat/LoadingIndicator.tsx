import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface LoadingIndicatorProps {
  className?: string;
}

const LOADING_MESSAGES = [
  { icon: '🔍', text: 'Analyzing your request...', duration: 2000 },
  { icon: '🧠', text: 'Selecting optimal AI model...', duration: 1500 },
  { icon: '📁', text: 'Planning project structure...', duration: 2000 },
  { icon: '⚡', text: 'Generating code with AI...', duration: 3000 },
  { icon: '🎨', text: 'Creating components...', duration: 2500 },
  { icon: '🔧', text: 'Setting up configuration...', duration: 2000 },
  { icon: '✅', text: 'Almost done...', duration: 1500 },
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
      {/* Animated icon */}
      <div className="relative">
        <div className="text-6xl animate-bounce">{currentMessage.icon}</div>
        {/* Pulse effect */}
        <div className="absolute inset-0 text-6xl animate-ping opacity-20">{currentMessage.icon}</div>
      </div>

      {/* Loading message */}
      <div className="text-center">
        <p className="text-lg font-medium text-bolt-elements-textPrimary mb-2 animate-fade-in">
          {currentMessage.text}
        </p>
        
        {/* Spinning dots indicator */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="i-svg-spinners:3-dots-fade text-2xl text-bolt-elements-textSecondary"></div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-64 h-1.5 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent-500 via-accent-400 to-accent-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(progress + 10, 95)}%` }}
        />
      </div>

      {/* Step indicator */}
      <div className="text-xs text-bolt-elements-textTertiary">
        Step {messageIndex + 1} of {LOADING_MESSAGES.length}
      </div>

      {/* Model badge (optional - shows which model is being used) */}
      {messageIndex >= 2 && (
        <div className="mt-2 px-3 py-1.5 bg-bolt-elements-background-depth-2 rounded-full border border-bolt-elements-borderColor animate-fade-in">
          <span className="text-xs font-medium text-bolt-elements-textSecondary">
            Powered by Claude Sonnet 4
          </span>
        </div>
      )}
    </div>
  );
}

// Simple version for inline loading (smaller)
export function InlineLoadingIndicator({ message = 'Processing...' }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
      <div className="i-svg-spinners:3-dots-fade text-xl"></div>
      <span className="text-sm">{message}</span>
    </div>
  );
}

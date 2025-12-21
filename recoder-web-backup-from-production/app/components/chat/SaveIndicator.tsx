import { useEffect, useState } from 'react';
import { classNames } from '~/utils/classNames';

interface SaveIndicatorProps {
  isSaving: boolean;
  lastSaved?: Date;
}

export function SaveIndicator({ isSaving, lastSaved }: SaveIndicatorProps) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!isSaving && lastSaved) {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, lastSaved]);

  if (!isSaving && !showSaved) {
    return null;
  }

  return (
    <div
      className={classNames(
        'fixed top-4 right-4 z-50 px-3 py-2 rounded-lg shadow-lg transition-all duration-300',
        'text-sm font-medium flex items-center gap-2',
        isSaving
          ? 'bg-blue-500 text-white'
          : 'bg-green-500 text-white'
      )}
    >
      {isSaving ? (
        <>
          <div className="i-ph:circle-notch animate-spin" />
          <span>Saving chat...</span>
        </>
      ) : (
        <>
          <div className="i-ph:check-circle" />
          <span>Saved</span>
        </>
      )}
    </div>
  );
}

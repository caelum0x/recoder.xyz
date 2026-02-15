import { useEffect, useRef, useCallback } from 'react';

const DRAFT_PREFIX = 'recoder_chat_draft_';
const DEBOUNCE_MS = 500;

export function useChatDraft(
  chatId: string | undefined,
  input: string,
  setInput: (value: string) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredRef = useRef(false);
  const draftRestoredRef = useRef(false);

  const storageKey = chatId ? `${DRAFT_PREFIX}${chatId}` : null;

  // Restore draft on mount (once per chatId)
  useEffect(() => {
    if (!storageKey) return;
    restoredRef.current = false;
    draftRestoredRef.current = false;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && saved.trim().length > 0) {
        setInput(saved);
        draftRestoredRef.current = true;
      }
    } catch {
      // localStorage not available
    }
    restoredRef.current = true;
  }, [storageKey]);

  // Debounced save
  useEffect(() => {
    if (!storageKey || !restoredRef.current) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      try {
        if (input.trim().length > 0) {
          localStorage.setItem(storageKey, input);
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch {
        // localStorage full or not available
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [input, storageKey]);

  const clearDraft = useCallback(() => {
    if (!storageKey) return;
    draftRestoredRef.current = false;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return {
    clearDraft,
    wasDraftRestored: draftRestoredRef.current,
  };
}

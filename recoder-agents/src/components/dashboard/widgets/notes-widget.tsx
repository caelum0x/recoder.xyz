'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateWidget } from '@/hooks/dashboard/use-dashboard-widgets';

interface NotesWidgetProps {
  widgetId: string;
  config: Record<string, any>;
}

export function NotesWidget({ widgetId, config }: NotesWidgetProps) {
  const [notes, setNotes] = useState<string>(config?.notes ?? '');
  const updateWidget = useUpdateWidget();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from config when it changes externally
  useEffect(() => {
    if (config?.notes !== undefined && config.notes !== notes) {
      setNotes(config.notes);
    }
    // Only sync on config change, not notes change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.notes]);

  const debouncedSave = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateWidget.mutate({
          widgetId,
          data: { config: { ...config, notes: value } },
        });
      }, 800);
    },
    [widgetId, config, updateWidget]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNotes(value);
    debouncedSave(value);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <Textarea
      value={notes}
      onChange={handleChange}
      placeholder="Write your notes here..."
      className="min-h-[100px] resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
    />
  );
}

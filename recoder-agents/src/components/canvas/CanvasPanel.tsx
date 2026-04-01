'use client';

import '@excalidraw/excalidraw/index.css';

import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { Button } from '@/components/ui/button';
import { RecoderLoader } from '@/components/ui/recoder-loader';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  consumePendingCanvasRefreshEvent,
  doesCanvasRefreshMatchFilePath,
  normalizeCanvasWorkspacePath,
} from '@/lib/canvas/live-updates';
import {
  getExcalidrawDisplayName,
  parseExcalidrawScene,
  serializeExcalidrawScene,
} from '@/lib/canvas/excalidraw';
import { useFileContent } from '@/hooks/files';

const Excalidraw = dynamic(
  () => import('@excalidraw/excalidraw').then((mod) => mod.Excalidraw),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading board...
      </div>
    ),
  }
);

interface CanvasPanelProps {
  content: string | null;
  fileName: string;
  className?: string;
  onSave?: (content: string) => Promise<void>;
  /** Thread ID used to subscribe to live agent canvas updates via SSE */
  threadId?: string;
  filePath?: string;
  sandboxId?: string;
}

function serializeScene(
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles
): string {
  return serializeExcalidrawScene({ elements: [...elements], appState, files });
}

export function CanvasPanel({
  content,
  fileName,
  className,
  onSave,
  threadId,
  filePath,
  sandboxId,
}: CanvasPanelProps) {
  const { resolvedTheme } = useTheme();
  const [instanceKey, setInstanceKey] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncedContent, setSyncedContent] = useState(content);

  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSavedContentRef = useRef('');
  const draftContentRef = useRef('');
  const pendingExternalRefreshRef = useRef(false);
  const draftSceneRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const resolvedFilePath = useMemo(() => normalizeCanvasWorkspacePath(filePath), [filePath]);
  const { refetch: refetchContent } = useFileContent(sandboxId, resolvedFilePath || undefined, {
    enabled: false,
  });

  const initialData = useMemo<ExcalidrawInitialDataState>(() => {
    const parsed = parseExcalidrawScene(syncedContent);

    return {
      ...parsed,
      appState: {
        ...parsed.appState,
        viewBackgroundColor:
          typeof parsed.appState.viewBackgroundColor === 'string'
            ? parsed.appState.viewBackgroundColor
            : resolvedTheme === 'dark'
              ? '#0b0d12'
              : '#ffffff',
      },
      scrollToContent: parsed.elements.length > 0,
    } as ExcalidrawInitialDataState;
  }, [resolvedTheme, syncedContent]);

  useEffect(() => {
    setSyncedContent(content);
  }, [content, fileName]);

  useEffect(() => {
    const normalized = serializeScene(
      initialData.elements as readonly ExcalidrawElement[],
      initialData.appState as AppState,
      (initialData.files || {}) as BinaryFiles
    );

    lastSavedContentRef.current = normalized;
    draftContentRef.current = normalized;
    draftSceneRef.current = {
      elements: initialData.elements as readonly ExcalidrawElement[],
      appState: initialData.appState as AppState,
      files: (initialData.files || {}) as BinaryFiles,
    };
    setHasUnsavedChanges(false);
    setInstanceKey((current) => current + 1);
  }, [initialData]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const serialized = serializeScene(elements, appState, files);

      draftSceneRef.current = { elements, appState, files };
      draftContentRef.current = serialized;
      setHasUnsavedChanges(serialized !== lastSavedContentRef.current);
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!onSave || !draftSceneRef.current) {
      return;
    }

    try {
      setIsSaving(true);
      await onSave(draftContentRef.current);
      setSyncedContent(draftContentRef.current);
      lastSavedContentRef.current = draftContentRef.current;
      setHasUnsavedChanges(false);
      toast.success('Board saved');
    } catch (error) {
      console.error('[CanvasPanel] Failed to save board', error);
      toast.error('Failed to save board');
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  const refreshFromSandboxFile = useCallback(async () => {
    if (!sandboxId || !resolvedFilePath) {
      return;
    }

    if (hasUnsavedChanges || isSaving) {
      pendingExternalRefreshRef.current = true;
      return;
    }

    const result = await refetchContent();
    const nextContent = result.data;

    if (typeof nextContent === 'string') {
      pendingExternalRefreshRef.current = false;
      setSyncedContent(nextContent);
    }
  }, [hasUnsavedChanges, isSaving, refetchContent, resolvedFilePath, sandboxId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();

      if (!isSaving && hasUnsavedChanges && onSave) {
        void handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, hasUnsavedChanges, isSaving, onSave]);

  // Live canvas updates via SSE — agent calls recoder_canvas_update MCP tool →
  // docker-backend broadcasts → recoder-agents /api/canvas/subscribe SSE → here.
  useEffect(() => {
    if (!threadId) return;

    const es = new EventSource(`/api/canvas/subscribe/${threadId}`);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string; elements?: ExcalidrawElement[] };
        if (payload.type === 'canvas_update' && Array.isArray(payload.elements) && excalidrawAPIRef.current) {
          // Non-destructive patch: preserves viewport/selection/appState
          excalidrawAPIRef.current.updateScene({ elements: payload.elements });
        }
      } catch {
        // ignore malformed events
      }
    };

    return () => es.close();
  }, [threadId]);

  useEffect(() => {
    if (!resolvedFilePath) return;

    const handleCanvasUpdate = (event: CustomEvent<{ canvasPath: string; timestamp: number }>) => {
      if (!doesCanvasRefreshMatchFilePath(resolvedFilePath, event.detail.canvasPath)) {
        return;
      }

      void refreshFromSandboxFile();
    };

    window.addEventListener('canvas-tool-updated', handleCanvasUpdate as EventListener);

    const pendingEvents = window.__pendingCanvasRefreshEvents;
    if (consumePendingCanvasRefreshEvent(resolvedFilePath, pendingEvents)) {
      void refreshFromSandboxFile();
    }

    return () => {
      window.removeEventListener('canvas-tool-updated', handleCanvasUpdate as EventListener);
    };
  }, [refreshFromSandboxFile, resolvedFilePath]);

  useEffect(() => {
    if (!pendingExternalRefreshRef.current || hasUnsavedChanges || isSaving) {
      return;
    }

    void refreshFromSandboxFile();
  }, [hasUnsavedChanges, isSaving, refreshFromSandboxFile]);

  return (
    <div className={cn('flex h-full w-full min-h-0 flex-col bg-background', className)}>
      <div className="flex h-12 items-center justify-between border-b px-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {getExcalidrawDisplayName(fileName) || 'Board'}
          </div>
          <div className="text-xs text-muted-foreground">
            Excalidraw board
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className={cn('gap-2', hasUnsavedChanges && 'text-primary')}
          onClick={() => void handleSave()}
          disabled={!onSave || isSaving || !hasUnsavedChanges}
        >
          {isSaving ? <RecoderLoader size="small" /> : <Save className="h-4 w-4" />}
          <span>{isSaving ? 'Saving' : hasUnsavedChanges ? 'Save' : 'Saved'}</span>
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        <Excalidraw
          key={instanceKey}
          initialData={initialData}
          onChange={handleChange}
          excalidrawAPI={(api) => { excalidrawAPIRef.current = api; }}
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          name={fileName}
          detectScroll
          handleKeyboardGlobally
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveAsImage: true,
            },
          }}
        />
      </div>
    </div>
  );
}

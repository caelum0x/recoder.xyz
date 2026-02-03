import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { GitHubSyncModal } from './GitHubSyncModal';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { BuildProgressIndicator } from './BuildProgressIndicator';
import { CompactActionStatus } from './ActionStatusPanel';
import { useLSPDiagnostics } from '~/lib/hooks/useLSPDiagnostics';
import { useFileWatcher } from '~/lib/hooks/useFileWatcher';
import { useAutoErrorFix } from '~/lib/hooks/useAutoErrorFix';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  right: {
    value: 'preview',
    text: 'Preview',
  },
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Get projectId (stable atom) and containerReady from workbench store
  // NOTE: Use projectId atom (stable) NOT currentProjectId getter (creates new atom each call)
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);

  // Connect to LSP diagnostics WebSocket
  useLSPDiagnostics(projectId);

  // File watcher for CLI tool integration (claude, recoder-code)
  // Auto-refreshes preview and file tree when files change
  useFileWatcher({
    enabled: !!projectId && containerReady,
    onFileChange: (changes) => {
      // Refresh file tree
      workbenchStore.refreshFiles?.();
    },
    onPreviewRefresh: () => {
      // Preview will auto-refresh via the recoder:file-changed event
      console.log('[Workbench] File change detected, preview will refresh');
    },
  });

  // Auto-fix build errors - automatically sends errors to AI for fixing (no UI)
  useAutoErrorFix({
    enabled: !!projectId && containerReady,
    isStreaming: !!isStreaming,
    debounceMs: 3000,
    maxAttempts: 10,
  });

  // Kill container on tab close to prevent container leaks
  useEffect(() => {
    if (!projectId || !containerReady) return;

    const handleBeforeUnload = () => {
      const blob = new Blob(
        [JSON.stringify({ projectId })],
        { type: 'application/json' }
      );
      navigator.sendBeacon('/api/kill-sandbox', blob);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [projectId, containerReady]);

  // Listen for action execution errors and container errors, show toast
  useEffect(() => {
    const actionErrorHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const filePath = detail?.filePath ? ` (${detail.filePath})` : '';
      toast.error(`Action failed${filePath}: ${detail?.error || 'Unknown error'}`);
    };
    const containerErrorHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      toast.error(detail?.message || 'Container creation failed. File operations may not work.');
    };

    window.addEventListener('recoder:action-error', actionErrorHandler);
    window.addEventListener('recoder:container-error', containerErrorHandler);
    return () => {
      window.removeEventListener('recoder:action-error', actionErrorHandler);
      window.removeEventListener('recoder:container-error', containerErrorHandler);
    };
  }, []);

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    }
  }, [hasPreview]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const [showGitHubModal, setShowGitHubModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const handleFilesUpdate = useCallback((newFiles: Record<string, string>) => {
    // console.log('📥 Updating files from GitHub:', Object.keys(newFiles).length, 'files');

    // Convert plain object to workbench format
    const updatedFiles: Record<string, any> = {};
    Object.entries(newFiles).forEach(([path, content]) => {
      updatedFiles[path] = {
        type: 'file',
        content,
        isBinary: false,
      };
    });

    workbenchStore.files.set(updatedFiles);
    workbenchStore.setDocuments(updatedFiles);
    workbenchStore.showWorkbench.set(true);
    toast.success(`Updated ${Object.keys(newFiles).length} files from GitHub`);
  }, []);

  return (
    chatStarted && (
      <motion.div
        initial="closed"
        animate={showWorkbench ? 'open' : 'closed'}
        variants={workbenchVariants}
        className="z-workbench"
      >
        <div
          className={classNames(
            'fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 w-[var(--workbench-inner-width)] mr-4 z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
            {
              'left-[var(--workbench-left)]': showWorkbench && !isFullscreen,
              'left-[100%]': !showWorkbench,
              'left-0 right-0 top-0 bottom-0 w-full mr-0 z-50': isFullscreen,
            },
          )}
        >
          <div className="absolute inset-0 px-6">
            <div className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor">
                <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                <div className="ml-auto" />
                {selectedView === 'code' && (
                  <>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      <div className={isFullscreen ? "i-ph:arrows-in" : "i-ph:arrows-out"} />
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setShowVersionHistory(true)}
                      title="Version History"
                    >
                      <div className="i-ph:clock-counter-clockwise" />
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setShowGitHubModal(true)}
                      title="GitHub Sync"
                    >
                      <div className="i-ph:git-branch" />
                    </PanelHeaderButton>
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => {
                        workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                      }}
                      title="Toggle Terminal"
                    >
                      <div className="i-ph:terminal" />
                    </PanelHeaderButton>
                  </>
                )}
                <IconButton
                  icon="i-ph:x-circle"
                  className="-mr-1"
                  size="xl"
                  onClick={() => {
                    workbenchStore.showWorkbench.set(false);
                  }}
                />
              </div>
              <div className="relative flex-1 overflow-hidden">
                <View
                  initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                  animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                >
                  <div className="relative h-full">
                    <EditorPanel
                      editorDocument={currentDocument}
                      isStreaming={isStreaming}
                      selectedFile={selectedFile}
                      files={files}
                      unsavedFiles={unsavedFiles}
                      onFileSelect={onFileSelect}
                      onEditorScroll={onEditorScroll}
                      onEditorChange={onEditorChange}
                      onFileSave={onFileSave}
                      onFileReset={onFileReset}
                    />
                    {/* Compact action progress indicator - floats at bottom-right of editor */}
                    <div className="absolute bottom-2 right-3 z-10">
                      <CompactActionStatus />
                    </div>
                  </div>
                </View>
                <View
                  initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                  animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                >
                  <Preview />
                </View>
              </div>
            </div>
          </div>
        </div>
        <GitHubSyncModal
          isOpen={showGitHubModal}
          onClose={() => setShowGitHubModal(false)}
          files={files}
          onFilesUpdate={handleFilesUpdate}
        />
        <VersionHistoryPanel
          isOpen={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
        />
        <BuildProgressIndicator />
      </motion.div>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});

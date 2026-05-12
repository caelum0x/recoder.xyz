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
import { VersionHistoryPanel } from './VersionHistoryPanel';
// BuildProgressIndicator removed
import { CompactActionStatus } from './ActionStatusPanel';
import { SupabasePanel } from './SupabasePanel';
import { NeonPanel } from './NeonPanel';
import { ThemePanel } from './ThemePanel';
import { PromptLibraryPanel } from './PromptLibraryPanel';
import { VercelPanel } from './VercelPanel';
import { ProposalView } from './ProposalView';
import { GitCollaboratorsPanel } from './GitCollaboratorsPanel';
import { AgentTeamPanel } from './AgentTeamPanel';
import { AgentPanel } from '~/components/agent/AgentPanel';
import { agentSessionActive } from '~/lib/stores/agent-session';
import { useLSPDiagnostics } from '~/lib/hooks/useLSPDiagnostics';
import { useFileWatcher } from '~/lib/hooks/useFileWatcher';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('Workbench');

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
  const isAgentActive = useStore(agentSessionActive);

  // Connect to Daytona LSP diagnostics for the active file
  useLSPDiagnostics(projectId, selectedFile ?? null);

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
      logger.info('[Workbench] File change detected, preview will refresh');
    },
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

  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [activePanel, setActivePanel] = useState<'supabase' | 'database' | 'themes' | 'prompts' | 'vercel' | 'proposals' | 'collaborators' | 'agent-team' | null>(null);

  const togglePanel = (panel: 'supabase' | 'database' | 'themes' | 'prompts' | 'vercel' | 'proposals' | 'collaborators' | 'agent-team') => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

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
            'fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 z-0 transition-[left,right,width] duration-200 bolt-ease-cubic-bezier',
            {
              'left-0 right-0 top-0 bottom-0 w-full mr-0 z-50': isFullscreen,
            },
          )}
          style={
            isFullscreen
              ? undefined
              : showWorkbench
                ? { left: 'var(--workbench-left)', right: '1rem' }
                : { left: '100%', right: '-1rem' }
          }
        >
          <div className="absolute inset-0 px-6">
            <div className="h-full flex flex-col bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor shadow-sm rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-recoder-elements-borderColor">
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
                      onClick={() => {
                        workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                      }}
                      title="Toggle Terminal"
                    >
                      <div className="i-ph:terminal" />
                    </PanelHeaderButton>
                    {/* Integration panels hidden — not yet functional end-to-end */}
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
                {selectedView === 'code' ? (
                  <div className="absolute inset-0 z-10">
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
                  </div>
                ) : (
                  <div className="absolute inset-0 z-10">
                    <Preview />
                  </div>
                )}

                {/* Agent Panel overlay */}
                {isAgentActive && (
                  <div className="absolute inset-0 z-30 bg-recoder-elements-background-depth-2 border-l border-recoder-elements-borderColor overflow-hidden">
                    <AgentPanel />
                  </div>
                )}

                {/* Integration & Theme Panels (slide over code view) */}
                {activePanel && (
                  <div className="absolute inset-0 z-20 bg-recoder-elements-background-depth-2 border-l border-recoder-elements-borderColor overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-recoder-elements-borderColor">
                      <span className="text-sm font-medium text-recoder-elements-textPrimary">
                        {activePanel === 'supabase' && 'Supabase'}
                        {activePanel === 'database' && 'Database'}
                        {activePanel === 'themes' && 'Themes'}
                        {activePanel === 'prompts' && 'Prompt Library'}
                        {activePanel === 'vercel' && 'Vercel'}
                        {activePanel === 'proposals' && 'Proposals'}
                        {activePanel === 'collaborators' && 'Collaborators'}
                        {activePanel === 'agent-team' && 'Agent Team'}
                      </span>
                      <IconButton
                        icon="i-ph:x"
                        size="md"
                        onClick={() => setActivePanel(null)}
                      />
                    </div>
                    <div className="h-[calc(100%-40px)] overflow-auto">
                      {activePanel === 'supabase' && <SupabasePanel />}
                      {activePanel === 'database' && <NeonPanel />}
                      {activePanel === 'themes' && <ThemePanel />}
                      {activePanel === 'prompts' && <PromptLibraryPanel />}
                      {activePanel === 'vercel' && <VercelPanel />}
                      {activePanel === 'proposals' && <ProposalView />}
                      {activePanel === 'collaborators' && <GitCollaboratorsPanel />}
                      {activePanel === 'agent-team' && <AgentTeamPanel />}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <VersionHistoryPanel
          isOpen={showVersionHistory}
          onClose={() => setShowVersionHistory(false)}
        />
        {/* BuildProgressIndicator removed — was showing "Creating files..." mock UI */}
      </motion.div>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: React.JSX.Element;
}

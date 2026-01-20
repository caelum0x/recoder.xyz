import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { EditorTabs } from './EditorTabs';
import { FileBreadcrumb } from './FileBreadcrumb';
import { EnhancedFileTree } from './EnhancedFileTree';
import { ProjectPlanPanel } from './ProjectPlanPanel';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { TerminalControls } from './terminal/TerminalControls';
import { TerminalTabs, type TerminalTab } from './terminal/TerminalTabs';
import { ReplLauncher } from './terminal/ReplLauncher';
import { CLIStatus } from './terminal/CLIStatus';
import { terminalSync } from '~/lib/terminal-sync';
import { LogsPanel } from './LogsPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { SearchPanel } from './SearchPanel';
import { GitPanel } from './GitPanel';
import { DiffViewer } from './DiffViewer';
import { PackageManagerPanel } from './PackageManagerPanel';
import { SecretsPanel } from './SecretsPanel';
// Note: DatabaseExplorer removed - needs security rewrite
import { useStore as useNanoStore } from '@nanostores/react';
import { errorCountAtom, criticalErrorCountAtom } from '~/lib/stores/errors';
import { createFile, createFolder, deleteFile, renameFile, copyFilePath } from '~/lib/services/file-operations';
import { toast } from 'react-toastify';
import { PanelErrorBoundary } from './PanelErrorBoundary';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const MAX_TERMINALS = 3;
// Get saved terminal size or use default
const getSavedTerminalSize = () => {
  try {
    return terminalSync.getSizePrefs().panelSize;
  } catch {
    return 25;
  }
};
const DEFAULT_TERMINAL_SIZE = getSavedTerminalSize();
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

type BottomPanelView = 'terminal' | 'logs' | 'problems' | 'secrets';
type SidebarView = 'files' | 'search' | 'git' | 'packages' | 'architecture';

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);
    const highlightTerminal = useStore(workbenchStore.highlightTerminal);
    const commandRunning = useStore(workbenchStore.commandRunning);
    const projectId = useStore(workbenchStore.currentProjectId);
    const errorCount = useNanoStore(errorCountAtom);
    const criticalErrorCount = useNanoStore(criticalErrorCountAtom);

    const terminalRefs = useRef<Array<TerminalRef | null>>([]);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);

    const [activeTerminal, setActiveTerminal] = useState(0);
    const [terminalCount, setTerminalCount] = useState(1);
    const [terminalNames, setTerminalNames] = useState<string[]>(['Terminal 1']);
    const [bottomPanelView, setBottomPanelView] = useState<BottomPanelView>('terminal');
    const [sidebarView, setSidebarView] = useState<SidebarView>('files');
    const [diffView, setDiffView] = useState<{ path: string; original: string; modified: string } | null>(null);
    const [replLauncherExpanded, setReplLauncherExpanded] = useState(false);

    // Get available files for REPL detection
    const availableFileNames = useMemo(() => {
      if (!files) return new Set<string>();
      return new Set(Object.keys(files).map(f => f.split('/').pop() || ''));
    }, [files]);

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        for (const ref of Object.values(terminalRefs.current)) {
          ref?.reloadStyles();
        }
      });

      // Keyboard shortcut for search (Cmd+Shift+F)
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
          e.preventDefault();
          setSidebarView('search');
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
          e.preventDefault();
          setSidebarView('files');
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'g') {
          e.preventDefault();
          setSidebarView('git');
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, []);

    // File operation handlers
    const handleFileCreate = useCallback(async (folderPath: string, fileName: string) => {
      if (!projectId) return;
      const fullPath = `${folderPath}/${fileName}`;
      const result = await createFile(projectId, fullPath, '');
      if (result.success) {
        toast.success(`Created ${fileName}`);
        onFileSelect?.(fullPath);
      } else {
        toast.error(result.error || 'Failed to create file');
      }
    }, [projectId, onFileSelect]);

    const handleFolderCreate = useCallback(async (folderPath: string, folderName: string) => {
      if (!projectId) return;
      const fullPath = `${folderPath}/${folderName}`;
      const result = await createFolder(projectId, fullPath);
      if (result.success) {
        toast.success(`Created folder ${folderName}`);
      } else {
        toast.error(result.error || 'Failed to create folder');
      }
    }, [projectId]);

    const handleFileDelete = useCallback(async (filePath: string) => {
      if (!projectId) return;
      if (!confirm(`Delete ${filePath.split('/').pop()}?`)) return;
      const result = await deleteFile(projectId, filePath);
      if (result.success) {
        toast.success('Deleted');
      } else {
        toast.error(result.error || 'Failed to delete');
      }
    }, [projectId]);

    const handleFileRename = useCallback(async (oldPath: string, newPath: string) => {
      if (!projectId) return;
      const result = await renameFile(projectId, oldPath, newPath);
      if (result.success) {
        toast.success('Renamed');
        onFileSelect?.(newPath);
      } else {
        toast.error(result.error || 'Failed to rename');
      }
    }, [projectId, onFileSelect]);

    const handleFileCopy = useCallback(async (filePath: string) => {
      await copyFilePath(filePath);
      toast.success('Path copied');
    }, []);

    useEffect(() => {
      const { current: terminal } = terminalPanelRef;

      if (!terminal) {
        return;
      }

      const isCollapsed = terminal.isCollapsed();

      if (!showTerminal && !isCollapsed) {
        terminal.collapse();
      } else if (showTerminal && isCollapsed) {
        terminal.resize(DEFAULT_TERMINAL_SIZE);
      }

      terminalToggledByShortcut.current = false;
    }, [showTerminal]);

    const addTerminal = useCallback(() => {
      if (terminalCount < MAX_TERMINALS) {
        const newName = `Terminal ${terminalCount + 1}`;
        setTerminalNames(prev => [...prev, newName]);
        setTerminalCount(terminalCount + 1);
        setActiveTerminal(terminalCount);
      }
    }, [terminalCount]);

    const handleClearTerminal = useCallback(() => {
      workbenchStore.clearActiveTerminal();
    }, []);

    const handleKillProcess = useCallback(() => {
      workbenchStore.killActiveProcess();
    }, []);

    const handleCloseTerminal = useCallback((index: number) => {
      if (terminalCount > 1) {
        workbenchStore.closeTerminal(index);
        setTerminalNames(prev => {
          const newNames = [...prev];
          newNames.splice(index, 1);
          return newNames;
        });
        setTerminalCount(prev => prev - 1);
        setActiveTerminal(prev => Math.max(0, Math.min(prev, terminalCount - 2)));
      }
    }, [terminalCount]);

    const handleRenameTerminal = useCallback((index: number, newName: string) => {
      setTerminalNames(prev => {
        const newNames = [...prev];
        newNames[index] = newName;
        return newNames;
      });
      workbenchStore.renameTerminal(index, newName);
    }, []);

    const handleReplLaunch = useCallback((command: string, name: string) => {
      setReplLauncherExpanded(false);
      // Send command to active terminal
      workbenchStore.launchCommand(command);
    }, []);

    // PERFORMANCE: Memoize terminal ready/resize handlers to prevent re-renders
    const handleTerminalReady = useCallback((terminal: any) => {
      workbenchStore.attachTerminal(terminal);
    }, []);

    const handleTerminalResize = useCallback((cols: number, rows: number) => {
      workbenchStore.onTerminalResize(cols, rows);
    }, []);

    // PERFORMANCE: Memoize sidebar view setters
    const handleSetFilesView = useCallback(() => setSidebarView('files'), []);
    const handleSetSearchView = useCallback(() => setSidebarView('search'), []);
    const handleSetGitView = useCallback(() => setSidebarView('git'), []);
    const handleSetPackagesView = useCallback(() => setSidebarView('packages'), []);
    const handleSetArchView = useCallback(() => setSidebarView('architecture'), []);

    // PERFORMANCE: Memoize bottom panel view setters
    const handleSetTerminalView = useCallback(() => setBottomPanelView('terminal'), []);
    const handleSetLogsView = useCallback(() => setBottomPanelView('logs'), []);
    const handleSetProblemsView = useCallback(() => setBottomPanelView('problems'), []);
    const handleSetSecretsView = useCallback(() => setBottomPanelView('secrets'), []);

    // Build terminal tabs data
    const terminalTabs: TerminalTab[] = useMemo(() => {
      return terminalNames.map((name, index) => ({
        id: `terminal-${index}`,
        name,
        isActive: index === activeTerminal,
        isRunning: commandRunning && index === activeTerminal,
      }));
    }, [terminalNames, activeTerminal, commandRunning]);

    return (
      <>
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel
              defaultSize={25}  // ✅ P2: Increased from 20% to 25% for file tree
              minSize={15}      // ✅ P2: Increased from 10% to 15% minimum
              maxSize={40}      // ✅ P2: Added max size to prevent over-expansion
              collapsible
            >
              <div className="flex flex-col border-r border-bolt-elements-borderColor h-full overflow-hidden">
                {/* Sidebar Tabs */}
                {/* PERFORMANCE: Using memoized click handlers */}
                <div className="flex border-b border-bolt-elements-borderColor">
                  <button
                    onClick={handleSetFilesView}
                    className={classNames(
                      'flex-1 px-3 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors',
                      sidebarView === 'files'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border-b-2 border-blue-500'
                        : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textSecondary'
                    )}
                    title="Explorer - Browse project files (Cmd+Shift+E)"
                    aria-label="File explorer"
                    aria-selected={sidebarView === 'files'}
                  >
                    <span className="i-ph:tree-structure-duotone" />
                    Files
                  </button>
                  <button
                    onClick={handleSetSearchView}
                    className={classNames(
                      'flex-1 px-3 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors',
                      sidebarView === 'search'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border-b-2 border-blue-500'
                        : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textSecondary'
                    )}
                    title="Search - Find in files (Cmd+Shift+F)"
                    aria-label="Search files"
                    aria-selected={sidebarView === 'search'}
                  >
                    <span className="i-ph:magnifying-glass" />
                    Search
                  </button>
                  <button
                    onClick={handleSetGitView}
                    className={classNames(
                      'flex-1 px-3 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors',
                      sidebarView === 'git'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border-b-2 border-purple-500'
                        : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textSecondary'
                    )}
                    title="Source Control - Git changes and history (Cmd+Shift+G)"
                    aria-label="Git source control"
                    aria-selected={sidebarView === 'git'}
                  >
                    <span className="i-ph:git-branch" />
                    Git
                  </button>
                  <button
                    onClick={handleSetPackagesView}
                    className={classNames(
                      'flex-1 px-3 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors',
                      sidebarView === 'packages'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border-b-2 border-green-500'
                        : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textSecondary'
                    )}
                    title="Package Manager - Install and manage dependencies"
                    aria-label="Package manager"
                    aria-selected={sidebarView === 'packages'}
                  >
                    <span className="i-ph:package" />
                    Pkgs
                  </button>
                  <button
                    onClick={handleSetArchView}
                    className={classNames(
                      'flex-1 px-3 py-2 text-sm flex items-center justify-center gap-1.5 transition-colors',
                      sidebarView === 'architecture'
                        ? 'bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary border-b-2 border-orange-500'
                        : 'text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textSecondary'
                    )}
                    title="Architecture - Project structure and stats overview"
                    aria-label="Project architecture"
                    aria-selected={sidebarView === 'architecture'}
                  >
                    <span className="i-ph:stack" />
                    Arch
                  </button>
                </div>
                
                {/* Sidebar Content */}
                <div className="flex-1 overflow-auto">
                  {sidebarView === 'files' && (
                    <PanelErrorBoundary panelName="File Explorer">
                      <EnhancedFileTree
                        className="h-full"
                        files={files || {}}
                        hideRoot
                        unsavedFiles={unsavedFiles}
                        rootFolder={WORK_DIR}
                        selectedFile={selectedFile}
                        onFileSelect={onFileSelect}
                        onFileCreate={handleFileCreate}
                        onFolderCreate={handleFolderCreate}
                        onFileDelete={handleFileDelete}
                        onFileRename={handleFileRename}
                        onFileCopy={handleFileCopy}
                      />
                    </PanelErrorBoundary>
                  )}
                  {sidebarView === 'search' && (
                    <PanelErrorBoundary panelName="Search">
                      <SearchPanel
                        onFileOpen={(file, line, column) => {
                          onFileSelect?.(`${WORK_DIR}/${file}`);
                        }}
                      />
                    </PanelErrorBoundary>
                  )}
                  {sidebarView === 'git' && (
                    <PanelErrorBoundary panelName="Git">
                      <GitPanel
                        files={files || {}}
                        onFileSelect={onFileSelect}
                        onShowDiff={(path, original, modified) => {
                          setDiffView({ path, original, modified });
                        }}
                      />
                    </PanelErrorBoundary>
                  )}
                  {sidebarView === 'packages' && (
                    <PanelErrorBoundary panelName="Package Manager">
                      <PackageManagerPanel
                        files={files || {}}
                      />
                    </PanelErrorBoundary>
                  )}
                  {sidebarView === 'architecture' && (
                    <PanelErrorBoundary panelName="Architecture">
                      <ProjectPlanPanel
                        files={files || {}}
                        onFileSelect={onFileSelect}
                      />
                    </PanelErrorBoundary>
                  )}
                </div>
              </div>
            </Panel>
            <PanelResizeHandle />
            <Panel
              className="flex flex-col"
              defaultSize={75}  // ✅ P2: Adjusted from 80% (25% + 75% = 100%)
              minSize={30}      // ✅ P2: Increased from 20% to 30% to prevent squishing
            >
              {/* Editor Tabs */}
              <EditorTabs unsavedFiles={unsavedFiles} />
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                    {activeFileUnsaved && (
                      <div className="flex gap-1 ml-auto -mr-1.5">
                        <PanelHeaderButton onClick={onFileSave}>
                          <div className="i-ph:floppy-disk-duotone" />
                          Save
                        </PanelHeaderButton>
                        <PanelHeaderButton onClick={onFileReset}>
                          <div className="i-ph:clock-counter-clockwise-duotone" />
                          Reset
                        </PanelHeaderButton>
                      </div>
                    )}
                  </div>
                )}
              </PanelHeader>
              <div className="h-full flex-1 overflow-hidden">
                <CodeMirrorEditor
                  theme={theme}
                  editable={!isStreaming && editorDocument !== undefined}
                  settings={editorSettings}
                  doc={editorDocument}
                  autoFocusOnDocumentChange={!isMobile()}
                  onScroll={onEditorScroll}
                  onChange={onEditorChange}
                  onSave={onFileSave}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <Panel
          ref={terminalPanelRef}
          defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
          minSize={10}      // Reduced to allow more collapse
          maxSize={70}      // Allow terminal to expand more if needed
          collapsible
          onExpand={() => {
            if (!terminalToggledByShortcut.current) {
              workbenchStore.toggleTerminal(true);
            }
          }}
          onCollapse={() => {
            if (!terminalToggledByShortcut.current) {
              workbenchStore.toggleTerminal(false);
            }
          }}
          onResize={(size: number) => {
            // Save panel size preference when user resizes
            if (size > 5) { // Don't save when collapsed
              terminalSync.setSizePrefs(size);
            }
          }}
        >
          <div className="h-full">
            <div className="bg-bolt-elements-terminals-background h-full flex flex-col">
              <div
                className={classNames(
                  'flex items-center bg-bolt-elements-background-depth-2 border-y border-bolt-elements-borderColor gap-1.5 min-h-[34px] p-2 transition-all duration-300',
                  {
                    'animate-pulse bg-gradient-to-r from-orange-500/20 via-orange-400/30 to-orange-500/20 border-orange-500/50':
                      highlightTerminal,
                  },
                )}
              >
                {/* Tab: Terminal */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': bottomPanelView === 'terminal',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        bottomPanelView !== 'terminal',
                    },
                  )}
                  onClick={handleSetTerminalView}
                >
                  <div className="i-ph:terminal-window-duotone text-lg" />
                  Terminal
                  {commandRunning && (
                    <span className="ml-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </button>

                {/* Tab: Logs */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': bottomPanelView === 'logs',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        bottomPanelView !== 'logs',
                    },
                  )}
                  onClick={handleSetLogsView}
                >
                  <div className="i-ph:file-text-duotone text-lg" />
                  Logs
                </button>

                {/* Tab: Problems */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': bottomPanelView === 'problems',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        bottomPanelView !== 'problems',
                    },
                  )}
                  onClick={handleSetProblemsView}
                >
                  <div className={classNames('text-lg', criticalErrorCount > 0 ? 'i-ph:x-circle-fill text-red-500' : 'i-ph:warning-circle-duotone')} />
                  Problems
                  {errorCount > 0 && (
                    <span className={classNames(
                      'ml-1 px-1.5 py-0.5 text-xs rounded-full',
                      criticalErrorCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                    )}>
                      {errorCount}
                    </span>
                  )}
                </button>

                {/* Tab: Secrets */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-terminals-buttonBackground text-bolt-elements-textPrimary': bottomPanelView === 'secrets',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-terminals-buttonBackground':
                        bottomPanelView !== 'secrets',
                    },
                  )}
                  onClick={handleSetSecretsView}
                >
                  <div className="i-ph:key-duotone text-lg text-yellow-400" />
                  Secrets
                </button>

                {/* Terminal tabs (only show when terminal view is active) */}
                {bottomPanelView === 'terminal' && (
                  <>
                    <div className="w-px h-4 bg-bolt-elements-borderColor mx-1" />
                    <TerminalTabs
                      tabs={terminalTabs}
                      activeIndex={activeTerminal}
                      maxTerminals={MAX_TERMINALS}
                      onSelect={setActiveTerminal}
                      onAdd={addTerminal}
                      onClose={handleCloseTerminal}
                      onRename={handleRenameTerminal}
                    />
                  </>
                )}

                <div className="flex-1" />

                {/* Terminal Controls (only show when terminal view is active) */}
                {bottomPanelView === 'terminal' && (
                  <div className="flex items-center gap-1 relative">
                    <ReplLauncher
                      onLaunch={handleReplLaunch}
                      availableFiles={availableFileNames}
                      isExpanded={replLauncherExpanded}
                      onToggleExpand={() => setReplLauncherExpanded(!replLauncherExpanded)}
                    />
                    <TerminalControls
                      onClear={handleClearTerminal}
                      onKill={handleKillProcess}
                      isRunning={commandRunning}
                      terminalCount={terminalCount}
                      activeIndex={activeTerminal}
                    />
                  </div>
                )}

                <CLIStatus />
                <IconButton
                  className="ml-2"
                  icon="i-ph:caret-down"
                  title="Close"
                  size="md"
                  onClick={() => workbenchStore.toggleTerminal(false)}
                />
              </div>

              {/* Terminal View */}
              {/* PERFORMANCE: Only render terminals when view is active, use stable refs */}
              {bottomPanelView === 'terminal' && (
                <>
                  {Array.from({ length: terminalCount }, (_, index) => {
                    const isActive = activeTerminal === index;

                    return (
                      <Terminal
                        key={`terminal-${index}`}
                        className={classNames('h-full overflow-hidden', {
                          hidden: !isActive,
                        })}
                        ref={(ref) => {
                          // PERFORMANCE: Avoid array growth on each render
                          terminalRefs.current[index] = ref;
                        }}
                        onTerminalReady={handleTerminalReady}
                        onTerminalResize={handleTerminalResize}
                        theme={theme}
                      />
                    );
                  })}
                </>
              )}

              {/* Logs View */}
              {bottomPanelView === 'logs' && (
                <LogsPanel projectId={projectId} className="flex-1" />
              )}

              {/* Problems View */}
              {bottomPanelView === 'problems' && (
                <ProblemsPanel
                  className="flex-1"
                  onErrorClick={(error) => {
                    // Navigate to file when error is clicked
                    if (error.filePath) {
                      const filePath = error.filePath.replace('/workspace', '');
                      onFileSelect?.(filePath);
                    }
                  }}
                />
              )}

              {/* Secrets View */}
              {bottomPanelView === 'secrets' && (
                <SecretsPanel className="flex-1" />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Diff Viewer Modal */}
      {diffView && (
        <DiffViewer
          filePath={diffView.path}
          original={diffView.original}
          modified={diffView.modified}
          onClose={() => setDiffView(null)}
        />
      )}
    </>
  );
  },
);

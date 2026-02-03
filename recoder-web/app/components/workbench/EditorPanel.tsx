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
  type ScrollPosition,
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
import { Breadcrumbs } from './Breadcrumbs';
import { EnhancedFileTree } from './EnhancedFileTree';
import { ProjectPlanPanel } from './ProjectPlanPanel';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { TerminalControls } from './terminal/TerminalControls';
import { TerminalTabs, type TerminalTab } from './terminal/TerminalTabs';
import { ReplLauncher } from './terminal/ReplLauncher';
import { CLIStatus } from './terminal/CLIStatus';
import { HistorySearch } from './terminal/HistorySearch';
import { QuickCommands } from './terminal/QuickCommands';
import { terminalSync } from '~/lib/terminal-sync';
import { LogsPanel } from './LogsPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { SearchPanel } from './SearchPanel';
import { AppConsolePanel } from './AppConsolePanel';
import { GitPanel } from './GitPanel';
import { DiffViewer } from './DiffViewer';
import { PackageManagerPanel } from './PackageManagerPanel';
import { SecretsPanel } from './SecretsPanel';
// Note: DatabaseExplorer removed - needs security rewrite
import { useStore as useNanoStore } from '@nanostores/react';
import { errorCountAtom, criticalErrorCountAtom } from '~/lib/stores/errors';
import { errorCountAtom as consoleErrorCountAtom, entryCountAtom as consoleEntryCountAtom } from '~/lib/stores/app-console';
import { createFile, createFolder, deleteFile, renameFile, moveFile, copyFilePath } from '~/lib/services/file-operations';
import { dockerGet } from '~/lib/services/docker-api';
import { toast } from 'react-toastify';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { FileHistoryPanel } from './FileHistoryPanel';
import { useUndoRedo } from '~/lib/hooks/useUndoRedo';
import { RecentFilesPanel } from './RecentFilesPanel';
import { initRecentFiles, addRecentFile, recentFilesAtom } from '~/lib/stores/recent-files';
import { useAutoSave } from '~/lib/hooks/useAutoSave';
import { SaveIndicator } from './SaveIndicator';
import { preferencesStore, updateEditorPreferences } from '~/lib/stores/settings';
import { SplitEditorPane } from './SplitEditorPane';
import { StatusBar } from './StatusBar';
import {
  setCursorPosition,
  setFileSyncStatus,
  updateMetadataFromFile,
  setGitBranch,
} from '~/lib/stores/status-bar';

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

type BottomPanelView = 'terminal' | 'logs' | 'problems' | 'console' | 'secrets';
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
    const containerReady = useStore(workbenchStore.containerReady);
    const errorCount = useNanoStore(errorCountAtom);
    const criticalErrorCount = useNanoStore(criticalErrorCountAtom);
    const consoleErrorCount = useNanoStore(consoleErrorCountAtom);
    const consoleEntryCount = useNanoStore(consoleEntryCountAtom);
    const recentFiles = useNanoStore(recentFilesAtom);
    const preferences = useNanoStore(preferencesStore);
    const showMinimap = preferences.editor.minimap;
    const wordWrap = preferences.editor.wordWrap;

    // Split editor state
    const splitEnabled = useStore(workbenchStore.splitEnabled);
    const secondarySelectedFile = useStore(workbenchStore.secondarySelectedFile);
    const secondaryDocument = useStore(workbenchStore.secondaryDocument);
    const syncScrolling = useStore(workbenchStore.syncScrolling);
    const splitRatio = useStore(workbenchStore.splitRatio);

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
    const [showFileHistory, setShowFileHistory] = useState(false);
    const [showHistorySearch, setShowHistorySearch] = useState(false);
    const [showRecentFiles, setShowRecentFiles] = useState(false);

    // Undo/redo for current file
    const [undoState, undoActions] = useUndoRedo();

    // IMPORTANT: Define activeFileUnsaved BEFORE it's used in useAutoSave
    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    // Auto-save functionality
    const handleAutoSave = useCallback(async () => {
      if (onFileSave) {
        await onFileSave();
      }
    }, [onFileSave]);

    const autoSave = useAutoSave({
      onSave: handleAutoSave,
      filePath: editorDocument?.filePath,
      hasUnsavedChanges: activeFileUnsaved ?? false,
      disabled: isStreaming ?? false,
    });

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

    // Check if current file has history
    const activeFileHasHistory = useMemo(() => {
      if (!editorDocument?.filePath) return false;
      // Get relative path for the undo manager (remove /home/project prefix)
      const relativePath = editorDocument.filePath.replace('/home/project/', '');
      const history = undoActions.getHistory(relativePath);
      return history.length > 1; // More than 1 means we have history to show
    }, [editorDocument, undoActions]);

    // Initialize recent files when project changes
    useEffect(() => {
      if (projectId) {
        initRecentFiles(projectId);
      }
    }, [projectId]);

    // Track file selections for recent files
    useEffect(() => {
      if (selectedFile) {
        addRecentFile(selectedFile);
      }
    }, [selectedFile]);

    // Update status bar file metadata when current document changes
    useEffect(() => {
      if (editorDocument?.filePath && editorDocument?.value) {
        updateMetadataFromFile(editorDocument.filePath, editorDocument.value);
      }
    }, [editorDocument?.filePath]);

    // Update status bar sync status based on unsaved files
    useEffect(() => {
      if (editorDocument?.filePath) {
        const hasUnsaved = unsavedFiles?.has(editorDocument.filePath);
        setFileSyncStatus(hasUnsaved ? 'unsaved' : 'synced');
      }
    }, [editorDocument?.filePath, unsavedFiles]);

    // Fetch git branch for status bar
    useEffect(() => {
      if (!projectId || !containerReady) {
        setGitBranch(null);
        return;
      }

      const fetchGitBranch = async () => {
        if (!workbenchStore.containerReady.get()) return;
        try {
          const data = await dockerGet<{ branch: string }>(`/api/git/${projectId}/status`);
          if (data?.branch) {
            setGitBranch(data.branch);
          } else {
            setGitBranch(null);
          }
        } catch {
          setGitBranch(null);
        }
      };

      fetchGitBranch();
      // Refresh git branch periodically
      const interval = setInterval(fetchGitBranch, 30000);
      return () => clearInterval(interval);
    }, [projectId, containerReady]);

    // Handler for opening problems panel from status bar
    const handleOpenProblems = useCallback(() => {
      setBottomPanelView('problems');
      workbenchStore.toggleTerminal(true);
    }, []);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        for (const ref of Object.values(terminalRefs.current)) {
          ref?.reloadStyles();
        }
      });

      // Keyboard shortcuts for navigation and panels
      const handleKeyDown = (e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in input fields
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

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
        // Cmd+` or Ctrl+` to toggle terminal
        if ((e.metaKey || e.ctrlKey) && e.key === '`') {
          e.preventDefault();
          workbenchStore.toggleTerminal(!showTerminal);
        }
        // Ctrl+R to open history search (when terminal is visible)
        if (e.ctrlKey && e.key === 'r' && showTerminal && bottomPanelView === 'terminal') {
          e.preventDefault();
          setShowHistorySearch(true);
        }
        // Cmd+E or Ctrl+E to open recent files picker (when not in input)
        if ((e.metaKey || e.ctrlKey) && e.key === 'e' && !e.shiftKey && !isInput) {
          e.preventDefault();
          setShowRecentFiles(true);
        }
        // Cmd+1/2/3/4/5 to switch bottom panel tabs (when not in input)
        if ((e.metaKey || e.ctrlKey) && !isInput) {
          if (e.key === '1') {
            e.preventDefault();
            setBottomPanelView('terminal');
          } else if (e.key === '2') {
            e.preventDefault();
            setBottomPanelView('logs');
          } else if (e.key === '3') {
            e.preventDefault();
            setBottomPanelView('problems');
          } else if (e.key === '4') {
            e.preventDefault();
            setBottomPanelView('console');
          } else if (e.key === '5') {
            e.preventDefault();
            setBottomPanelView('secrets');
          }
        }
        // Cmd+\ or Ctrl+\ to toggle split editor view
        if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
          e.preventDefault();
          workbenchStore.toggleSplit();
        }
        // Alt+Z to toggle word wrap
        if (e.altKey && e.key === 'z') {
          e.preventDefault();
          updateEditorPreferences({ wordWrap: !wordWrap });
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
        window.removeEventListener('keydown', handleKeyDown);
      };
    }, [showTerminal, bottomPanelView, wordWrap]);

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
        // Update open tabs to reflect the new path
        // Check if it's a folder or file by looking at the files map
        const isFolder = files?.[oldPath]?.type === 'folder';
        if (isFolder) {
          workbenchStore.updateFolderPath(oldPath, newPath);
        } else {
          workbenchStore.updateFilePath(oldPath, newPath);
        }
        onFileSelect?.(newPath);
      } else {
        toast.error(result.error || 'Failed to rename');
      }
    }, [projectId, onFileSelect, files]);

    const handleFileMove = useCallback(async (sourcePath: string, destinationFolder: string) => {
      if (!projectId) return;
      const result = await moveFile(projectId, sourcePath, destinationFolder);
      if (result.success && result.newPath) {
        toast.success('Moved');
        // Update open tabs to reflect the new path
        const isFolder = files?.[sourcePath]?.type === 'folder';
        if (isFolder) {
          workbenchStore.updateFolderPath(sourcePath, result.newPath);
        } else {
          workbenchStore.updateFilePath(sourcePath, result.newPath);
        }
        onFileSelect?.(result.newPath);
      } else {
        toast.error(result.error || 'Failed to move');
      }
    }, [projectId, onFileSelect, files]);

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

    // Handle quick command execution
    const handleQuickCommand = useCallback((command: string) => {
      workbenchStore.launchCommand(command);
    }, []);

    // Handle history search selection
    const handleHistorySelect = useCallback((command: string) => {
      workbenchStore.launchCommand(command);
      setShowHistorySearch(false);
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
    const handleSetConsoleView = useCallback(() => setBottomPanelView('console'), []);

    // Split editor handlers
    const handleToggleSplit = useCallback(() => {
      workbenchStore.toggleSplit();
    }, []);

    const handleToggleSyncScrolling = useCallback(() => {
      workbenchStore.toggleSyncScrolling();
    }, []);

    const handleSwapSplitFiles = useCallback(() => {
      workbenchStore.swapSplitFiles();
    }, []);

    const handleCloseSplit = useCallback(() => {
      workbenchStore.setSplitEnabled(false);
    }, []);

    const handleSecondaryFileSelect = useCallback((filePath?: string) => {
      if (filePath) {
        workbenchStore.setSecondarySelectedFile(filePath);
      }
    }, []);

    // Sync scrolling handler - syncs scroll position between panes
    const lastScrollRef = useRef<{ pane: 'primary' | 'secondary'; position: ScrollPosition } | null>(null);

    const handlePrimaryScroll = useCallback((position: ScrollPosition) => {
      onEditorScroll?.(position);
      if (syncScrolling && secondaryDocument) {
        // Avoid infinite scroll loop by checking if this scroll came from the other pane
        if (lastScrollRef.current?.pane === 'secondary') {
          lastScrollRef.current = null;
          return;
        }
        lastScrollRef.current = { pane: 'primary', position };
        // Note: Sync scrolling is handled via store update - the secondary pane
        // will receive the new scroll position on next render
      }
    }, [onEditorScroll, syncScrolling, secondaryDocument]);

    const handleSecondaryScroll = useCallback((position: ScrollPosition) => {
      if (syncScrolling && editorDocument) {
        if (lastScrollRef.current?.pane === 'primary') {
          lastScrollRef.current = null;
          return;
        }
        lastScrollRef.current = { pane: 'secondary', position };
      }
    }, [syncScrolling, editorDocument]);

    // Secondary file segments for breadcrumbs
    const secondaryFileSegments = useMemo(() => {
      if (!secondaryDocument) {
        return undefined;
      }
      return secondaryDocument.filePath.split('/');
    }, [secondaryDocument]);

    const secondaryFileUnsaved = useMemo(() => {
      return secondaryDocument !== undefined && unsavedFiles?.has(secondaryDocument.filePath);
    }, [secondaryDocument, unsavedFiles]);

    // Save handler for secondary file
    const handleSecondarySave = useCallback(async () => {
      if (secondaryDocument?.filePath) {
        await workbenchStore.saveFile(secondaryDocument.filePath);
      }
    }, [secondaryDocument]);

    // Reset handler for secondary file
    const handleSecondaryReset = useCallback(() => {
      // Reset is not as straightforward for secondary - for now just close split
      // In future could implement proper reset
    }, []);

    // Build terminal tabs data
    const terminalTabs: TerminalTab[] = useMemo(() => {
      return terminalNames.map((name, index) => ({
        id: `terminal-${index}`,
        name,
        isActive: index === activeTerminal,
        isRunning: commandRunning && index === activeTerminal,
      }));
    }, [terminalNames, activeTerminal, commandRunning]);

    // Go to Definition handler - navigates to file and line
    const handleGotoDefinition = useCallback((file: string, line: number, character?: number) => {
      // Normalize file path
      let targetFile = file;

      // Handle various path formats from LSP
      if (targetFile.startsWith('/workspace/')) {
        targetFile = targetFile.replace('/workspace/', '');
      }
      if (!targetFile.startsWith('/home/project/') && !targetFile.startsWith(WORK_DIR)) {
        targetFile = `${WORK_DIR}/${targetFile}`;
      }

      console.log('[EditorPanel] Go to definition:', { file: targetFile, line, character });

      // Navigate to file and line - this will open the file and scroll to the line
      workbenchStore.navigateToLine(targetFile, line, character);
    }, []);

    return (
      <div className="flex flex-col h-full bg-bolt-elements-background-depth-1">
      <PanelGroup direction="vertical" className="flex-1">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel
              defaultSize={25}  // ✅ P2: Increased from 20% to 25% for file tree
              minSize={15}      // ✅ P2: Increased from 10% to 15% minimum
              maxSize={40}      // ✅ P2: Added max size to prevent over-expansion
              collapsible
            >
              <div className="flex flex-col border-r border-bolt-elements-borderColor h-full overflow-hidden bg-bolt-elements-background-depth-1">
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
                <div className="flex-1 overflow-auto bg-bolt-elements-background-depth-1">
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
                        onFileMove={handleFileMove}
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
              <EditorTabs
                unsavedFiles={unsavedFiles}
                onRevealInTree={(filePath) => {
                  setSidebarView('files');
                  onFileSelect?.(filePath);
                }}
                onOpenNewFile={() => setShowRecentFiles(true)}
              />
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <Breadcrumbs pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} unsavedChanges={activeFileUnsaved} />
                    <div className="flex items-center gap-1 ml-auto -mr-1.5">
                      {/* Auto-save status indicator */}
                      <SaveIndicator
                        status={autoSave.status}
                        isEnabled={autoSave.isEnabled}
                        lastSaved={autoSave.lastSaved}
                        errorMessage={autoSave.errorMessage}
                        showToggle
                        onToggle={autoSave.toggleAutoSave}
                      />
                      {/* REMOVED: UI declutter — Recent files button removed from breadcrumb bar. Use Cmd+E keyboard shortcut instead. */}
                      {activeFileHasHistory && (
                        <PanelHeaderButton
                          onClick={() => setShowFileHistory(true)}
                          title="View file history"
                        >
                          <div className="i-ph:clock-countdown-duotone" />
                          History
                        </PanelHeaderButton>
                      )}
                      {activeFileUnsaved && (
                        <>
                          <PanelHeaderButton onClick={onFileSave}>
                            <div className="i-ph:floppy-disk-duotone" />
                            Save
                          </PanelHeaderButton>
                          <PanelHeaderButton onClick={onFileReset}>
                            <div className="i-ph:clock-counter-clockwise-duotone" />
                            Reset
                          </PanelHeaderButton>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </PanelHeader>
              {/* Editor Content Area - Single or Split View */}
              <div className="h-full flex-1 overflow-hidden bg-bolt-elements-background-depth-1">
                {splitEnabled ? (
                  <PanelGroup direction="horizontal">
                    {/* Primary Editor Pane */}
                    <Panel defaultSize={splitRatio} minSize={20}>
                      <SplitEditorPane
                        theme={theme}
                        editorDocument={editorDocument}
                        files={files}
                        unsavedFiles={unsavedFiles}
                        isStreaming={isStreaming}
                        projectId={projectId ?? undefined}
                        onEditorChange={onEditorChange}
                        onEditorScroll={handlePrimaryScroll}
                        onFileSave={onFileSave}
                        onFileReset={onFileReset}
                        onFileSelect={onFileSelect}
                        onGotoDefinition={handleGotoDefinition}
                        paneId="primary"
                        headerActions={
                          <div className="flex items-center gap-1">
                            <PanelHeaderButton
                              onClick={handleSwapSplitFiles}
                              title="Swap files between panes"
                            >
                              <div className="i-ph:arrows-left-right" />
                            </PanelHeaderButton>
                            <PanelHeaderButton
                              onClick={handleToggleSyncScrolling}
                              title={syncScrolling ? 'Disable scroll sync' : 'Enable scroll sync'}
                            >
                              <div className={syncScrolling ? 'i-ph:link-simple-fill text-blue-400' : 'i-ph:link-simple-break-duotone'} />
                            </PanelHeaderButton>
                          </div>
                        }
                      />
                    </Panel>
                    {/* Resizable Divider */}
                    <PanelResizeHandle className="w-1 bg-bolt-elements-borderColor hover:bg-blue-500 transition-colors cursor-col-resize" />
                    {/* Secondary Editor Pane */}
                    <Panel defaultSize={100 - splitRatio} minSize={20}>
                      <SplitEditorPane
                        theme={theme}
                        editorDocument={secondaryDocument}
                        files={files}
                        unsavedFiles={unsavedFiles}
                        isStreaming={isStreaming}
                        projectId={projectId ?? undefined}
                        onEditorScroll={handleSecondaryScroll}
                        onFileSave={handleSecondarySave}
                        onFileReset={handleSecondaryReset}
                        onFileSelect={handleSecondaryFileSelect}
                        onGotoDefinition={handleGotoDefinition}
                        paneId="secondary"
                        autoFocus={false}
                        headerActions={
                          <div className="flex items-center gap-1">
                            <PanelHeaderButton
                              onClick={handleCloseSplit}
                              title="Close split view"
                            >
                              <div className="i-ph:x" />
                            </PanelHeaderButton>
                          </div>
                        }
                      />
                    </Panel>
                  </PanelGroup>
                ) : (
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={editorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={onEditorChange}
                    onSave={onFileSave}
                    onGotoDefinition={handleGotoDefinition}
                    showMinimap={showMinimap}
                    projectId={projectId ?? undefined}
                  />
                )}
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
            <div className="bg-bolt-elements-background-depth-1 h-full flex flex-col">
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
                      'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary': bottomPanelView === 'terminal',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3':
                        bottomPanelView !== 'terminal',
                    },
                  )}
                  onClick={handleSetTerminalView}
                  aria-label="Terminal panel"
                  aria-selected={bottomPanelView === 'terminal'}
                  role="tab"
                >
                  <div className="i-ph:terminal-window-duotone text-lg" aria-hidden="true" />
                  Terminal
                  {commandRunning && (
                    <span className="ml-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-label="Command running" />
                  )}
                </button>

                {/* Tab: Logs */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary': bottomPanelView === 'logs',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3':
                        bottomPanelView !== 'logs',
                    },
                  )}
                  onClick={handleSetLogsView}
                  aria-label="Logs panel"
                  aria-selected={bottomPanelView === 'logs'}
                  role="tab"
                >
                  <div className="i-ph:file-text-duotone text-lg" aria-hidden="true" />
                  Logs
                </button>

                {/* Tab: Problems */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary': bottomPanelView === 'problems',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3':
                        bottomPanelView !== 'problems',
                    },
                  )}
                  onClick={handleSetProblemsView}
                  aria-label={`Problems panel${errorCount > 0 ? `, ${errorCount} issues` : ''}`}
                  aria-selected={bottomPanelView === 'problems'}
                  role="tab"
                >
                  <div className={classNames('text-lg', criticalErrorCount > 0 ? 'i-ph:x-circle-fill text-red-500' : 'i-ph:warning-circle-duotone')} aria-hidden="true" />
                  Problems
                  {errorCount > 0 && (
                    <span className={classNames(
                      'ml-1 px-1.5 py-0.5 text-xs rounded-full',
                      criticalErrorCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'
                    )} aria-label={`${errorCount} issues`}>
                      {errorCount}
                    </span>
                  )}
                </button>

                {/* Tab: Console */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary': bottomPanelView === 'console',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3':
                        bottomPanelView !== 'console',
                    },
                  )}
                  onClick={handleSetConsoleView}
                  aria-label={`Console panel${consoleEntryCount > 0 ? `, ${consoleEntryCount} logs` : ''}`}
                  aria-selected={bottomPanelView === 'console'}
                  role="tab"
                >
                  <div className={classNames('text-lg', consoleErrorCount > 0 ? 'i-ph:code-fill text-red-500' : 'i-ph:code-duotone')} aria-hidden="true" />
                  Console
                  {consoleErrorCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400" aria-label={`${consoleErrorCount} errors`}>
                      {consoleErrorCount}
                    </span>
                  )}
                </button>

                {/* Tab: Secrets */}
                <button
                  className={classNames(
                    'flex items-center text-sm cursor-pointer gap-1.5 px-3 py-2 h-full whitespace-nowrap rounded-full',
                    {
                      'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary': bottomPanelView === 'secrets',
                      'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3':
                        bottomPanelView !== 'secrets',
                    },
                  )}
                  onClick={handleSetSecretsView}
                  aria-label="Secrets panel - manage environment variables"
                  aria-selected={bottomPanelView === 'secrets'}
                  role="tab"
                >
                  <div className="i-ph:key-duotone text-lg text-yellow-400" aria-hidden="true" />
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
                    {/* Quick Commands */}
                    <QuickCommands onRunCommand={handleQuickCommand} />
                    <div className="w-px h-4 bg-bolt-elements-borderColor mx-1" />
                    {/* History Search Button */}
                    <button
                      onClick={() => setShowHistorySearch(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary border border-bolt-elements-borderColor"
                      title="Search command history (Ctrl+R)"
                    >
                      <div className="i-ph:clock-counter-clockwise" />
                      <span className="hidden sm:inline">History</span>
                    </button>
                    <div className="w-px h-4 bg-bolt-elements-borderColor mx-1" />
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
                <div className="relative flex-1 h-full">
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

                  {/* History Search Modal */}
                  {showHistorySearch && projectId && (
                    <HistorySearch
                      projectId={projectId ?? undefined}
                      isOpen={showHistorySearch}
                      onClose={() => setShowHistorySearch(false)}
                      onSelectCommand={handleHistorySelect}
                    />
                  )}
                </div>
              )}

              {/* Logs View */}
              {bottomPanelView === 'logs' && (
                <LogsPanel projectId={projectId ?? null} className="flex-1" />
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

              {/* Console View */}
              {bottomPanelView === 'console' && (
                <AppConsolePanel className="flex-1" />
              )}

              {/* Secrets View */}
              {bottomPanelView === 'secrets' && (
                <SecretsPanel className="flex-1" />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <StatusBar
        onProblemsClick={handleOpenProblems}
      />

      {/* Diff Viewer Modal */}
      {diffView && (
        <DiffViewer
          filePath={diffView.path}
          original={diffView.original}
          modified={diffView.modified}
          onClose={() => setDiffView(null)}
        />
      )}

      {/* File History Modal */}
      {showFileHistory && editorDocument && (
        <FileHistoryPanel
          filePath={editorDocument.filePath.replace('/home/project/', '')}
          currentContent={editorDocument.value || ''}
          onRevert={(content) => {
            // Update the workbench content directly (bypassing EditorUpdate type)
            workbenchStore.setCurrentDocumentContent(content);
          }}
          onClose={() => setShowFileHistory(false)}
        />
      )}

      {/* Recent Files Picker (Cmd+E) */}
      <RecentFilesPanel
        isOpen={showRecentFiles}
        onClose={() => setShowRecentFiles(false)}
        onFileSelect={(filePath) => {
          onFileSelect?.(filePath);
          setShowRecentFiles(false);
        }}
        currentFile={selectedFile}
      />
    </div>
  );
  },
);

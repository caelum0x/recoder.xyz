import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import { dockerGet, dockerPost, dockerDelete, DOCKER_URL, CONTAINER_CREATE_TIMEOUT_MS, withDockerCredentials } from '~/lib/services/docker-api';
import {
  clearContainerCreateFailure,
  noteContainerCreateFailure,
  shouldAttemptContainerCreate,
} from '~/lib/services/container-create-breaker';
import { getCurrentUserId } from '~/lib/stores/user';
import type { ProjectContext, RelatedFiles } from '~/lib/services/code-context';
import type { ParsedError } from '~/lib/services/error-analyzer';
import * as undoManager from '~/lib/services/undo-manager';
import * as diffPreview from '~/lib/services/diff-preview';
import type {
  CodeProposal,
  FileChange,
  ProposalResult,
  ProposalStatus,
  ApproveProposalResult,
} from '~/lib/types/proposals';
import { createCodeProposal } from '~/lib/types/proposals';
import * as workspace from './workspace';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WorkbenchStore');

// 🔒 Global container creation coordination - prevents duplicate container creation
// This is module-level to ensure coordination across all callers
const containerCreationPromises = new Map<string, Promise<boolean>>();

/**
 * Options for container creation - passes template/framework context to the backend
 * so it can configure the container appropriately (e.g., Expo projects get different setup).
 */
export interface ContainerCreationOptions {
  /** Framework identifier (e.g., 'expo', 'nextjs', 'react', 'vue') */
  framework?: string;
  /** Template ID used when the project was created */
  templateId?: string;
  /** Allow user-triggered retries to bypass the automatic failure cooldown */
  bypassFailureCooldown?: boolean;
}

/**
 * Ensure container exists with coordination to prevent race conditions.
 * Multiple callers share the same promise - only one container creation request per project.
 * This is the SINGLE SOURCE OF TRUTH for container creation.
 */
export async function ensureContainerExists(
  projectId: string,
  options?: ContainerCreationOptions
): Promise<boolean> {
  if (!DOCKER_URL) {
    logger.warn('[ensureContainerExists] DOCKER_URL not configured');
    return false;
  }

  // If already creating this container, wait for the existing promise
  const existingPromise = containerCreationPromises.get(projectId);
  if (existingPromise) {
    logger.info('⏳ [ensureContainerExists] Waiting for existing container creation...');
    return existingPromise;
  }

  const attemptDecision = shouldAttemptContainerCreate(projectId, {
    bypassCooldown: options?.bypassFailureCooldown,
  });
  if (!attemptDecision.allowed) {
    logger.warn(
      `⏸️ [ensureContainerExists] Skipping auto-retry for ${projectId}; cooldown active for ${Math.ceil(attemptDecision.retryAfterMs / 1000)}s`
    );
    return false;
  }

  // Create new promise for this container
  const createPromise = (async (): Promise<boolean> => {
    const containerCreateRequestOptions = {
      timeout: CONTAINER_CREATE_TIMEOUT_MS,
      skipRetry: true,
    } as const;

    const createViaWebRoute = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONTAINER_CREATE_TIMEOUT_MS);

      try {
        const response = await fetch('/api/create-sandbox', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            projectId,
            framework: options?.framework,
            templateId: options?.templateId,
          }),
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null) as {
          success?: boolean;
          error?: string;
          details?: string;
        } | null;

        if (!response.ok || payload?.success === false) {
          const error = new Error(
            payload?.details || payload?.error || `Container creation failed with status ${response.status}`,
          ) as Error & { statusCode?: number };
          error.statusCode = response.status;
          throw error;
        }

        return true;
      } catch (error: any) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const timeoutError = new Error(`Container creation timed out after ${CONTAINER_CREATE_TIMEOUT_MS}ms`) as Error & {
            statusCode?: number;
          };
          timeoutError.statusCode = 408;
          throw timeoutError;
        }

        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      logger.info('🐳 [ensureContainerExists] Creating container for', projectId,
        options?.framework ? `(framework: ${options.framework})` : '',
        options?.templateId ? `(template: ${options.templateId})` : '');

      try {
        const health = await dockerGet<{ status?: string }>('/health', {
          timeout: 3000,
          skipRetry: true,
        });
        if (!health || (health.status !== 'ok' && health.status !== 'healthy')) {
          throw new Error('Docker backend health check did not return ready status');
        }
      } catch (healthError: any) {
        throw new Error(
          healthError?.message || 'Docker backend is unavailable. Container creation was skipped.'
        );
      }

      // Go through the same-origin route so server-side session verification owns
      // the create path instead of relying on browser-readable auth state.
      await createViaWebRoute();

      clearContainerCreateFailure(projectId);
      logger.info('✅ [ensureContainerExists] Container ready for', projectId);
      return true;
    } catch (error: any) {
      // 409 Conflict means container already exists - that's OK
      if (error?.statusCode === 409 || error?.message?.includes('already exists')) {
        clearContainerCreateFailure(projectId);
        logger.info('✅ [ensureContainerExists] Container already exists for', projectId);
        return true;
      }

      // 429 Container limit — auto-evict oldest stale containers and retry
      if (error?.statusCode === 429 && error?.message?.includes('Container limit')) {
        logger.info('⚠️ [ensureContainerExists] Container limit hit, attempting auto-eviction...');
        try {
          const { containers: userContainers, count, max } = await dockerGet<{
            containers: { projectId: string; lastActive: number }[];
            count: number;
            max: number;
          }>('/api/containers');

          // Evict enough containers to get below the limit (need room for 1 new one)
          const evictCandidates = userContainers.filter((c) => c.projectId !== projectId);
          const numToEvict = Math.max(1, count - max + 1); // e.g. 6 - 5 + 1 = 2

          logger.info(`🗑️ [ensureContainerExists] Need to evict ${numToEvict} containers (have ${count}, max ${max})`);

          for (let i = 0; i < numToEvict && i < evictCandidates.length; i++) {
            logger.info(`🗑️ [ensureContainerExists] Evicting container ${i + 1}/${numToEvict}: ${evictCandidates[i].projectId}`);
            await dockerDelete(`/api/container/${evictCandidates[i].projectId}`);
          }

          // Retry container creation
          await createViaWebRoute();
          clearContainerCreateFailure(projectId);
          logger.info('✅ [ensureContainerExists] Container created after eviction for', projectId);
          return true;
        } catch (retryError: any) {
          logger.error('❌ [ensureContainerExists] Auto-eviction failed:', retryError.message);
        }
      }

      const failure = noteContainerCreateFailure(projectId, error?.message ?? 'Container creation failed');
      logger.error(
        `❌ [ensureContainerExists] Error: ${error?.message ?? 'Container creation failed'} (cooldown ${Math.ceil(failure.retryAfterMs / 1000)}s)`
      );
      return false;
    } finally {
      containerCreationPromises.delete(projectId);
    }
  })();

  containerCreationPromises.set(projectId, createPromise);
  return createPromise;
}

/**
 * Clear container creation state for a project (call when navigating away)
 */
export function clearContainerState(projectId?: string) {
  if (projectId) {
    containerCreationPromises.delete(projectId);
    clearContainerCreateFailure(projectId);
  } else {
    containerCreationPromises.clear();
    clearContainerCreateFailure();
  }
}

export interface ArtifactState {
  id: string;
  title: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'preview' | 'agent';

// ==================== Publish State ====================
export type PublishStatus = 'idle' | 'building' | 'publishing' | 'published' | 'error';

export interface CustomDomainInfo {
  domain: string;
  status: string;
  url: string | null;
}

export interface PublishState {
  status: PublishStatus;
  url: string | null;
  zrokUrl?: string | null;
  slug: string | null;
  publishedAt: string | null;
  error: string | null;
  customDomains?: CustomDomainInfo[];
}

export interface BuildStatus {
  phase: 'idle' | 'creating' | 'installing' | 'starting' | 'ready';
  message: string;
  progress: number; // 0-100
  filesCreated?: number;
}

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore();

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #currentProjectId: string | null = null;
  #isRestoredChat: boolean = false;  // Track if this is a restored past chat
  #restoredMessageIds: Set<string> = new Set();  // Track messageIds from restored chat
  
  // Stable atom for project ID (used by useStore in components)
  projectId: WritableAtom<string | null> = import.meta.hot?.data.projectId ?? atom<string | null>(null);

  // ✅ Container ready flag - true only when container exists AND dev server is responding
  // NOTE: Do NOT preserve via HMR - must always start false on page load
  containerReady: WritableAtom<boolean> = atom<boolean>(false);

  // ❌ Container creation failed flag — lets ActionRunner fast-fail instead of waiting 120s
  containerCreationFailed: WritableAtom<boolean> = atom<boolean>(false);

  // ✅ P1: Build progress feedback
  buildStatus: WritableAtom<BuildStatus> = import.meta.hot?.data.buildStatus ?? atom({
    phase: 'idle',
    message: '',
    progress: 0,
  });

  // ✅ Publish (Go Live) state
  publishState: WritableAtom<PublishState> = import.meta.hot?.data.publishState ?? atom<PublishState>({
    status: 'idle',
    url: null,
    zrokUrl: null,
    slug: null,
    publishedAt: null,
    error: null,
  });

  // Container recovery status
  containerRecoveryStatus = atom<{
    recovering: boolean;
    lastRecovery: number | null;
    message: string | null;
  }>({ recovering: false, lastRecovery: null, message: null });

  // ==================== PROPOSAL SYSTEM ====================
  // When enabled, AI actions are collected into proposals for user review

  /** Whether proposal mode is enabled (actions require approval) */
  proposalModeEnabled: WritableAtom<boolean> = import.meta.hot?.data.proposalModeEnabled ?? atom(false);

  /** Current pending proposals awaiting user approval */
  pendingProposals: WritableAtom<Map<string, ProposalResult>> = import.meta.hot?.data.pendingProposals ?? atom(new Map());

  /** Actions that are queued while waiting for proposal approval */
  #queuedActions: Map<string, ActionCallbackData[]> = new Map();

  /** Track file changes being collected for current proposal */
  #proposalFileChanges: Map<string, FileChange[]> = new Map();

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.buildStatus = this.buildStatus;
      import.meta.hot.data.projectId = this.projectId;
      import.meta.hot.data.proposalModeEnabled = this.proposalModeEnabled;
      import.meta.hot.data.pendingProposals = this.pendingProposals;
      import.meta.hot.data.publishState = this.publishState;
      // NOTE: Do NOT preserve containerReady - must always start false
    }
  }

  #restoredFilePaths: string[] = [];  // Files restored from snapshot

  /**
   * Mark this session as a restored past chat.
   * This tells ActionRunner to not auto-install since we handle it separately.
   * @param restoredFiles - Array of file paths that were restored from snapshot
   * @param restoredMessageIds - Array of messageIds from the restored chat (artifacts that already exist)
   */
  markAsRestoredChat(restoredFiles?: string[], restoredMessageIds?: string[]) {
    this.#isRestoredChat = true;
    this.#restoredFilePaths = restoredFiles || [];
    this.#restoredMessageIds = new Set(restoredMessageIds || []);
    logger.info(`📂 [WorkbenchStore] Marked as restored chat with ${this.#restoredFilePaths.length} files, ${this.#restoredMessageIds.size} messageIds`);
  }

  /**
   * Get the list of restored file paths.
   */
  getRestoredFilePaths(): string[] {
    return this.#restoredFilePaths;
  }

  /**
   * Reset restored chat flag - call this when starting a new conversation
   */
  resetRestoredChatFlag() {
    this.#isRestoredChat = false;
    this.#restoredMessageIds.clear();
    logger.info('🔄 [WorkbenchStore] Reset restored chat flag');
  }

  /**
   * Check if this session is a restored past chat.
   */
  isRestoredChat(): boolean {
    return this.#isRestoredChat;
  }

  /**
   * Mark container as ready - call this when dev server is confirmed running
   */
  setContainerReady(ready: boolean = true) {
    this.containerReady.set(ready);
    if (ready) {
      logger.info('✅ [WorkbenchStore] Container marked as ready');
    }
  }

  /**
   * Reset container ready state - call this when starting a new conversation
   */
  resetContainerReady() {
    this.containerReady.set(false);
    this.containerCreationFailed.set(false);
  }

  /**
   * Retry container creation after a failure.
   * Resets failure/ready flags and re-calls ensureContainerExists.
   */
  async retryContainerCreation(): Promise<boolean> {
    const projectId = this.#currentProjectId;
    if (!projectId) {
      logger.warn('[WorkbenchStore] Cannot retry container creation: no projectId');
      return false;
    }

    logger.info('[WorkbenchStore] Retrying container creation for', projectId);

    // Reset both flags to enter the "creating" state
    this.containerCreationFailed.set(false);
    this.containerReady.set(false);

    try {
      const success = await ensureContainerExists(projectId, { bypassFailureCooldown: true });

      if (success) {
        this.containerCreationFailed.set(false);
        this.setContainerReady(true);
        logger.info('[WorkbenchStore] Container retry succeeded for', projectId);

        // Re-initialize dependent stores now that the container is back
        await this.#terminalStore.setProjectId(projectId);
        await this.#previewsStore.setProjectId(projectId);
        this.#checkExistingDevServer(projectId);

        return true;
      } else {
        this.containerCreationFailed.set(true);
        logger.error('[WorkbenchStore] Container retry failed for', projectId);
        return false;
      }
    } catch (error) {
      this.containerCreationFailed.set(true);
      logger.error('[WorkbenchStore] Container retry threw for', projectId, error);
      return false;
    }
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get openTabs(): ReadableAtom<string[]> {
    return this.#editorStore.openTabs;
  }

  // Split editor getters
  get splitEnabled(): ReadableAtom<boolean> {
    return this.#editorStore.splitEnabled;
  }

  get secondarySelectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.secondarySelectedFile;
  }

  get secondaryDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.secondaryDocument;
  }

  get syncScrolling(): ReadableAtom<boolean> {
    return this.#editorStore.syncScrolling;
  }

  get splitRatio(): ReadableAtom<number> {
    return this.#editorStore.splitRatio;
  }

  get pendingNavigation() {
    return this.#editorStore.pendingNavigation;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }

  get highlightTerminal() {
    return this.#terminalStore.highlightTerminal;
  }

  get commandRunning() {
    return this.#terminalStore.commandRunning;
  }

  get currentProjectId() {
    return atom(this.#currentProjectId);
  }

  getProjectId(): string | null {
    return this.#currentProjectId;
  }

  get terminalStore() {
    return {
      get: () => this.#terminalStore
    };
  }

  // Set project ID for Docker backend
  // CRITICAL: This ensures container exists BEFORE initializing other stores
  // Pass optional framework/templateId so the backend can configure the container properly
  async setProjectId(projectId: string, options?: ContainerCreationOptions) {
    this.#currentProjectId = projectId;
    this.projectId.set(projectId);

    for (const artifact of Object.values(this.artifacts.get())) {
      artifact?.runner?.setProjectId(projectId);
    }

    // 🔒 CRITICAL FIX: Ensure container exists FIRST before any other API calls
    // This prevents 404 errors from terminal, preview, files, etc.
    let containerExists = false;
    if (DOCKER_URL) {
      logger.info('🔄 [WorkbenchStore] Ensuring container exists before initialization...');
      containerExists = await ensureContainerExists(projectId, options);

      if (containerExists) {
        // Container exists — immediately mark ready for file operations.
        // Don't wait for #checkExistingDevServer (which checks files + dev server health)
        // because the action runner needs containerReady=true to start writing files.
        this.containerCreationFailed.set(false);
        this.setContainerReady(true);
        logger.info('✅ [WorkbenchStore] Container exists, marked ready, proceeding with initialization');
      } else {
        logger.warn('⚠️ [WorkbenchStore] Container creation failed, proceeding anyway');
        this.containerCreationFailed.set(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:container-error', {
            detail: { projectId, message: 'Container creation failed. File operations may not work.' },
          }));
        }
      }
    }

    // Now it's safe to initialize other stores - container exists
    if (!DOCKER_URL || containerExists) {
      await this.#terminalStore.setProjectId(projectId);
      await this.#previewsStore.setProjectId(projectId);
    } else {
      logger.warn('⚠️ [WorkbenchStore] Skipping terminal/preview initialization until the container is available');
    }

    // Initialize workspace and restore saved state
    this.#initializeWorkspace(projectId);

    // Only check for existing dev server if container was successfully created.
    // If container creation failed, don't run this — it will incorrectly mark
    // containerReady=true in its catch block when API calls 404.
    if (containerExists) {
      this.#checkExistingDevServer(projectId);
    }
  }

  /**
   * Initialize workspace for a project and restore saved state
   */
  #initializeWorkspace(projectId: string) {
    const savedWorkspace = workspace.initWorkspace(projectId);

    if (savedWorkspace) {
      logger.info('[WorkbenchStore] Restoring workspace state...');

      // Restore open tabs
      if (savedWorkspace.openTabs.length > 0) {
        this.#editorStore.openTabs.set(savedWorkspace.openTabs);
      }

      // Restore pinned tabs
      if (savedWorkspace.pinnedTabs && savedWorkspace.pinnedTabs.length > 0) {
        this.#editorStore.pinnedTabs.set(new Set(savedWorkspace.pinnedTabs));
      }

      // Restore active file
      if (savedWorkspace.activeFile) {
        this.#editorStore.selectedFile.set(savedWorkspace.activeFile);
      }

      // Restore split view state
      if (savedWorkspace.splitState) {
        this.#editorStore.splitEnabled.set(savedWorkspace.splitState.enabled);
        if (savedWorkspace.splitState.secondaryFile) {
          this.#editorStore.secondarySelectedFile.set(savedWorkspace.splitState.secondaryFile);
        }
        this.#editorStore.splitRatio.set(savedWorkspace.splitState.ratio);
        this.#editorStore.syncScrolling.set(savedWorkspace.splitState.syncScrolling);
      }

      // Restore panel state
      if (savedWorkspace.panelState) {
        this.#terminalStore.showTerminal.set(savedWorkspace.panelState.terminalVisible);
      }

      // Restore current view
      if (savedWorkspace.currentView) {
        this.currentView.set(savedWorkspace.currentView);
      }

      logger.info('[WorkbenchStore] Workspace state restored');
    }

    // Subscribe to state changes to sync with workspace store
    this.#setupWorkspaceSync();
  }

  /**
   * Setup listeners to sync workbench state with workspace store
   */
  #setupWorkspaceSync() {
    // Sync open tabs
    this.#editorStore.openTabs.subscribe((tabs) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceOpenTabs([...tabs]);
      }
    });

    // Sync pinned tabs
    this.#editorStore.pinnedTabs.subscribe((pinnedSet) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspacePinnedTabs(Array.from(pinnedSet));
      }
    });

    // Sync active file (triggers save immediately)
    this.#editorStore.selectedFile.subscribe((file) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceActiveFile(file);
      }
    });

    // Sync split state
    this.#editorStore.splitEnabled.subscribe((enabled) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceSplitState({ enabled });
      }
    });

    this.#editorStore.secondarySelectedFile.subscribe((file) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceSplitState({ secondaryFile: file });
      }
    });

    this.#editorStore.splitRatio.subscribe((ratio) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceSplitState({ ratio });
      }
    });

    this.#editorStore.syncScrolling.subscribe((sync) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceSplitState({ syncScrolling: sync });
      }
    });

    // Sync terminal visibility
    this.#terminalStore.showTerminal.subscribe((visible) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspacePanelState({ terminalVisible: visible });
      }
    });

    // Sync current view
    this.currentView.subscribe((view) => {
      if (!workspace.isRestoringWorkspace.get()) {
        workspace.updateWorkspaceCurrentView(view);
      }
    });
  }

  // Check if container already has a running dev server and set containerReady
  // Uses the workspace-state endpoint for efficient checking
  async #checkExistingDevServer(projectId: string) {
    let containerGone = false;

    try {
      // Use dedicated workspace-state endpoint - single fast check
      const state = await dockerGet<{ 
        hasFiles: boolean; 
        hasPackageJson: boolean; 
        devServerRunning: boolean;
        volumeMounted: boolean;
      }>(`/api/workspace-state/${projectId}`, { timeout: 5000, skipRetry: true });
      
      if (state) {
        // Container and workspace volume exist
        this.setContainerReady(true);
        
        // If dev server is already running, we're fully operational
        if (state.devServerRunning) {
          // Emit event so preview can connect immediately
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('recoder:dev-server-ready', {
              detail: { projectId, hasFiles: state.hasFiles, hasPackageJson: state.hasPackageJson },
            }));
          }
        }
        return;
      }
    } catch (e: any) {
      const is404 = e?.statusCode === 404 || e?.message?.includes('404') || e?.message?.includes('not found');
      if (is404) {
        containerGone = true;
      }
    }

    if (containerGone) {
      return;
    }

    // Fallback: just mark ready since container exists
    this.setContainerReady(true);
  }

  /**
   * Refresh file tree from Docker container
   * Called when CLI tools (claude, recoder-code) modify files
   */
  async refreshFiles() {
    if (!this.#currentProjectId) return;

    try {
      await dockerGet<{ files: any[] }>(`/api/files/${this.#currentProjectId}`);
      // Update files store with new file list
      // The files are returned as { files: [...] }
      logger.info('[WorkbenchStore] Refreshed file list from Docker');
    } catch (e) {
      logger.warn('[WorkbenchStore] Failed to refresh files:', e);
    }
  }

  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  flashTerminalHighlight() {
    this.#terminalStore.flashTerminalHighlight();
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  clearActiveTerminal() {
    this.#terminalStore.clearActiveTerminal();
  }

  killActiveProcess() {
    this.#terminalStore.killActiveProcess();
  }

  closeTerminal(index: number) {
    this.#terminalStore.closeTerminal(index);
  }

  renameTerminal(index: number, newName: string) {
    this.#terminalStore.renameTerminal(index, newName);
  }

  async launchCommand(command: string, newTerminalName?: string) {
    await this.#terminalStore.launchCommand(command, newTerminalName);
  }

  async sendTerminalCommand(command: string) {
    await this.#terminalStore.sendCommand(command);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);

    // Also sync with workspace store
    workspace.updateWorkspaceScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    if (filePath) {
      this.#editorStore.addTab(filePath);
    } else {
      this.#editorStore.setSelectedFile(undefined);
    }
  }

  /**
   * Navigate to a specific line in a file (for go-to-definition)
   * Opens the file if not already open and sets cursor to the specified line
   */
  navigateToLine(filePath: string, line: number, character?: number) {
    this.#editorStore.navigateToLine(filePath, line, character);
  }

  /**
   * Consume pending navigation (called by CodeMirrorEditor after scrolling)
   */
  consumePendingNavigation() {
    return this.#editorStore.consumePendingNavigation();
  }

  closeTab(filePath: string) {
    this.#editorStore.closeTab(filePath);
    // Also remove from workspace
    workspace.removeFileFromWorkspace(filePath);
  }

  closeOtherTabs(filePath: string) {
    this.#editorStore.closeOtherTabs(filePath);
    // Workspace will be synced via the openTabs subscription
  }

  closeAllTabs() {
    this.#editorStore.closeAllTabs();
    // Workspace will be synced via the openTabs subscription
  }

  closeTabsToRight(filePath: string) {
    this.#editorStore.closeTabsToRight(filePath);
    // Workspace will be synced via the openTabs subscription
  }

  reorderTabs(fromIndex: number, toIndex: number) {
    this.#editorStore.reorderTabs(fromIndex, toIndex);
  }

  pinTab(filePath: string) {
    this.#editorStore.pinTab(filePath);
  }

  unpinTab(filePath: string) {
    this.#editorStore.unpinTab(filePath);
  }

  togglePinTab(filePath: string) {
    this.#editorStore.togglePinTab(filePath);
  }

  isPinned(filePath: string): boolean {
    return this.#editorStore.isPinned(filePath);
  }

  get pinnedTabs(): ReadableAtom<Set<string>> {
    return this.#editorStore.pinnedTabs;
  }

  /**
   * Update file path in tabs and documents when a file is renamed/moved.
   * This ensures open tabs continue to work after rename operations.
   */
  updateFilePath(oldPath: string, newPath: string) {
    this.#editorStore.updateFilePath(oldPath, newPath);
    // Also sync with workspace store
    workspace.updateFilePathInWorkspace(oldPath, newPath);
  }

  /**
   * Update all file paths under a folder when a folder is renamed/moved.
   * This handles the case when a folder containing open files is renamed.
   */
  updateFolderPath(oldFolderPath: string, newFolderPath: string) {
    this.#editorStore.updateFolderPath(oldFolderPath, newFolderPath);
    // Note: Folder path updates are handled by the workspace through individual tab updates
  }

  // Split editor methods
  toggleSplit() {
    this.#editorStore.toggleSplit();
  }

  setSplitEnabled(enabled: boolean) {
    this.#editorStore.setSplitEnabled(enabled);
  }

  setSecondarySelectedFile(filePath: string | undefined) {
    this.#editorStore.setSecondarySelectedFile(filePath);
  }

  toggleSyncScrolling() {
    this.#editorStore.toggleSyncScrolling();
  }

  setSyncScrolling(enabled: boolean) {
    this.#editorStore.setSyncScrolling(enabled);
  }

  setSplitRatio(ratio: number) {
    this.#editorStore.setSplitRatio(ratio);
  }

  swapSplitFiles() {
    this.#editorStore.swapSplitFiles();
  }

  openInSecondaryPane(filePath: string) {
    this.#editorStore.openInSecondaryPane(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  abortAllActions() {
    const artifacts = this.artifacts.get();
    let totalCancelled = 0;

    for (const [id, artifact] of Object.entries(artifacts)) {
      if (artifact?.runner) {
        const cancelled = artifact.runner.cancelAllActions();
        totalCancelled += cancelled;
      }
    }

    if (totalCancelled > 0) {
      logger.info(`[WorkbenchStore] Aborted ${totalCancelled} action(s) across all artifacts`);
    }

    return totalCancelled;
  }

  addArtifact({ messageId, title, id }: ArtifactCallbackData) {
    logger.info('🎨 [WorkbenchStore] addArtifact called:', id, title, 'messageId:', messageId);
    const artifact = this.#getArtifact(messageId);

    if (artifact) {
      logger.info('⏭️  [WorkbenchStore] Artifact already exists, skipping');
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    const projectIdToUse = this.#currentProjectId || this.projectId.get();
    if (!projectIdToUse) {
      logger.error('[WorkbenchStore] CRITICAL: No projectId when creating ActionRunner');
    }
    const runner = new ActionRunner(projectIdToUse || undefined);
    runner.setMessageId(messageId);
    logger.info(`[WorkbenchStore] ActionRunner created with projectId: ${projectIdToUse}`);
    
    // 🔧 CRITICAL FIX: Only mark runner as restored if THIS messageId was part of the restored chat.
    // This prevents NEW AI messages (after restoration) from being skipped.
    // Before: ALL runners were marked as restored if #isRestoredChat was true
    // After: Only runners for messageIds that existed in the restored chat are marked
    const isRestoredMessage = this.#isRestoredChat && this.#restoredMessageIds.has(messageId);
    if (isRestoredMessage) {
      runner.markAsRestoredChat(this.#restoredFilePaths);
      logger.info(`📂 [WorkbenchStore] Marked runner as restored for messageId: ${messageId}`);
    } else if (this.#isRestoredChat) {
      logger.info(`✨ [WorkbenchStore] NEW message after restoration, runner NOT marked as restored: ${messageId}`);
    }

    this.artifacts.setKey(messageId, {
      id,
      title,
      closed: false,
      runner,
    });
  }

  updateArtifact({ messageId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(messageId, { ...artifact, ...state });
  }

  async addAction(data: ActionCallbackData) {
    const { messageId } = data;
    logger.info('🏪 [WorkbenchStore] addAction called:', data.action?.type, 'messageId:', messageId);

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      logger.error('❌ [WorkbenchStore] Artifact not found for messageId:', messageId, 'Available:', Object.keys(this.artifacts.get()));
      unreachable('Artifact not found');
    }

    logger.info('🏪 [WorkbenchStore] Calling artifact.runner.addAction');
    artifact.runner.addAction(data);
  }

  async runAction(data: ActionCallbackData) {
    const { messageId } = data;
    logger.info('🏪 [WorkbenchStore] runAction called:', data.action?.type, 'messageId:', messageId);

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      logger.error('❌ [WorkbenchStore] Artifact not found for messageId:', messageId, 'Available:', Object.keys(this.artifacts.get()));
      unreachable('Artifact not found');
    }

    logger.info('🏪 [WorkbenchStore] Calling artifact.runner.runAction');
    artifact.runner.runAction(data);
  }

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  /**
   * Create an AI snapshot after AI changes complete.
   * Call this when AI streaming finishes.
   */
  async createAISnapshot(messageId: string, description: string = 'AI changes'): Promise<void> {
    const artifact = this.#getArtifact(messageId);
    if (artifact?.runner) {
      await artifact.runner.createAISnapshot(description);
    }
  }

  /**
   * Create an AI snapshot for all active artifacts
   */
  async createAISnapshotForAll(description: string = 'AI changes'): Promise<void> {
    const artifacts = this.artifacts.get();
    for (const artifact of Object.values(artifacts)) {
      if (artifact?.runner) {
        await artifact.runner.createAISnapshot(description);
      }
    }
  }

  // ==================== BULLETPROOF ACTION MANAGEMENT ====================

  /**
   * Cancel a running or pending action
   */
  cancelAction(messageId: string, actionId: string): boolean {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return false;
    return artifact.runner.cancelAction(actionId);
  }

  /**
   * Retry a failed action
   */
  async retryAction(messageId: string, actionId: string): Promise<boolean> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return false;
    return artifact.runner.retryAction(actionId);
  }

  /**
   * Rollback a file action to its previous content
   */
  async rollbackAction(messageId: string, actionId: string): Promise<boolean> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return false;
    return artifact.runner.rollbackAction(actionId);
  }

  /**
   * Get all action states for an artifact
   */
  getActionStates(messageId: string): Array<{
    id: string;
    type: string;
    status: string;
    filePath?: string;
    error?: string;
    canRetry: boolean;
    canRollback: boolean;
  }> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return [];
    return artifact.runner.getActionStates();
  }

  /**
   * Get running actions for an artifact
   */
  getRunningActions(messageId: string): Array<{ id: string; type: string; filePath?: string }> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return [];
    return artifact.runner.getRunningActions();
  }

  /**
   * Get failed actions for an artifact
   */
  getFailedActions(messageId: string): Array<{
    id: string;
    type: string;
    filePath?: string;
    error: string;
  }> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return [];
    return artifact.runner.getFailedActions();
  }

  /**
   * Cancel all running and pending actions for an artifact
   */
  cancelAllActions(messageId: string): number {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return 0;
    return artifact.runner.cancelAllActions();
  }

  /**
   * Retry all failed actions for an artifact
   */
  async retryAllFailed(messageId: string): Promise<number> {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return 0;
    return artifact.runner.retryAllFailed();
  }

  /**
   * Get queue statistics for an artifact
   */
  getQueueStats(messageId: string): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    aborted: number;
  } | null {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return null;
    return artifact.runner.getQueueStats();
  }

  /**
   * Check if rollback is available for a file
   */
  canRollbackFile(messageId: string, filePath: string): boolean {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return false;
    return artifact.runner.canRollbackFile(filePath);
  }

  // ==================== ORPHAN ACTION HANDLING ====================

  /**
   * Called when streaming ends for an artifact.
   * Handles any orphaned actions that were opened but never closed.
   *
   * @param messageId - The message/artifact ID
   * @param isTruncated - Whether the stream was truncated
   */
  onStreamEnd(messageId: string, isTruncated: boolean = false): void {
    const artifact = this.#getArtifact(messageId);
    if (artifact?.runner) {
      artifact.runner.onStreamEnd(isTruncated);
    }
  }

  /**
   * Called when streaming ends for all active artifacts.
   */
  onStreamEndForAll(isTruncated: boolean = false): void {
    const artifacts = this.artifacts.get();
    for (const artifact of Object.values(artifacts)) {
      if (artifact?.runner) {
        artifact.runner.onStreamEnd(isTruncated);
      }
    }
  }

  /**
   * Finalize any orphaned actions immediately for an artifact.
   */
  finalizeOrphanedActions(messageId: string, reason: string = 'stream_ended'): number {
    const artifact = this.#getArtifact(messageId);
    if (!artifact?.runner) return 0;
    return artifact.runner.finalizeOrphanedActions(reason);
  }

  /**
   * Finalize orphaned actions for all active artifacts.
   */
  finalizeOrphanedActionsForAll(reason: string = 'stream_ended'): number {
    let total = 0;
    const artifacts = this.artifacts.get();
    for (const artifact of Object.values(artifacts)) {
      if (artifact?.runner) {
        total += artifact.runner.finalizeOrphanedActions(reason);
      }
    }
    return total;
  }

  /**
   * Check if any artifact has orphaned actions.
   */
  hasOrphanedActions(): boolean {
    const artifacts = this.artifacts.get();
    for (const artifact of Object.values(artifacts)) {
      if (artifact?.runner?.hasOrphanedActions()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get detailed status of all actions across all artifacts.
   */
  getAllDetailedActionStatus(): Array<{
    messageId: string;
    actions: Array<{
      actionId: string;
      type: string;
      status: string;
      executed: boolean;
      filePath?: string;
      error?: string;
      isOrphaned: boolean;
    }>;
  }> {
    const result: Array<{
      messageId: string;
      actions: Array<{
        actionId: string;
        type: string;
        status: string;
        executed: boolean;
        filePath?: string;
        error?: string;
        isOrphaned: boolean;
      }>;
    }> = [];

    const artifacts = this.artifacts.get();
    for (const [messageId, artifact] of Object.entries(artifacts)) {
      if (artifact?.runner) {
        const actionStatus = artifact.runner.getDetailedActionStatus();
        result.push({
          messageId,
          actions: actionStatus,
        });
      }
    }

    return result;
  }

  /**
   * Clean up orphan timeouts for all artifacts (call on unmount).
   */
  cleanupOrphanTimeouts(): void {
    const artifacts = this.artifacts.get();
    for (const artifact of Object.values(artifacts)) {
      if (artifact?.runner) {
        artifact.runner.cleanupOrphanTimeouts();
      }
    }
  }

  // ==================== ADVANCED CODING FEATURES ====================

  /**
   * Load project context for AI awareness
   * Returns context about project structure, dependencies, and files
   */
  async loadProjectContext(): Promise<ProjectContext | null> {
    const projectId = this.#currentProjectId;
    if (!projectId) return null;

    try {
      const { loadProjectContext } = await import('~/lib/services/code-context');
      return await loadProjectContext(projectId);
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to load project context:', error);
      return null;
    }
  }

  /**
   * Get smart file selection based on user request
   * Automatically determines which files are relevant to the request
   */
  async getSmartFileSelection(userMessage: string): Promise<string[]> {
    const projectId = this.#currentProjectId;
    if (!projectId) return [];

    try {
      const { getSmartFileSelection } = await import('~/lib/services/code-context');
      return await getSmartFileSelection(projectId, userMessage);
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to get smart file selection:', error);
      return [];
    }
  }

  /**
   * Find files related to a given file path
   * Returns imports, files that import it, tests, and configs
   */
  async findRelatedFiles(filePath: string): Promise<RelatedFiles | null> {
    const projectId = this.#currentProjectId;
    if (!projectId) return null;

    try {
      const { loadProjectContext, findRelatedFiles } = await import('~/lib/services/code-context');
      const context = await loadProjectContext(projectId);
      if (!context) return null;
      return await findRelatedFiles(projectId, filePath, context.files);
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to find related files:', error);
      return null;
    }
  }

  /**
   * Read file content from Docker container
   */
  async readFileContent(filePath: string): Promise<string | null> {
    const projectId = this.#currentProjectId;
    if (!projectId) return null;

    try {
      const res = await fetch(
        `${DOCKER_URL}/api/file/${projectId}?path=${encodeURIComponent(filePath)}`,
        withDockerCredentials()
      );
      if (!res.ok) return null;
      return await res.text();
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to read file:', error);
      return null;
    }
  }

  /**
   * Read multiple files efficiently
   */
  async readMultipleFiles(filePaths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const projectId = this.#currentProjectId;
    if (!projectId) return results;

    // Read files in parallel, up to 5 at a time
    const chunks: string[][] = [];
    for (let i = 0; i < filePaths.length; i += 5) {
      chunks.push(filePaths.slice(i, i + 5));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (path) => {
        const content = await this.readFileContent(path);
        if (content !== null) {
          results.set(path, content);
        }
      });
      await Promise.all(promises);
    }

    return results;
  }

  // ==================== ERROR HANDLING ====================

  /**
   * Analyze errors from terminal output
   */
  async analyzeErrors(terminalOutput: string): Promise<{
    hasErrors: boolean;
    errors: ParsedError[];
    summary: string;
    autoFixAvailable: boolean;
  }> {
    try {
      const { analyzeTerminalOutput } = await import('~/lib/services/error-analyzer');
      return analyzeTerminalOutput(terminalOutput);
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to analyze errors:', error);
      return { hasErrors: false, errors: [], summary: '', autoFixAvailable: false };
    }
  }

  /**
   * Generate a fix prompt for an error
   */
  async generateFixPrompt(error: ParsedError): Promise<string> {
    try {
      const { generateFixPrompt } = await import('~/lib/services/error-analyzer');
      let fileContent: string | undefined;

      if (error.file) {
        const content = await this.readFileContent(error.file);
        if (content) fileContent = content;
      }

      return generateFixPrompt(error, fileContent);
    } catch (err) {
      logger.warn('[WorkbenchStore] Failed to generate fix prompt:', err);
      return `Fix error: ${error.message}`;
    }
  }

  /**
   * Create diagnostic report for debugging
   */
  async createDiagnosticReport(errors: ParsedError[]): Promise<string> {
    try {
      const { createDiagnosticReport } = await import('~/lib/services/error-analyzer');
      return createDiagnosticReport(errors);
    } catch (error) {
      logger.warn('[WorkbenchStore] Failed to create diagnostic report:', error);
      return 'Unable to generate diagnostic report';
    }
  }

  // ==================== DIFF PREVIEW ====================

  /**
   * Generate a diff preview for file changes
   */
  generateDiffPreview(
    filePath: string,
    oldContent: string,
    newContent: string
  ): diffPreview.FileDiff {
    return diffPreview.generateDiff(filePath, oldContent, newContent);
  }

  /**
   * Add a pending change for review
   */
  addPendingChange(
    filePath: string,
    oldContent: string,
    newContent: string,
    description?: string
  ): diffPreview.PendingChange {
    return diffPreview.addPendingChange(filePath, oldContent, newContent, description);
  }

  /**
   * Get all pending changes
   */
  getPendingChanges(): diffPreview.PendingChange[] {
    return diffPreview.getPendingChanges();
  }

  /**
   * Accept a pending change
   */
  acceptChange(changeId: string): diffPreview.PendingChange | null {
    return diffPreview.acceptChange(changeId);
  }

  /**
   * Reject a pending change
   */
  rejectChange(changeId: string): diffPreview.PendingChange | null {
    return diffPreview.rejectChange(changeId);
  }

  /**
   * Accept specific hunks from a change
   */
  acceptPartialChange(
    changeId: string,
    hunkIds: string[]
  ): { newContent: string; change: diffPreview.PendingChange } | null {
    return diffPreview.acceptPartialChange(changeId, hunkIds);
  }

  // ==================== UNDO/REDO ====================

  /**
   * Save file state for undo
   */
  saveUndoState(
    filePath: string,
    content: string,
    description?: string,
    aiGenerated?: boolean
  ): void {
    undoManager.saveState(filePath, content, description, aiGenerated);
  }

  /**
   * Save batch state for multiple files (AI changes)
   */
  saveBatchUndoState(
    files: Array<{ path: string; content: string }>,
    description?: string,
    snapshotId?: string
  ): void {
    undoManager.saveBatchState(files, description, snapshotId);
  }

  /**
   * Undo last change for a file
   */
  undoFile(filePath: string): undoManager.FileState | null {
    return undoManager.undo(filePath);
  }

  /**
   * Redo last undone change for a file
   */
  redoFile(filePath: string): undoManager.FileState | null {
    return undoManager.redo(filePath);
  }

  /**
   * Check if undo is available
   */
  canUndo(filePath: string): boolean {
    return undoManager.canUndo(filePath);
  }

  /**
   * Check if redo is available
   */
  canRedo(filePath: string): boolean {
    return undoManager.canRedo(filePath);
  }

  /**
   * Undo last AI batch action
   */
  undoLastAIAction(): Array<{ path: string; content: string }> | null {
    return undoManager.undoLastAIAction();
  }

  /**
   * Get undo history for a file
   */
  getUndoHistory(filePath: string): undoManager.FileState[] {
    return undoManager.getStateHistory(filePath);
  }

  /**
   * Get AI action history
   */
  getAIActionHistory(): undoManager.UndoAction[] {
    return undoManager.getActionHistory();
  }

  /**
   * Get undo statistics
   */
  getUndoStats(): { totalFiles: number; totalStates: number; aiActions: number } {
    return undoManager.getStats();
  }

  // ==================== PROPOSAL SYSTEM ====================

  /**
   * Enable or disable proposal mode.
   * When enabled, AI file changes are collected into proposals for review.
   */
  setProposalMode(enabled: boolean): void {
    this.proposalModeEnabled.set(enabled);
    logger.info(`[WorkbenchStore] Proposal mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if proposal mode is currently enabled
   */
  isProposalModeEnabled(): boolean {
    return this.proposalModeEnabled.get();
  }

  /**
   * Start collecting file changes for a new proposal
   */
  startProposal(messageId: string): void {
    this.#proposalFileChanges.set(messageId, []);
    this.#queuedActions.set(messageId, []);
    logger.info(`[WorkbenchStore] Started proposal collection for message: ${messageId}`);
  }

  /**
   * Add a file change to the current proposal
   */
  addFileChangeToProposal(
    messageId: string,
    change: FileChange
  ): void {
    const changes = this.#proposalFileChanges.get(messageId) || [];

    // Check if we already have a change for this file
    const existingIndex = changes.findIndex(c => c.path === change.path);
    if (existingIndex >= 0) {
      // Update existing change
      changes[existingIndex] = change;
    } else {
      changes.push(change);
    }

    this.#proposalFileChanges.set(messageId, changes);
  }

  /**
   * Queue an action to be executed after proposal approval
   */
  queueActionForProposal(messageId: string, action: ActionCallbackData): void {
    const actions = this.#queuedActions.get(messageId) || [];
    actions.push(action);
    this.#queuedActions.set(messageId, actions);
  }

  /**
   * Finalize and create a proposal from collected file changes
   */
  finalizeProposal(
    messageId: string,
    title: string,
    options: {
      packagesAdded?: string[];
      shellCommands?: string[];
    } = {}
  ): CodeProposal | null {
    const fileChanges = this.#proposalFileChanges.get(messageId);

    if (!fileChanges || fileChanges.length === 0) {
      logger.info(`[WorkbenchStore] No file changes for proposal: ${messageId}`);
      return null;
    }

    const proposal = createCodeProposal(title, fileChanges, options);

    const proposalResult: ProposalResult = {
      proposal,
      status: 'pending',
      messageId,
    };

    const proposals = new Map(this.pendingProposals.get());
    proposals.set(messageId, proposalResult);
    this.pendingProposals.set(proposals);

    logger.info(`[WorkbenchStore] Created proposal: ${proposal.id} with ${fileChanges.length} file changes`);
    return proposal;
  }

  /**
   * Get a pending proposal by message ID
   */
  getProposal(messageId: string): ProposalResult | undefined {
    return this.pendingProposals.get().get(messageId);
  }

  /**
   * Get all pending proposals
   */
  getAllPendingProposals(): ProposalResult[] {
    return Array.from(this.pendingProposals.get().values())
      .filter(p => p.status === 'pending');
  }

  /**
   * Approve a proposal — write approved files directly to Docker container.
   * Writes file content from the proposal data (no need to re-run actions).
   */
  async approveProposal(
    messageId: string,
    selectedFiles?: string[]
  ): Promise<ApproveProposalResult> {
    const proposalResult = this.pendingProposals.get().get(messageId);

    if (!proposalResult) {
      return { success: false, error: 'Proposal not found' };
    }

    const proposal = proposalResult.proposal;
    const projectId = this.projectId.get();

    if (!projectId) {
      return { success: false, error: 'No active project' };
    }

    // Filter files if partial approval
    const filesToApply = selectedFiles
      ? proposal.filesChanged.filter(f => selectedFiles.includes(f.path))
      : proposal.filesChanged;

    const appliedFiles: string[] = [];
    const failedFiles: string[] = [];

    // Write each approved file directly to Docker
    for (const fileChange of filesToApply) {
      try {
        if (fileChange.type === 'delete') {
          // Delete file from container
          await dockerDelete(`/api/file/${projectId}?path=${encodeURIComponent(fileChange.path)}`);
        } else if (fileChange.newContent !== undefined) {
          // Write (create or update) file to container
          await dockerPost(`/api/file/${projectId}`, {
            filePath: fileChange.path,
            content: fileChange.newContent,
          });
        }
        appliedFiles.push(fileChange.path);
      } catch (error) {
        logger.error(`[WorkbenchStore] Failed to write file ${fileChange.path}:`, error);
        failedFiles.push(fileChange.path);
      }
    }

    // Revert local file store for rejected files (restore old content)
    if (selectedFiles) {
      const rejectedFiles = proposal.filesChanged.filter(f => !selectedFiles.includes(f.path));
      for (const rejected of rejectedFiles) {
        const relativePath = rejected.path.startsWith('/') ? rejected.path.substring(1) : rejected.path;
        const fullPath = `/home/user/${relativePath}`;
        if (rejected.type === 'create') {
          // Remove from local store — was never written to Docker
          const currentFiles = this.files.get();
          if (currentFiles[fullPath]) {
            const updated = { ...currentFiles };
            delete updated[fullPath];
            this.files.set(updated as any);
          }
        } else if (rejected.oldContent !== undefined) {
          // Restore old content in local store
          this.files.setKey(fullPath, { type: 'file', content: rejected.oldContent, isBinary: false });
        }
      }
    }

    // Update proposal status
    const proposals = new Map(this.pendingProposals.get());
    const updatedResult: ProposalResult = {
      ...proposalResult,
      status: selectedFiles ? 'partial' : 'approved',
      approvedChanges: selectedFiles || proposal.filesChanged.map(f => f.path),
      rejectedChanges: selectedFiles
        ? proposal.filesChanged.filter(f => !selectedFiles.includes(f.path)).map(f => f.path)
        : undefined,
    };
    proposals.set(messageId, updatedResult);
    this.pendingProposals.set(proposals);

    // Clean up
    this.#proposalFileChanges.delete(messageId);
    this.#queuedActions.delete(messageId);

    logger.info(`[WorkbenchStore] Approved proposal: ${messageId}, applied ${appliedFiles.length} files`);

    return {
      success: true,
      appliedFiles,
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
    };
  }

  /**
   * Reject a proposal — revert local file store and discard changes.
   * No Docker writes needed since proposal mode never wrote to the container.
   */
  rejectProposal(messageId: string): void {
    const proposalResult = this.pendingProposals.get().get(messageId);

    if (!proposalResult) {
      logger.warn(`[WorkbenchStore] Proposal not found for rejection: ${messageId}`);
      return;
    }

    // Revert local file store for all file changes
    for (const fileChange of proposalResult.proposal.filesChanged) {
      const relativePath = fileChange.path.startsWith('/') ? fileChange.path.substring(1) : fileChange.path;
      const fullPath = `/home/user/${relativePath}`;

      if (fileChange.type === 'create') {
        // Remove newly created files from local store
        const currentFiles = this.files.get();
        if (currentFiles[fullPath]) {
          const updated = { ...currentFiles };
          delete updated[fullPath];
          this.files.set(updated as any);
        }
      } else if (fileChange.type === 'update' && fileChange.oldContent !== undefined) {
        // Restore old content
        this.files.setKey(fullPath, { type: 'file', content: fileChange.oldContent, isBinary: false });
      }
    }

    // Update proposal status
    const proposals = new Map(this.pendingProposals.get());
    const updatedResult: ProposalResult = {
      ...proposalResult,
      status: 'rejected',
    };
    proposals.set(messageId, updatedResult);
    this.pendingProposals.set(proposals);

    // Clean up
    this.#proposalFileChanges.delete(messageId);
    this.#queuedActions.delete(messageId);

    logger.info(`[WorkbenchStore] Rejected proposal: ${messageId}`);
  }

  /**
   * Clear all proposals (e.g., when starting a new conversation)
   */
  clearProposals(): void {
    this.pendingProposals.set(new Map());
    this.#proposalFileChanges.clear();
    this.#queuedActions.clear();
    logger.info('[WorkbenchStore] Cleared all proposals');
  }

  /**
   * Check if there are any pending proposals
   */
  hasPendingProposals(): boolean {
    return this.getAllPendingProposals().length > 0;
  }

  /**
   * Get the count of pending proposals
   */
  getPendingProposalCount(): number {
    return this.getAllPendingProposals().length;
  }

  // ==================== WORKSPACE SESSION MANAGEMENT ====================

  /**
   * Get the workspace settings store for external access
   */
  get workspaceSettings() {
    return workspace.workspaceSettingsStore;
  }

  /**
   * Get the current workspace state store
   */
  get workspaceState() {
    return workspace.workspaceStateStore;
  }

  /**
   * Check if workspace is being restored
   */
  get isRestoringWorkspace() {
    return workspace.isRestoringWorkspace;
  }

  /**
   * Save current workspace state immediately
   */
  saveWorkspace(): void {
    workspace.saveCurrentWorkspace();
  }

  /**
   * Set workspace restore enabled/disabled
   */
  setWorkspaceRestoreEnabled(enabled: boolean): void {
    workspace.setWorkspaceRestoreEnabled(enabled);
  }

  /**
   * Get saved scroll position for a file from workspace
   */
  getWorkspaceScrollPosition(filePath: string): ScrollPosition | undefined {
    return workspace.getWorkspaceScrollPosition(filePath);
  }

  /**
   * Clean up workspace management (call on project close)
   */
  cleanupWorkspace(): void {
    workspace.cleanupWorkspace();
  }

  /**
   * Check if a project has saved workspace state
   */
  hasWorkspaceState(projectId: string): boolean {
    return workspace.hasWorkspaceState(projectId);
  }

  /**
   * Delete workspace state for a project
   */
  deleteWorkspaceState(projectId: string): void {
    workspace.deleteWorkspaceState(projectId);
  }

  // ==================== PUBLISH (GO LIVE) ====================

  /**
   * Publish the current project. Builds and deploys to web.recoder.xyz/<slug>.
   */
  async publishProject(projectName?: string): Promise<{ url: string; slug: string } | null> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return null;

    this.publishState.set({
      status: 'building',
      url: null,
      zrokUrl: null,
      slug: null,
      publishedAt: null,
      error: null,
    });

    try {
      const result = await dockerPost<{ url: string; slug: string; publishedAt: string; zrokUrl?: string | null }>(
        `/api/publish/${projectId}`,
        { name: projectName || projectId },
        { timeout: 120000 } // 2 minute timeout for build
      );

      this.publishState.set({
        status: 'published',
        url: result.url,
        zrokUrl: result.zrokUrl || null,
        slug: result.slug,
        publishedAt: result.publishedAt,
        error: null,
      });

      return { url: result.url, slug: result.slug };
    } catch (error: any) {
      this.publishState.set({
        status: 'error',
        url: null,
        zrokUrl: null,
        slug: null,
        publishedAt: null,
        error: error.message || 'Publish failed',
      });
      return null;
    }
  }

  /**
   * Unpublish the current project
   */
  async unpublishProject(): Promise<boolean> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return false;

    try {
      await dockerPost(`/api/unpublish/${projectId}`, {});
      this.publishState.set({
        status: 'idle',
        url: null,
        zrokUrl: null,
        slug: null,
        publishedAt: null,
        error: null,
      });
      return true;
    } catch (error: any) {
      logger.error('[WorkbenchStore] Unpublish failed:', error);
      return false;
    }
  }

  /**
   * Change the slug (URL path) for a published project
   */
  async changeSlug(newSlug: string): Promise<boolean> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return false;

    try {
      const result = await dockerPost<{ url: string; slug: string; changed: boolean; zrokUrl?: string | null }>(
        `/api/publish/${projectId}/slug`,
        { slug: newSlug },
      );

      if (result.changed) {
        const currentState = this.publishState.get();
        this.publishState.set({
          ...currentState,
          url: result.url,
          zrokUrl: result.zrokUrl ?? currentState.zrokUrl ?? null,
          slug: result.slug,
        });
      }

      return true;
    } catch (error: any) {
      logger.error('[WorkbenchStore] Change slug failed:', error);

      // Dispatch a toast-style event so the UI can show the error
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('recoder:toast', {
          detail: { type: 'error', message: error.message || 'Failed to change slug' },
        }));
      }

      return false;
    }
  }

  /**
   * Add a custom domain to the current published project.
   */
  async addCustomDomain(domain: string): Promise<{ success: boolean; instructions?: any; error?: string }> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return { success: false, error: 'No project' };

    try {
      const result = await dockerPost<{ domain: any; instructions: any }>(`/api/domains/${projectId}`, { domain });
      await this.checkPublishStatus(); // Refresh state
      return { success: true, instructions: result.instructions };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add domain' };
    }
  }

  /**
   * Remove a custom domain from the current published project.
   */
  async removeCustomDomain(domain: string): Promise<boolean> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return false;

    try {
      await dockerDelete(`/api/domains/${projectId}/${domain}`);
      await this.checkPublishStatus();
      return true;
    } catch (error: any) {
      logger.error('[WorkbenchStore] Remove custom domain failed:', error);
      return false;
    }
  }

  /**
   * Verify DNS for a custom domain.
   */
  async verifyCustomDomain(domain: string): Promise<{ verified: boolean; error?: string }> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return { verified: false, error: 'No project' };

    try {
      const result = await dockerPost<{ verified: boolean; method?: string; error?: string }>(`/api/domains/${projectId}/${domain}/verify`, {});
      await this.checkPublishStatus();
      return { verified: result.verified, error: result.error };
    } catch (error: any) {
      return { verified: false, error: error.message || 'Verification failed' };
    }
  }

  /**
   * Activate a custom domain (verify DNS + provision SSL + configure nginx).
   */
  async activateCustomDomain(domain: string): Promise<{ success: boolean; error?: string }> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return { success: false, error: 'No project' };

    try {
      const result = await dockerPost<{ activated: boolean; status: string; error?: string; url?: string }>(`/api/domains/${projectId}/${domain}/activate`, {});
      await this.checkPublishStatus();
      if (result.activated) {
        return { success: true };
      }
      return { success: false, error: result.error || `Domain status: ${result.status}` };
    } catch (error: any) {
      return { success: false, error: error.message || 'Activation failed' };
    }
  }

  /**
   * Check publish status for the current project
   */
  async checkPublishStatus(): Promise<void> {
    const projectId = this.#currentProjectId;
    if (!projectId || !DOCKER_URL) return;

    try {
      const result = await dockerGet<{
        published: boolean;
        url?: string;
        zrokUrl?: string | null;
        slug?: string;
        publishedAt?: string;
        customDomains?: CustomDomainInfo[];
      }>(`/api/publish-status/${projectId}`);

      if (result.published) {
        this.publishState.set({
          status: 'published',
          url: result.url || null,
          zrokUrl: result.zrokUrl || null,
          slug: result.slug || null,
          publishedAt: result.publishedAt || null,
          error: null,
          customDomains: result.customDomains || [],
        });
      }
    } catch {
      // ignore - project may not be published
    }
  }
}

export const workbenchStore = new WorkbenchStore();

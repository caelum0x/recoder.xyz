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

export interface ArtifactState {
  id: string;
  title: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'preview';

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
  
  // Stable atom for project ID (used by useStore in components)
  projectId: WritableAtom<string | null> = import.meta.hot?.data.projectId ?? atom<string | null>(null);

  // ✅ Container ready flag - true only when container exists AND dev server is responding
  // NOTE: Do NOT preserve via HMR - must always start false on page load
  containerReady: WritableAtom<boolean> = atom<boolean>(false);

  // ✅ P1: Build progress feedback
  buildStatus: WritableAtom<BuildStatus> = import.meta.hot?.data.buildStatus ?? atom({
    phase: 'idle',
    message: '',
    progress: 0,
  });

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.buildStatus = this.buildStatus;
      import.meta.hot.data.projectId = this.projectId;
      // NOTE: Do NOT preserve containerReady - must always start false
    }
  }

  /**
   * Mark this session as a restored past chat.
   * This tells ActionRunner to not auto-install since we handle it separately.
   */
  markAsRestoredChat() {
    this.#isRestoredChat = true;
  }

  /**
   * Reset restored chat flag - call this when starting a new conversation
   */
  resetRestoredChatFlag() {
    this.#isRestoredChat = false;
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
      console.log('✅ [WorkbenchStore] Container marked as ready');
    }
  }

  /**
   * Reset container ready state - call this when starting a new conversation
   */
  resetContainerReady() {
    this.containerReady.set(false);
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
  async setProjectId(projectId: string) {
    this.#currentProjectId = projectId;
    this.projectId.set(projectId);
    await this.#terminalStore.setProjectId(projectId);
    await this.#previewsStore.setProjectId(projectId);
  }

  /**
   * Refresh file tree from Docker container
   * Called when CLI tools (claude, recoder-code) modify files
   */
  async refreshFiles() {
    if (!this.#currentProjectId) return;
    
    const DOCKER_URL = import.meta.env?.VITE_DOCKER_BACKEND_URL || 'http://localhost:3100';
    
    try {
      const resp = await fetch(`${DOCKER_URL}/api/files/${this.#currentProjectId}`);
      if (!resp.ok) return;
      
      const data = await resp.json();
      // Update files store with new file list
      // The files are returned as { files: [...] }
      console.log('[WorkbenchStore] Refreshed file list from Docker');
    } catch (e) {
      console.warn('[WorkbenchStore] Failed to refresh files:', e);
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
  }

  setSelectedFile(filePath: string | undefined) {
    if (filePath) {
      this.#editorStore.addTab(filePath);
    } else {
      this.#editorStore.setSelectedFile(undefined);
    }
  }

  closeTab(filePath: string) {
    this.#editorStore.closeTab(filePath);
  }

  closeOtherTabs(filePath: string) {
    this.#editorStore.closeOtherTabs(filePath);
  }

  closeAllTabs() {
    this.#editorStore.closeAllTabs();
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
    // TODO: what do we wanna do and how do we wanna recover from this?
  }

  addArtifact({ messageId, title, id }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(messageId);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    const runner = new ActionRunner(this.#currentProjectId || undefined);
    
    // If this is a restored past chat, mark the runner to disable auto-install
    if (this.#isRestoredChat) {
      runner.markAsRestoredChat();
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

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    artifact.runner.addAction(data);
  }

  async runAction(data: ActionCallbackData) {
    const { messageId } = data;
    // console.log('🔧 workbench.runAction called:', data.action?.type, data.action);

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      console.error('🔧 Artifact not found for messageId:', messageId);
      unreachable('Artifact not found');
    }

    // console.log('🔧 Calling artifact.runner.runAction');
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
}

export const workbenchStore = new WorkbenchStore();

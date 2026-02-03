import { atom, computed, map, type MapStore, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import type { FileMap, FilesStore } from './files';

export type EditorDocuments = Record<string, EditorDocument>;

type SelectedFile = WritableAtom<string | undefined>;
type OpenTabs = WritableAtom<string[]>;

/** Pending navigation to a specific line in a file (for go-to-definition) */
export interface PendingNavigation {
  filePath: string;
  line: number;
  character?: number;
}

export class EditorStore {
  #filesStore: FilesStore;

  selectedFile: SelectedFile = import.meta.hot?.data.selectedFile ?? atom<string | undefined>();
  openTabs: OpenTabs = import.meta.hot?.data.openTabs ?? atom<string[]>([]);
  pinnedTabs: WritableAtom<Set<string>> = import.meta.hot?.data.pinnedTabs ?? atom<Set<string>>(new Set());
  documents: MapStore<EditorDocuments> = import.meta.hot?.data.documents ?? map({});

  // Pending navigation for go-to-definition
  pendingNavigation: WritableAtom<PendingNavigation | undefined> = import.meta.hot?.data.pendingNavigation ?? atom<PendingNavigation | undefined>();

  // Split editor state
  splitEnabled: WritableAtom<boolean> = import.meta.hot?.data.splitEnabled ?? atom<boolean>(false);
  secondarySelectedFile: WritableAtom<string | undefined> = import.meta.hot?.data.secondarySelectedFile ?? atom<string | undefined>();
  syncScrolling: WritableAtom<boolean> = import.meta.hot?.data.syncScrolling ?? atom<boolean>(false);
  splitRatio: WritableAtom<number> = import.meta.hot?.data.splitRatio ?? atom<number>(50); // Percentage for left pane

  currentDocument = computed([this.documents, this.selectedFile], (documents, selectedFile) => {
    if (!selectedFile) {
      return undefined;
    }

    return documents[selectedFile];
  });

  // Secondary document for split view
  secondaryDocument = computed([this.documents, this.secondarySelectedFile], (documents, secondaryFile) => {
    if (!secondaryFile) {
      return undefined;
    }

    return documents[secondaryFile];
  });

  constructor(filesStore: FilesStore) {
    this.#filesStore = filesStore;

    if (import.meta.hot) {
      import.meta.hot.data.documents = this.documents;
      import.meta.hot.data.selectedFile = this.selectedFile;
      import.meta.hot.data.openTabs = this.openTabs;
      import.meta.hot.data.pinnedTabs = this.pinnedTabs;
      import.meta.hot.data.pendingNavigation = this.pendingNavigation;
      import.meta.hot.data.splitEnabled = this.splitEnabled;
      import.meta.hot.data.secondarySelectedFile = this.secondarySelectedFile;
      import.meta.hot.data.syncScrolling = this.syncScrolling;
      import.meta.hot.data.splitRatio = this.splitRatio;
    }
  }

  // Tab management methods
  addTab(filePath: string) {
    const tabs = this.openTabs.get();
    if (!tabs.includes(filePath)) {
      this.openTabs.set([...tabs, filePath]);
    }
    this.selectedFile.set(filePath);
  }

  closeTab(filePath: string) {
    const tabs = this.openTabs.get();
    const index = tabs.indexOf(filePath);
    if (index === -1) return;

    const newTabs = tabs.filter(t => t !== filePath);
    this.openTabs.set(newTabs);

    // If closing the active tab, switch to adjacent tab
    if (this.selectedFile.get() === filePath) {
      if (newTabs.length > 0) {
        const newIndex = Math.min(index, newTabs.length - 1);
        this.selectedFile.set(newTabs[newIndex]);
      } else {
        this.selectedFile.set(undefined);
      }
    }
  }

  closeOtherTabs(filePath: string) {
    // Keep pinned tabs and the target file
    const pinned = this.pinnedTabs.get();
    const tabs = this.openTabs.get().filter(t => t === filePath || pinned.has(t));
    this.openTabs.set(tabs);
    this.selectedFile.set(filePath);
  }

  closeAllTabs() {
    // Keep only pinned tabs
    const pinned = this.pinnedTabs.get();
    const tabs = this.openTabs.get().filter(t => pinned.has(t));
    this.openTabs.set(tabs);
    if (tabs.length > 0) {
      this.selectedFile.set(tabs[0]);
    } else {
      this.selectedFile.set(undefined);
    }
  }

  closeTabsToRight(filePath: string) {
    const tabs = this.openTabs.get();
    const index = tabs.indexOf(filePath);
    if (index === -1) return;

    const pinned = this.pinnedTabs.get();
    // Keep tabs to the left and at current position, plus any pinned tabs to the right
    const newTabs = tabs.filter((t, i) => i <= index || pinned.has(t));
    this.openTabs.set(newTabs);
  }

  reorderTabs(fromIndex: number, toIndex: number) {
    const tabs = [...this.openTabs.get()];
    const pinnedTabs = this.pinnedTabs.get();

    // Count pinned tabs
    const pinnedCount = tabs.filter(t => pinnedTabs.has(t)).length;

    // Don't allow dragging pinned tabs to unpinned area or vice versa
    const fromTab = tabs[fromIndex];
    const isFromPinned = pinnedTabs.has(fromTab);

    if (isFromPinned && toIndex >= pinnedCount) {
      // Trying to drag pinned tab to unpinned area - place at end of pinned
      toIndex = pinnedCount - 1;
    } else if (!isFromPinned && toIndex < pinnedCount) {
      // Trying to drag unpinned tab to pinned area - place at start of unpinned
      toIndex = pinnedCount;
    }

    const [removed] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, removed);
    this.openTabs.set(tabs);
  }

  pinTab(filePath: string) {
    const pinned = new Set(this.pinnedTabs.get());
    if (pinned.has(filePath)) return;

    pinned.add(filePath);
    this.pinnedTabs.set(pinned);

    // Move the tab to the end of the pinned section
    const tabs = [...this.openTabs.get()];
    const tabIndex = tabs.indexOf(filePath);
    if (tabIndex === -1) return;

    // Count existing pinned tabs (excluding the one being pinned)
    const pinnedCount = tabs.filter((t, i) => i !== tabIndex && pinned.has(t)).length;

    // Remove and insert at the pinned position
    tabs.splice(tabIndex, 1);
    tabs.splice(pinnedCount, 0, filePath);
    this.openTabs.set(tabs);
  }

  unpinTab(filePath: string) {
    const pinned = new Set(this.pinnedTabs.get());
    if (!pinned.has(filePath)) return;

    pinned.delete(filePath);
    this.pinnedTabs.set(pinned);

    // Move the tab to the start of the unpinned section
    const tabs = [...this.openTabs.get()];
    const tabIndex = tabs.indexOf(filePath);
    if (tabIndex === -1) return;

    // Count remaining pinned tabs
    const pinnedCount = tabs.filter(t => pinned.has(t)).length;

    // Remove and insert right after pinned tabs
    tabs.splice(tabIndex, 1);
    tabs.splice(pinnedCount, 0, filePath);
    this.openTabs.set(tabs);
  }

  togglePinTab(filePath: string) {
    if (this.pinnedTabs.get().has(filePath)) {
      this.unpinTab(filePath);
    } else {
      this.pinTab(filePath);
    }
  }

  isPinned(filePath: string): boolean {
    return this.pinnedTabs.get().has(filePath);
  }

  setDocuments(files: FileMap) {
    const previousDocuments = this.documents.value;

    this.documents.set(
      Object.fromEntries<EditorDocument>(
        Object.entries(files)
          .map(([filePath, dirent]) => {
            if (dirent === undefined || dirent.type === 'folder') {
              return undefined;
            }

            const previousDocument = previousDocuments?.[filePath];

            return [
              filePath,
              {
                value: dirent.content,
                filePath,
                scroll: previousDocument?.scroll,
              },
            ] as [string, EditorDocument];
          })
          .filter(Boolean) as Array<[string, EditorDocument]>,
      ),
    );
  }

  setSelectedFile(filePath: string | undefined) {
    this.selectedFile.set(filePath);
  }

  /**
   * Navigate to a specific line in a file (for go-to-definition)
   * Opens the file if not already open and sets a pending navigation
   */
  navigateToLine(filePath: string, line: number, character?: number) {
    // Set pending navigation before opening file
    this.pendingNavigation.set({ filePath, line, character });

    // Open the file
    this.addTab(filePath);
  }

  /**
   * Clear pending navigation (called after CodeMirror scrolls to line)
   */
  clearPendingNavigation() {
    this.pendingNavigation.set(undefined);
  }

  /**
   * Get and clear pending navigation in one call
   */
  consumePendingNavigation(): PendingNavigation | undefined {
    const nav = this.pendingNavigation.get();
    if (nav) {
      this.pendingNavigation.set(undefined);
    }
    return nav;
  }

  updateScrollPosition(filePath: string, position: ScrollPosition) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    this.documents.setKey(filePath, {
      ...documentState,
      scroll: position,
    });
  }

  updateFile(filePath: string, newContent: string) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    const currentContent = documentState.value;
    const contentChanged = currentContent !== newContent;

    if (contentChanged) {
      this.documents.setKey(filePath, {
        ...documentState,
        value: newContent,
      });
    }
  }

  // Split view management methods
  toggleSplit() {
    const isEnabled = this.splitEnabled.get();
    this.splitEnabled.set(!isEnabled);

    // When enabling split, if no secondary file is selected, use the primary file
    if (!isEnabled && !this.secondarySelectedFile.get()) {
      const primaryFile = this.selectedFile.get();
      if (primaryFile) {
        // Try to find another open tab to show in split
        const tabs = this.openTabs.get();
        const otherTab = tabs.find(t => t !== primaryFile);
        this.secondarySelectedFile.set(otherTab || primaryFile);
      }
    }
  }

  setSplitEnabled(enabled: boolean) {
    this.splitEnabled.set(enabled);

    if (enabled && !this.secondarySelectedFile.get()) {
      const primaryFile = this.selectedFile.get();
      if (primaryFile) {
        const tabs = this.openTabs.get();
        const otherTab = tabs.find(t => t !== primaryFile);
        this.secondarySelectedFile.set(otherTab || primaryFile);
      }
    }
  }

  setSecondarySelectedFile(filePath: string | undefined) {
    this.secondarySelectedFile.set(filePath);

    // Ensure the file is in tabs
    if (filePath) {
      const tabs = this.openTabs.get();
      if (!tabs.includes(filePath)) {
        this.openTabs.set([...tabs, filePath]);
      }
    }
  }

  toggleSyncScrolling() {
    this.syncScrolling.set(!this.syncScrolling.get());
  }

  setSyncScrolling(enabled: boolean) {
    this.syncScrolling.set(enabled);
  }

  setSplitRatio(ratio: number) {
    // Clamp between 20 and 80
    this.splitRatio.set(Math.max(20, Math.min(80, ratio)));
  }

  // Swap primary and secondary files
  swapSplitFiles() {
    const primary = this.selectedFile.get();
    const secondary = this.secondarySelectedFile.get();

    if (primary && secondary) {
      this.selectedFile.set(secondary);
      this.secondarySelectedFile.set(primary);
    }
  }

  // Open a file in the secondary pane (or enable split if not enabled)
  openInSecondaryPane(filePath: string) {
    if (!this.splitEnabled.get()) {
      this.splitEnabled.set(true);
    }
    this.setSecondarySelectedFile(filePath);
  }

  // Update scroll position for secondary file (for sync scrolling)
  updateSecondaryScrollPosition(filePath: string, position: ScrollPosition) {
    const documents = this.documents.get();
    const documentState = documents[filePath];

    if (!documentState) {
      return;
    }

    this.documents.setKey(filePath, {
      ...documentState,
      scroll: position,
    });
  }

  /**
   * Update file path in tabs and documents when a file is renamed/moved.
   * This ensures open tabs continue to work after rename operations.
   */
  updateFilePath(oldPath: string, newPath: string) {
    // Update tabs
    const tabs = this.openTabs.get();
    const tabIndex = tabs.indexOf(oldPath);
    if (tabIndex !== -1) {
      const newTabs = [...tabs];
      newTabs[tabIndex] = newPath;
      this.openTabs.set(newTabs);
    }

    // Update selected file
    if (this.selectedFile.get() === oldPath) {
      this.selectedFile.set(newPath);
    }

    // Update secondary selected file
    if (this.secondarySelectedFile.get() === oldPath) {
      this.secondarySelectedFile.set(newPath);
    }

    // Update documents - copy document content to new path
    const documents = this.documents.get();
    const documentState = documents[oldPath];
    if (documentState) {
      // Remove old document and add new one
      const newDocuments = { ...documents };
      delete newDocuments[oldPath];
      newDocuments[newPath] = {
        ...documentState,
        filePath: newPath,
      };
      this.documents.set(newDocuments);
    }
  }

  /**
   * Update all file paths under a folder when a folder is renamed/moved.
   * This handles the case when a folder containing open files is renamed.
   */
  updateFolderPath(oldFolderPath: string, newFolderPath: string) {
    const tabs = this.openTabs.get();
    const documents = this.documents.get();
    const newTabs = [...tabs];
    const newDocuments = { ...documents };
    let hasChanges = false;

    // Find all tabs that are under the old folder path
    tabs.forEach((tab, index) => {
      if (tab.startsWith(oldFolderPath + '/')) {
        const newPath = tab.replace(oldFolderPath, newFolderPath);
        newTabs[index] = newPath;
        hasChanges = true;

        // Update document if exists
        const docState = documents[tab];
        if (docState) {
          delete newDocuments[tab];
          newDocuments[newPath] = {
            ...docState,
            filePath: newPath,
          };
        }
      }
    });

    if (hasChanges) {
      this.openTabs.set(newTabs);
      this.documents.set(newDocuments);
    }

    // Update selected file if affected
    const selected = this.selectedFile.get();
    if (selected?.startsWith(oldFolderPath + '/')) {
      this.selectedFile.set(selected.replace(oldFolderPath, newFolderPath));
    }

    // Update secondary selected file if affected
    const secondary = this.secondarySelectedFile.get();
    if (secondary?.startsWith(oldFolderPath + '/')) {
      this.secondarySelectedFile.set(secondary.replace(oldFolderPath, newFolderPath));
    }
  }
}

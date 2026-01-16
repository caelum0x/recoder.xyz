import { atom, computed, map, type MapStore, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import type { FileMap, FilesStore } from './files';

export type EditorDocuments = Record<string, EditorDocument>;

type SelectedFile = WritableAtom<string | undefined>;
type OpenTabs = WritableAtom<string[]>;

export class EditorStore {
  #filesStore: FilesStore;

  selectedFile: SelectedFile = import.meta.hot?.data.selectedFile ?? atom<string | undefined>();
  openTabs: OpenTabs = import.meta.hot?.data.openTabs ?? atom<string[]>([]);
  documents: MapStore<EditorDocuments> = import.meta.hot?.data.documents ?? map({});

  currentDocument = computed([this.documents, this.selectedFile], (documents, selectedFile) => {
    if (!selectedFile) {
      return undefined;
    }

    return documents[selectedFile];
  });

  constructor(filesStore: FilesStore) {
    this.#filesStore = filesStore;

    if (import.meta.hot) {
      import.meta.hot.data.documents = this.documents;
      import.meta.hot.data.selectedFile = this.selectedFile;
      import.meta.hot.data.openTabs = this.openTabs;
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
    this.openTabs.set([filePath]);
    this.selectedFile.set(filePath);
  }

  closeAllTabs() {
    this.openTabs.set([]);
    this.selectedFile.set(undefined);
  }

  reorderTabs(fromIndex: number, toIndex: number) {
    const tabs = [...this.openTabs.get()];
    const [removed] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, removed);
    this.openTabs.set(tabs);
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
}

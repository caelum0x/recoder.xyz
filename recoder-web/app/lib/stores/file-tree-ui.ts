/**
 * File Tree UI Store
 *
 * Manages the state of the file tree UI including:
 * - Expanded/collapsed folders
 * - Selected files (single and multi-select)
 * - Clipboard operations (cut/copy)
 * - Search/filter state
 * - Sort order
 */

import { atom, map, computed, type WritableAtom, type MapStore } from 'nanostores';

// ==================== TYPES ====================

export type SortOrder = 'name-asc' | 'name-desc' | 'type-asc' | 'type-desc' | 'date-asc' | 'date-desc' | 'size-asc' | 'size-desc';

export interface ClipboardItem {
  path: string;
  type: 'file' | 'folder';
  operation: 'cut' | 'copy';
}

export interface FileMetadata {
  path: string;
  size?: number;
  modifiedAt?: Date;
  createdAt?: Date;
}

// ==================== STORES ====================

/**
 * Set of expanded folder paths
 */
export const expandedFoldersStore: WritableAtom<Set<string>> = atom(new Set<string>());

/**
 * Currently selected file path (single selection)
 */
export const selectedFileStore: WritableAtom<string | null> = atom<string | null>(null);

/**
 * Set of selected file paths (multi-selection with Cmd/Ctrl+Click or Shift+Click)
 */
export const selectedFilesStore: WritableAtom<Set<string>> = atom(new Set<string>());

/**
 * Clipboard state for cut/copy operations
 */
export const clipboardStore: WritableAtom<ClipboardItem[]> = atom<ClipboardItem[]>([]);

/**
 * Search query for filtering files
 */
export const searchQueryStore: WritableAtom<string> = atom('');

/**
 * Whether search is active/visible
 */
export const searchActiveStore: WritableAtom<boolean> = atom(false);

/**
 * Current sort order
 */
export const sortOrderStore: WritableAtom<SortOrder> = atom<SortOrder>('name-asc');

/**
 * File metadata cache (size, modified date, etc.)
 */
export const fileMetadataStore: MapStore<Record<string, FileMetadata>> = map({});

/**
 * Drag state for drag-and-drop operations
 */
export const dragStateStore = atom<{
  isDragging: boolean;
  draggedPaths: string[];
  draggedTypes: ('file' | 'folder')[];
  dropTargetPath: string | null;
}>({
  isDragging: false,
  draggedPaths: [],
  draggedTypes: [],
  dropTargetPath: null,
});

/**
 * Currently renaming item path (null if not renaming)
 */
export const renamingPathStore: WritableAtom<string | null> = atom<string | null>(null);

/**
 * Currently creating new item in folder (null if not creating)
 */
export const creatingInStore = atom<{
  folderPath: string;
  type: 'file' | 'folder';
} | null>(null);

/**
 * Last focused item index for keyboard navigation
 */
export const focusedIndexStore: WritableAtom<number> = atom(-1);

/**
 * Whether to show hidden files (dotfiles)
 */
export const showHiddenFilesStore: WritableAtom<boolean> = atom(false);

/**
 * Whether to show file sizes in the tree
 */
export const showFileSizesStore: WritableAtom<boolean> = atom(false);

/**
 * Whether to show modified dates in the tree
 */
export const showModifiedDatesStore: WritableAtom<boolean> = atom(false);

// ==================== COMPUTED VALUES ====================

/**
 * Computed: Whether clipboard has items to paste
 */
export const hasClipboardItems = computed(clipboardStore, (items) => items.length > 0);

/**
 * Computed: Number of selected files
 */
export const selectedFilesCount = computed(selectedFilesStore, (files) => files.size);

/**
 * Computed: Whether multi-selection is active
 */
export const isMultiSelectActive = computed(selectedFilesStore, (files) => files.size > 1);

/**
 * Computed: Clipboard operation type (null, 'cut', or 'copy')
 */
export const clipboardOperation = computed(clipboardStore, (items) => {
  if (items.length === 0) return null;
  return items[0].operation;
});

// ==================== ACTIONS ====================

// --- Folder Expansion ---

export function expandFolder(path: string): void {
  const current = expandedFoldersStore.get();
  const next = new Set(current);
  next.add(path);
  expandedFoldersStore.set(next);
}

export function collapseFolder(path: string): void {
  const current = expandedFoldersStore.get();
  const next = new Set(current);
  next.delete(path);
  expandedFoldersStore.set(next);
}

export function toggleFolder(path: string): void {
  const current = expandedFoldersStore.get();
  if (current.has(path)) {
    collapseFolder(path);
  } else {
    expandFolder(path);
  }
}

export function expandAll(folderPaths: string[]): void {
  expandedFoldersStore.set(new Set(folderPaths));
}

export function collapseAll(): void {
  expandedFoldersStore.set(new Set());
}

export function isFolderExpanded(path: string): boolean {
  return expandedFoldersStore.get().has(path);
}

/**
 * Expand all parent folders to reveal a specific path
 */
export function revealPath(path: string): void {
  const parts = path.split('/').filter(Boolean);
  const current = expandedFoldersStore.get();
  const next = new Set(current);

  let currentPath = '';
  for (let i = 0; i < parts.length - 1; i++) {
    currentPath += '/' + parts[i];
    next.add(currentPath);
  }

  expandedFoldersStore.set(next);
}

// --- File Selection ---

export function selectFile(path: string): void {
  selectedFileStore.set(path);
  selectedFilesStore.set(new Set([path]));
}

export function toggleFileSelection(path: string, multiSelect: boolean = false): void {
  const currentSelected = selectedFilesStore.get();

  if (multiSelect) {
    const next = new Set(currentSelected);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    selectedFilesStore.set(next);
    selectedFileStore.set(path);
  } else {
    selectFile(path);
  }
}

export function selectRange(paths: string[], startPath: string, endPath: string): void {
  const startIndex = paths.indexOf(startPath);
  const endIndex = paths.indexOf(endPath);

  if (startIndex === -1 || endIndex === -1) return;

  const [minIndex, maxIndex] = startIndex < endIndex
    ? [startIndex, endIndex]
    : [endIndex, startIndex];

  const selectedPaths = paths.slice(minIndex, maxIndex + 1);
  selectedFilesStore.set(new Set(selectedPaths));
  selectedFileStore.set(endPath);
}

export function selectAll(paths: string[]): void {
  selectedFilesStore.set(new Set(paths));
  if (paths.length > 0) {
    selectedFileStore.set(paths[0]);
  }
}

export function clearSelection(): void {
  selectedFileStore.set(null);
  selectedFilesStore.set(new Set());
}

export function getSelectedFiles(): string[] {
  return Array.from(selectedFilesStore.get());
}

// --- Clipboard Operations ---

export function copyToClipboard(paths: string[], types: ('file' | 'folder')[]): void {
  const items: ClipboardItem[] = paths.map((path, i) => ({
    path,
    type: types[i] || 'file',
    operation: 'copy',
  }));
  clipboardStore.set(items);
}

export function cutToClipboard(paths: string[], types: ('file' | 'folder')[]): void {
  const items: ClipboardItem[] = paths.map((path, i) => ({
    path,
    type: types[i] || 'file',
    operation: 'cut',
  }));
  clipboardStore.set(items);
}

export function clearClipboard(): void {
  clipboardStore.set([]);
}

export function getClipboardItems(): ClipboardItem[] {
  return clipboardStore.get();
}

// --- Search ---

export function setSearchQuery(query: string): void {
  searchQueryStore.set(query);
}

export function clearSearch(): void {
  searchQueryStore.set('');
  searchActiveStore.set(false);
}

export function toggleSearch(): void {
  const isActive = searchActiveStore.get();
  if (isActive) {
    clearSearch();
  } else {
    searchActiveStore.set(true);
  }
}

export function openSearch(): void {
  searchActiveStore.set(true);
}

export function closeSearch(): void {
  searchActiveStore.set(false);
  searchQueryStore.set('');
}

// --- Sorting ---

export function setSortOrder(order: SortOrder): void {
  sortOrderStore.set(order);
}

export function toggleSortDirection(): void {
  const current = sortOrderStore.get();
  const [field, direction] = current.split('-') as [string, 'asc' | 'desc'];
  const newDirection = direction === 'asc' ? 'desc' : 'asc';
  sortOrderStore.set(`${field}-${newDirection}` as SortOrder);
}

// --- Drag and Drop ---

export function startDrag(paths: string[], types: ('file' | 'folder')[]): void {
  dragStateStore.set({
    isDragging: true,
    draggedPaths: paths,
    draggedTypes: types,
    dropTargetPath: null,
  });
}

export function setDropTarget(path: string | null): void {
  const current = dragStateStore.get();
  dragStateStore.set({
    ...current,
    dropTargetPath: path,
  });
}

export function endDrag(): void {
  dragStateStore.set({
    isDragging: false,
    draggedPaths: [],
    draggedTypes: [],
    dropTargetPath: null,
  });
}

// --- Rename ---

export function startRename(path: string): void {
  renamingPathStore.set(path);
}

export function cancelRename(): void {
  renamingPathStore.set(null);
}

// --- Create New Item ---

export function startCreateFile(folderPath: string): void {
  creatingInStore.set({ folderPath, type: 'file' });
}

export function startCreateFolder(folderPath: string): void {
  creatingInStore.set({ folderPath, type: 'folder' });
}

export function cancelCreate(): void {
  creatingInStore.set(null);
}

// --- Focused Index ---

export function setFocusedIndex(index: number): void {
  focusedIndexStore.set(index);
}

// --- File Metadata ---

export function setFileMetadata(path: string, metadata: Partial<FileMetadata>): void {
  const current = fileMetadataStore.get();
  fileMetadataStore.setKey(path, { ...current[path], path, ...metadata });
}

export function getFileMetadata(path: string): FileMetadata | undefined {
  return fileMetadataStore.get()[path];
}

export function clearFileMetadata(): void {
  fileMetadataStore.set({});
}

// --- View Options ---

export function toggleShowHiddenFiles(): void {
  showHiddenFilesStore.set(!showHiddenFilesStore.get());
}

export function toggleShowFileSizes(): void {
  showFileSizesStore.set(!showFileSizesStore.get());
}

export function toggleShowModifiedDates(): void {
  showModifiedDatesStore.set(!showModifiedDatesStore.get());
}

// --- Reset ---

export function resetFileTreeUI(): void {
  expandedFoldersStore.set(new Set());
  selectedFileStore.set(null);
  selectedFilesStore.set(new Set());
  clipboardStore.set([]);
  searchQueryStore.set('');
  searchActiveStore.set(false);
  sortOrderStore.set('name-asc');
  dragStateStore.set({
    isDragging: false,
    draggedPaths: [],
    draggedTypes: [],
    dropTargetPath: null,
  });
  renamingPathStore.set(null);
  creatingInStore.set(null);
  focusedIndexStore.set(-1);
}

// ==================== FUZZY SEARCH ====================

/**
 * Fuzzy match score for a query against a string
 * Returns a score from 0 to 1 (higher is better match)
 * Returns 0 if no match
 */
export function fuzzyMatch(text: string, query: string): number {
  if (!query) return 1;

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match
  if (textLower === queryLower) return 1;

  // Contains match
  if (textLower.includes(queryLower)) {
    // Boost score if match is at the start
    return textLower.startsWith(queryLower) ? 0.9 : 0.8;
  }

  // Fuzzy character match
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let totalScore = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        consecutiveMatches++;
        totalScore += 0.1 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
      }

      // Bonus for matching at word boundaries
      if (i === 0 || text[i - 1] === '/' || text[i - 1] === '.' || text[i - 1] === '-' || text[i - 1] === '_') {
        totalScore += 0.05;
      }

      totalScore += 0.1;
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  // Did we match all query characters?
  if (queryIndex === queryLower.length) {
    // Normalize score to 0-1 range, max around 0.7 for fuzzy matches
    return Math.min(0.7, totalScore / queryLower.length);
  }

  return 0;
}

/**
 * Filter and sort paths by fuzzy match score
 */
export function fuzzyFilterPaths(paths: string[], query: string): { path: string; score: number }[] {
  if (!query.trim()) {
    return paths.map(path => ({ path, score: 1 }));
  }

  return paths
    .map(path => {
      const fileName = path.split('/').pop() || path;
      // Match against both full path and just filename
      const pathScore = fuzzyMatch(path, query);
      const nameScore = fuzzyMatch(fileName, query);
      // Use the better score, slightly prefer filename matches
      const score = Math.max(pathScore, nameScore * 1.1);
      return { path, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ==================== FILE SIZE FORMATTING ====================

export function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return '';

  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);

  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatModifiedDate(date: Date | undefined): string {
  if (!date) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today - show time
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    // Show date
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}

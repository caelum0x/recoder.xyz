/**
 * Export Store
 * Manages project export state, progress, and options using nanostores
 * Inspired by December's export service
 */

import { atom, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ExportStore');

// ==================== TYPES ====================

/**
 * Export format options
 */
export type ExportFormat = 'zip' | 'tar.gz';

/**
 * Export status
 */
export type ExportStatus = 'idle' | 'preparing' | 'reading' | 'compressing' | 'downloading' | 'complete' | 'error';

/**
 * Export options configuration
 */
export interface ExportOptions {
  /** Include patterns (glob-style) */
  includePatterns: string[];
  /** Exclude patterns (glob-style) */
  excludePatterns: string[];
  /** Whether to include .env.example (sanitized) */
  includeEnvExample: boolean;
  /** Whether to include auto-generated README */
  includeReadme: boolean;
  /** Custom project name for the export */
  projectName: string;
  /** Export format */
  format: ExportFormat;
  /** Preserve directory structure */
  preserveStructure: boolean;
  /** Selected files for selective export (empty = all files) */
  selectedFiles: string[];
}

/**
 * Export progress state
 */
export interface ExportProgress {
  /** Current status */
  status: ExportStatus;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current file being processed */
  currentFile: string;
  /** Total files to process */
  totalFiles: number;
  /** Files processed so far */
  processedFiles: number;
  /** Size of files processed (bytes) */
  processedBytes: number;
  /** Estimated total size (bytes) */
  estimatedTotalBytes: number;
  /** Error message if status is 'error' */
  error?: string;
}

/**
 * Export history entry
 */
export interface ExportHistoryEntry {
  /** Unique ID */
  id: string;
  /** Project ID */
  projectId: string;
  /** Project name used for export */
  projectName: string;
  /** Timestamp */
  timestamp: number;
  /** Number of files exported */
  fileCount: number;
  /** Total size in bytes */
  sizeBytes: number;
  /** Format used */
  format: ExportFormat;
  /** Export duration in ms */
  durationMs: number;
  /** Options used */
  options: ExportOptions;
}

// ==================== DEFAULT VALUES ====================

/**
 * Default exclude patterns (common build artifacts and dependencies)
 */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
  'node_modules/**',
  '.next/**',
  'dist/**',
  'build/**',
  '.git/**',
  '.cache/**',
  '.turbo/**',
  '*.log',
  '*.lock',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '.DS_Store',
  'Thumbs.db',
  '*.pyc',
  '__pycache__/**',
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  'coverage/**',
  '.nyc_output/**',
  '.vscode/**',
  '.idea/**',
];

/**
 * Default include patterns (all source files)
 */
export const DEFAULT_INCLUDE_PATTERNS: string[] = [
  '**/*',
];

/**
 * Default export options
 */
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includePatterns: DEFAULT_INCLUDE_PATTERNS,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  includeEnvExample: true,
  includeReadme: true,
  projectName: 'recoder-project',
  format: 'zip',
  preserveStructure: true,
  selectedFiles: [],
};

/**
 * Initial progress state
 */
export const INITIAL_PROGRESS: ExportProgress = {
  status: 'idle',
  percentage: 0,
  currentFile: '',
  totalFiles: 0,
  processedFiles: 0,
  processedBytes: 0,
  estimatedTotalBytes: 0,
};

// ==================== STORES ====================

/**
 * Export modal visibility
 */
export const exportModalOpen = atom<boolean>(false);

/**
 * Export options store
 */
export const exportOptions = map<ExportOptions>(DEFAULT_EXPORT_OPTIONS);

/**
 * Export progress store
 */
export const exportProgress = map<ExportProgress>(INITIAL_PROGRESS);

/**
 * Export history store
 */
export const exportHistory = atom<ExportHistoryEntry[]>([]);

/**
 * Current project ID being exported
 */
export const currentExportProjectId = atom<string | null>(null);

// ==================== ACTIONS ====================

/**
 * Open export modal
 */
export function openExportModal(): void {
  exportModalOpen.set(true);
}

/**
 * Close export modal
 */
export function closeExportModal(): void {
  exportModalOpen.set(false);
}

/**
 * Toggle export modal
 */
export function toggleExportModal(): void {
  exportModalOpen.set(!exportModalOpen.get());
}

/**
 * Reset export options to defaults
 */
export function resetExportOptions(): void {
  exportOptions.set({ ...DEFAULT_EXPORT_OPTIONS });
}

/**
 * Update export options
 */
export function updateExportOptions(updates: Partial<ExportOptions>): void {
  exportOptions.set({ ...exportOptions.get(), ...updates });
}

/**
 * Set project name for export
 */
export function setExportProjectName(name: string): void {
  exportOptions.setKey('projectName', name);
}

/**
 * Toggle include env example
 */
export function toggleIncludeEnvExample(): void {
  const current = exportOptions.get();
  exportOptions.setKey('includeEnvExample', !current.includeEnvExample);
}

/**
 * Toggle include readme
 */
export function toggleIncludeReadme(): void {
  const current = exportOptions.get();
  exportOptions.setKey('includeReadme', !current.includeReadme);
}

/**
 * Add exclude pattern
 */
export function addExcludePattern(pattern: string): void {
  const current = exportOptions.get();
  if (!current.excludePatterns.includes(pattern)) {
    exportOptions.setKey('excludePatterns', [...current.excludePatterns, pattern]);
  }
}

/**
 * Remove exclude pattern
 */
export function removeExcludePattern(pattern: string): void {
  const current = exportOptions.get();
  exportOptions.setKey(
    'excludePatterns',
    current.excludePatterns.filter((p) => p !== pattern)
  );
}

/**
 * Add include pattern
 */
export function addIncludePattern(pattern: string): void {
  const current = exportOptions.get();
  if (!current.includePatterns.includes(pattern)) {
    exportOptions.setKey('includePatterns', [...current.includePatterns, pattern]);
  }
}

/**
 * Remove include pattern
 */
export function removeIncludePattern(pattern: string): void {
  const current = exportOptions.get();
  exportOptions.setKey(
    'includePatterns',
    current.includePatterns.filter((p) => p !== pattern)
  );
}

/**
 * Set selected files for selective export
 */
export function setSelectedFiles(files: string[]): void {
  exportOptions.setKey('selectedFiles', files);
}

/**
 * Clear selected files (export all)
 */
export function clearSelectedFiles(): void {
  exportOptions.setKey('selectedFiles', []);
}

/**
 * Toggle file selection
 */
export function toggleFileSelection(filePath: string): void {
  const current = exportOptions.get();
  const selected = current.selectedFiles;
  if (selected.includes(filePath)) {
    exportOptions.setKey('selectedFiles', selected.filter((f) => f !== filePath));
  } else {
    exportOptions.setKey('selectedFiles', [...selected, filePath]);
  }
}

/**
 * Update export progress
 */
export function updateExportProgress(updates: Partial<ExportProgress>): void {
  exportProgress.set({ ...exportProgress.get(), ...updates });
}

/**
 * Set export status
 */
export function setExportStatus(status: ExportStatus, error?: string): void {
  const updates: Partial<ExportProgress> = { status };
  if (error !== undefined) {
    updates.error = error;
  }
  exportProgress.set({ ...exportProgress.get(), ...updates });
}

/**
 * Reset export progress
 */
export function resetExportProgress(): void {
  exportProgress.set({ ...INITIAL_PROGRESS });
}

/**
 * Start export (set initial progress)
 */
export function startExport(totalFiles: number, estimatedBytes: number): void {
  exportProgress.set({
    status: 'preparing',
    percentage: 0,
    currentFile: '',
    totalFiles,
    processedFiles: 0,
    processedBytes: 0,
    estimatedTotalBytes: estimatedBytes,
  });
}

/**
 * Update file progress during export
 */
export function updateFileProgress(filePath: string, fileBytes: number): void {
  const current = exportProgress.get();
  const processedFiles = current.processedFiles + 1;
  const processedBytes = current.processedBytes + fileBytes;
  const percentage = current.totalFiles > 0
    ? Math.round((processedFiles / current.totalFiles) * 100)
    : 0;

  exportProgress.set({
    ...current,
    status: 'reading',
    currentFile: filePath,
    processedFiles,
    processedBytes,
    percentage,
  });
}

/**
 * Complete export
 */
export function completeExport(): void {
  exportProgress.set({
    ...exportProgress.get(),
    status: 'complete',
    percentage: 100,
  });
}

/**
 * Set export error
 */
export function setExportError(error: string): void {
  exportProgress.set({
    ...exportProgress.get(),
    status: 'error',
    error,
  });
}

/**
 * Add entry to export history
 */
export function addExportHistoryEntry(entry: ExportHistoryEntry): void {
  const history = exportHistory.get();
  // Keep last 20 entries
  const newHistory = [entry, ...history].slice(0, 20);
  exportHistory.set(newHistory);

  // Persist to localStorage
  saveExportHistory(newHistory);
}

/**
 * Clear export history
 */
export function clearExportHistory(): void {
  exportHistory.set([]);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('recoder_export_history');
  }
}

/**
 * Load export history from localStorage
 */
export function loadExportHistory(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const stored = localStorage.getItem('recoder_export_history');
    if (stored) {
      const history = JSON.parse(stored) as ExportHistoryEntry[];
      exportHistory.set(history);
    }
  } catch (e) {
    logger.error('[Export] Failed to load export history:', e);
  }
}

/**
 * Save export history to localStorage
 */
function saveExportHistory(history: ExportHistoryEntry[]): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem('recoder_export_history', JSON.stringify(history));
  } catch (e) {
    logger.error('[Export] Failed to save export history:', e);
  }
}

/**
 * Set current project ID for export
 */
export function setCurrentExportProjectId(projectId: string | null): void {
  currentExportProjectId.set(projectId);
}

/**
 * Get export options preset for quick exports
 */
export function getQuickExportOptions(presetName: 'minimal' | 'full' | 'source-only'): Partial<ExportOptions> {
  switch (presetName) {
    case 'minimal':
      return {
        excludePatterns: [
          ...DEFAULT_EXCLUDE_PATTERNS,
          'tests/**',
          '**/*.test.*',
          '**/*.spec.*',
          'docs/**',
          '*.md',
        ],
        includeEnvExample: false,
        includeReadme: false,
      };
    case 'full':
      return {
        excludePatterns: ['node_modules/**', '.git/**', '.next/**', 'dist/**', 'build/**'],
        includeEnvExample: true,
        includeReadme: true,
      };
    case 'source-only':
      return {
        includePatterns: ['src/**', 'app/**', 'pages/**', 'components/**', 'lib/**', 'utils/**'],
        excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
        includeEnvExample: false,
        includeReadme: false,
      };
    default:
      return {};
  }
}

/**
 * Apply preset to export options
 */
export function applyExportPreset(presetName: 'minimal' | 'full' | 'source-only'): void {
  const preset = getQuickExportOptions(presetName);
  exportOptions.set({ ...DEFAULT_EXPORT_OPTIONS, ...preset });
}

// Initialize export history on module load
if (typeof window !== 'undefined') {
  loadExportHistory();
}

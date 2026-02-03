/**
 * Types for diff application strategies
 */

/**
 * Result of a diff application operation
 */
export type DiffResult =
  | { success: true; content: string; failParts?: DiffResult[] }
  | ({
      success: false;
      error?: string;
      details?: {
        similarity?: number;
        threshold?: number;
        matchedRange?: { start: number; end: number };
        searchContent?: string;
        bestMatch?: string;
      };
      failParts?: DiffResult[];
    } & ({ error: string } | { failParts: DiffResult[] }));

/**
 * Item for batch diff operations
 */
export interface DiffItem {
  content: string;
  startLine?: number;
}

/**
 * Progress status for diff tool
 */
export interface ToolProgressStatus {
  icon?: string;
  text?: string;
}

/**
 * Tool use information
 */
export interface ToolUse {
  type: 'tool_use';
  name: string;
  params: Record<string, string>;
  partial: boolean;
}

/**
 * Strategy interface for diff application
 */
export interface DiffStrategy {
  /**
   * Get the name of this diff strategy for analytics and debugging
   */
  getName(): string;

  /**
   * Get the tool description for this diff strategy
   */
  getToolDescription(args: { cwd: string; toolOptions?: Record<string, string> }): string;

  /**
   * Apply a diff to the original content
   */
  applyDiff(
    originalContent: string,
    diffContent: string | DiffItem[],
    startLine?: number,
    endLine?: number
  ): Promise<DiffResult>;

  /**
   * Get progress status for tool UI
   */
  getProgressStatus?(toolUse: ToolUse, result?: DiffResult): ToolProgressStatus;
}

/**
 * File operation for multi-file batch operations
 */
export interface FileOperation {
  path: string;
  diffs: Array<{
    content: string;
    startLine?: number;
  }>;
}

/**
 * Result of a multi-file operation
 */
export interface MultiFileResult {
  results: Map<string, DiffResult>;
  overallSuccess: boolean;
  successCount: number;
  failureCount: number;
}

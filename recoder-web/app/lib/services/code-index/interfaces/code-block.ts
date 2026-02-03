/**
 * Code Block Interfaces
 * Types for parsed code segments
 */

export interface CodeBlock {
  filePath: string;
  identifier: string | null;
  type: string;
  startLine: number;
  endLine: number;
  content: string;
  fileHash: string;
  segmentHash: string;
  language?: string;
}

export interface ParseOptions {
  minBlockLines?: number;
  maxBlockLines?: number;
  content?: string;
  fileHash?: string;
}

export interface ICodeParser {
  /**
   * Parses a code file into code blocks
   * @param filePath Path to the file to parse
   * @param options Optional parsing options
   * @returns Promise resolving to array of code blocks
   */
  parseFile(filePath: string, options?: ParseOptions): Promise<CodeBlock[]>;

  /**
   * Parses code content directly
   * @param content The code content to parse
   * @param filePath Virtual file path for context
   * @param language The programming language
   * @returns Promise resolving to array of code blocks
   */
  parseContent(content: string, filePath: string, language?: string): Promise<CodeBlock[]>;
}

export interface ScanResult {
  stats: {
    processed: number;
    skipped: number;
    errors: number;
  };
  totalBlockCount: number;
  blocks?: CodeBlock[];
}

export interface IDirectoryScanner {
  /**
   * Scans a directory for code blocks
   */
  scanDirectory(
    directory: string,
    files: string[],
    onError?: (error: Error) => void,
    onBlocksIndexed?: (indexedCount: number) => void,
    onFileParsed?: (fileBlockCount: number) => void
  ): Promise<ScanResult>;

  /**
   * Cancels ongoing scan
   */
  cancel(): void;

  /**
   * Gets cancellation status
   */
  get isCancelled(): boolean;
}

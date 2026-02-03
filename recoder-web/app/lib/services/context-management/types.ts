/**
 * Context Management Types
 *
 * Type definitions for the context management system including:
 * - File mention extraction
 * - Symbol tracking
 * - Dependency resolution
 * - Token budget management
 */

/**
 * Source of how a file was added to context
 */
export type RecordSource =
  | 'read_tool'      // File was read via a tool
  | 'user_edited'    // User modified the file
  | 'ai_edited'      // AI modified the file
  | 'file_mentioned' // File was mentioned in conversation
  | 'auto_import'    // Automatically included via import analysis
  | 'auto_related'   // Automatically included as related file
  | 'auto_smart'     // Automatically included via smart analysis
  | 'manual'         // Manually selected by user
  | 'system';        // System-required file (e.g., package.json)

/**
 * State of a file context entry
 */
export type RecordState = 'active' | 'stale' | 'removed';

/**
 * Metadata entry for a file in context
 */
export interface FileMetadataEntry {
  path: string;
  recordState: RecordState;
  recordSource: RecordSource;
  aiReadDate: number | null;
  aiEditDate: number | null;
  userEditDate: number | null;
  tokenCount: number;
  lastModified?: number;
  hash?: string;
}

/**
 * Task/conversation metadata
 */
export interface TaskMetadata {
  filesInContext: FileMetadataEntry[];
  totalTokens: number;
  lastUpdated: number;
}

/**
 * Symbol information extracted from code
 */
export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'type' | 'interface' | 'enum' | 'constant' | 'component';
  filePath: string;
  line: number;
  column?: number;
  exported: boolean;
  isDefault: boolean;
  docComment?: string;
}

/**
 * Import information extracted from code
 */
export interface ImportInfo {
  source: string;           // The import path/module
  isRelative: boolean;      // Is it a relative import?
  isNpmPackage: boolean;    // Is it an npm package?
  specifiers: Array<{
    name: string;           // The imported name
    alias?: string;         // If renamed via 'as'
    isDefault: boolean;     // Is it a default import?
    isNamespace: boolean;   // Is it a namespace import (import * as)
  }>;
  line: number;
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  path: string;
  imports: ImportInfo[];
  exports: SymbolInfo[];
  importedBy: string[];
  depth: number;              // Distance from entry point
  isEntryPoint: boolean;
}

/**
 * Dependency graph
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  entryPoints: string[];
  totalFiles: number;
  buildTime: number;
}

/**
 * File mention extracted from text
 */
export interface FileMention {
  path: string;
  matchText: string;
  startIndex: number;
  endIndex: number;
  confidence: 'high' | 'medium' | 'low';
  context: 'inline_code' | 'path_reference' | 'natural_language';
}

/**
 * Context file with full content and metadata
 */
export interface ContextFile {
  path: string;
  content: string;
  language: string;
  tokenCount: number;
  source: RecordSource;
  priority: number;
  symbols?: SymbolInfo[];
  imports?: ImportInfo[];
  lastModified?: number;
}

/**
 * Token budget configuration
 */
export interface TokenBudgetConfig {
  maxTokens: number;           // Maximum tokens for context
  reservedForResponse: number; // Tokens reserved for AI response
  reservedForSystem: number;   // Tokens reserved for system prompt
  bufferPercentage: number;    // Safety buffer (0-1)
}

/**
 * Token budget status
 */
export interface TokenBudgetStatus {
  totalBudget: number;
  used: number;
  available: number;
  percentage: number;
  isOverBudget: boolean;
  breakdown: {
    systemPrompt: number;
    conversationHistory: number;
    fileContext: number;
    reservedForResponse: number;
  };
}

/**
 * Context inclusion decision
 */
export interface ContextInclusionDecision {
  path: string;
  included: boolean;
  reason: string;
  priority: number;
  tokenCost: number;
  budgetImpact: number;
}

/**
 * Smart context result
 */
export interface SmartContextResult {
  files: ContextFile[];
  totalTokens: number;
  budget: TokenBudgetStatus;
  decisions: ContextInclusionDecision[];
  warnings: string[];
  summary: string;
}

/**
 * Context management options
 */
export interface ContextManagementOptions {
  tokenBudget: TokenBudgetConfig;
  includeImports: boolean;
  includeImportedBy: boolean;
  includeRelatedTests: boolean;
  includeConfigs: boolean;
  includeTypes: boolean;
  maxDepth: number;
  maxFiles: number;
  priorityPatterns: string[];
  excludePatterns: string[];
}

/**
 * Default context management options
 */
export const DEFAULT_CONTEXT_OPTIONS: ContextManagementOptions = {
  tokenBudget: {
    maxTokens: 128000,        // Default context window
    reservedForResponse: 8192,
    reservedForSystem: 4000,
    bufferPercentage: 0.1,
  },
  includeImports: true,
  includeImportedBy: true,
  includeRelatedTests: false,
  includeConfigs: true,
  includeTypes: true,
  maxDepth: 3,
  maxFiles: 50,
  priorityPatterns: [
    '**/App.{tsx,jsx,ts,js}',
    '**/index.{tsx,jsx,ts,js}',
    '**/main.{tsx,jsx,ts,js}',
    'package.json',
    'tsconfig.json',
  ],
  excludePatterns: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.min.js',
    '**/*.map',
    '**/package-lock.json',
    '**/yarn.lock',
    '**/pnpm-lock.yaml',
  ],
};

/**
 * Truncation result type
 */
export interface TruncationResult {
  messages: ApiMessage[];
  truncationId: string;
  messagesRemoved: number;
}

/**
 * API message type for context management
 */
export interface ApiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; [key: string]: unknown }>;
  ts?: number;
  truncationParent?: string;
  isTruncationMarker?: boolean;
  truncationId?: string;
  isSummary?: boolean;
}

/**
 * Context condensation result
 */
export interface CondenseResult {
  messages: ApiMessage[];
  summary: string;
  cost: number;
  prevContextTokens: number;
  newContextTokens?: number;
  error?: string;
  truncationId?: string;
  messagesRemoved?: number;
}

/**
 * File tracker event types
 */
export type FileTrackerEvent =
  | { type: 'file_read'; path: string; source: RecordSource }
  | { type: 'file_edited'; path: string; source: RecordSource }
  | { type: 'file_mentioned'; path: string; matchText: string }
  | { type: 'file_stale'; path: string }
  | { type: 'context_updated'; totalTokens: number };

/**
 * File tracker event listener
 */
export type FileTrackerEventListener = (event: FileTrackerEvent) => void;

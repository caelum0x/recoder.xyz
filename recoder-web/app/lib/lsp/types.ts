/**
 * LSP Protocol Types
 * Complete type definitions for Language Server Protocol messages
 * Based on LSP 3.17 specification
 */

// ============================================
// Basic Types
// ============================================

/** LSP Position (0-based) */
export interface LSPPosition {
  line: number;
  character: number;
}

/** LSP Range */
export interface LSPRange {
  start: LSPPosition;
  end: LSPPosition;
}

/** LSP Location */
export interface LSPLocation {
  uri: string;
  range: LSPRange;
}

/** LSP Text Edit */
export interface LSPTextEdit {
  range: LSPRange;
  newText: string;
}

/** LSP Markup Content */
export interface LSPMarkupContent {
  kind: 'plaintext' | 'markdown';
  value: string;
}

export type LSPDocumentation = string | LSPMarkupContent;

// ============================================
// Diagnostic Types
// ============================================

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export enum DiagnosticTag {
  Unnecessary = 1,
  Deprecated = 2,
}

export interface LSPDiagnosticRelatedInformation {
  location: LSPLocation;
  message: string;
}

export interface LSPDiagnostic {
  range: LSPRange;
  severity?: DiagnosticSeverity;
  code?: string | number;
  codeDescription?: {
    href: string;
  };
  source?: string;
  message: string;
  tags?: DiagnosticTag[];
  relatedInformation?: LSPDiagnosticRelatedInformation[];
  data?: unknown;
}

export interface LSPPublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: LSPDiagnostic[];
}

// ============================================
// Completion Types
// ============================================

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export enum CompletionItemTag {
  Deprecated = 1,
}

export enum InsertTextFormat {
  PlainText = 1,
  Snippet = 2,
}

export enum CompletionTriggerKind {
  Invoked = 1,
  TriggerCharacter = 2,
  TriggerForIncompleteCompletions = 3,
}

export interface LSPCompletionContext {
  triggerKind: CompletionTriggerKind;
  triggerCharacter?: string;
}

export interface LSPCompletionItem {
  label: string;
  labelDetails?: {
    detail?: string;
    description?: string;
  };
  kind?: CompletionItemKind;
  tags?: CompletionItemTag[];
  detail?: string;
  documentation?: LSPDocumentation;
  deprecated?: boolean;
  preselect?: boolean;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: InsertTextFormat;
  insertTextMode?: 1 | 2; // asIs = 1, adjustIndentation = 2
  textEdit?: LSPTextEdit;
  textEditText?: string;
  additionalTextEdits?: LSPTextEdit[];
  commitCharacters?: string[];
  command?: LSPCommand;
  data?: unknown;
}

export interface LSPCompletionList {
  isIncomplete: boolean;
  itemDefaults?: {
    commitCharacters?: string[];
    editRange?: LSPRange;
    insertTextFormat?: InsertTextFormat;
    insertTextMode?: 1 | 2;
    data?: unknown;
  };
  items: LSPCompletionItem[];
}

export interface LSPCompletionParams {
  textDocument: { uri: string };
  position: LSPPosition;
  context?: LSPCompletionContext;
}

// ============================================
// Hover Types
// ============================================

export type LSPMarkedString = string | { language: string; value: string };

export type LSPHoverContents =
  | LSPMarkedString
  | LSPMarkedString[]
  | LSPMarkupContent;

export interface LSPHover {
  contents: LSPHoverContents;
  range?: LSPRange;
}

export interface LSPHoverParams {
  textDocument: { uri: string };
  position: LSPPosition;
}

// ============================================
// Definition/Reference Types
// ============================================

export interface LSPDefinitionParams {
  textDocument: { uri: string };
  position: LSPPosition;
}

export type LSPDefinitionResult = LSPLocation | LSPLocation[] | null;

export interface LSPReferenceContext {
  includeDeclaration: boolean;
}

export interface LSPReferenceParams {
  textDocument: { uri: string };
  position: LSPPosition;
  context: LSPReferenceContext;
}

// ============================================
// Signature Help Types
// ============================================

export interface LSPParameterInformation {
  label: string | [number, number];
  documentation?: LSPDocumentation;
}

export interface LSPSignatureInformation {
  label: string;
  documentation?: LSPDocumentation;
  parameters?: LSPParameterInformation[];
  activeParameter?: number;
}

export interface LSPSignatureHelp {
  signatures: LSPSignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface LSPSignatureHelpParams {
  textDocument: { uri: string };
  position: LSPPosition;
  context?: {
    triggerKind: 1 | 2 | 3; // Invoked = 1, TriggerCharacter = 2, ContentChange = 3
    triggerCharacter?: string;
    isRetrigger: boolean;
    activeSignatureHelp?: LSPSignatureHelp;
  };
}

// ============================================
// Document Symbol Types
// ============================================

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export enum SymbolTag {
  Deprecated = 1,
}

export interface LSPDocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  tags?: SymbolTag[];
  deprecated?: boolean;
  range: LSPRange;
  selectionRange: LSPRange;
  children?: LSPDocumentSymbol[];
}

export interface LSPDocumentSymbolParams {
  textDocument: { uri: string };
}

// ============================================
// Code Action Types
// ============================================

export enum CodeActionKind {
  Empty = '',
  QuickFix = 'quickfix',
  Refactor = 'refactor',
  RefactorExtract = 'refactor.extract',
  RefactorInline = 'refactor.inline',
  RefactorRewrite = 'refactor.rewrite',
  Source = 'source',
  SourceOrganizeImports = 'source.organizeImports',
  SourceFixAll = 'source.fixAll',
}

export interface LSPCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface LSPCodeAction {
  title: string;
  kind?: CodeActionKind;
  diagnostics?: LSPDiagnostic[];
  isPreferred?: boolean;
  disabled?: {
    reason: string;
  };
  edit?: LSPWorkspaceEdit;
  command?: LSPCommand;
  data?: unknown;
}

export interface LSPCodeActionParams {
  textDocument: { uri: string };
  range: LSPRange;
  context: {
    diagnostics: LSPDiagnostic[];
    only?: CodeActionKind[];
    triggerKind?: 1 | 2; // Invoked = 1, Automatic = 2
  };
}

// ============================================
// Workspace Edit Types
// ============================================

export interface LSPTextDocumentEdit {
  textDocument: {
    uri: string;
    version: number | null;
  };
  edits: LSPTextEdit[];
}

export interface LSPWorkspaceEdit {
  changes?: { [uri: string]: LSPTextEdit[] };
  documentChanges?: LSPTextDocumentEdit[];
}

// ============================================
// Document Sync Types
// ============================================

export enum TextDocumentSyncKind {
  None = 0,
  Full = 1,
  Incremental = 2,
}

export interface LSPDidOpenTextDocumentParams {
  textDocument: {
    uri: string;
    languageId: string;
    version: number;
    text: string;
  };
}

export interface LSPDidChangeTextDocumentParams {
  textDocument: {
    uri: string;
    version: number;
  };
  contentChanges: Array<{
    range?: LSPRange;
    rangeLength?: number;
    text: string;
  }>;
}

export interface LSPDidCloseTextDocumentParams {
  textDocument: {
    uri: string;
  };
}

// ============================================
// Server Capabilities Types
// ============================================

export interface LSPServerCapabilities {
  textDocumentSync?: TextDocumentSyncKind | {
    openClose?: boolean;
    change?: TextDocumentSyncKind;
    willSave?: boolean;
    willSaveWaitUntil?: boolean;
    save?: boolean | { includeText?: boolean };
  };
  completionProvider?: {
    triggerCharacters?: string[];
    allCommitCharacters?: string[];
    resolveProvider?: boolean;
  };
  hoverProvider?: boolean | {};
  signatureHelpProvider?: {
    triggerCharacters?: string[];
    retriggerCharacters?: string[];
  };
  definitionProvider?: boolean | {};
  referencesProvider?: boolean | {};
  documentSymbolProvider?: boolean | {};
  codeActionProvider?: boolean | {
    codeActionKinds?: CodeActionKind[];
  };
  diagnosticProvider?: {
    interFileDependencies: boolean;
    workspaceDiagnostics: boolean;
  };
}

// ============================================
// Server Status Types
// ============================================

export type LSPServerState = 'stopped' | 'starting' | 'running' | 'error';

export interface LSPServerStatus {
  languageId: string;
  name: string;
  status: LSPServerState;
  port?: number;
  capabilities?: LSPServerCapabilities;
  error?: string;
  startedAt?: number;
  lastHealthCheck?: number;
}

// ============================================
// Connection State Types
// ============================================

export type LSPConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface LSPConnectionStatus {
  state: LSPConnectionState;
  reconnectAttempts: number;
  lastConnected?: number;
  lastError?: string;
}

// ============================================
// Request/Response Types
// ============================================

export interface LSPRequest {
  method: string;
  params: unknown;
}

export interface LSPResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ============================================
// Event Types
// ============================================

export interface LSPClientEvents {
  'connected': () => void;
  'disconnected': (reason: string) => void;
  'reconnecting': (attempt: number) => void;
  'error': (error: Error) => void;
  'diagnostics': (uri: string, diagnostics: LSPDiagnostic[]) => void;
  'serverStatus': (status: LSPServerStatus) => void;
}

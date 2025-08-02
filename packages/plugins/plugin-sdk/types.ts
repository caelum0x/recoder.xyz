/**
 * Core plugin interface definitions for the Craft Code extensibility framework
 */
import * as React from 'react';
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license: string;
  keywords: string[];
  engines: {
    craftCode: string;
    node: string;
  };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  icon?: string;
  screenshots?: string[];
  category: PluginCategory;
  tags: string[];
  pricing?: PluginPricing;
  publishedAt: Date;
  updatedAt: Date;
  downloads: number;
  rating: {
    average: number;
    count: number;
  };
}

export enum PluginCategory {
  AI_INTEGRATION = 'ai-integration',
  CODE_GENERATION = 'code-generation',
  DEPLOYMENT = 'deployment',
  TESTING = 'testing',
  VERSION_CONTROL = 'version-control',
  DATABASE = 'database',
  CLOUD_SERVICES = 'cloud-services',
  BLOCKCHAIN = 'blockchain',
  PAYMENT = 'payment',
  UTILITIES = 'utilities',
  THEMES = 'themes',
  LANGUAGES = 'languages',
  FRAMEWORKS = 'frameworks',
  CONTAINERS = 'containers'
}

export interface PluginPricing {
  type: 'free' | 'paid' | 'freemium';
  price?: number;
  currency?: string;
  billingCycle?: 'monthly' | 'yearly' | 'one-time';
  trialPeriod?: number; // days
}

export interface PluginCapabilities {
  codeGeneration?: boolean;
  fileSystemAccess?: boolean;
  networkAccess?: boolean;
  shellAccess?: boolean;
  databaseAccess?: boolean;
  cloudAccess?: boolean;
  uiExtensions?: boolean;
  apiAccess?: boolean;
  webhooks?: boolean;
  storage?: boolean;
}

export interface PluginConfiguration {
  schema: Record<string, ConfigurationField>;
  defaults: Record<string, any>;
}

export interface ConfigurationField {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'select' | 'multiselect';
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: any[];
  };
  options?: Array<{ value: any; label: string }>;
  sensitive?: boolean; // For secrets/API keys
}

export interface PluginContext {
  id: string;
  version: string;
  config: Record<string, any>;
  logger: PluginLogger;
  storage: PluginStorage;
  api: PluginAPI;
  workspace: WorkspaceAPI;
  ui: PluginUI;
  events: EventEmitter;
}

export interface PluginLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

export interface PluginStorage {
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

export interface PluginAPI {
  request(options: RequestOptions): Promise<Response>;
  webhook: WebhookAPI;
}

export interface RequestOptions {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface WebhookAPI {
  create(options: WebhookOptions): Promise<string>; // Returns webhook URL
  delete(id: string): Promise<void>;
  list(): Promise<Webhook[]>;
}

export interface WebhookOptions {
  events: string[];
  secret?: string;
  metadata?: Record<string, any>;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface WorkspaceAPI {
  rootPath: string;
  getProject(): Promise<Project | null>;
  createFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  updateFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listFiles(pattern?: string): Promise<string[]>;
  executeCommand(command: string, args?: string[]): Promise<CommandResult>;
  watchFiles(pattern: string, callback: (event: FileEvent) => void): Promise<FileWatcher>;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  type: string;
  framework?: string;
  language: string;
  metadata: Record<string, any>;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface FileEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: Date;
}

export interface FileWatcher {
  stop(): void;
}

export interface PluginUI {
  showInputDialog(arg0: { title: string; placeholder: string; multiline: boolean; }): string | PromiseLike<string | null> | null;
  showNotification(options: NotificationOptions): void;
  showModal(options: ModalOptions): Promise<any>;
  registerCommand(command: PluginCommand): void;
  registerView(view: PluginView): void;
  registerStatusBarItem(item: StatusBarItem): void;
  registerContextMenuItem(item: ContextMenuItem): void;
  
  // Additional UI methods
  createPanel(options: PanelOptions): Panel;
  createStatusBarItem(options: StatusBarItemOptions): StatusBarItem;
  showQuickPick<T>(items: QuickPickItem<T>[], options?: QuickPickOptions): Promise<T | null>;
  showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean>;
  showOutput(channel: string): void;
  appendOutput(channel: string, text: string): void;
  showProgress(options: ProgressOptions): Progress;
  hideProgress(progress: Progress): void;
  createTerminal(options: TerminalOptions): Terminal;
}

export interface NotificationOptions {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  actions?: Array<{ label: string; action: () => void }>;
  timeout?: number;
}

export interface ModalOptions {
  title: string;
  content: string | React.ComponentType;
  width?: number;
  height?: number;
  buttons?: Array<{ label: string; variant: 'primary' | 'secondary' | 'danger'; action: () => any }>;
}

export interface PluginCommand {
  id: string;
  title: string;
  category?: string;
  keybinding?: string;
  when?: string; // Context expression
  handler: (args?: any) => Promise<void>;
}

export interface PluginView {
  id: string;
  title: string;
  icon?: string;
  location: 'sidebar' | 'panel' | 'editor';
  component: React.ComponentType;
  when?: string; // Context expression
}

export interface StatusBarItem {
  id: string;
  text: string;
  tooltip?: string;
  command?: string;
  alignment: 'left' | 'right';
  priority: number;
}

export interface ContextMenuItem {
  id: string;
  label: string;
  command: string;
  when?: string; // Context expression
  group?: string;
}

// Additional UI interfaces
export interface PanelOptions {
  id: string;
  title: string;
  icon?: string;
  position: 'left' | 'right' | 'bottom';
  width?: number;
  height?: number;
  content?: React.ComponentType;
}

export interface Panel {
  id: string;
  show(): void;
  hide(): void;
  dispose(): void;
}

export interface StatusBarItemOptions {
  id: string;
  text: string;
  tooltip?: string;
  command?: string;
  alignment: 'left' | 'right';
  priority: number;
}

export interface QuickPickItem<T = any> {
  label: string;
  title?: string; // Alias for label for backward compatibility
  description?: string;
  detail?: string;
  value: T;
}

export interface QuickPickOptions {
  title?: string;
  placeholder?: string;
  canPickMany?: boolean;
  ignoreFocusOut?: boolean;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string; // Alias for confirmLabel
  cancelLabel?: string;
  type?: 'info' | 'warning' | 'error';
}

export interface ProgressOptions {
  title: string;
  cancellable?: boolean;
  location?: 'notification' | 'window' | 'source-control';
}

export interface Progress {
  report(value: { message?: string; increment?: number }): void;
  cancel(): void;
}

export interface TerminalOptions {
  id?: string;
  name: string;
  title?: string; // Alias for name
  cwd?: string;
  env?: Record<string, string>;
  shellPath?: string;
  shellArgs?: string[];
}

export interface Terminal {
  sendText(text: string, addNewLine?: boolean): void;
  show(preserveFocus?: boolean): void;
  hide(): void;
  dispose(): void;
}

export interface PluginHooks {
  onActivate?(context: PluginContext): Promise<void>;
  onDeactivate?(): Promise<void>;
  onProjectOpen?(project: Project): Promise<void>;
  onProjectClose?(): Promise<void>;
  onFileCreate?(path: string): Promise<void>;
  onFileChange?(path: string): Promise<void>;
  onFileDelete?(path: string): Promise<void>;
  onCommand?(command: string, args?: any): Promise<any>;
  onConfigChange?(newConfig: Record<string, any>): Promise<void>;
}

export interface Plugin extends PluginHooks {
  metadata: PluginMetadata;
  capabilities: PluginCapabilities;
  configuration?: PluginConfiguration;
  
  // Core plugin interface
  activate(context: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}

export interface PluginManifest {
  name: string;
  version: string;
  main: string; // Entry point file
  craftCodePlugin: {
    metadata: Omit<PluginMetadata, 'id' | 'downloads' | 'rating' | 'publishedAt' | 'updatedAt'>;
    capabilities: PluginCapabilities;
    configuration?: PluginConfiguration;
    activationEvents?: string[];
    contributes?: PluginContributions;
  };
}

export interface PluginContributions {
  commands?: PluginCommand[];
  views?: PluginView[];
  statusBarItems?: StatusBarItem[];
  contextMenuItems?: ContextMenuItem[];
  languages?: LanguageContribution[];
  themes?: ThemeContribution[];
  snippets?: SnippetContribution[];
  keybindings?: KeybindingContribution[];
}

export interface LanguageContribution {
  id: string;
  aliases: string[];
  extensions: string[];
  mimetypes?: string[];
  configuration?: string; // Path to language configuration file
}

export interface ThemeContribution {
  id: string;
  label: string;
  uiTheme: 'light' | 'dark';
  path: string;
}

export interface SnippetContribution {
  language: string;
  path: string;
}

export interface KeybindingContribution {
  command: string;
  key: string;
  when?: string;
  mac?: string;
  linux?: string;
  win?: string;
}

export class PluginError extends Error {
  constructor(
    message: string,
    public pluginId: string,
    public code: PluginErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'PluginError';
    Object.setPrototypeOf(this, PluginError.prototype);
  }
}

export enum PluginErrorCode {
  ACTIVATION_FAILED = 'ACTIVATION_FAILED',
  DEACTIVATION_FAILED = 'DEACTIVATION_FAILED',
  INVALID_MANIFEST = 'INVALID_MANIFEST',
  DEPENDENCY_NOT_FOUND = 'DEPENDENCY_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  RUNTIME_ERROR = 'RUNTIME_ERROR',
  SANDBOX_VIOLATION = 'SANDBOX_VIOLATION',
  VERSION_INCOMPATIBLE = 'VERSION_INCOMPATIBLE'
}

export interface PluginEvent {
  type: string;
  pluginId: string;
  timestamp: Date;
  data?: any;
}

export interface PluginAnalytics {
  activations: number;
  deactivations: number;
  errors: number;
  lastUsed: Date;
  totalUsageTime: number;
  commandsExecuted: number;
  filesCreated: number;
  apiCalls: number;
}

export interface PluginSecurity {
  permissions: string[];
  trustedDomains?: string[];
  sandboxConfig: SandboxConfig;
  codeSignature?: string;
  publisher: {
    id: string;
    verified: boolean;
    reputation: number;
  };
}

export interface SandboxConfig {
  allowNetworkAccess: boolean;
  allowFileSystemAccess: boolean;
  allowShellAccess: boolean;
  allowedDomains?: string[];
  allowedPaths?: string[];
  allowedCommands?: string[];
  timeoutMs: number;
  memoryLimitMB: number;
  cpuLimitPercent: number;
}

export interface PluginDependency {
  name: string;
  version: string;
  type: 'plugin' | 'npm' | 'binary';
  optional?: boolean;
  platforms?: string[];
}

export interface PluginUpdate {
  currentVersion: string;
  latestVersion: string;
  changelog: string;
  breaking: boolean;
  size: number;
  releaseDate: Date;
  downloadUrl: string;
}

export interface PluginInstallOptions {
  version?: string;
  force?: boolean;
  skipDependencies?: boolean;
  dev?: boolean;
}

export interface PluginSearchOptions {
  query?: string;
  category?: PluginCategory;
  tags?: string[];
  author?: string;
  pricing?: 'free' | 'paid';
  sortBy?: 'relevance' | 'downloads' | 'rating' | 'updated';
  limit?: number;
  offset?: number;
}

export interface PluginSearchResult {
  plugins: PluginMetadata[];
  total: number;
  hasMore: boolean;
}

// Event system types
export interface EventEmitter {
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
  once(event: string, listener: (...args: any[]) => void): void;
}

// Plugin development utilities
export interface PluginTestUtils {
  createMockContext(): PluginContext;
  createMockProject(): Project;
  mockAPI(responses: Record<string, any>): void;
  assertFileExists(path: string): void;
  assertFileContent(path: string, expectedContent: string): void;
  waitForEvent(event: string, timeout?: number): Promise<any>;
}

// Plugin template system
export interface PluginTemplate {
  id: string;
  name: string;
  description: string;
  category: PluginCategory;
  files: Array<{
    path: string;
    content: string;
    template?: boolean;
  }>;
  variables: Record<string, TemplateVariable>;
}

export interface TemplateVariable {
  type: 'string' | 'boolean' | 'number' | 'select';
  label: string;
  description?: string;
  default?: any;
  options?: any[];
  required?: boolean;
}

export default Plugin;
/**
 * Auto-Approval System
 *
 * Implements a comprehensive auto-approval system for AI actions, inspired by Kilocode.
 * Features:
 * - Granular approval settings per action type
 * - Command execution pattern matching (whitelist/blacklist)
 * - Protected file/path handling
 * - Operation timeouts
 * - Cost and request limit tracking
 */

import { atom, map } from 'nanostores';
import type { ActionType } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AutoApproval');

// ==================== TYPES ====================

/** Decision returned by approval checks */
export type ApprovalDecision = 'approve' | 'deny' | 'ask';

/** Command approval decision with more granularity */
export type CommandDecision = 'auto_approve' | 'auto_deny' | 'ask_user';

/** Timeout-based approval with callback */
export interface TimeoutApproval {
  decision: 'timeout';
  timeout: number;
  fn: () => { response: ApprovalResponse; text?: string };
}

/** Combined approval result */
export type ApprovalResult =
  | { decision: 'approve' }
  | { decision: 'deny'; reason?: string }
  | { decision: 'ask' }
  | TimeoutApproval;

/** Response types for approval requests */
export type ApprovalResponse =
  | 'yesButtonClicked'
  | 'noButtonClicked'
  | 'messageResponse';

/** Auto-approval state flags for different action types */
export interface AutoApprovalFlags {
  // Global toggle
  autoApprovalEnabled: boolean;

  // File operations
  alwaysAllowRead: boolean;
  alwaysAllowReadOutsideWorkspace: boolean;
  alwaysAllowWrite: boolean;
  alwaysAllowWriteOutsideWorkspace: boolean;
  alwaysAllowWriteProtected: boolean;
  alwaysAllowDelete: boolean;

  // Shell/command operations
  alwaysAllowExecute: boolean;
  allowedCommands: string[];
  deniedCommands: string[];

  // Other operations
  alwaysAllowBrowser: boolean;
  alwaysAllowMcp: boolean;
  alwaysAllowModeSwitch: boolean;
  alwaysAllowSubtasks: boolean;
  alwaysAllowFollowupQuestions: boolean;

  // Timeouts
  followupAutoApproveTimeoutMs: number;
  operationTimeoutMs: number;

  // Cost/request limits
  maxRequestsBeforeApproval: number;
  maxCostBeforeApproval: number;

  // YOLO mode - bypass all checks
  yoloMode: boolean;
}

/** Protected path configuration */
export interface ProtectedPathConfig {
  /** Glob patterns for protected paths */
  patterns: string[];
  /** Whether to block writes to protected paths entirely */
  blockWrites: boolean;
  /** Whether to block deletes to protected paths entirely */
  blockDeletes: boolean;
  /** Allow override with explicit approval */
  allowOverride: boolean;
}

/** Request tracking state */
export interface RequestTrackingState {
  consecutiveRequests: number;
  totalCost: number;
  lastResetTimestamp: number;
}

// ==================== DEFAULT VALUES ====================

export const DEFAULT_AUTO_APPROVAL_FLAGS: AutoApprovalFlags = {
  autoApprovalEnabled: false,
  alwaysAllowRead: true,
  alwaysAllowReadOutsideWorkspace: false,
  alwaysAllowWrite: false,
  alwaysAllowWriteOutsideWorkspace: false,
  alwaysAllowWriteProtected: false,
  alwaysAllowDelete: false,
  alwaysAllowExecute: false,
  allowedCommands: [
    'npm',
    'npx',
    'pnpm',
    'yarn',
    'bun',
    'node',
    'git status',
    'git diff',
    'git log',
    'ls',
    'cat',
    'head',
    'tail',
    'grep',
    'find',
    'echo',
    'pwd',
    'which',
    'type',
    'tsc --version',
    'node --version',
    'npm --version',
  ],
  deniedCommands: [
    'rm -rf /',
    'rm -rf ~',
    'rm -rf /*',
    'sudo rm',
    'chmod 777',
    'curl | sh',
    'curl | bash',
    'wget | sh',
    'wget | bash',
    '> /dev/sda',
    'mkfs',
    'dd if=',
    ':(){:|:&};:',
  ],
  alwaysAllowBrowser: false,
  alwaysAllowMcp: false,
  alwaysAllowModeSwitch: true,
  alwaysAllowSubtasks: true,
  alwaysAllowFollowupQuestions: false,
  followupAutoApproveTimeoutMs: 5000,
  operationTimeoutMs: 30000,
  maxRequestsBeforeApproval: Infinity,
  maxCostBeforeApproval: Infinity,
  yoloMode: false,
};

export const DEFAULT_PROTECTED_PATHS: ProtectedPathConfig = {
  patterns: [
    '.env',
    '.env.*',
    '*.pem',
    '*.key',
    '**/secrets/**',
    '**/credentials/**',
    '.git/config',
    '.ssh/**',
    '**/private/**',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ],
  blockWrites: false,
  blockDeletes: true,
  allowOverride: true,
};

// ==================== STORAGE ====================

const STORAGE_KEY = 'recoder_auto_approval';
const PROTECTED_PATHS_KEY = 'recoder_protected_paths';

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;

  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return { ...defaultValue, ...JSON.parse(stored) };
    }
  } catch (e) {
    logger.error(`[AutoApproval] Failed to load ${key}:`, e);
  }

  return defaultValue;
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error(`[AutoApproval] Failed to save ${key}:`, e);
  }
}

// ==================== STORES ====================

/** Auto-approval flags store */
export const autoApprovalStore = map<AutoApprovalFlags>(
  loadFromStorage(STORAGE_KEY, DEFAULT_AUTO_APPROVAL_FLAGS)
);

/** Protected paths configuration store */
export const protectedPathsStore = map<ProtectedPathConfig>(
  loadFromStorage(PROTECTED_PATHS_KEY, DEFAULT_PROTECTED_PATHS)
);

/** Request tracking store */
export const requestTrackingStore = map<RequestTrackingState>({
  consecutiveRequests: 0,
  totalCost: 0,
  lastResetTimestamp: Date.now(),
});

/** Panel visibility for settings UI */
export const autoApprovalPanelOpen = atom<boolean>(false);

// Persist changes to storage
autoApprovalStore.subscribe((flags) => {
  saveToStorage(STORAGE_KEY, flags);
});

protectedPathsStore.subscribe((config) => {
  saveToStorage(PROTECTED_PATHS_KEY, config);
});

// ==================== COMMAND PARSING ====================

/**
 * Split a command string into individual sub-commands.
 * Handles command chaining with &&, ||, ;, | and &
 */
export function parseCommand(command: string): string[] {
  if (!command?.trim()) return [];

  // Simple parsing - split by common operators
  // This handles most common cases without requiring shell-quote
  const operators = /(?:&&|\|\||;|\||&(?!&))/;

  // Protect quoted strings
  const quotes: string[] = [];
  let processed = command.replace(/"[^"]*"|'[^']*'/g, (match) => {
    quotes.push(match);
    return `__QUOTE_${quotes.length - 1}__`;
  });

  // Protect subshell commands
  const subshells: string[] = [];
  processed = processed.replace(/\$\([^)]+\)|`[^`]+`/g, (match) => {
    subshells.push(match);
    return `__SUBSH_${subshells.length - 1}__`;
  });

  // Split by operators
  const parts = processed.split(operators);

  // Restore and clean up
  return parts
    .map((part) => {
      let result = part.trim();
      // Restore quotes
      result = result.replace(/__QUOTE_(\d+)__/g, (_, i) => quotes[parseInt(i)]);
      // Restore subshells
      result = result.replace(/__SUBSH_(\d+)__/g, (_, i) => subshells[parseInt(i)]);
      return result;
    })
    .filter((cmd) => cmd.length > 0);
}

/**
 * Detect dangerous parameter substitutions that could lead to command execution.
 * These patterns are never auto-approved.
 */
export function containsDangerousSubstitution(source: string): boolean {
  // ${var@P} - Prompt string expansion
  // ${var@Q} - Quote removal
  // ${var@E} - Escape sequence expansion
  // ${var@A} - Assignment statement
  // ${var@a} - Attribute flags
  const dangerousParameterExpansion = /\$\{[^}]*@[PQEAa][^}]*\}/.test(source);

  // Parameter assignments with escape sequences
  const parameterAssignmentWithEscapes =
    /\$\{[^}]*[=+\-?][^}]*\\[0-7]{3}[^}]*\}/.test(source) ||
    /\$\{[^}]*[=+\-?][^}]*\\x[0-9a-fA-F]{2}[^}]*\}/.test(source) ||
    /\$\{[^}]*[=+\-?][^}]*\\u[0-9a-fA-F]{4}[^}]*\}/.test(source);

  // Indirect variable references
  const indirectExpansion = /\$\{![^}]+\}/.test(source);

  // Here-strings with command substitution
  const hereStringWithSubstitution = /<<<\s*(\$\(|`)/.test(source);

  // Zsh process substitution
  const zshProcessSubstitution = /=\([^)]+\)/.test(source);

  // Zsh glob qualifiers with code execution
  const zshGlobQualifier = /[*?+@!]\(e:[^:]+:\)/.test(source);

  return (
    dangerousParameterExpansion ||
    parameterAssignmentWithEscapes ||
    indirectExpansion ||
    hereStringWithSubstitution ||
    zshProcessSubstitution ||
    zshGlobQualifier
  );
}

/**
 * Find the longest matching prefix from a list of prefixes.
 * Implements "longest prefix match" strategy.
 */
export function findLongestPrefixMatch(
  command: string,
  prefixes: string[]
): string | null {
  if (!command || !prefixes?.length) return null;

  const trimmedCommand = command.trim().toLowerCase();
  let longestMatch: string | null = null;

  for (const prefix of prefixes) {
    const lowerPrefix = prefix.toLowerCase();
    // Handle wildcard "*" - matches any command
    if (lowerPrefix === '*' || trimmedCommand.startsWith(lowerPrefix)) {
      if (!longestMatch || lowerPrefix.length > longestMatch.length) {
        longestMatch = lowerPrefix;
      }
    }
  }

  return longestMatch;
}

/**
 * Get decision for a single command using longest prefix match.
 */
export function getSingleCommandDecision(
  command: string,
  allowedCommands: string[],
  deniedCommands: string[]
): CommandDecision {
  if (!command) return 'auto_approve';

  const longestAllowedMatch = findLongestPrefixMatch(command, allowedCommands || []);
  const longestDeniedMatch = findLongestPrefixMatch(command, deniedCommands || []);

  // Only allowlist matches
  if (longestAllowedMatch && !longestDeniedMatch) {
    return 'auto_approve';
  }

  // Only denylist matches
  if (!longestAllowedMatch && longestDeniedMatch) {
    return 'auto_deny';
  }

  // Both match - longer (more specific) wins
  if (longestAllowedMatch && longestDeniedMatch) {
    return longestAllowedMatch.length > longestDeniedMatch.length
      ? 'auto_approve'
      : 'auto_deny';
  }

  // Neither matches
  return 'ask_user';
}

/**
 * Get approval decision for a command string.
 * Handles command chains and dangerous patterns.
 */
export function getCommandDecision(
  command: string,
  allowedCommands: string[],
  deniedCommands: string[]
): CommandDecision {
  if (!command?.trim()) return 'auto_approve';

  // Parse into sub-commands
  const subCommands = parseCommand(command);

  // Check each sub-command
  const decisions = subCommands.map((cmd) => {
    // Remove PowerShell-like redirections
    const cmdWithoutRedirection = cmd.replace(/\d*>&\d*/g, '').trim();
    return getSingleCommandDecision(cmdWithoutRedirection, allowedCommands, deniedCommands);
  });

  // Any denial blocks all
  if (decisions.includes('auto_deny')) {
    return 'auto_deny';
  }

  // Check for dangerous patterns
  if (containsDangerousSubstitution(command)) {
    return 'ask_user';
  }

  // All approved
  if (decisions.every((d) => d === 'auto_approve')) {
    return 'auto_approve';
  }

  return 'ask_user';
}

// ==================== FILE PATH CHECKS ====================

/**
 * Simple glob-like pattern matching.
 */
function matchGlob(pattern: string, path: string): boolean {
  // Convert glob to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*\*/g, '.*') // ** matches anything
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\?/g, '.'); // ? matches single char

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(path);
}

/**
 * Check if a path matches any protected pattern.
 */
export function isProtectedPath(filePath: string): boolean {
  const config = protectedPathsStore.get();

  for (const pattern of config.patterns) {
    if (matchGlob(pattern, filePath)) {
      return true;
    }
    // Also check if the path contains the pattern
    if (filePath.includes(pattern.replace(/\*/g, ''))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path is outside the workspace.
 */
export function isOutsideWorkspace(filePath: string, workspacePath?: string): boolean {
  if (!workspacePath) return false;

  const normalizedFile = filePath.replace(/\\/g, '/');
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/');

  return !normalizedFile.startsWith(normalizedWorkspace);
}

// ==================== ACTION TYPE CHECKS ====================

/** Read-only action types */
const READ_ONLY_ACTIONS: ActionType[] = [
  'readFile',
  'listFiles',
  'searchFiles',
  'ripgrep_search',
  'glob_search',
  'read_many_files',
  'web_search',
  'web_fetch',
  'web_crawl',
];

/** Write action types */
const WRITE_ACTIONS: ActionType[] = [
  'file',
  'str_replace',
  'edit_file',
  'multi_apply_diff',
  'copy_project',
];

/** Shell/command action types */
const SHELL_ACTIONS: ActionType[] = ['shell'];

/**
 * Check if an action type is read-only.
 */
export function isReadOnlyAction(actionType: ActionType): boolean {
  return READ_ONLY_ACTIONS.includes(actionType);
}

/**
 * Check if an action type is a write operation.
 */
export function isWriteAction(actionType: ActionType): boolean {
  return WRITE_ACTIONS.includes(actionType);
}

/**
 * Check if an action type is a shell/command operation.
 */
export function isShellAction(actionType: ActionType): boolean {
  return SHELL_ACTIONS.includes(actionType);
}

// ==================== MAIN APPROVAL CHECK ====================

export interface ApprovalCheckParams {
  actionType: ActionType;
  filePath?: string;
  command?: string;
  isOutsideWorkspace?: boolean;
  workspacePath?: string;
  followupSuggestion?: string;
}

/**
 * Main function to check if an action should be auto-approved.
 */
export function checkAutoApproval(params: ApprovalCheckParams): ApprovalResult {
  const {
    actionType,
    filePath,
    command,
    isOutsideWorkspace: outsideWorkspace,
    workspacePath,
    followupSuggestion,
  } = params;

  const flags = autoApprovalStore.get();
  const protectedConfig = protectedPathsStore.get();

  // YOLO mode bypasses all checks
  if (flags.yoloMode) {
    return { decision: 'approve' };
  }

  // Auto-approval must be enabled
  if (!flags.autoApprovalEnabled) {
    return { decision: 'ask' };
  }

  // Check workspace boundary
  const isOutside = outsideWorkspace ?? (filePath && workspacePath
    ? isOutsideWorkspace(filePath, workspacePath)
    : false);

  // Check if path is protected
  const isProtected = filePath ? isProtectedPath(filePath) : false;

  // ===== READ OPERATIONS =====
  if (isReadOnlyAction(actionType)) {
    if (!flags.alwaysAllowRead) {
      return { decision: 'ask' };
    }
    if (isOutside && !flags.alwaysAllowReadOutsideWorkspace) {
      return { decision: 'ask' };
    }
    return { decision: 'approve' };
  }

  // ===== WRITE OPERATIONS =====
  if (isWriteAction(actionType)) {
    if (!flags.alwaysAllowWrite) {
      return { decision: 'ask' };
    }
    if (isOutside && !flags.alwaysAllowWriteOutsideWorkspace) {
      return { decision: 'ask' };
    }
    if (isProtected) {
      if (protectedConfig.blockWrites) {
        return { decision: 'deny', reason: 'Protected path' };
      }
      if (!flags.alwaysAllowWriteProtected) {
        return { decision: 'ask' };
      }
    }
    return { decision: 'approve' };
  }

  // ===== SHELL OPERATIONS =====
  if (isShellAction(actionType)) {
    if (!flags.alwaysAllowExecute || !command) {
      return { decision: 'ask' };
    }

    const cmdDecision = getCommandDecision(
      command,
      flags.allowedCommands,
      flags.deniedCommands
    );

    if (cmdDecision === 'auto_approve') {
      return { decision: 'approve' };
    }
    if (cmdDecision === 'auto_deny') {
      return { decision: 'deny', reason: 'Command in deny list' };
    }
    return { decision: 'ask' };
  }

  // ===== DELETE OPERATIONS =====
  // Note: We don't have a specific delete action type, but this handles it
  if (actionType === 'file' && filePath?.startsWith('DELETE:')) {
    if (!flags.alwaysAllowDelete) {
      return { decision: 'ask' };
    }
    if (isProtected && protectedConfig.blockDeletes) {
      return { decision: 'deny', reason: 'Cannot delete protected path' };
    }
    return { decision: 'approve' };
  }

  // ===== MODE SWITCHING =====
  if (actionType === 'switch_mode') {
    return flags.alwaysAllowModeSwitch
      ? { decision: 'approve' }
      : { decision: 'ask' };
  }

  // ===== SUBTASKS =====
  if (actionType === 'spawn_task' || actionType === 'delegate_subagent') {
    return flags.alwaysAllowSubtasks
      ? { decision: 'approve' }
      : { decision: 'ask' };
  }

  // ===== FOLLOWUP QUESTIONS =====
  // Special handling for followup questions with timeout auto-approval
  if (followupSuggestion && flags.alwaysAllowFollowupQuestions) {
    if (flags.followupAutoApproveTimeoutMs > 0) {
      return {
        decision: 'timeout',
        timeout: flags.followupAutoApproveTimeoutMs,
        fn: () => ({ response: 'messageResponse', text: followupSuggestion }),
      };
    }
  }

  // ===== WEB OPERATIONS =====
  if (actionType === 'web_search' || actionType === 'web_fetch') {
    return flags.alwaysAllowBrowser
      ? { decision: 'approve' }
      : { decision: 'ask' };
  }

  if (actionType === 'web_crawl') {
    return flags.alwaysAllowBrowser
      ? { decision: 'approve' }
      : { decision: 'ask' };
  }

  // ===== MEMORY OPERATIONS =====
  if (actionType === 'memory_operation') {
    // Memory operations are generally safe
    return { decision: 'approve' };
  }

  // ===== IMPORT/CLONE OPERATIONS =====
  if (
    actionType === 'importStarter' ||
    actionType === 'cloneGitHub' ||
    actionType === 'cloneUrl' ||
    actionType === 'copy_project'
  ) {
    // These modify the workspace significantly, ask by default
    return { decision: 'ask' };
  }

  // Default: ask for approval
  return { decision: 'ask' };
}

// ==================== REQUEST/COST TRACKING ====================

/**
 * Increment request counter and check limits.
 */
export function trackRequest(cost: number = 0): {
  shouldProceed: boolean;
  limitType?: 'requests' | 'cost';
  currentValue?: number;
  maxValue?: number;
} {
  const flags = autoApprovalStore.get();
  const tracking = requestTrackingStore.get();

  // YOLO mode bypasses limits
  if (flags.yoloMode) {
    return { shouldProceed: true };
  }

  // Increment counters
  const newRequests = tracking.consecutiveRequests + 1;
  const newCost = tracking.totalCost + cost;

  requestTrackingStore.set({
    ...tracking,
    consecutiveRequests: newRequests,
    totalCost: newCost,
  });

  // Check request limit
  if (newRequests > flags.maxRequestsBeforeApproval) {
    return {
      shouldProceed: false,
      limitType: 'requests',
      currentValue: newRequests,
      maxValue: flags.maxRequestsBeforeApproval,
    };
  }

  // Check cost limit (with epsilon for floating-point comparison)
  const EPSILON = 0.0001;
  if (newCost > flags.maxCostBeforeApproval + EPSILON) {
    return {
      shouldProceed: false,
      limitType: 'cost',
      currentValue: newCost,
      maxValue: flags.maxCostBeforeApproval,
    };
  }

  return { shouldProceed: true };
}

/**
 * Reset request tracking counters.
 */
export function resetRequestTracking(): void {
  requestTrackingStore.set({
    consecutiveRequests: 0,
    totalCost: 0,
    lastResetTimestamp: Date.now(),
  });
}

/**
 * Get current tracking state.
 */
export function getTrackingState(): RequestTrackingState {
  return requestTrackingStore.get();
}

// ==================== CONFIGURATION FUNCTIONS ====================

/**
 * Update auto-approval flags.
 */
export function updateAutoApprovalFlags(
  updates: Partial<AutoApprovalFlags>
): void {
  const current = autoApprovalStore.get();
  autoApprovalStore.set({ ...current, ...updates });
}

/**
 * Enable YOLO mode (bypass all checks).
 */
export function enableYoloMode(): void {
  updateAutoApprovalFlags({ yoloMode: true });
}

/**
 * Disable YOLO mode.
 */
export function disableYoloMode(): void {
  updateAutoApprovalFlags({ yoloMode: false });
}

/**
 * Toggle YOLO mode.
 */
export function toggleYoloMode(): boolean {
  const current = autoApprovalStore.get().yoloMode;
  updateAutoApprovalFlags({ yoloMode: !current });
  return !current;
}

/**
 * Enable auto-approval globally.
 */
export function enableAutoApproval(): void {
  updateAutoApprovalFlags({ autoApprovalEnabled: true });
}

/**
 * Disable auto-approval globally.
 */
export function disableAutoApproval(): void {
  updateAutoApprovalFlags({ autoApprovalEnabled: false });
}

/**
 * Toggle auto-approval.
 */
export function toggleAutoApproval(): boolean {
  const current = autoApprovalStore.get().autoApprovalEnabled;
  updateAutoApprovalFlags({ autoApprovalEnabled: !current });
  return !current;
}

/**
 * Add a command to the allowed list.
 */
export function addAllowedCommand(command: string): void {
  const current = autoApprovalStore.get();
  if (!current.allowedCommands.includes(command)) {
    updateAutoApprovalFlags({
      allowedCommands: [...current.allowedCommands, command],
    });
  }
}

/**
 * Remove a command from the allowed list.
 */
export function removeAllowedCommand(command: string): void {
  const current = autoApprovalStore.get();
  updateAutoApprovalFlags({
    allowedCommands: current.allowedCommands.filter((c) => c !== command),
  });
}

/**
 * Add a command to the denied list.
 */
export function addDeniedCommand(command: string): void {
  const current = autoApprovalStore.get();
  if (!current.deniedCommands.includes(command)) {
    updateAutoApprovalFlags({
      deniedCommands: [...current.deniedCommands, command],
    });
  }
}

/**
 * Remove a command from the denied list.
 */
export function removeDeniedCommand(command: string): void {
  const current = autoApprovalStore.get();
  updateAutoApprovalFlags({
    deniedCommands: current.deniedCommands.filter((c) => c !== command),
  });
}

/**
 * Update protected paths configuration.
 */
export function updateProtectedPaths(
  updates: Partial<ProtectedPathConfig>
): void {
  const current = protectedPathsStore.get();
  protectedPathsStore.set({ ...current, ...updates });
}

/**
 * Add a protected path pattern.
 */
export function addProtectedPattern(pattern: string): void {
  const current = protectedPathsStore.get();
  if (!current.patterns.includes(pattern)) {
    updateProtectedPaths({
      patterns: [...current.patterns, pattern],
    });
  }
}

/**
 * Remove a protected path pattern.
 */
export function removeProtectedPattern(pattern: string): void {
  const current = protectedPathsStore.get();
  updateProtectedPaths({
    patterns: current.patterns.filter((p) => p !== pattern),
  });
}

/**
 * Reset all settings to defaults.
 */
export function resetToDefaults(): void {
  autoApprovalStore.set(DEFAULT_AUTO_APPROVAL_FLAGS);
  protectedPathsStore.set(DEFAULT_PROTECTED_PATHS);
  resetRequestTracking();
}

/**
 * Open the auto-approval settings panel.
 */
export function openAutoApprovalPanel(): void {
  autoApprovalPanelOpen.set(true);
}

/**
 * Close the auto-approval settings panel.
 */
export function closeAutoApprovalPanel(): void {
  autoApprovalPanelOpen.set(false);
}

/**
 * Toggle the auto-approval settings panel.
 */
export function toggleAutoApprovalPanel(): void {
  autoApprovalPanelOpen.set(!autoApprovalPanelOpen.get());
}

// ==================== EXPORT/IMPORT ====================

/**
 * Export current configuration.
 */
export function exportConfig(): {
  flags: AutoApprovalFlags;
  protectedPaths: ProtectedPathConfig;
} {
  return {
    flags: autoApprovalStore.get(),
    protectedPaths: protectedPathsStore.get(),
  };
}

/**
 * Import configuration.
 */
export function importConfig(config: {
  flags?: Partial<AutoApprovalFlags>;
  protectedPaths?: Partial<ProtectedPathConfig>;
}): void {
  if (config.flags) {
    updateAutoApprovalFlags(config.flags);
  }
  if (config.protectedPaths) {
    updateProtectedPaths(config.protectedPaths);
  }
}

// ==================== AUTO-APPROVAL HANDLER CLASS ====================

/**
 * Handler class for managing auto-approval state across a session.
 * Tracks requests and costs, similar to Kilocode's AutoApprovalHandler.
 */
export class AutoApprovalHandler {
  private lastResetMessageIndex: number = 0;
  private consecutiveAutoApprovedRequestsCount: number = 0;
  private consecutiveAutoApprovedCost: number = 0;

  /**
   * Check if auto-approval limits have been reached.
   */
  async checkAutoApprovalLimits(
    messages: Array<{ type: string; say?: string; text?: string }>,
    askForApproval: (
      type: string,
      data: string
    ) => Promise<{ response: ApprovalResponse; text?: string }>
  ): Promise<{
    shouldProceed: boolean;
    requiresApproval: boolean;
    approvalType?: 'requests' | 'cost';
    approvalCount?: number | string;
  }> {
    const flags = autoApprovalStore.get();

    // YOLO mode bypasses all checks
    if (flags.yoloMode) {
      return { shouldProceed: true, requiresApproval: false };
    }

    // Check request count limit
    const requestResult = await this.checkRequestLimit(
      messages,
      flags.maxRequestsBeforeApproval,
      askForApproval
    );
    if (!requestResult.shouldProceed || requestResult.requiresApproval) {
      return requestResult;
    }

    // Check cost limit
    const costResult = await this.checkCostLimit(
      messages,
      flags.maxCostBeforeApproval,
      askForApproval
    );
    return costResult;
  }

  private async checkRequestLimit(
    messages: Array<{ type: string; say?: string; text?: string }>,
    maxRequests: number,
    askForApproval: (
      type: string,
      data: string
    ) => Promise<{ response: ApprovalResponse; text?: string }>
  ): Promise<{
    shouldProceed: boolean;
    requiresApproval: boolean;
    approvalType?: 'requests' | 'cost';
    approvalCount?: number | string;
  }> {
    if (maxRequests === Infinity) {
      return { shouldProceed: true, requiresApproval: false };
    }

    const messagesAfterReset = messages.slice(this.lastResetMessageIndex);
    this.consecutiveAutoApprovedRequestsCount =
      messagesAfterReset.filter(
        (msg) => msg.type === 'say' && msg.say === 'api_req_started'
      ).length + 1;

    if (this.consecutiveAutoApprovedRequestsCount > maxRequests) {
      const { response } = await askForApproval(
        'auto_approval_max_req_reached',
        JSON.stringify({ count: maxRequests, type: 'requests' })
      );

      if (response === 'yesButtonClicked') {
        this.lastResetMessageIndex = messages.length;
        return {
          shouldProceed: true,
          requiresApproval: true,
          approvalType: 'requests',
          approvalCount: maxRequests,
        };
      }

      return {
        shouldProceed: false,
        requiresApproval: true,
        approvalType: 'requests',
        approvalCount: maxRequests,
      };
    }

    return { shouldProceed: true, requiresApproval: false };
  }

  private async checkCostLimit(
    messages: Array<{ type: string; say?: string; text?: string }>,
    maxCost: number,
    askForApproval: (
      type: string,
      data: string
    ) => Promise<{ response: ApprovalResponse; text?: string }>
  ): Promise<{
    shouldProceed: boolean;
    requiresApproval: boolean;
    approvalType?: 'requests' | 'cost';
    approvalCount?: number | string;
  }> {
    if (maxCost === Infinity) {
      return { shouldProceed: true, requiresApproval: false };
    }

    // Calculate cost from messages (simplified - would need actual cost tracking)
    const messagesAfterReset = messages.slice(this.lastResetMessageIndex);
    this.consecutiveAutoApprovedCost = messagesAfterReset.reduce((total, msg) => {
      if (msg.text) {
        try {
          const data = JSON.parse(msg.text);
          return total + (data.cost || 0);
        } catch {
          return total;
        }
      }
      return total;
    }, 0);

    const EPSILON = 0.0001;
    if (this.consecutiveAutoApprovedCost > maxCost + EPSILON) {
      const { response } = await askForApproval(
        'auto_approval_max_req_reached',
        JSON.stringify({ count: maxCost.toFixed(2), type: 'cost' })
      );

      if (response === 'yesButtonClicked') {
        this.lastResetMessageIndex = messages.length;
        return {
          shouldProceed: true,
          requiresApproval: true,
          approvalType: 'cost',
          approvalCount: maxCost.toFixed(2),
        };
      }

      return {
        shouldProceed: false,
        requiresApproval: true,
        approvalType: 'cost',
        approvalCount: maxCost.toFixed(2),
      };
    }

    return { shouldProceed: true, requiresApproval: false };
  }

  /**
   * Reset tracking state.
   */
  resetRequestCount(): void {
    this.lastResetMessageIndex = 0;
    this.consecutiveAutoApprovedRequestsCount = 0;
    this.consecutiveAutoApprovedCost = 0;
  }

  /**
   * Get current state for debugging.
   */
  getApprovalState(): { requestCount: number; currentCost: number } {
    return {
      requestCount: this.consecutiveAutoApprovedRequestsCount,
      currentCost: this.consecutiveAutoApprovedCost,
    };
  }
}

// ==================== SINGLETON INSTANCE ====================

/** Global auto-approval handler instance */
export const autoApprovalHandler = new AutoApprovalHandler();

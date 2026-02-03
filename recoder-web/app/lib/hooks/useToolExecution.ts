/**
 * Tool Execution Hook
 * Provides React integration for the tool execution framework
 */

import { useCallback, useMemo, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
  toolExecutionsStore,
  pendingApproval,
  consecutiveMistakes,
  toolErrors,
  startToolExecution,
  grantApproval,
  denyApproval,
  completeToolExecution,
  getToolExecution,
  getPendingExecutions,
  validateToolUse,
  requiresApproval,
  detectRepetition,
  clearRepetitionTracking,
  parseXmlToolCalls,
  TOOL_DEFINITIONS,
  getAllNativeTools,
  type ToolName,
  type ToolUse,
  type ToolResult,
  type ToolExecution,
  type ToolCallbacks,
} from '~/lib/services/tools';

export interface UseToolExecutionOptions {
  onApprovalRequired?: (toolUse: ToolUse, message: string) => Promise<boolean>;
  onToolError?: (toolUse: ToolUse, error: Error) => void;
  onToolResult?: (result: ToolResult) => void;
  autoApprove?: ToolName[];
  maxConsecutiveMistakes?: number;
}

export interface UseToolExecutionReturn {
  // State
  executions: ToolExecution[];
  pendingApproval: ToolUse | null;
  consecutiveMistakes: number;
  errors: Record<string, string[]>;

  // Actions
  execute: <T extends ToolName>(toolUse: ToolUse<T>) => Promise<ToolResult>;
  approve: (executionId: string) => void;
  deny: (executionId: string) => void;
  cancel: (executionId: string) => void;

  // Utilities
  validate: <T extends ToolName>(toolUse: ToolUse<T>) => { valid: boolean; error?: string };
  needsApproval: (toolName: ToolName) => boolean;
  parseToolCalls: (content: string) => ToolUse[];
  getToolDefinitions: () => typeof TOOL_DEFINITIONS;
  getNativeTools: () => ReturnType<typeof getAllNativeTools>;
  clearRepetitions: () => void;
}

/**
 * Hook for managing tool execution
 */
export function useToolExecution(
  executeToolFn: (toolUse: ToolUse) => Promise<unknown>,
  options: UseToolExecutionOptions = {}
): UseToolExecutionReturn {
  const {
    onApprovalRequired,
    onToolError,
    onToolResult,
    autoApprove = [],
    maxConsecutiveMistakes = 5,
  } = options;

  // Subscribe to stores
  const executionsMap = useStore(toolExecutionsStore);
  const pending = useStore(pendingApproval);
  const mistakes = useStore(consecutiveMistakes);
  const errorsMap = useStore(toolErrors);

  // Derived state
  const executions = useMemo(
    () => Object.values(executionsMap).filter(Boolean) as ToolExecution[],
    [executionsMap]
  );

  // Check for too many consecutive mistakes
  useEffect(() => {
    if (mistakes >= maxConsecutiveMistakes) {
      console.warn(`Tool execution: ${mistakes} consecutive mistakes detected`);
    }
  }, [mistakes, maxConsecutiveMistakes]);

  // Execute a tool
  const handleExecute = useCallback(
    async <T extends ToolName>(toolUse: ToolUse<T>): Promise<ToolResult> => {
      // Validate tool use
      const validation = validateToolUse(toolUse);
      if (!validation.valid) {
        const result: ToolResult = {
          toolUseId: toolUse.id,
          success: false,
          content: '',
          error: validation.error,
        };
        onToolResult?.(result);
        return result;
      }

      // Check for repetition
      const repetition = detectRepetition(toolUse);
      if (repetition.shouldBlock) {
        const result: ToolResult = {
          toolUseId: toolUse.id,
          success: false,
          content: '',
          error: `Tool ${toolUse.name} has been called ${repetition.count} times with same parameters. Possible loop detected.`,
        };
        onToolResult?.(result);
        return result;
      }

      if (repetition.shouldWarn) {
        console.warn(`Tool ${toolUse.name} called ${repetition.count} times with same parameters`);
      }

      // Start execution
      const execution = startToolExecution(toolUse);

      // Check if approval is needed
      const needsApprovalCheck = requiresApproval(toolUse.name);
      const isAutoApproved = autoApprove.includes(toolUse.name);

      if (needsApprovalCheck && !isAutoApproved) {
        // Request approval
        if (onApprovalRequired) {
          const approved = await onApprovalRequired(
            toolUse,
            `Tool "${toolUse.name}" requires approval`
          );

          if (!approved) {
            denyApproval(execution.id);
            const result: ToolResult = {
              toolUseId: toolUse.id,
              success: false,
              content: '',
              error: 'Tool execution denied by user',
            };
            onToolResult?.(result);
            return result;
          }
        }

        grantApproval(execution.id);
      }

      // Execute the tool
      try {
        const output = await executeToolFn(toolUse);

        const result: ToolResult = {
          toolUseId: toolUse.id,
          success: true,
          content: typeof output === 'string' ? output : JSON.stringify(output),
        };

        completeToolExecution(execution.id, result);
        onToolResult?.(result);

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onToolError?.(toolUse, err);

        const result: ToolResult = {
          toolUseId: toolUse.id,
          success: false,
          content: '',
          error: err.message,
        };

        completeToolExecution(execution.id, result);
        onToolResult?.(result);

        return result;
      }
    },
    [executeToolFn, onApprovalRequired, onToolError, onToolResult, autoApprove]
  );

  // Approve pending tool
  const handleApprove = useCallback(
    (executionId: string) => {
      grantApproval(executionId);
    },
    []
  );

  // Deny pending tool
  const handleDeny = useCallback(
    (executionId: string) => {
      denyApproval(executionId);
    },
    []
  );

  // Cancel execution
  const handleCancel = useCallback(
    (executionId: string) => {
      const execution = getToolExecution(executionId);
      if (execution && execution.status !== 'completed' && execution.status !== 'failed') {
        completeToolExecution(executionId, {
          toolUseId: execution.toolUse.id,
          success: false,
          content: '',
          error: 'Execution cancelled',
        });
      }
    },
    []
  );

  // Validate tool use
  const handleValidate = useCallback(
    <T extends ToolName>(toolUse: ToolUse<T>) => {
      const result = validateToolUse(toolUse);
      return result.valid
        ? { valid: true as const }
        : { valid: false as const, error: result.error };
    },
    []
  );

  // Check if tool needs approval
  const handleNeedsApproval = useCallback(
    (toolName: ToolName) => requiresApproval(toolName),
    []
  );

  // Parse tool calls from content
  const handleParseToolCalls = useCallback(
    (content: string) => parseXmlToolCalls(content),
    []
  );

  // Get tool definitions
  const handleGetToolDefinitions = useCallback(
    () => TOOL_DEFINITIONS,
    []
  );

  // Get native tools format
  const handleGetNativeTools = useCallback(
    () => getAllNativeTools(),
    []
  );

  // Clear repetition tracking
  const handleClearRepetitions = useCallback(
    () => clearRepetitionTracking(),
    []
  );

  return {
    // State
    executions,
    pendingApproval: pending,
    consecutiveMistakes: mistakes,
    errors: errorsMap,

    // Actions
    execute: handleExecute,
    approve: handleApprove,
    deny: handleDeny,
    cancel: handleCancel,

    // Utilities
    validate: handleValidate,
    needsApproval: handleNeedsApproval,
    parseToolCalls: handleParseToolCalls,
    getToolDefinitions: handleGetToolDefinitions,
    getNativeTools: handleGetNativeTools,
    clearRepetitions: handleClearRepetitions,
  } as unknown as UseToolExecutionReturn;
}

export default useToolExecution;

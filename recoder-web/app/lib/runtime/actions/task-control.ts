/**
 * Task control actions - extracted from action-runner.ts
 * Handles spawn_task and switch_mode actions.
 */

import { createScopedLogger } from '~/utils/logger';
import type { ActionState } from '../action-runner';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('TaskControl');

/**
 * Run a spawn_task action - dispatches a subtask to the chat
 */
export async function runSpawnTaskAction(action: ActionState): Promise<void> {
  if (action.type !== 'spawn_task') {
    unreachable('Expected spawn_task action');
  }

  logger.info(`🚀 Spawning subtask: ${action.taskDescription}`);
  if (action.mode) {
    logger.info(`   Mode: ${action.mode}`);
  }

  try {
    const taskId = `task-${Date.now().toString(36)}`;

    // Build the task prompt with context
    let taskPrompt = action.taskDescription;

    // Add context if provided
    if (action.context) {
      taskPrompt = `Context: ${action.context}\n\nTask: ${taskPrompt}`;
    }

    // Add mode instruction if different from current
    if (action.mode && action.mode !== 'code') {
      taskPrompt = `[Mode: ${action.mode}] ${taskPrompt}`;
    }

    // Dispatch event to trigger the chat to send this as a message
    // The Chat.client.tsx component listens for this event
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('recoder:spawn-task', {
        detail: {
          taskId,
          prompt: taskPrompt,
          mode: action.mode || 'code',
          context: action.context,
        },
      });
      window.dispatchEvent(event);

      logger.info(`✅ Subtask dispatched to chat: ${taskId}`);
      action.content = `Task "${action.taskDescription}" sent to AI for execution`;
    } else {
      // Server-side fallback - just log
      logger.info(`✅ Subtask logged (server-side): ${taskId}`);
      action.content = `Task logged: ${action.taskDescription}`;
    }
  } catch (error) {
    logger.error(`❌ Failed to spawn subtask:`, error);
    throw error;
  }
}

/**
 * Run a switch_mode action - changes the AI mode mid-conversation
 */
export async function runSwitchModeAction(action: ActionState): Promise<void> {
  if (action.type !== 'switch_mode') {
    unreachable('Expected switch_mode action');
  }

  logger.info(`🔄 Switching to ${action.targetMode} mode`);
  if (action.reason) {
    logger.info(`   Reason: ${action.reason}`);
  }

  // Import the mode store and update it
  try {
    const { setMode } = await import('../../stores/mode');
    setMode(action.targetMode);

    logger.info(`✅ Mode switched to: ${action.targetMode}`);
    action.content = `Mode switched to ${action.targetMode}`;
  } catch (error) {
    logger.error(`❌ Failed to switch mode:`, error);
    // Don't throw - mode switching is non-critical
    action.content = `Mode switch requested: ${action.targetMode}`;
  }
}

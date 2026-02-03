/**
 * Context Compaction Service
 *
 * Prevents context overflow in long chat sessions by summarizing older
 * messages when the conversation approaches the model's context limit.
 *
 * This is the server-side counterpart to the client-side condense.ts.
 * It runs inside api.chat.ts right before the messages are sent to the
 * LLM, providing a last-resort safety net against context overflow errors.
 *
 * Design decisions:
 *   - Uses the canonical token-counter.ts for estimation (not the simpler
 *     chars/4 approach in condense.ts) for better accuracy on code-heavy
 *     conversations.
 *   - Keeps the last 6 messages (3 user/assistant turns) intact so the LLM
 *     has enough recent context to produce coherent responses.
 *   - Preserves recoderAction metadata (file paths, shell commands) in the
 *     summary so the LLM knows what files already exist.
 *   - The summary is injected as an assistant message (not system) to avoid
 *     confusing providers that limit the number of system messages.
 *   - 30% headroom is reserved for the model's response tokens.
 */

import { estimateTokens, getModelLimit } from '~/lib/services/token-counter';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ContextCompaction');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompactionResult {
  messages: Array<{ role: string; content: string }>;
  wasCompacted: boolean;
  originalTokens: number;
  compactedTokens: number;
  summarizedCount: number;
}

// ---------------------------------------------------------------------------
// Threshold calculation
// ---------------------------------------------------------------------------

/**
 * Headroom factor: we trigger compaction when the conversation exceeds
 * 70% of the model's context window, leaving 30% for the response and
 * any additional system overhead the provider adds.
 */
const HEADROOM_FACTOR = 0.70;

/**
 * Number of recent messages to keep intact during compaction.
 * 6 messages = roughly 3 user/assistant turns, which is enough for the
 * LLM to maintain coherent conversation continuity.
 */
const KEEP_RECENT_COUNT = 6;

/**
 * Calculate the compaction threshold (in tokens) for a given model.
 */
function getThreshold(modelId: string): number {
  const contextLimit = getModelLimit(modelId);
  return Math.floor(contextLimit * HEADROOM_FACTOR);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compact conversation history when it approaches the context limit.
 *
 * Strategy:
 *   1. Estimate total tokens (system prompt + all messages).
 *   2. If below threshold, return messages unchanged.
 *   3. Otherwise, keep the last N messages intact and build a structured
 *      summary of everything before them.
 *   4. Prepend the summary as a single assistant message.
 *
 * @param messages          - The full conversation message array
 * @param modelId           - Model identifier for context-limit lookup
 * @param systemPromptTokens - Pre-computed token count for the system prompt
 *                             (which is sent separately and still counts
 *                             against the context window)
 */
export function compactMessages(
  messages: Array<{ role: string; content: string | any }>,
  modelId: string,
  systemPromptTokens: number = 0,
): CompactionResult {
  // --- Step 1: estimate total token usage ---
  const totalTokens = messages.reduce((acc, msg) => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);
    return acc + estimateTokens(content);
  }, systemPromptTokens);

  const threshold = getThreshold(modelId);

  // --- Step 2: bail early if under threshold ---
  if (totalTokens < threshold) {
    return {
      messages: messages as any,
      wasCompacted: false,
      originalTokens: totalTokens,
      compactedTokens: totalTokens,
      summarizedCount: 0,
    };
  }

  // --- Step 3: split messages into "old" and "recent" ---
  const keepCount = Math.min(KEEP_RECENT_COUNT, messages.length);
  const recentMessages = messages.slice(-keepCount);
  const olderMessages = messages.slice(0, -keepCount);

  // Nothing to compact if all messages are "recent"
  if (olderMessages.length === 0) {
    return {
      messages: messages as any,
      wasCompacted: false,
      originalTokens: totalTokens,
      compactedTokens: totalTokens,
      summarizedCount: 0,
    };
  }

  // --- Step 4: build summary and reassemble ---
  const summary = summarizeMessages(olderMessages);

  const compactedMessages: Array<{ role: string; content: string }> = [
    {
      role: 'assistant',
      content: [
        `[CONVERSATION SUMMARY - The following summarizes ${olderMessages.length} earlier messages]`,
        summary,
        '[END SUMMARY - Recent messages follow]',
      ].join('\n'),
    },
    ...recentMessages.map((msg) => ({
      role: msg.role as string,
      content: typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content),
    })),
  ];

  // Ensure the first message is always a user message for API compatibility.
  // Some providers (Anthropic, OpenAI) require the conversation to start
  // with a user message. If the first recent message isn't a user message,
  // we insert a thin user message before the summary.
  if (compactedMessages[0].role !== 'user') {
    compactedMessages.unshift({
      role: 'user',
      content: '(Continue from the conversation summary below.)',
    });
  }

  const compactedTokens = compactedMessages.reduce((acc, msg) => {
    return acc + estimateTokens(msg.content);
  }, systemPromptTokens);

  logger.info(
    `Compacted ${olderMessages.length} messages: ${totalTokens} -> ${compactedTokens} tokens ` +
    `(saved ${totalTokens - compactedTokens} tokens, model threshold: ${threshold})`,
  );

  return {
    messages: compactedMessages,
    wasCompacted: true,
    originalTokens: totalTokens,
    compactedTokens,
    summarizedCount: olderMessages.length,
  };
}

// ---------------------------------------------------------------------------
// Summarization (client-side, no LLM call)
// ---------------------------------------------------------------------------

/**
 * Create a structured text summary of older messages.
 *
 * Extracts the most important context the LLM needs to continue the
 * conversation: which files exist, what commands were run, what the user
 * asked for, and what errors occurred.
 */
function summarizeMessages(
  messages: Array<{ role: string; content: string | any }>,
): string {
  const filesCreated: string[] = [];
  const shellCommands: string[] = [];
  const userRequests: string[] = [];
  const errorsReported: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);

    // --- Extract file paths from recoderAction tags ---
    const fileMatches = content.match(/filePath="([^"]+)"/g);
    if (fileMatches) {
      for (const match of fileMatches) {
        const path = match.replace(/filePath="([^"]+)"/, '$1');
        if (!filesCreated.includes(path)) {
          filesCreated.push(path);
        }
      }
    }

    // --- Extract shell commands ---
    const shellMatches = content.match(/type="shell"[^>]*>([\s\S]*?)<\/recoderAction>/g);
    if (shellMatches) {
      for (const match of shellMatches) {
        const cmd = match
          .replace(/type="shell"[^>]*>/, '')
          .replace(/<\/recoderAction>/, '')
          .trim();
        if (cmd && !shellCommands.includes(cmd)) {
          shellCommands.push(cmd);
        }
      }
    }

    // --- Extract user requests (short messages only to avoid noise) ---
    if (msg.role === 'user' && content.length < 500) {
      userRequests.push(content.slice(0, 150));
    }

    // --- Extract error mentions from user messages ---
    if (
      msg.role === 'user' &&
      /error|bug|fix|broken|doesn't work|not working|crash|fail/i.test(content)
    ) {
      const firstLine = content.split('\n')[0].slice(0, 200);
      if (!errorsReported.includes(firstLine)) {
        errorsReported.push(firstLine);
      }
    }
  }

  // --- Assemble summary sections ---
  const parts: string[] = [];

  if (filesCreated.length > 0) {
    parts.push(`Files created/modified:\n${filesCreated.map((f) => `  - ${f}`).join('\n')}`);
  }

  if (shellCommands.length > 0) {
    // Cap at 10 commands to keep the summary compact
    const cmdsToShow = shellCommands.slice(-10);
    parts.push(`Commands run:\n${cmdsToShow.map((c) => `  $ ${c}`).join('\n')}`);
  }

  if (userRequests.length > 0) {
    // Show the first request and last 4 requests to capture the arc
    const requests = userRequests.length <= 5
      ? userRequests
      : [userRequests[0], '...', ...userRequests.slice(-4)];
    parts.push(`User requests:\n${requests.map((r) => `  - ${r}`).join('\n')}`);
  }

  if (errorsReported.length > 0) {
    parts.push(`Issues reported:\n${errorsReported.map((e) => `  - ${e}`).join('\n')}`);
  }

  return parts.join('\n\n') || 'Previous conversation contained code generation and discussion.';
}

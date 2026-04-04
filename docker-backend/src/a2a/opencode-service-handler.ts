/**
 * @module opencode-service-handler
 *
 * Extracted pure function that handles a Deep Coding prompt via the
 * centralized opencode service. This is the hot path used by:
 *
 *   - recoder-web   → POST /api/opencode/:projectId (server.ts)
 *   - recoder-agents → POST /api/opencode/:projectId (via backend)
 *   - A2A connector → POST /api/a2a/connectors/opencode/execute
 *
 * Keeping the logic in a standalone module makes it unit-testable
 * without spinning up the full Express app, and ensures BYOK key
 * forwarding and text extraction are consistent across all callers.
 */

import {
  promptProject,
  setProviderKey,
  type MessageWithParts,
} from './opencode-service-adapter';

export interface OpencodeServiceHandlerInput {
  projectId: string;
  prompt: string;
  model?: string;
  providerKeys?: {
    openrouter?: string;
    openai?: string;
    anthropic?: string;
    google?: string;
    gemini?: string;
  };
  directory?: string;
}

export interface OpencodeServiceHandlerResult {
  success: boolean;
  sessionId?: string;
  text: string;
  output: string;
  raw: MessageWithParts;
}

/**
 * Forward BYOK provider keys to the opencode service.
 * Each key is best-effort — failures are logged but don't block the prompt.
 */
export async function forwardProviderKeys(
  providerKeys: OpencodeServiceHandlerInput['providerKeys'],
): Promise<void> {
  if (!providerKeys) return;

  const keyMap: Array<[string, string | undefined]> = [
    ['openrouter', providerKeys.openrouter],
    ['openai', providerKeys.openai],
    ['anthropic', providerKeys.anthropic],
    ['google', providerKeys.google || providerKeys.gemini],
  ];

  for (const [provider, key] of keyMap) {
    if (key) {
      await setProviderKey(provider, key).catch(() => {});
    }
  }
}

/**
 * Extract user-readable text from an opencode message's parts.
 * Joins text parts and tool-result parts with double newlines.
 */
export function extractResponseText(result: MessageWithParts): string {
  const textParts = result.parts
    .filter((p) => p.type === 'text' || p.type === 'tool-result')
    .map((p) => {
      const record = p as Record<string, unknown>;
      return String(record.text || record.content || '');
    })
    .filter(Boolean);

  return textParts.join('\n\n');
}

/**
 * Handle a Deep Coding prompt through the centralized opencode service.
 *
 * Flow:
 *   1. Forward BYOK provider keys (openrouter/openai/anthropic/google)
 *   2. Call promptProject() to run the prompt
 *   3. Extract text from the result's parts
 *   4. Return a uniform response shape
 */
export async function handleOpencodeServicePrompt(
  input: OpencodeServiceHandlerInput,
): Promise<OpencodeServiceHandlerResult> {
  await forwardProviderKeys(input.providerKeys);

  const result = await promptProject(
    input.projectId,
    {
      content: input.prompt,
      agent: input.model,
    },
    { directory: input.directory },
  );

  const text = extractResponseText(result);

  return {
    success: true,
    sessionId: result.info.sessionID as string | undefined,
    text,
    output: JSON.stringify(result),
    raw: result,
  };
}

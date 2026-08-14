/** Extract the newest safe native-session reference from structured CLI output. */
function isSafeRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    value === value.trim() && !/[\x00-\x1f\x7f]/.test(value) && !value.startsWith('-');
}

function asRecord(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

export function findNativeSessionRef(runtimeId: string, output: string): string | undefined {
  for (const line of output.split('\n').reverse()) {
    const event = asRecord(line.trim());
    if (!event) continue;
    let ref: unknown;
    if (runtimeId === 'claude_code' && event['type'] === 'system') ref = event['session_id'];
    if (runtimeId === 'codex' && event['type'] === 'thread.started') ref = event['thread_id'] ?? event['threadId'];
    if (runtimeId === 'opencode') ref = event['sessionID'];
    if ((runtimeId === 'pi' || runtimeId === 'recoder_code') && event['type'] === 'session') ref = event['id'];
    if (isSafeRef(ref)) return ref;
  }
  return undefined;
}

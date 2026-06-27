/**
 * which — resolve a binary on PATH via `command -v <bin>`.
 *
 * Promoted from the inline `which()` in
 * docker-backend/src/conductor/runtime-commands.ts. Returns the resolved path,
 * or undefined when the binary is not on PATH (truthful, never assumed present).
 */
import { execFileSafe } from './exec-file.js';

export async function which(bin: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileSafe('/bin/sh', ['-c', `command -v ${bin}`]);
    const path = stdout.trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';

/** Write a rendered prompt to a child's stdin, then optionally close the stream. */
export function writePromptToStdin(
  stdin: Writable,
  prompt: string,
  options: { closeAfter?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    stdin.write(prompt, (error) => {
      if (error) {
        reject(error);
        return;
      }
      if (options.closeAfter ?? true) {
        stdin.end();
      }
      resolve();
    });
  });
}

/**
 * Write a rendered prompt to a temp file (for CLIs that take a prompt-file flag).
 * Returns the absolute path. The caller owns cleanup.
 */
export async function writePromptToTempFile(prompt: string, prefix = 'recoder-prompt-'): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  const filePath = path.join(dir, 'prompt.txt');
  await writeFile(filePath, prompt, 'utf8');
  return filePath;
}

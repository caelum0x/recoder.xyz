import { spawnSync } from 'child_process';
import { tmuxBinFile } from './tmuxBin.js';

export function sendTmuxShellCommand(
  target: string,
  command: string,
  stdio: 'pipe' | 'inherit' = 'pipe'
): void {
  const result = spawnSync(
    tmuxBinFile(),
    ['send-keys', '-t', target, command, 'Enter'],
    { stdio }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to send tmux command to target ${target}`);
  }
}

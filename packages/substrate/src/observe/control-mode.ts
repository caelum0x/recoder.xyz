/**
 * observe/control-mode — the PURE tmux control-mode (`tmux -CC`) protocol
 * pieces: notification-line parsing, octal-escape decoding, ANSI stripping, and
 * the version gate for `-CC` support.
 *
 * Substrate-pure by design: NOTHING here spawns a process or reads the
 * environment. The backend's `tmux-control-mode.adapter` owns the client
 * process; this module owns the wire format so the parser is deterministically
 * testable on captured control-mode transcripts.
 *
 * Protocol notes (tmux control-mode, `man tmux` CONTROL MODE):
 *  - `%output %<pane-id> <data>` — pane output; non-printable/non-ASCII bytes
 *    are escaped as `\ooo` (three octal digits), a literal backslash as `\\`.
 *  - `%begin`/`%end`/`%error` — command-reply blocks (arbitrary text inside).
 *  - `%exit [reason]` / `%exited` — the control client is detaching.
 *  - Other `%`-notifications (`%session-changed`, `%window-add`, …) are valid
 *    protocol this consumer either surfaces or deliberately ignores.
 */

/** One parsed control-mode stdout line. */
export type ControlModeNotification =
  | { kind: 'output'; paneId: string; text: string }
  | { kind: 'exited'; reason?: string }
  | { kind: 'session-changed'; sessionId: string; name: string }
  | { kind: 'block-begin' }
  | { kind: 'block-end' }
  | { kind: 'garbage'; reason: string }
  | { kind: 'ignored' };

/**
 * Decode tmux control-mode escaping: non-printable/non-ASCII bytes arrive as
 * `\ooo` (three octal digits) and a literal backslash as `\\`. The escaped
 * stream is byte-oriented, so decoded bytes are reassembled as UTF-8.
 */
export function decodeControlModeData(data: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const ch = data[i]!;
    if (ch === '\\') {
      const octal = data.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        bytes.push(parseInt(octal, 8));
        i += 3;
        continue;
      }
      if (data[i + 1] === '\\') {
        bytes.push(0x5c);
        i += 1;
        continue;
      }
      // Lone backslash — keep it literally (defensive; tmux always escapes).
      bytes.push(0x5c);
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code > 0xff) {
      for (const byte of Buffer.from(ch, 'utf8')) bytes.push(byte);
      continue;
    }
    bytes.push(code);
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Strip ANSI escape sequences + normalize line endings so control-mode output
 * matches the plain text the capture-poll path produces (`capture-pane` without
 * `-e` already drops escapes). Cursor-movement fidelity is not a goal here —
 * the RunEvent log is a text audit trail, not a terminal emulator.
 */
export function stripAnsi(text: string): string {
  return (
    text
      // CSI sequences (colors, cursor movement): ESC [ … final byte
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
      // OSC sequences (titles): ESC ] … (BEL | ESC \)
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
      // Remaining two-byte ESC sequences
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b[@-_]/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '')
  );
}

/**
 * Strip the DCS envelope `-CC` wraps the notification stream in
 * (`ESC P 1000 p … ESC \`) so the raw markers never reach the line parser.
 */
export function stripDcsEnvelope(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\x1bP1000p/g, '').replace(/\x1b\\/g, '');
}

/** Parse ONE line of control-mode stdout into a typed notification. */
export function parseControlModeLine(line: string): ControlModeNotification {
  if (line === '') return { kind: 'ignored' };
  if (!line.startsWith('%')) {
    return { kind: 'garbage', reason: `non-notification line: ${line.slice(0, 80)}` };
  }
  if (line.startsWith('%begin')) return { kind: 'block-begin' };
  if (line.startsWith('%end') || line.startsWith('%error')) return { kind: 'block-end' };
  if (line.startsWith('%output')) {
    // [\s\S] instead of the dotall flag: the package targets pre-es2018, and
    // newlines inside data arrive escaped (\012) anyway — this is defensive.
    const match = /^%output (%\d+) ([\s\S]*)$/.exec(line);
    if (!match) return { kind: 'garbage', reason: `malformed %output: ${line.slice(0, 80)}` };
    return { kind: 'output', paneId: match[1]!, text: decodeControlModeData(match[2]!) };
  }
  if (line.startsWith('%session-changed')) {
    const match = /^%session-changed (\$\d+) (.*)$/.exec(line);
    if (!match) {
      return { kind: 'garbage', reason: `malformed %session-changed: ${line.slice(0, 80)}` };
    }
    return { kind: 'session-changed', sessionId: match[1]!, name: match[2]! };
  }
  if (/^%exit(ed)?(\s|$)/.test(line)) {
    const reason = line.replace(/^%exit(ed)?\s*/, '').trim();
    return { kind: 'exited', reason: reason || undefined };
  }
  // Any other %-notification (%window-add, %layout-change, …) is valid
  // protocol we simply do not consume.
  return { kind: 'ignored' };
}

/** Control mode (`-CC`) landed in tmux 1.8. */
export const MIN_CONTROL_MODE_VERSION = 1.8;

/**
 * Whether a `tmux -V` output line names a binary that speaks control mode.
 * Pure version-string gate — truthful `false` on anything unparseable (an
 * unknown binary must select the poller, never a fabricated attach).
 *
 * Accepts the shapes tmux actually prints: `tmux 3.7b`, `tmux 1.8`,
 * `tmux next-3.7`, `tmux master`, `tmux 3.4-rc2`, and the OpenBSD base-system
 * `tmux openbsd-7.4` (always current). Rejects garbage and pre-1.8 versions.
 */
export function supportsControlMode(versionOutput: string): boolean {
  const trimmed = versionOutput.trim();
  if (!/^tmux\s/i.test(trimmed)) return false;
  const rest = trimmed.replace(/^tmux\s+/i, '');
  // Development builds track ahead of every release — always modern.
  if (/^(next-|master$|openbsd-)/i.test(rest)) return true;
  const match = /^(\d+)\.(\d+)/.exec(rest);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 8);
}

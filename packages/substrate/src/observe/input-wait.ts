/**
 * input-wait — pure pane-tail classifier: is the agent BLOCKED waiting for
 * operator input right now?
 *
 * Conservative by design. Only well-known interactive prompt shapes from the
 * real agent CLIs count, and only when they sit at the TAIL of the pane (a
 * question that scrolled past is history, not a wait). A false "needs you"
 * erodes trust in the triage, so unknown shapes classify as not-waiting.
 */

/** Only the tail of the pane can be an active wait. */
const TAIL_LINES = 12;

/** Trailing y/n-style confirmations: `... ? (y/n)` / `[y/N]` / `(yes/no)`. */
const YES_NO_TAIL = /\((?:y\/n|yes\/no)\)\s*$|\[(?:y\/n|y\/N|Y\/n)\]\s*$/i;

/** Question lines that head a numbered option dialog (claude-code style). */
const OPTION_DIALOG_QUESTION = /^(?:do you want|do you trust|would you like)\b.*\?$/i;

/** A numbered option row, optionally with the ❯ cursor (e.g. `❯ 1. Yes`). */
const OPTION_ROW = /^❯?\s*\d+\.\s+\S/;

/** Explicit pause prompts. */
const PRESS_ENTER = /^press enter to continue\b/i;

/**
 * Returns the prompt line the agent is blocked on, or null when the pane tail
 * does not look like an input wait.
 */
export function detectInputWait(pane: string): string | null {
  const lines = pane
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(-TAIL_LINES);
  if (lines.length === 0) return null;

  const last = lines[lines.length - 1];
  if (YES_NO_TAIL.test(last)) return last;
  if (PRESS_ENTER.test(last)) return last;

  // Option dialog: a "Do you want …?" question followed only by option rows
  // through the end of the tail (so the dialog is still on screen and active).
  for (let i = lines.length - 1; i >= 0; i--) {
    if (OPTION_DIALOG_QUESTION.test(lines[i])) {
      const rest = lines.slice(i + 1);
      if (rest.length > 0 && rest.every((l) => OPTION_ROW.test(l))) {
        return lines[i];
      }
      return null;
    }
  }
  return null;
}

/**
 * modelFlag — per-runtime model-flag formatting.
 *
 * Promoted verbatim from runtime-commands.ts. Returns the leading-space flag
 * fragment (e.g. ` --model 'gpt-5'`) or '' when no model override is given. The
 * model value is shell-quoted (it can be an arbitrary string).
 */
import { shellQuote } from './shell-quote.js';

export function modelFlag(flag: string, model?: string): string {
  return model ? ` ${flag} ${shellQuote(model)}` : '';
}

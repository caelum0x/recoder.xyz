"use strict";
/**
 * @module completion-loop
 *
 * Bounded retry wrapper around `runtime.sendPrompt()`. Re-runs a task
 * when the result looks incomplete, with exponential backoff.
 *
 * Inspired by oh-my-openagent's Ralph Loop + Todo Continuation Enforcer,
 * but much simpler:
 *   - No file-based session state
 *   - No Claude Code hook assumptions
 *   - Pure async wrapper — works with any RuntimeAdapter in our registry
 *
 * Default behavior:
 *   - Max 3 iterations (hard cap prevents infinite loops)
 *   - Exponential backoff starting at 1000ms
 *   - Completion heuristics: TODO markers, hedge phrases, min length
 *
 * Typical usage:
 *
 *   const runtime = getRuntime('opencode')!;
 *   const outcome = await runWithCompletionLoop(runtime, sendPromptParams);
 *   if (outcome.completed) {
 *     console.log(`Done in ${outcome.iterations} iteration(s)`);
 *   } else {
 *     console.log(`Gave up after ${outcome.iterations} iterations`);
 *   }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCompletionCheck = defaultCompletionCheck;
exports.runWithCompletionLoop = runWithCompletionLoop;
// ── Default completion heuristics ───────────────────────────────────
const DEFAULT_MIN_LENGTH = 20;
const HEDGE_PHRASES = [
    'let me know if',
    'let me know when',
    'i can continue',
    'should i continue',
    'do you want me to',
    'would you like me to',
    'want me to continue',
    'shall i continue',
];
const TODO_MARKER = /\bTODO\b|\btodo:|- \[ \]|\*\s*\[\s*\]/i;
/** Extract plain text from a PromptResult's parts array. */
function extractText(result) {
    if (!result?.parts || !Array.isArray(result.parts))
        return '';
    return result.parts
        .filter((p) => p.type === 'text' || p.type === 'tool-result')
        .map((p) => {
        const rec = p;
        return String(rec.text || rec.content || '');
    })
        .filter(Boolean)
        .join('\n\n')
        .trim();
}
/**
 * Default completion check. Returns `true` when the result looks done.
 *
 * Considered INCOMPLETE when:
 *  - Text is shorter than minResultLength
 *  - Text contains TODO markers or unchecked checkboxes
 *  - Text ends with a hedge phrase asking the user for more input
 */
function defaultCompletionCheck(result, minResultLength = DEFAULT_MIN_LENGTH) {
    const text = extractText(result);
    const lower = text.toLowerCase();
    if (text.length < minResultLength)
        return false;
    if (TODO_MARKER.test(text))
        return false;
    // Only check the last ~200 chars for hedge phrases (we don't care if
    // the middle of a response mentions "let me know if" in a quoted example)
    const tail = lower.slice(-200);
    for (const phrase of HEDGE_PHRASES) {
        if (tail.includes(phrase))
            return false;
    }
    return true;
}
// ── Loop runner ─────────────────────────────────────────────────────
/**
 * Run a prompt through a RuntimeAdapter with bounded retry-until-complete.
 *
 * @param runtime - Any adapter from the coding-runtime registry.
 * @param params - Prompt parameters (same shape as `runtime.sendPrompt()`).
 * @param options - Loop configuration. See `CompletionLoopOptions`.
 */
async function runWithCompletionLoop(runtime, params, options = {}) {
    const maxIterations = Math.max(1, options.maxIterations ?? 3);
    const initialBackoff = Math.max(0, options.backoffMs ?? 1000);
    const minLength = options.minResultLength ?? DEFAULT_MIN_LENGTH;
    const checkComplete = options.completionCheck ?? ((r) => defaultCompletionCheck(r, minLength));
    const continuation = options.continuationPrompt ??
        'Continue from where you left off. Complete any remaining work, and finish every item on your todo list.';
    const history = [];
    let lastResult = null;
    let completed = false;
    let iterations = 0;
    for (let i = 0; i < maxIterations; i++) {
        iterations = i + 1;
        // On retries, append the continuation prompt to the original.
        const effectivePrompt = i === 0 ? params.prompt : `${params.prompt}\n\n---\n${continuation}`;
        lastResult = await runtime.sendPrompt({
            ...params,
            prompt: effectivePrompt,
        });
        const text = extractText(lastResult);
        history.push(text);
        const isComplete = checkComplete(lastResult);
        if (options.onIteration) {
            options.onIteration(iterations, lastResult, isComplete);
        }
        if (isComplete) {
            completed = true;
            break;
        }
        // Wait before the next iteration (skip wait after final iteration)
        if (i < maxIterations - 1 && initialBackoff > 0) {
            const wait = initialBackoff * Math.pow(2, i);
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    }
    return {
        result: lastResult,
        iterations,
        completed,
        history,
    };
}

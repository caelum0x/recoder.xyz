/**
 * Local check-run fold (recoder-fxee) — proves executed test/typecheck/lint results
 * fold into a GitHub-shaped rollup: any fail/error ⇒ failing (names surfaced), all
 * pass ⇒ passing, a mix without failures ⇒ pending, nothing ⇒ none.
 */
import { describe, it, expect } from 'vitest';
import { foldCheckRuns, type LocalCheckRun } from './check-run.service.js';

const run = (name: string, status: LocalCheckRun['status']): LocalCheckRun => ({ name, status });

describe('foldCheckRuns', () => {
  it('none when nothing ran', () => {
    expect(foldCheckRuns([])).toEqual({ rollup: 'none', passed: 0, failed: 0, total: 0, failing: [] });
  });

  it('passing when every check passed', () => {
    const r = foldCheckRuns([run('tests', 'pass'), run('typecheck', 'pass')]);
    expect(r.rollup).toBe('passing');
    expect(r.passed).toBe(2);
    expect(r.failing).toEqual([]);
  });

  it('failing (with names) when any check fails or errors', () => {
    const r = foldCheckRuns([run('tests', 'pass'), run('lint', 'fail'), run('build', 'error')]);
    expect(r.rollup).toBe('failing');
    expect(r.failed).toBe(2);
    expect(r.failing).toEqual(['lint', 'build']);
  });
});

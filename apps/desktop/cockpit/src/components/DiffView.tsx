/**
 * DiffView — renders the real GET /workspaces/:id/diff output: the `git diff
 * --stat` summary, the unified patch with line-level coloring, and untracked
 * files. No synthetic content; if the diff endpoint errors (e.g. no worktree),
 * the error is surfaced.
 */
import type { WorkspaceDiff } from '../types';

interface DiffViewProps {
  diff: WorkspaceDiff | null;
  error: Error | null;
  loading: boolean;
}

function classifyLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'diff-meta';
  if (line.startsWith('@@')) return 'diff-hunk';
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'diff-meta';
  if (line.startsWith('+')) return 'diff-add';
  if (line.startsWith('-')) return 'diff-del';
  return 'diff-ctx';
}

export function DiffView({ diff, error, loading }: DiffViewProps) {
  if (loading && !diff) return <div class="diff-empty">Loading diff…</div>;
  if (error) return <div class="diff-error">Diff unavailable: {error.message}</div>;
  if (!diff) return <div class="diff-empty">No diff yet.</div>;

  const patchLines = diff.patch ? diff.patch.split('\n') : [];

  return (
    <div class="diff-view">
      <div class="diff-summary">
        <span class="diff-count">{diff.changedFiles} file{diff.changedFiles === 1 ? '' : 's'} changed</span>
        <span class="diff-branch">{diff.branch} ← {diff.baseRef}</span>
      </div>

      {diff.stat && <pre class="diff-stat">{diff.stat}</pre>}

      {patchLines.length > 0 ? (
        <pre class="diff-patch">
          {patchLines.map((line, i) => (
            <div class={`diff-line ${classifyLine(line)}`} key={i}>{line || ' '}</div>
          ))}
        </pre>
      ) : (
        <div class="diff-empty">No tracked changes.</div>
      )}

      {diff.untracked.length > 0 && (
        <div class="diff-untracked">
          <div class="diff-untracked-title">Untracked files</div>
          <ul>
            {diff.untracked.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

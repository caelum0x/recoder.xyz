/**
 * `computeCandidateVote` — the CROSS-CANDIDATE self-consistency vote. Recoder runs N
 * REAL, independent coding agents in parallel worktrees on the same task; this turns
 * their agreement into a first-class confidence signal.
 *
 * Competitors (Sweep's >=4/5 group vote, Ellipsis's parallel comment-generators) have
 * to RE-SAMPLE a single model to FAKE N-way agreement. Recoder has the genuine thing —
 * so we measure it: of the files that MULTIPLE candidates changed (the votable set),
 * how many CONVERGED (their changes auto-3-way-merged — compatible) versus had ONE
 * version PICKED as the winner (the candidates diverged, so a single sibling's version
 * was chosen). High convergence = the independent agents agreed → real confidence.
 * Divergence = a human/heuristic chose one approach over others → a review flag.
 *
 * PURE + deterministic. It reads ONLY the converge selections (`mode` + `contested`)
 * and the candidate count already on the convergence evidence — no I/O, no content
 * fetch. It DELIBERATELY does not overclaim: `synthesize` proves the changes were
 * mergeable/compatible, not semantically identical; `pick` proves one version was
 * chosen, whether by textual conflict or a human's call. Both are honest signals for
 * "should a human look?".
 */

/** The vote verdict over the candidates that touched shared files. */
export type VoteVerdict = 'strong' | 'mixed' | 'weak' | 'solo';

/** One converge selection, narrowed to what the vote reads. */
export interface VoteSelection {
  /** Repo-relative path (used for the reviewer-facing flags); optional/degrades to an index. */
  readonly path?: string;
  /** `'synthesize'` (auto-merged) or `'pick'` (one version chosen). Absent ⇒ treated as picked. */
  readonly mode?: string;
  /** True when 2+ candidates authored this path — the votable set. */
  readonly contested: boolean;
}

export interface CandidateVoteInput {
  /** Number of independent agent candidates that were converged (N). */
  readonly candidateCount: number;
  readonly selections: readonly VoteSelection[];
}

export interface CandidateVote {
  readonly verdict: VoteVerdict;
  /** 0..1 — of the files MULTIPLE candidates changed, the fraction whose changes CONVERGED. */
  readonly agreementRatio: number;
  /** Count of files multiple candidates changed (the votable set); 0 ⇒ nothing to vote on. */
  readonly contestedCount: number;
  /** Files where multiple candidates' changes auto-merged (compatible / converged). */
  readonly converged: readonly string[];
  /** Files where candidates diverged and a single winner was picked (a review flag). */
  readonly picked: readonly string[];
  /** Specific things a reviewer should check because the agents disagreed. */
  readonly reviewFlags: readonly string[];
  readonly summary: string;
}

/** Cap surfaced file names so a huge converge can't flood the flags. */
const MAX_NAMED = 3;

function selectionLabel(sel: VoteSelection, index: number): string {
  const p = sel.path?.trim();
  return p && p !== '' ? p : `file ${index + 1}`;
}

/**
 * Fold the converge selections into the cross-candidate vote. Degrade-truthful: a
 * single candidate (N<2) or no shared files ⇒ verdict `'solo'` (nothing to vote on),
 * never a fabricated consensus.
 */
export function computeCandidateVote(input: CandidateVoteInput): CandidateVote {
  const solo = (summary: string): CandidateVote => ({
    verdict: 'solo',
    agreementRatio: 0,
    contestedCount: 0,
    converged: [],
    picked: [],
    reviewFlags: [],
    summary,
  });

  if (input.candidateCount < 2) {
    return solo('Single candidate — no cross-agent vote.');
  }
  const contested = input.selections.filter((s) => s && s.contested);
  if (contested.length === 0) {
    return solo(`${input.candidateCount} candidates changed no shared files — nothing to vote on.`);
  }

  const converged: string[] = [];
  const picked: string[] = [];
  contested.forEach((sel, i) => {
    // `synthesize` = the candidates' versions auto-3-way-merged (compatible/converged);
    // anything else (`pick`/absent) = one sibling's whole version was chosen (diverged).
    if (sel.mode === 'synthesize') converged.push(selectionLabel(sel, i));
    else picked.push(selectionLabel(sel, i));
  });

  const agreementRatio = converged.length / contested.length;
  const verdict: VoteVerdict =
    picked.length === 0 ? 'strong' : converged.length === 0 ? 'weak' : 'mixed';

  const reviewFlags: string[] = [];
  if (picked.length > 0) {
    const shown = picked.slice(0, MAX_NAMED).join(', ');
    reviewFlags.push(
      `${input.candidateCount} agents diverged on ${picked.length} shared file(s): ${shown} — one version was picked; review the winner.`,
    );
  }

  const summary = `${input.candidateCount} agents · ${converged.length}/${contested.length} shared file(s) converged (${verdict}).`;
  return { verdict, agreementRatio, contestedCount: contested.length, converged, picked, reviewFlags, summary };
}

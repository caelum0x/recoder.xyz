/**
 * health — truthful liveness of the absorbed engines, with no side effects and
 * no fabricated readiness:
 *   - recodergitLib: 'up' when the code-graph flag is on (the in-process index
 *     lifecycle is active), else 'disabled'.
 *   - gh: 'authed' | 'not_authed' | 'absent' from a bounded `gh auth status`
 *     probe (env token wins).
 *   - codeGraphEnabled: the RECODER_CODE_GRAPH_ENABLED gate.
 */

import { RecoderGitService } from './deps';
import { ghAuthState, type GhRunner } from './ops';
import type { GitHubHealth } from './types';

/** Compute the module's truthful health snapshot. Never throws. */
export function health(codeGraph: RecoderGitService, ghRunner: GhRunner): GitHubHealth {
  const codeGraphEnabled = codeGraph.isEnabled();
  return {
    recodergitLib: codeGraphEnabled ? 'up' : 'disabled',
    gh: ghAuthState(ghRunner),
    codeGraphEnabled,
  };
}

import type { GovernanceRequest } from '../domain/governance-request';

/**
 * complexity-estimator — TS mirror of the openfang `routing.rs` `ModelRouter`
 * scoring heuristics. It produces a normalized complexity score in [0, 1] from
 * cheap proxies: prompt size (token proxy), tool count, code markers in the
 * command/target, and conversation depth.
 *
 * The score is deliberately monotonic and bounded so downstream tier
 * classification is stable. Each signal contributes a capped, weighted share.
 */

export type ComplexityBreakdown = {
  readonly tokenScore: number;
  readonly toolScore: number;
  readonly codeScore: number;
  readonly depthScore: number;
  readonly total: number; // in [0, 1]
};

// Saturation points: signals above these contribute their full weight.
const TOKEN_SATURATION = 8000;
const TOOL_SATURATION = 20;
const DEPTH_SATURATION = 12;

const WEIGHTS = {
  token: 0.4,
  tool: 0.2,
  code: 0.2,
  depth: 0.2,
} as const;

const CODE_MARKERS = [
  /\bfunction\b/,
  /\bclass\b/,
  /\bimport\b/,
  /\brequire\(/,
  /=>/,
  /\{[\s\S]*\}/,
  /\bgit\b/,
  /\bnpm\b|\bpnpm\b|\byarn\b/,
  /\bdocker\b/,
];

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function tokenProxy(req: GovernanceRequest): number {
  const explicit = req.context?.promptTokens;
  if (typeof explicit === 'number' && explicit >= 0) return explicit;
  // Fall back to a char/4 proxy over the visible target fields.
  const text = [req.target.command, req.target.path, req.target.toolName].filter(Boolean).join(' ');
  return Math.ceil(text.length / 4);
}

function codeMarkerScore(req: GovernanceRequest): number {
  const text = [req.target.command, req.context?.bashInput].filter(Boolean).join('\n');
  if (!text) return 0;
  const hits = CODE_MARKERS.reduce((count, marker) => (marker.test(text) ? count + 1 : count), 0);
  return clamp01(hits / CODE_MARKERS.length);
}

export function estimateComplexity(req: GovernanceRequest): ComplexityBreakdown {
  const tokens = tokenProxy(req);
  const tools = req.context?.toolCount ?? req.actor.tools.length ?? 0;
  const depth = req.context?.conversationDepth ?? 0;

  const tokenScore = clamp01(tokens / TOKEN_SATURATION);
  const toolScore = clamp01(tools / TOOL_SATURATION);
  const codeScore = codeMarkerScore(req);
  const depthScore = clamp01(depth / DEPTH_SATURATION);

  const total = clamp01(
    tokenScore * WEIGHTS.token +
      toolScore * WEIGHTS.tool +
      codeScore * WEIGHTS.code +
      depthScore * WEIGHTS.depth,
  );

  return { tokenScore, toolScore, codeScore, depthScore, total };
}

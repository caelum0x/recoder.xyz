/**
 * Structured results for the installed-app PR-review loop. Each independent
 * reviewer emits one evidence-backed JSON result. We group only matching
 * file + symbol + defect-class anchors (with a narrow legacy line fallback),
 * so K/N means named reviewers found the same defect — never model confidence.
 */
import type { PullRequestImpactContext } from '../ports/pr-review-agent.port.js';

export type PullRequestFindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type PullRequestReviewVerdict = 'clear' | 'comment' | 'request_changes';

export interface PullRequestFinding {
  readonly file: string;
  readonly line: number;
  readonly defectKey: string;
  /** Nearest function/class/symbol anchor; new reviewers emit it, legacy results may omit it. */
  readonly symbol?: string;
  readonly severity: PullRequestFindingSeverity;
  readonly message: string;
  readonly evidence: string;
}

export interface PullRequestStructuredReview {
  readonly verdict: PullRequestReviewVerdict;
  readonly summary: string;
  readonly findings: readonly PullRequestFinding[];
}

export interface PullRequestReviewerEvidence {
  readonly workspaceId: string;
  readonly runtimeId: string;
  readonly state?: string;
  readonly output: string;
}

export interface PullRequestReviewerResult {
  readonly workspaceId: string;
  readonly runtimeId: string;
  readonly state?: string;
  readonly status: 'running' | 'reported' | 'unavailable';
  readonly review?: PullRequestStructuredReview;
}

export interface PullRequestFindingAgreement {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly defectKey: string;
  readonly symbol?: string;
  readonly severity: PullRequestFindingSeverity;
  readonly message: string;
  readonly evidence: readonly string[];
  readonly reviewers: readonly { workspaceId: string; runtimeId: string }[];
  readonly reviewerCount: number;
  readonly totalReviewers: number;
  readonly agreementRatio: number;
}

export interface PullRequestReviewEvidenceView {
  readonly reviewers: readonly PullRequestReviewerResult[];
  readonly reportedReviewers: number;
  readonly totalReviewers: number;
  readonly findings: readonly PullRequestFindingAgreement[];
  readonly summary: string;
}

export type PullRequestFindingLifecycle = 'new' | 'persisting' | 'fixed';

export interface PullRequestFindingLifecycleRow extends PullRequestFindingAgreement {
  readonly lifecycle: PullRequestFindingLifecycle;
  readonly feedback?: 'accepted' | 'dismissed';
  readonly validation?: PullRequestFindingValidation;
  readonly githubThread?: {
    readonly id: string;
    readonly state: 'open' | 'resolved' | 'outdated';
    readonly url?: string;
    readonly resolvedBy?: string;
  };
  readonly previousAgreement?: {
    readonly key: string;
    readonly reviewerCount: number;
    readonly totalReviewers: number;
    readonly reviewers: readonly { workspaceId: string; runtimeId: string }[];
  };
}

export interface PullRequestReviewLifecycleView extends PullRequestReviewEvidenceView {
  readonly headSha: string;
  readonly impact?: PullRequestImpactContext;
  readonly previousHeadSha?: string;
  readonly lifecycleFindings: readonly PullRequestFindingLifecycleRow[];
  /** Fixed rows are emitted only after every reviewer in the current cohort reported. */
  readonly fixedEvidenceComplete: boolean;
  readonly threadSync?: {
    readonly available: boolean;
    readonly matched: number;
    readonly total: number;
    readonly reason?: string;
  };
  readonly suppressedFindings?: readonly PullRequestFindingLifecycleRow[];
  readonly feedbackStore?: { readonly available: boolean; readonly durable: boolean; readonly reason?: string };
  readonly feedbackStats?: {
    readonly accepted: number;
    readonly dismissed: number;
    readonly total: number;
    readonly dismissalRate: number;
    readonly basis: 'active_rules' | 'decision_history';
    readonly activeAccepted: number;
    readonly activeDismissed: number;
    readonly startedAt?: string;
    readonly updatedAt?: string;
    readonly coverage?: 'since_metrics_enabled' | 'migrated_active_rules';
  };
  readonly findingFixes?: readonly {
    readonly findingKey: string;
    readonly workspaceId: string;
    readonly runtimeId?: string;
    readonly state?: string;
    readonly headSha: string;
    readonly createdAt?: string;
  }[];
  readonly findingFixesUnavailable?: string;
  readonly validator?: {
    readonly status: 'waiting' | 'not_needed' | 'running' | 'reported' | 'unavailable';
    readonly workspaceId?: string;
    readonly runtimeId?: string;
    readonly summary?: string;
    readonly validatedCount?: number;
    readonly totalFindings?: number;
    readonly intent?: PullRequestIntentAssessment;
    readonly requirements?: readonly {
      readonly number: number;
      readonly title: string;
      readonly state: 'OPEN' | 'CLOSED';
      readonly url: string;
    }[];
    readonly unavailableRequirements?: readonly { readonly number: number; readonly reason: string }[];
    readonly beadsRequirements?: readonly {
      readonly id: string;
      readonly title: string;
      readonly status?: string;
    }[];
    readonly unavailableBeadsRequirements?: readonly { readonly id: string; readonly reason: string }[];
    readonly jiraRequirements?: readonly {
      readonly key: string;
      readonly title: string;
      readonly description: string;
      readonly status: string;
      readonly url: string;
      readonly labels: readonly string[];
      readonly issueType?: string;
      readonly priority?: string;
    }[];
    readonly unavailableJiraRequirements?: readonly { readonly key: string; readonly reason: string }[];
    readonly rules?: readonly {
      readonly id: string;
      readonly level: 'required' | 'advisory';
      readonly text: string;
      readonly source: string;
      readonly check?: string;
      readonly assessment?: PullRequestRuleAssessment;
    }[];
    readonly rulesUnavailable?: { readonly source?: string; readonly reason: string };
  };
}

export const PR_REVIEW_RESULT_MARKER = 'RECODER_REVIEW_RESULT';
export const PR_REVIEW_VALIDATION_MARKER = 'RECODER_REVIEW_VALIDATION';
const GITHUB_FINDING_MARKER = /<!--\s*recoder-finding:([^\s>]+)\s*-->/gi;

export function githubFindingMarker(key: string): string {
  return `<!-- recoder-finding:${encodeURIComponent(key)} -->`;
}

export function stripGithubFindingMarkers(body: string): string {
  return body.replace(GITHUB_FINDING_MARKER, '').trim();
}

export function findingKeyFromGithubComment(body: string): string | null {
  GITHUB_FINDING_MARKER.lastIndex = 0;
  const match = GITHUB_FINDING_MARKER.exec(body);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Repo-local learned rule signature: stable across line movement on later pushes. */
export function findingFeedbackSignature(file: string, defectKey: string, symbol?: string): string {
  const defect = normalizedDefectKey(defectKey);
  const anchor = normalizedSymbol(symbol ?? '');
  return anchor
    ? `symbol:${anchor}:${defect}`
    : `${file.trim().replace(/^\.\//, '').toLowerCase()}:${defect}`;
}

export interface PullRequestFileRename {
  readonly from: string;
  readonly to: string;
}

export function extractPullRequestRenames(diff: string | null): readonly PullRequestFileRename[] {
  if (!diff) return [];
  const renames: PullRequestFileRename[] = [];
  let from = '';
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('rename from ')) {
      from = line.slice('rename from '.length).trim();
      continue;
    }
    if (from && line.startsWith('rename to ')) {
      const to = line.slice('rename to '.length).trim();
      if (to && from !== to) renames.push({ from, to });
      from = '';
    }
  }
  return [...new Map(renames.map((rename) => [`${rename.from}\u0000${rename.to}`, rename])).values()];
}

const SEVERITY_RANK: Record<PullRequestFindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function asSeverity(value: unknown): PullRequestFindingSeverity {
  return value === 'critical' || value === 'high' || value === 'medium' || value === 'low' || value === 'info'
    ? value
    : 'info';
}

function asVerdict(value: unknown): PullRequestReviewVerdict | null {
  return value === 'clear' || value === 'comment' || value === 'request_changes' ? value : null;
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

/** Read the first balanced JSON object after the final result marker. */
function markedJsonObject(output: string, resultMarker = PR_REVIEW_RESULT_MARKER): string | null {
  const clean = stripAnsi(output);
  const marker = clean.lastIndexOf(resultMarker);
  if (marker < 0) return null;
  const start = clean.indexOf('{', marker + resultMarker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < clean.length; i += 1) {
    const ch = clean[i]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}' && --depth === 0) return clean.slice(start, i + 1);
  }
  return null;
}

export type PullRequestFindingValidationVerdict = 'confirmed' | 'rejected' | 'uncertain';

export interface PullRequestFindingValidation {
  readonly key: string;
  readonly verdict: PullRequestFindingValidationVerdict;
  readonly rationale: string;
  readonly evidence: string;
}

export interface PullRequestStructuredValidation {
  readonly summary: string;
  readonly validations: readonly PullRequestFindingValidation[];
  readonly intent?: PullRequestIntentAssessment;
  readonly ruleAssessments: readonly PullRequestRuleAssessment[];
}

export interface PullRequestRuleAssessment {
  readonly id: string;
  readonly verdict: 'pass' | 'fail' | 'unknown';
  readonly rationale: string;
  readonly evidence: string;
  /** Recoder projection only; validator JSON cannot choose this authority. */
  readonly basis?: 'validator' | 'named_check';
  readonly checkName?: string;
  readonly checkStatus?: 'pass' | 'fail' | 'error' | 'missing' | 'ambiguous' | 'unavailable' | 'running';
  readonly checkAutofix?: boolean;
}

export interface PullRequestIntentAssessment {
  readonly verdict: 'aligned' | 'partial' | 'misaligned' | 'unknown';
  readonly rationale: string;
  readonly unmetRequirements: readonly string[];
  readonly outOfScopeChanges: readonly string[];
}

/** Parse one independent validator's evidence block. Unknown finding keys are joined out later. */
export function parsePullRequestReviewValidation(output: string): PullRequestStructuredValidation | null {
  const json = markedJsonObject(output, PR_REVIEW_VALIDATION_MARKER);
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const summary = typeof row.summary === 'string' ? row.summary.trim().slice(0, 2_000) : '';
  if (!summary || !Array.isArray(row.validations)) return null;
  const seen = new Set<string>();
  const validations: PullRequestFindingValidation[] = [];
  for (const item of row.validations) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    const key = typeof candidate.key === 'string' ? candidate.key.trim().slice(0, 500) : '';
    const verdict = candidate.verdict === 'confirmed' || candidate.verdict === 'rejected' || candidate.verdict === 'uncertain'
      ? candidate.verdict
      : null;
    const rationale = typeof candidate.rationale === 'string' ? candidate.rationale.trim().slice(0, 4_000) : '';
    const evidence = typeof candidate.evidence === 'string' ? candidate.evidence.trim().slice(0, 4_000) : '';
    if (!key || !verdict || !rationale || !evidence || seen.has(key)) continue;
    seen.add(key);
    validations.push({ key, verdict, rationale, evidence });
  }
  const intentRow = row.intent && typeof row.intent === 'object'
    ? row.intent as Record<string, unknown>
    : null;
  const intentVerdict = intentRow?.verdict === 'aligned' || intentRow?.verdict === 'partial' ||
    intentRow?.verdict === 'misaligned' || intentRow?.verdict === 'unknown'
    ? intentRow.verdict
    : null;
  const intentRationale = typeof intentRow?.rationale === 'string'
    ? intentRow.rationale.trim().slice(0, 4_000)
    : '';
  const boundedStrings = (value: unknown): string[] => Array.isArray(value)
    ? value.flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim().slice(0, 1_000)] : []).slice(0, 20)
    : [];
  const intent = intentVerdict && intentRationale
    ? {
        verdict: intentVerdict,
        rationale: intentRationale,
        unmetRequirements: boundedStrings(intentRow?.unmetRequirements),
        outOfScopeChanges: boundedStrings(intentRow?.outOfScopeChanges),
      } satisfies PullRequestIntentAssessment
    : undefined;
  const ruleSeen = new Set<string>();
  const ruleAssessments: PullRequestRuleAssessment[] = Array.isArray(row.ruleAssessments)
    ? row.ruleAssessments.flatMap((item): PullRequestRuleAssessment[] => {
        if (!item || typeof item !== 'object') return [];
        const rule = item as Record<string, unknown>;
        const id = typeof rule.id === 'string' ? rule.id.trim().slice(0, 80) : '';
        const verdict = rule.verdict === 'pass' || rule.verdict === 'fail' || rule.verdict === 'unknown'
          ? rule.verdict
          : null;
        const rationale = typeof rule.rationale === 'string' ? rule.rationale.trim().slice(0, 4_000) : '';
        const evidence = typeof rule.evidence === 'string' ? rule.evidence.trim().slice(0, 4_000) : '';
        if (!id || !verdict || !rationale || !evidence || ruleSeen.has(id)) return [];
        ruleSeen.add(id);
        return [{ id, verdict, rationale, evidence }];
      }).slice(0, 30)
    : [];
  return { summary, validations, ruleAssessments, ...(intent ? { intent } : {}) };
}

function normalizedDefectKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function normalizedSymbol(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_$:.#-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

function agreementKey(finding: Pick<PullRequestFinding, 'file' | 'line' | 'defectKey' | 'symbol'>): string {
  const file = finding.file.toLowerCase();
  const symbol = normalizedSymbol(finding.symbol ?? '');
  return symbol
    ? `${file}:symbol:${symbol}:${finding.defectKey}`
    : `${file}:${finding.line}:${finding.defectKey}`;
}

function sameAnchoredDefect(a: PullRequestFinding, b: PullRequestFinding): boolean {
  if (a.file.toLowerCase() !== b.file.toLowerCase() || a.defectKey !== b.defectKey) return false;
  const aSymbol = normalizedSymbol(a.symbol ?? '');
  const bSymbol = normalizedSymbol(b.symbol ?? '');
  if (aSymbol && bSymbol) return aSymbol === bSymbol;
  return Math.abs(a.line - b.line) <= 12;
}

function sameRevisionDefect(
  current: PullRequestFindingAgreement,
  previous: PullRequestFindingAgreement,
  renames: readonly PullRequestFileRename[],
): boolean {
  if (current.defectKey !== previous.defectKey) return false;
  const currentFile = current.file.toLowerCase();
  const previousFile = previous.file.toLowerCase();
  const sameFile = currentFile === previousFile;
  const renamedFile = renames.some((rename) =>
    rename.from.toLowerCase() === previousFile && rename.to.toLowerCase() === currentFile);
  if (!sameFile && !renamedFile) return false;

  const currentSymbol = normalizedSymbol(current.symbol ?? '');
  const previousSymbol = normalizedSymbol(previous.symbol ?? '');
  if (currentSymbol && previousSymbol) return currentSymbol === previousSymbol;
  // File renames require a real code anchor. For legacy results on the same
  // path, a tight line window preserves the old behavior without guessing.
  return sameFile && Math.abs(current.line - previous.line) <= 12;
}

/** Parse and evidence-gate one real reviewer's terminal result. Never throws. */
export function parsePullRequestReviewResult(output: string): PullRequestStructuredReview | null {
  const json = markedJsonObject(output);
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const verdict = asVerdict(row.verdict);
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  if (!verdict || !summary || !Array.isArray(row.findings)) return null;

  const seen = new Set<string>();
  const findings: PullRequestFinding[] = [];
  for (const item of row.findings) {
    if (!item || typeof item !== 'object') continue;
    const finding = item as Record<string, unknown>;
    const file = typeof finding.file === 'string' ? finding.file.trim().replace(/^\.\//, '') : '';
    const line = typeof finding.line === 'number' && Number.isInteger(finding.line) ? finding.line : 0;
    const defectKey = typeof finding.defectKey === 'string' ? normalizedDefectKey(finding.defectKey) : '';
    const symbol = typeof finding.symbol === 'string' ? finding.symbol.trim().slice(0, 160) : '';
    const message = typeof finding.message === 'string' ? finding.message.trim() : '';
    const evidence = typeof finding.evidence === 'string' ? finding.evidence.trim() : '';
    if (!file || line < 1 || !defectKey || !message || !evidence) continue;
    const key = agreementKey({ file, line, defectKey, ...(symbol ? { symbol } : {}) });
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ file, line, defectKey, ...(symbol ? { symbol } : {}), severity: asSeverity(finding.severity), message, evidence });
  }
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);
  return { verdict, summary, findings };
}

export function aggregatePullRequestReviewEvidence(
  evidence: readonly PullRequestReviewerEvidence[],
): PullRequestReviewEvidenceView {
  // One vote per installed runtime. Canonical dispatch already dedupes this, but
  // legacy/recovered duplicate workspaces must never inflate N.
  const byRuntime = new Map<string, PullRequestReviewerEvidence>();
  for (const reviewer of evidence) {
    const current = byRuntime.get(reviewer.runtimeId);
    if (!current || (!parsePullRequestReviewResult(current.output) && parsePullRequestReviewResult(reviewer.output))) {
      byRuntime.set(reviewer.runtimeId, reviewer);
    }
  }
  const reviewers: PullRequestReviewerResult[] = [...byRuntime.values()]
    .sort((a, b) => a.runtimeId.localeCompare(b.runtimeId) || a.workspaceId.localeCompare(b.workspaceId))
    .map((reviewer) => {
    const review = parsePullRequestReviewResult(reviewer.output);
    const running = reviewer.state === 'queued' || reviewer.state === 'running';
    return {
      workspaceId: reviewer.workspaceId,
      runtimeId: reviewer.runtimeId,
      ...(reviewer.state ? { state: reviewer.state } : {}),
      status: review ? 'reported' : running ? 'running' : 'unavailable',
      ...(review ? { review } : {}),
    };
  });
  const totalReviewers = reviewers.length;
  const reportedReviewers = reviewers.filter((reviewer) => reviewer.status === 'reported').length;
  const grouped: Array<{
    finding: PullRequestFinding;
    symbol?: string;
    evidence: Set<string>;
    reviewers: Map<string, { workspaceId: string; runtimeId: string }>;
  }> = [];
  for (const reviewer of reviewers) {
    for (const finding of reviewer.review?.findings ?? []) {
      let group = grouped.find((candidate) => sameAnchoredDefect({
        ...candidate.finding,
        ...(candidate.symbol ? { symbol: candidate.symbol } : {}),
      }, finding));
      if (!group) {
        group = {
          finding,
          ...(finding.symbol ? { symbol: finding.symbol } : {}),
          evidence: new Set<string>(),
          reviewers: new Map<string, { workspaceId: string; runtimeId: string }>(),
        };
        grouped.push(group);
      } else if (!group.symbol && finding.symbol) {
        group.symbol = finding.symbol;
      }
      group.evidence.add(finding.evidence);
      group.reviewers.set(reviewer.runtimeId, {
        workspaceId: reviewer.workspaceId,
        runtimeId: reviewer.runtimeId,
      });
      if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[group.finding.severity]) group.finding = finding;
    }
  }
  const findings: PullRequestFindingAgreement[] = grouped.map((group) => {
    const anchoredFinding = {
      ...group.finding,
      ...(group.symbol ? { symbol: group.symbol } : {}),
    };
    const key = agreementKey(anchoredFinding);
    const sources = [...group.reviewers.values()]
      .sort((a, b) => a.runtimeId.localeCompare(b.runtimeId) || a.workspaceId.localeCompare(b.workspaceId));
    return {
      key,
      file: anchoredFinding.file,
      line: anchoredFinding.line,
      defectKey: anchoredFinding.defectKey,
      ...(anchoredFinding.symbol ? { symbol: anchoredFinding.symbol } : {}),
      severity: anchoredFinding.severity,
      message: anchoredFinding.message,
      evidence: [...group.evidence].sort(),
      reviewers: sources,
      reviewerCount: sources.length,
      totalReviewers,
      agreementRatio: totalReviewers > 0 ? sources.length / totalReviewers : 0,
    };
  });
  findings.sort((a, b) => b.reviewerCount - a.reviewerCount || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.key.localeCompare(b.key));
  return {
    reviewers,
    reportedReviewers,
    totalReviewers,
    findings,
    summary: totalReviewers === 0
      ? 'No reviewers were launched.'
      : `${reportedReviewers}/${totalReviewers} independent reviewer(s) reported · ${findings.length} evidence-backed finding cluster(s).`,
  };
}

/**
 * Compare adjacent PR revisions by deterministic defect class + code anchors.
 * A previous-only key is called fixed only when the entire current cohort has
 * reported; while reviewers are running/unavailable, absence is not evidence.
 */
export function comparePullRequestReviewEvidence(input: {
  readonly headSha: string;
  readonly current: PullRequestReviewEvidenceView;
  readonly previousHeadSha?: string;
  readonly previous?: PullRequestReviewEvidenceView;
  readonly renames?: readonly PullRequestFileRename[];
}): PullRequestReviewLifecycleView {
  const previousFindings = input.previous?.findings ?? [];
  const matchedPrevious = new Set<string>();
  const lifecycleFindings: PullRequestFindingLifecycleRow[] = input.current.findings.map((finding) => {
    const previous = previousFindings.find((candidate) =>
      !matchedPrevious.has(candidate.key) && candidate.key === finding.key) ??
      previousFindings.find((candidate) =>
        !matchedPrevious.has(candidate.key) && sameRevisionDefect(finding, candidate, input.renames ?? []));
    if (previous) matchedPrevious.add(previous.key);
    return {
      ...finding,
      lifecycle: previous ? 'persisting' : 'new',
      ...(previous ? {
        previousAgreement: {
          key: previous.key,
          reviewerCount: previous.reviewerCount,
          totalReviewers: previous.totalReviewers,
          reviewers: previous.reviewers,
        },
      } : {}),
    };
  });
  const fixedEvidenceComplete = input.current.totalReviewers > 0 &&
    input.current.reportedReviewers === input.current.totalReviewers;
  if (fixedEvidenceComplete) {
    for (const previous of previousFindings) {
      if (matchedPrevious.has(previous.key)) continue;
      lifecycleFindings.push({
        ...previous,
        lifecycle: 'fixed',
        reviewers: [],
        reviewerCount: 0,
        totalReviewers: input.current.totalReviewers,
        agreementRatio: 0,
        previousAgreement: {
          key: previous.key,
          reviewerCount: previous.reviewerCount,
          totalReviewers: previous.totalReviewers,
          reviewers: previous.reviewers,
        },
      });
    }
  }
  const lifecycleRank: Record<PullRequestFindingLifecycle, number> = { persisting: 0, new: 1, fixed: 2 };
  lifecycleFindings.sort((a, b) => lifecycleRank[a.lifecycle] - lifecycleRank[b.lifecycle] || b.reviewerCount - a.reviewerCount || a.key.localeCompare(b.key));
  return {
    ...input.current,
    headSha: input.headSha,
    ...(input.previousHeadSha ? { previousHeadSha: input.previousHeadSha } : {}),
    lifecycleFindings,
    fixedEvidenceComplete,
  };
}

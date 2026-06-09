export const BROWSER_VERIFIER_TOOLS = [
  'recoder.browser.open_preview',
  'recoder.browser.assert_text',
  'recoder.browser.click',
  'recoder.browser.screenshot',
  'recoder.browser.console_errors',
  'recoder.browser.network_errors',
  'recoder.browser.accessibility_smoke',
] as const;

export type BrowserVerifierTool = (typeof BROWSER_VERIFIER_TOOLS)[number];

export type BrowserVerificationPlan = {
  planId: string;
  taskId: string;
  previewUrl: string;
  checks: Array<{
    tool: BrowserVerifierTool;
    target?: string;
    expected?: string;
  }>;
};

export type BrowserVerificationArtifact = {
  artifactId: string;
  taskId: string;
  kind: 'screenshot' | 'console_log' | 'network_log' | 'trace' | 'verification_summary';
  pathOrUrl?: string;
  summary: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type BrowserVerificationCheckStatus = 'passed' | 'failed' | 'skipped';

export type BrowserVerificationCheckResult = {
  tool: BrowserVerifierTool;
  status: BrowserVerificationCheckStatus;
  target?: string;
  expected?: string;
  actual?: string;
  message: string;
  artifactIds?: string[];
  metadata?: Record<string, unknown>;
};

export type BrowserVerificationResult = {
  planId: string;
  taskId: string;
  previewUrl: string;
  status: BrowserVerificationCheckStatus;
  checkedAt: string;
  checks: BrowserVerificationCheckResult[];
  artifacts: BrowserVerificationArtifact[];
};

export function createBrowserVerificationPlan(input: Omit<BrowserVerificationPlan, 'planId'>): BrowserVerificationPlan {
  return {
    ...input,
    planId: `browser_${input.taskId}`,
  };
}

export function summarizeBrowserVerification(input: {
  plan: BrowserVerificationPlan;
  checks: BrowserVerificationCheckResult[];
  artifacts?: BrowserVerificationArtifact[];
  checkedAt?: string;
}): BrowserVerificationResult {
  const status = input.checks.some((check) => check.status === 'failed')
    ? 'failed'
    : input.checks.every((check) => check.status === 'skipped')
      ? 'skipped'
      : 'passed';

  return {
    planId: input.plan.planId,
    taskId: input.plan.taskId,
    previewUrl: input.plan.previewUrl,
    status,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    checks: input.checks,
    artifacts: input.artifacts ?? [],
  };
}

export function createBrowserVerificationSummaryArtifact(input: {
  result: BrowserVerificationResult;
  artifactId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}): BrowserVerificationArtifact {
  const failedChecks = input.result.checks.filter((check) => check.status === 'failed');
  const skippedChecks = input.result.checks.filter((check) => check.status === 'skipped');
  const summary = [
    `Browser verification ${input.result.status}`,
    `Preview: ${input.result.previewUrl}`,
    `Checks: ${input.result.checks.length}`,
    failedChecks.length > 0 ? `Failed: ${failedChecks.map((check) => check.tool).join(', ')}` : undefined,
    skippedChecks.length > 0 ? `Skipped: ${skippedChecks.map((check) => check.tool).join(', ')}` : undefined,
  ].filter(Boolean).join('\n');

  return {
    artifactId: input.artifactId ?? `browser_summary_${input.result.planId}`,
    taskId: input.result.taskId,
    kind: 'verification_summary',
    summary,
    createdAt: input.createdAt ?? input.result.checkedAt,
    metadata: {
      ...(input.metadata ?? {}),
      planId: input.result.planId,
      previewUrl: input.result.previewUrl,
      status: input.result.status,
      checkCount: input.result.checks.length,
      failedCount: failedChecks.length,
      skippedCount: skippedChecks.length,
    },
  };
}

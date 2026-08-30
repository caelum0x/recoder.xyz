/** Read-only canonical Jira requirement boundary used by installed PR review. */
export interface JiraRequirement {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly url: string;
  readonly labels: readonly string[];
  readonly issueType?: string;
  readonly priority?: string;
}

export interface JiraRequirementPort {
  health(): Promise<{ readonly available: boolean; readonly reason?: string }>;
  issue(key: string): Promise<JiraRequirement | null>;
}

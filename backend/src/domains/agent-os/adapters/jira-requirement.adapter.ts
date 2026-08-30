import type { JiraRequirement, JiraRequirementPort } from '../ports/jira-requirement.port.js';

export interface JiraRequirementAdapterOptions {
  readonly baseUrl?: string | null;
  readonly email?: string | null;
  readonly apiToken?: string | null;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const JIRA_KEY = /^[A-Z][A-Z0-9]{1,19}-[1-9][0-9]*$/;

/** Jira Cloud REST v3 adapter. It is read-only and never guesses missing fields. */
export function createJiraRequirementAdapter(
  options: JiraRequirementAdapterOptions,
): JiraRequirementPort {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const email = options.email?.trim() ?? '';
  const token = options.apiToken?.trim() ?? '';
  const request = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const unavailableReason = !baseUrl
    ? 'Jira base URL is not configured'
    : !token
      ? 'Jira API token is not configured'
      : null;

  return {
    async health() {
      return unavailableReason
        ? { available: false, reason: unavailableReason }
        : { available: true };
    },
    async issue(rawKey) {
      if (unavailableReason || !baseUrl || !token) return null;
      const key = rawKey.trim().toUpperCase();
      if (!JIRA_KEY.test(key)) return null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const auth = email
          ? `Basic ${Buffer.from(`${email}:${token}`, 'utf8').toString('base64')}`
          : `Bearer ${token}`;
        const response = await request(
          `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,status,labels,issuetype,priority`,
          {
            method: 'GET',
            headers: { accept: 'application/json', authorization: auth },
            signal: controller.signal,
          },
        );
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Jira returned ${response.status}`);
        return parseJiraIssue(await response.json(), baseUrl, key);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const raw = value?.trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
      ? url.toString().replace(/\/$/, '')
      : null;
  } catch {
    return null;
  }
}

function parseJiraIssue(value: unknown, baseUrl: string, requestedKey: string): JiraRequirement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fields = row.fields && typeof row.fields === 'object' && !Array.isArray(row.fields)
    ? row.fields as Record<string, unknown>
    : null;
  const key = typeof row.key === 'string' && JIRA_KEY.test(row.key.trim().toUpperCase())
    ? row.key.trim().toUpperCase()
    : requestedKey;
  const title = typeof fields?.summary === 'string' ? fields.summary.trim().slice(0, 2_000) : '';
  if (!fields || !title) return null;
  const named = (value: unknown): string => value && typeof value === 'object' && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).name === 'string'
    ? ((value as Record<string, unknown>).name as string).trim().slice(0, 200)
    : '';
  const labels = Array.isArray(fields.labels)
    ? fields.labels.flatMap((label) => typeof label === 'string' && label.trim() ? [label.trim().slice(0, 200)] : []).slice(0, 50)
    : [];
  const issueType = named(fields.issuetype);
  const priority = named(fields.priority);
  return {
    key,
    title,
    description: jiraDocumentText(fields.description).slice(0, 20_000),
    status: named(fields.status),
    url: `${baseUrl}/browse/${encodeURIComponent(key)}`,
    labels,
    ...(issueType ? { issueType } : {}),
    ...(priority ? { priority } : {}),
  };
}

/** Flatten Jira's Atlassian Document Format without executing embedded content. */
export function jiraDocumentText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const lines: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const row = node as Record<string, unknown>;
    if (row.type === 'text' && typeof row.text === 'string') lines.push(row.text);
    if (row.type === 'hardBreak') lines.push('\n');
    if (Array.isArray(row.content)) {
      for (const child of row.content) visit(child);
      if (row.type === 'paragraph' || row.type === 'heading' || row.type === 'listItem') lines.push('\n');
    }
  };
  visit(value);
  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

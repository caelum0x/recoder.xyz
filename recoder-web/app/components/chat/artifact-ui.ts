import type { ActionResultMeta, ActionState } from '~/lib/runtime/action-runner';

export function getActionSummary(action: ActionState): string {
  switch (action.type) {
    case 'web_search':
      return `Web search: ${(action.query || '').trim() || 'query'}`;
    case 'web_crawl':
      return `Web crawl: ${(action.url || '').trim() || 'url'}`;
    case 'github_documents':
      return `GitHub docs: ${action.owner}/${action.repo}`;
    case 'copy_project':
      return `Copy project${action.newProjectName ? `: ${action.newProjectName}` : ''}`;
    case 'web_fetch':
      return `Fetch URL: ${(action.url || '').trim() || 'url'}`;
    case 'readFile':
      return `Read file: ${action.filePath}`;
    case 'listFiles':
      return `List files: ${action.path || '.'}`;
    case 'searchFiles':
      return `Search files: ${action.query}`;
    case 'str_replace':
      return `Edit file: ${action.filePath}`;
    default:
      return action.type;
  }
}

export function getActionMetaBadges(meta: ActionResultMeta): string[] {
  const badges: string[] = [];

  if (meta.provider) {
    badges.push(`provider: ${meta.provider}`);
  }
  if (typeof meta.resultCount === 'number') {
    badges.push(`results: ${meta.resultCount}`);
  }
  if (meta.capabilities?.supportsWebCrawl === false) {
    badges.push('crawl unsupported');
  }
  if (meta.capabilities?.supportsBlockedDomains === false) {
    badges.push('blockedDomains ignored');
  }
  if (meta.capabilities?.supportsAllowedDomains === false) {
    badges.push('allowedDomains ignored');
  }

  return badges;
}

export function getActionPolicyText(meta: ActionResultMeta): string | null {
  if (!meta.effectivePolicy) return null;
  const allowed = (meta.effectivePolicy.allowedDomains || []).join(', ') || 'any';
  const blocked = (meta.effectivePolicy.blockedDomains || []).join(', ') || 'none';
  return `policy: allow[${allowed}] block[${blocked}]`;
}

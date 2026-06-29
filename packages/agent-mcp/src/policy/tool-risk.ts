export type McpToolRisk = 'low' | 'medium' | 'high';

export function estimateMcpToolRisk(toolName: string): McpToolRisk {
  if (/secret|billing|deploy|production|delete|write|push|pr\.create|merge/.test(toolName)) {
    return 'high';
  }
  if (/command|browser|preview|artifact|memory|approval|repo\.diff|workspace\.diff|workspace\.create/.test(toolName)) {
    return 'medium';
  }
  return 'low';
}

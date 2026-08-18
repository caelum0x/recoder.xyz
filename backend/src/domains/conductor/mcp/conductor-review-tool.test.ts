/**
 * `recoder_review_findings` tool — proves the governed binding: an authorized caller gets
 * validated findings from the surface (identity forwarded as the gate principal), an
 * anonymous caller is refused AUTH_REQUIRED, and a missing workspaceId is rejected — never
 * touching the surface.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildConductorReviewTools, type ReviewFindingsSurface } from './conductor-review-tool.js';
import type { McpToolCaller } from '../../../shared/module-base.js';

const findings = { kept: [{ file: 'a.ts', line: 3, severity: 'high' as const, message: 'bug', evidence: 'e' }], dropped: 1, summary: '1 evidence-backed finding (1 dropped)' };

function toolOf(surface: ReviewFindingsSurface) {
  const t = buildConductorReviewTools(surface).find((x) => x.name === 'recoder_review_findings');
  if (!t) throw new Error('tool missing');
  return t;
}

const caller = (over: Partial<McpToolCaller> = {}): McpToolCaller => ({ userId: 'u1', scopes: ['read'], ...over } as McpToolCaller);

describe('recoder_review_findings tool', () => {
  it('forwards workspaceId + the caller identity (as principal) to the surface and returns its findings', async () => {
    const generateReviewFindings = vi.fn(async () => findings);
    const out = await toolOf({ generateReviewFindings }).handler({ workspaceId: 'ws9' }, caller());
    expect(out).toBe(findings);
    expect(generateReviewFindings).toHaveBeenCalledWith('ws9', expect.objectContaining({ userId: 'u1' }));
  });

  it('refuses an anonymous caller (AUTH_REQUIRED) without touching the surface', async () => {
    const generateReviewFindings = vi.fn(async () => findings);
    await expect(toolOf({ generateReviewFindings }).handler({ workspaceId: 'ws9' }, undefined)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(generateReviewFindings).not.toHaveBeenCalled();
  });

  it('rejects a missing workspaceId (never touches the surface)', async () => {
    const generateReviewFindings = vi.fn(async () => findings);
    await expect(toolOf({ generateReviewFindings }).handler({}, caller())).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
    });
    expect(generateReviewFindings).not.toHaveBeenCalled();
  });
});

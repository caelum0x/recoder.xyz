/**
 * workspace-access — ownership enforcement for mutating conductor routes.
 *
 * The 2026-07-11 enterprise audit found every workspace mutation (pr/merge/
 * message/archive/steer, batch ops) callable against ANY user's workspace by
 * any authenticated caller. This module is the single gate:
 *
 *  - solo mode (RECODER_SOLO_MODE, the single-user desktop) → allow: the one
 *    human on the machine is the tenant.
 *  - non-strict auth (migration/dev mode) → allow: identities there are
 *    anonymous placeholders, not verifiable owners.
 *  - strict mode → the VERIFIED caller must be the workspace's owner
 *    (`createdBy`) or an internal service. Fail closed when no identity is
 *    attached (should not happen under strict auth).
 *
 * Ownership is made real at create time: `stampOwner` overrides the free-text
 * body `createdBy` with the verified identity under strict auth, so records
 * carry a checkable owner instead of client-chosen text.
 */
import type { Request, Response } from 'express';
import type { Workspace } from '@recoder/agent-os';
import { isStrictAuthMode } from '../auth-utils.js';
import { isSoloMode } from './solo-mode.js';
import { getWorkspace } from './workspace-service.js';

/** The verified caller identity attached by authenticateRequest, if any. */
export function callerId(req: Request): string | undefined {
  const id = (req as Request & { userId?: string }).userId;
  return typeof id === 'string' && id ? id : undefined;
}

function isInternal(userId: string | undefined): boolean {
  return Boolean(userId?.startsWith('internal:'));
}

/** Pure decision: may this caller mutate this workspace? */
export function canAccessWorkspace(
  userId: string | undefined,
  workspace: Pick<Workspace, 'createdBy'>,
): boolean {
  if (isSoloMode()) return true;
  if (!isStrictAuthMode()) return true;
  if (isInternal(userId)) return true;
  if (!userId) return false;
  return workspace.createdBy === userId;
}

/**
 * Load the workspace and enforce ownership. Sends the truthful 404/403 itself
 * and returns null so handlers can simply `if (!workspace) return;`.
 */
export async function requireWorkspaceAccess(
  req: Request,
  res: Response,
  workspaceId: string,
): Promise<Workspace | null> {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    res.status(404).json({ success: false, error: 'workspace not found' });
    return null;
  }
  if (!canAccessWorkspace(callerId(req), workspace)) {
    res.status(403).json({
      success: false,
      error: 'forbidden: this workspace belongs to another user',
    });
    return null;
  }
  return workspace;
}

/**
 * The owner to persist at create time: under strict auth the VERIFIED caller
 * identity wins over any client-supplied free text (a client must not be able
 * to create records it cannot later access, nor squat another user's name).
 * Internal services keep the caller-declared value (they act on behalf of
 * workflows, not as an owner).
 */
export function stampOwner(req: Request, requestedCreatedBy: string): string {
  const uid = callerId(req);
  if (isStrictAuthMode() && uid && !isInternal(uid)) return uid;
  return requestedCreatedBy;
}

/**
 * Scope a batch-operation filter to the verified caller: under strict auth a
 * non-internal caller can only batch-act on their OWN workspaces, regardless
 * of what filter the body claims. Solo/dev modes and internal services keep
 * the caller-supplied filter.
 */
export function scopeBatchFilter<T extends { createdBy?: string }>(
  req: Request,
  filter: T,
): T {
  const uid = callerId(req);
  if (isSoloMode() || !isStrictAuthMode() || isInternal(uid)) return filter;
  // Fail closed: no verified identity under strict auth matches nothing.
  return { ...filter, createdBy: uid ?? '__unauthenticated__' };
}

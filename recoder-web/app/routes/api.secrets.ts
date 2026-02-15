/**
 * Secret Operations API
 *
 * Handles secure secret management following giselle HTTP router patterns.
 *
 * GET /api/secrets?workspaceId=xxx - Get secrets for a workspace (masked values)
 * GET /api/secrets?workspaceId=xxx&tags=tag1,tag2 - Get secrets filtered by tags
 * POST /api/secrets - Add a new secret
 * POST /api/secrets?action=encrypt - Encrypt a secret value
 * DELETE /api/secrets - Delete a secret
 */

import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { z } from 'zod';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Secrets');
import {
  addSecret,
  deleteSecret,
  encryptSecretValue,
  findWorkspaceSecretByLabel,
  generateSecretId,
  getSecret,
  listSecretsForWorkspace,
  maskSecretValue,
} from '~/lib/.server/workspaces/workspace-vault-store';

// Dynamic import for session verification
async function verifySession(request: Request) {
  const { verifySession: verify } = await import('~/lib/auth/session.server');
  return verify(request);
}

// Request body type
interface SecretRequestBody {
  secretId?: string;
  workspaceId?: string;
  label?: string;
  value?: string;
  tags?: string[];
  plaintext?: string;
}

// Schema definitions
const SecretId = z.string().min(1).brand<'SecretId'>();
const WorkspaceId = z.string().min(1);

const Secret = z.object({
  id: SecretId,
  workspaceId: WorkspaceId.optional(),
  label: z.string().min(1),
  // Value is never exposed in API responses - only stored internally
  encryptedValue: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const AddSecretInput = z.object({
  workspaceId: WorkspaceId.optional(),
  label: z.string().min(1),
  value: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

const EncryptSecretInput = z.object({
  plaintext: z.string().min(1),
});

type SecretType = z.infer<typeof Secret>;

/**
 * GET /api/secrets
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const tagsParam = url.searchParams.get('tags');
    const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()) : undefined;

    if (!workspaceId) {
      return json({ success: false, error: 'workspaceId required' }, { status: 400 });
    }

    // Get secrets for workspace
    let secrets = listSecretsForWorkspace(workspaceId) as Array<SecretType & { rawValue: string }>;

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      secrets = secrets.filter((s) =>
        s.tags?.some((tag) => tags.includes(tag))
      );
    }

    // Return secrets with masked values (never expose actual values)
    const maskedSecrets = secrets.map((s) => ({
      id: s.id,
      workspaceId: s.workspaceId,
      label: s.label,
      maskedValue: maskSecretValue(s.rawValue),
      tags: s.tags,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    return json({ success: true, secrets: maskedSecrets });
  } catch (error) {
    logger.error('[Secrets] Loader error:', error);
    return json({
      success: false,
      error: 'Failed to get secrets',
    }, { status: 500 });
  }
}

/**
 * POST /api/secrets - Add secret
 * DELETE /api/secrets - Delete secret
 */
export async function action({ request }: ActionFunctionArgs) {
  const session = await verifySession(request);
  if (!session?.user) {
    return json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const actionType = url.searchParams.get('action');
    const body = await request.json();

    // Encrypt a secret value (utility endpoint)
    if (actionType === 'encrypt') {
      const validation = EncryptSecretInput.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const encrypted = encryptSecretValue(validation.data.plaintext);

      return json({ success: true, encrypted });
    }

    // POST - Add new secret
    if (request.method === 'POST') {
      const validation = AddSecretInput.safeParse(body);
      if (!validation.success) {
        return json({
          success: false,
          error: 'Invalid input',
          details: validation.error.errors,
        }, { status: 400 });
      }

      const secretId = generateSecretId();
      const now = new Date().toISOString();

      // Check for duplicate labels in the same workspace
      const existingSecret = findWorkspaceSecretByLabel(validation.data.workspaceId, validation.data.label);

      if (existingSecret) {
        return json({
          success: false,
          error: `Secret with label "${validation.data.label}" already exists`,
        }, { status: 409 });
      }

      const newSecret: SecretType & { rawValue: string } = {
        id: secretId as any,
        workspaceId: validation.data.workspaceId,
        label: validation.data.label,
        encryptedValue: encryptSecretValue(validation.data.value),
        rawValue: validation.data.value, // In production, this would be encrypted
        tags: validation.data.tags,
        createdAt: now,
        updatedAt: now,
        metadata: { userId: session.user.id },
      };

      addSecret(newSecret as any);

      logger.info(`[Secrets] Added: ${secretId} (${validation.data.label})`);

      // Return secret info without the actual value
      return json({
        success: true,
        secret: {
          id: secretId,
          workspaceId: validation.data.workspaceId,
          label: validation.data.label,
          tags: validation.data.tags,
          createdAt: now,
        },
      });
    }

    // DELETE - Delete secret
    if (request.method === 'DELETE') {
      const secretId = (body as SecretRequestBody).secretId;

      if (!secretId) {
        return json({ success: false, error: 'Secret ID required' }, { status: 400 });
      }

      const secret = getSecret(secretId);

      if (!secret) {
        return json({ success: false, error: 'Secret not found' }, { status: 404 });
      }

      // Check ownership
      if ((secret.metadata as any)?.userId !== session.user.id) {
        return json({ success: false, error: 'Access denied' }, { status: 403 });
      }

      deleteSecret(secretId);

      logger.info(`[Secrets] Deleted: ${secretId}`);
      return new Response(null, { status: 204 });
    }

    return json({ success: false, error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('[Secrets] Action error:', error);
    return json({
      success: false,
      error: 'Secret operation failed',
    }, { status: 500 });
  }
}

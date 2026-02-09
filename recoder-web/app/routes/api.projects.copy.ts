import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import * as z from 'zod/v4';
import { logToolAuditEvent } from '~/lib/.server/audit/tool-audit';
import { ProjectsDB } from '~/lib/.server/db/projects-db';
import { copyWorkspaceGraph, validateWorkspaceGraph } from '~/lib/.server/workspaces/graph-copy';
import { copySecretsToWorkspace } from '~/lib/.server/workspaces/workspace-vault-store';
import { copyTriggersToWorkspace } from '~/lib/.server/workspaces/triggers-store';
import { verifySession } from '~/lib/auth/session.server';
import { createDockerProxyHeaders, dockerFetchJson, getDockerBackendUrl } from '~/lib/http/docker-server';
import { JsonResponse } from '~/lib/http/json-response';
import {
  authRequired,
  methodNotAllowed,
  parseJsonWithSchema,
} from '~/lib/http/request-validation';

const CopyProjectRequestSchema = z.object({
  sourceProjectId: z.string().trim().min(1, 'sourceProjectId is required'),
  newProjectName: z.string().trim().optional(),
  includeGit: z.boolean().optional(),
  includeGitRemotes: z.boolean().optional(),
  includeTriggers: z.boolean().optional(),
  includeEnvFiles: z.boolean().optional(),
  includeSecrets: z.boolean().optional(),
  includeDeployConfig: z.boolean().optional(),
  includeDomains: z.boolean().optional(),
  /** Include workspace graph (nodes/connections) in the copy */
  includeWorkspaceGraph: z.boolean().optional(),
  /** Client-side workspace graph to duplicate (nodes + connections) */
  workspaceGraph: z.unknown().optional(),
});

const MAX_PROJECT_ID_LENGTH = 120;
const MAX_PROJECT_NAME_LENGTH = 120;

function deriveCopyName(sourceName: string, existingNames: Set<string>, preferred?: string): string {
  if (preferred && !existingNames.has(preferred)) {
    return preferred;
  }

  const base = `${sourceName} (Copy)`;
  if (!existingNames.has(base)) {
    return base;
  }

  let i = 2;
  while (existingNames.has(`${sourceName} (Copy ${i})`)) {
    i += 1;
  }
  return `${sourceName} (Copy ${i})`;
}

function sanitizeCopiedMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  const sanitized = { ...(metadata as Record<string, unknown>) };
  const staleKeys = [
    'copiedFrom',
    'copiedAt',
    'includeGit',
    'includeGitRemotes',
    'includeTriggers',
    'forkedFrom',
    'forkedAt',
    'forkPlanId',
    'deploymentStatus',
    'productionDeployUrl',
    'deployedAt',
    'customDomain',
    'customDomainStatus',
    'customDomainVerifiedAt',
    'sslStatus',
    'ownershipVerification',
  ];

  for (const key of staleKeys) {
    delete sanitized[key];
  }

  return sanitized;
}

async function ensureContainer(
  dockerUrl: string,
  projectId: string,
  headers: Record<string, string>,
): Promise<void> {
  try {
    await dockerFetchJson<unknown>(
      `${dockerUrl}/api/container`,
      {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      },
      headers,
    );
  } catch (error) {
    throw new Error(
      `Failed to prepare container for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return methodNotAllowed();
  }

  const session = await verifySession(request);
  if (!session?.user) {
    return authRequired();
  }
  const userId = session.user.id;

  try {
    const parsed = await parseJsonWithSchema(request, CopyProjectRequestSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const sourceProjectId = body.sourceProjectId;
    const includeGit = Boolean(body.includeGit);
    const includeGitRemotes = includeGit && Boolean(body.includeGitRemotes);
    const includeTriggers = Boolean(body.includeTriggers);
    const includeEnvFiles = Boolean(body.includeEnvFiles);
    const includeSecrets = Boolean(body.includeSecrets);
    const includeDeployConfig = Boolean(body.includeDeployConfig);
    const includeDomains = Boolean(body.includeDomains);
    const includeWorkspaceGraph = Boolean(body.includeWorkspaceGraph);

    if (sourceProjectId.length > MAX_PROJECT_ID_LENGTH) {
      return JsonResponse.json({ success: false, error: `sourceProjectId exceeds max length ${MAX_PROJECT_ID_LENGTH}` }, { status: 400 });
    }
    if ((body.newProjectName || '').length > MAX_PROJECT_NAME_LENGTH) {
      return JsonResponse.json({ success: false, error: `newProjectName exceeds max length ${MAX_PROJECT_NAME_LENGTH}` }, { status: 400 });
    }

    const env = context?.cloudflare?.env || process.env || {};
    const databaseUrl = (env as any).DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      return JsonResponse.json({ success: false, error: 'Database not configured' }, { status: 500 });
    }

    const projectsDB = new ProjectsDB(databaseUrl);
    const sourceProject = await projectsDB.getProject(sourceProjectId, session.user.id);
    if (!sourceProject) {
      logToolAuditEvent({
        route: '/api/projects/copy',
        action: 'copy_project',
        userId,
        status: 'blocked',
        reason: 'source_project_not_found',
        meta: { sourceProjectId },
      });
      return JsonResponse.json({ success: false, error: 'Source project not found' }, { status: 404 });
    }

    const userProjects = await projectsDB.getUserProjects(session.user.id);
    const existingNames = new Set(userProjects.map((p) => p.name));
    const newProjectName = deriveCopyName(sourceProject.name, existingNames, body.newProjectName?.trim());
    const sanitizedMetadata = sanitizeCopiedMetadata(sourceProject.metadata);

    const copiedProject = await projectsDB.createProject({
      name: newProjectName,
      description: sourceProject.description || `Copied from ${sourceProject.name}`,
      type: sourceProject.type,
      framework: sourceProject.framework,
      language: sourceProject.language,
      isPrivate: sourceProject.isPrivate,
      userId: session.user.id,
      templateId: sourceProject.templateId,
      starterPath: sourceProject.starterPath,
      config: sourceProject.config || {},
      knowledge: sourceProject.knowledge ?? undefined,
      messageHistory: sourceProject.messageHistory ?? undefined,
      metadata: {
        ...sanitizedMetadata,
        copiedFrom: sourceProject.id,
        copiedAt: new Date().toISOString(),
        includeGit,
        includeGitRemotes,
        includeTriggers,
        copyPolicy: {
          includeGitRemotes,
          includeTriggers,
          includeEnvFiles,
          includeSecrets,
          includeDeployConfig,
          includeDomains,
          includeWorkspaceGraph,
        },
      },
    });

    const dockerUrl = getDockerBackendUrl(context);
    const dockerHeaders = createDockerProxyHeaders(request);

    try {
      // Ensure both source and target containers exist before workspace transfer.
      await ensureContainer(dockerUrl, sourceProjectId, dockerHeaders);
      await ensureContainer(dockerUrl, copiedProject.id, dockerHeaders);

      await dockerFetchJson<unknown>(
        `${dockerUrl}/api/workspace/copy`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceProjectId,
            targetProjectId: copiedProject.id,
            includeGit,
            includeGitRemotes,
            includeTriggers,
            includeEnvFiles,
            includeSecrets,
            includeDeployConfig,
            includeDomains,
          }),
        },
        dockerHeaders,
      );

      let copiedSecrets = 0;
      let copiedTriggers = 0;
      let triggerIdMap: Record<string, string> = {};
      if (includeSecrets) {
        copiedSecrets = copySecretsToWorkspace(sourceProjectId, copiedProject.id, userId).copied;
      }
      if (includeTriggers) {
        const copiedTriggerResult = copyTriggersToWorkspace(sourceProjectId, copiedProject.id, userId);
        copiedTriggers = copiedTriggerResult.copied;
        triggerIdMap = copiedTriggerResult.idMap;
      }
      // Duplicate workspace graph (nodes + connections) with fresh IDs
      let copiedGraphIdMap: Record<string, Record<string, string>> | undefined;
      if (includeWorkspaceGraph && body.workspaceGraph) {
        const graph = validateWorkspaceGraph(body.workspaceGraph);
        if (graph) {
          const copiedGraph = copyWorkspaceGraph(graph);

          // If triggers were remapped, propagate trigger ID changes into the copied graph nodes
          if (Object.keys(triggerIdMap).length > 0) {
            for (const node of copiedGraph.nodes) {
              if (node.data) {
                node.data = JSON.parse(
                  JSON.stringify(node.data).replace(
                    new RegExp(Object.keys(triggerIdMap).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g'),
                    (match) => triggerIdMap[match] || match,
                  ),
                );
              }
            }
          }

          copiedGraphIdMap = copiedGraph.idMap;
          copiedProject.metadata = {
            ...(copiedProject.metadata || {}),
            workspaceGraph: {
              nodes: copiedGraph.nodes,
              connections: copiedGraph.connections,
              metadata: copiedGraph.metadata,
            },
          };
        }
      }

      copiedProject.metadata = {
        ...(copiedProject.metadata || {}),
        linkedAssetCopy: {
          copiedSecrets,
          copiedTriggers,
          triggerIdMap,
          ...(copiedGraphIdMap ? { graphIdMap: copiedGraphIdMap } : {}),
        },
      };
    } catch (copyError) {
      // Roll back DB project if workspace copy fails.
      await projectsDB.deleteProject(copiedProject.id, session.user.id);
      throw copyError;
    }

    logToolAuditEvent({
      route: '/api/projects/copy',
      action: 'copy_project',
      userId,
      status: 'success',
      meta: {
        sourceProjectId,
        targetProjectId: copiedProject.id,
        includeGit,
        includeGitRemotes,
        includeTriggers,
        includeEnvFiles,
        includeSecrets,
        includeDeployConfig,
        includeDomains,
        includeWorkspaceGraph,
        linkedAssetCopy: (copiedProject.metadata as Record<string, unknown>)?.linkedAssetCopy || {},
      },
    });

    return JsonResponse.json({
      success: true,
      project: copiedProject,
      sourceProject: {
        id: sourceProject.id,
        name: sourceProject.name,
      },
    });
  } catch (error) {
    logToolAuditEvent({
      route: '/api/projects/copy',
      action: 'copy_project',
      userId,
      status: 'error',
      reason: error instanceof Error ? error.message : 'copy_project_failed',
    });
    console.error('[api.projects.copy] Error:', error);
    return JsonResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to copy project',
    }, { status: 500 });
  }
}

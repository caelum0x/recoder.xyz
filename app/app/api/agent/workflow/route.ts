import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createSubagentWorkflowPlan } from '@/lib/subagent-workflow';

type WorkflowRequest = {
  task?: string;
  paths?: string[];
  continuous?: boolean;
  projectId?: string;
};

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (authResult.error) {
      return authResult.response;
    }

    const body = (await request.json().catch(() => ({}))) as WorkflowRequest;
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const paths = Array.isArray(body.paths)
      ? body.paths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : undefined;
    const continuous = body.continuous !== false;
    const projectId = typeof body.projectId === 'string' && body.projectId.trim().length > 0
      ? body.projectId.trim()
      : undefined;

    let workflow = createSubagentWorkflowPlan({
      task: task || 'continuous subagent workflow',
      requestedPaths: paths,
      continuous,
    });
    let source: 'docker-backend' | 'local-fallback' = 'local-fallback';

    const dockerBase =
      process.env.DOCKER_URL
      || process.env.NEXT_PUBLIC_DOCKER_URL
      || process.env.DOCKER_BACKEND_URL
      || process.env.NEXT_PUBLIC_DOCKER_BACKEND_URL
      || 'http://localhost:3100';

    try {
      const authHeader = request.headers.get('authorization');
      const cookieHeader = request.headers.get('cookie');
      const endpoint = projectId
        ? `${dockerBase}/api/agent/workflow/${encodeURIComponent(projectId)}`
        : `${dockerBase}/api/agent/workflow`;
      const dockerResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeader ? { Authorization: authHeader } : {}),
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({
          task: task || 'continuous subagent workflow',
          paths,
          continuous,
        }),
      });

      if (dockerResponse.ok) {
        const dockerPayload = await dockerResponse.json() as { workflow?: typeof workflow };
        if (dockerPayload.workflow) {
          workflow = dockerPayload.workflow;
          source = 'docker-backend';
        }
      }
    } catch {
      // Keep local fallback workflow; docker-backend may be unavailable in local mode.
    }

    return NextResponse.json({
      success: true,
      workflow,
      source,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Workflow execution failed' },
      { status: 500 },
    );
  }
}

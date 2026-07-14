/**
 * Cross-App A2A Workflows
 *
 * Predefined workflows that connect Recoder platform services:
 * - Agents → PM: Create tasks/tickets from AI conversations
 * - PM → Agency: Generate deliverables from project specs
 * - Agency → Agents: Trigger AI analysis for client deliverables
 * - Web → PM: Create PM features from web-generated projects
 * - Agency → Agents → Agency: Analyze client briefs and generate quotes
 * - OpenClaw → All: Route social channel messages to appropriate platform
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from './logger.js';

const logger = createLogger('a2a-cross-app-workflows');

// ── Configuration ──

const PM_URL = process.env.RECODER_PM_URL || 'http://host.docker.internal:3004';
const AGENCY_URL = process.env.RECODER_AGENCY_URL || 'http://host.docker.internal:3007';
const AGENTS_BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://host.docker.internal:8000';

// ── Types ──

interface WorkflowTrigger {
  source: 'agents' | 'pm' | 'agency' | 'openclaw' | 'web';
  action: string;
  data: Record<string, unknown>;
  userId?: string;
  threadId?: string;
  traceId?: string;
}

interface WorkflowResult {
  workflow: string;
  success: boolean;
  targets: Array<{
    service: string;
    status: number;
    response?: unknown;
    error?: string;
  }>;
}

// ── Workflow Definitions ──

/**
 * Agents → PM: Create a task from an AI conversation.
 * Triggered when an agent completes a planning action or the user
 * explicitly requests ticket creation.
 */
async function agentsToPmCreateTask(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const targets = [];

  try {
    const response = await fetch(`${PM_URL}/api/webhooks/a2a`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Source': 'agents',
        'X-A2A-Action': 'create-task',
      },
      body: JSON.stringify({
        action: 'create-task',
        source: 'agents',
        data: {
          title: trigger.data.title || 'AI-generated task',
          description: trigger.data.description || '',
          priority: trigger.data.priority || 'medium',
          threadId: trigger.threadId,
          sourceAgent: trigger.data.agentId,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    targets.push({
      service: 'pm',
      status: response.status,
      response: response.ok ? await response.json().catch(() => null) : null,
    });
  } catch (err) {
    targets.push({
      service: 'pm',
      status: 0,
      error: (err as Error).message,
    });
  }

  return {
    workflow: 'agents-to-pm-create-task',
    success: targets.some((t) => t.status >= 200 && t.status < 300),
    targets,
  };
}

/**
 * PM → Agency: Generate a deliverable from project specs.
 * Triggered when a PM project transitions to "ready for delivery".
 */
async function pmToAgencyCreateDeliverable(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const targets = [];

  try {
    const response = await fetch(`${AGENCY_URL}/api/webhooks/a2a`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Source': 'pm',
        'X-A2A-Action': 'create-deliverable',
      },
      body: JSON.stringify({
        action: 'create-deliverable',
        source: 'pm',
        data: {
          projectName: trigger.data.projectName,
          specs: trigger.data.specs,
          deadline: trigger.data.deadline,
          clientId: trigger.data.clientId,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    targets.push({
      service: 'agency',
      status: response.status,
      response: response.ok ? await response.json().catch(() => null) : null,
    });
  } catch (err) {
    targets.push({
      service: 'agency',
      status: 0,
      error: (err as Error).message,
    });
  }

  return {
    workflow: 'pm-to-agency-create-deliverable',
    success: targets.some((t) => t.status >= 200 && t.status < 300),
    targets,
  };
}

/**
 * Agency → Agents: Trigger AI analysis for a deliverable.
 * Triggered when agency needs AI review of code, docs, or designs.
 */
async function agencyToAgentsAnalyze(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const targets = [];

  try {
    const response = await fetch(`${AGENTS_BACKEND_URL}/v1/agent/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${trigger.data.apiToken || ''}`,
      },
      body: new URLSearchParams({
        prompt: String(trigger.data.prompt || 'Analyze this deliverable'),
        optimistic: 'false',
      }).toString(),
      signal: AbortSignal.timeout(30000),
    });

    targets.push({
      service: 'agents',
      status: response.status,
      response: response.ok ? await response.json().catch(() => null) : null,
    });
  } catch (err) {
    targets.push({
      service: 'agents',
      status: 0,
      error: (err as Error).message,
    });
  }

  return {
    workflow: 'agency-to-agents-analyze',
    success: targets.some((t) => t.status >= 200 && t.status < 300),
    targets,
  };
}

/**
 * Web → PM: Create a project feature from generated code.
 * Triggered when Spaces creates a project (project.created event),
 * so PM can track it as a feature/deliverable.
 */
async function webToPmCodeToProject(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const targets = [];

  try {
    const response = await fetch(`${PM_URL}/api/webhooks/a2a`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-A2A-Source': 'web',
        'X-A2A-Action': 'create-feature',
      },
      body: JSON.stringify({
        action: 'create-feature',
        source: 'web',
        data: {
          name: trigger.data.name || trigger.data.projectName || 'Untitled Project',
          description: trigger.data.description || '',
          techStack: trigger.data.techStack || [],
          sourceProjectId: trigger.data.projectId,
          userId: trigger.userId,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    targets.push({
      service: 'pm',
      status: response.status,
      response: response.ok ? await response.json().catch(() => null) : null,
    });
  } catch (err) {
    targets.push({
      service: 'pm',
      status: 0,
      error: (err as Error).message,
    });
  }

  return {
    workflow: 'web-to-pm-code-to-project',
    success: targets.some((t) => t.status >= 200 && t.status < 300),
    targets,
  };
}

/**
 * Agency → Agents → Agency: Analyze a client brief with AI.
 * Triggered when agency receives a new client brief (brief.submitted event).
 * Sends the brief to an agent for analysis, then routes the result back
 * to agency as a quote update with scope, timeline, and pricing suggestions.
 */
async function agencyBriefToAgent(trigger: WorkflowTrigger): Promise<WorkflowResult> {
  const targets = [];

  const briefContent = trigger.data.briefContent || trigger.data.content || '';
  const clientName = trigger.data.clientName || 'Unknown Client';
  const briefId = trigger.data.briefId || '';

  const analysisPrompt =
    `Analyze this client brief and suggest scope, timeline, and pricing:\n\n` +
    `Client: ${clientName}\n` +
    `Brief: ${briefContent}`;

  // Step 1: Send to agents backend for AI analysis
  try {
    const agentResponse = await fetch(`${AGENTS_BACKEND_URL}/v1/agent/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${trigger.data.apiToken || ''}`,
      },
      body: new URLSearchParams({
        prompt: analysisPrompt,
        optimistic: 'false',
      }).toString(),
      signal: AbortSignal.timeout(30000),
    });

    const agentResult = agentResponse.ok ? await agentResponse.json().catch(() => null) : null;

    targets.push({
      service: 'agents',
      status: agentResponse.status,
      response: agentResult,
    });

    // Step 2: Forward analysis result back to agency as a quote update
    if (agentResponse.ok && agentResult) {
      try {
        const quoteResponse = await fetch(`${AGENCY_URL}/api/webhooks/a2a`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-A2A-Source': 'agents',
            'X-A2A-Action': 'update-quote',
          },
          body: JSON.stringify({
            action: 'update-quote',
            source: 'agents',
            data: {
              briefId,
              clientName,
              analysis: agentResult,
              userId: trigger.userId,
            },
          }),
          signal: AbortSignal.timeout(10000),
        });

        targets.push({
          service: 'agency',
          status: quoteResponse.status,
          response: quoteResponse.ok ? await quoteResponse.json().catch(() => null) : null,
        });
      } catch (err) {
        targets.push({
          service: 'agency',
          status: 0,
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    targets.push({
      service: 'agents',
      status: 0,
      error: (err as Error).message,
    });
  }

  return {
    workflow: 'agency-brief-to-agent',
    success: targets.some((t) => t.status >= 200 && t.status < 300),
    targets,
  };
}

// ── Workflow Registry ──

const workflows: Record<string, (trigger: WorkflowTrigger) => Promise<WorkflowResult>> = {
  'agents-to-pm-create-task': agentsToPmCreateTask,
  'pm-to-agency-create-deliverable': pmToAgencyCreateDeliverable,
  'agency-to-agents-analyze': agencyToAgentsAnalyze,
  'web-to-pm-code-to-project': webToPmCodeToProject,
  'agency-brief-to-agent': agencyBriefToAgent,
};

// ── Router ──

export const crossAppWorkflowRouter = Router();

/**
 * POST /api/a2a/workflows/trigger
 * Trigger a cross-app workflow.
 */
crossAppWorkflowRouter.post('/trigger', async (req: Request, res: Response) => {
  const { workflow, source, action, data, userId, threadId } = req.body;

  if (!workflow || !workflows[workflow]) {
    return res.status(400).json({
      error: 'Invalid workflow',
      available: Object.keys(workflows),
    });
  }

  const trigger: WorkflowTrigger = {
    source: source || 'unknown',
    action: action || workflow,
    data: data || {},
    userId,
    threadId,
    traceId: req.headers['x-trace-id'] as string,
  };

  logger.info({ workflow, source, action }, 'Triggering cross-app workflow');

  try {
    const result = await workflows[workflow](trigger);
    logger.info({ workflow, success: result.success }, 'Workflow completed');
    res.json(result);
  } catch (err) {
    logger.error({ workflow, err }, 'Workflow failed');
    res.status(500).json({
      workflow,
      success: false,
      error: (err as Error).message,
    });
  }
});

/**
 * GET /api/a2a/workflows
 * List available workflows.
 */
crossAppWorkflowRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    workflows: Object.keys(workflows).map((name) => ({
      name,
      description: {
        'agents-to-pm-create-task': 'Create PM task from agent conversation',
        'pm-to-agency-create-deliverable': 'Generate agency deliverable from PM project',
        'agency-to-agents-analyze': 'Trigger AI analysis of agency deliverable',
        'web-to-pm-code-to-project': 'Create PM feature from web-generated project',
        'agency-brief-to-agent': 'Analyze client brief with AI and update agency quote',
      }[name],
    })),
  });
});

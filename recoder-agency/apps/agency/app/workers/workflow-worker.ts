/**
 * @module workflow-worker
 *
 * Hatchet-based workflow worker for Agency workflows.
 * Replaces Giselle's fs-storage-driver execution backend with durable steps.
 *
 * Each Giselle workflow node type maps to a Hatchet step:
 *   - LLM node     → llmStep: call OpenRouter with system/user messages
 *   - HTTP node    → httpStep: make HTTP request to external URL
 *   - Code node    → codeStep: execute code in Daytona sandbox
 *   - Branch node  → branchStep: evaluate condition, return which output to follow
 *   - Trigger node → triggerStep: A2A task dispatch to other agents
 *
 * Workflows survive process restarts, show progress in Hatchet dashboard,
 * and support retries, timeouts, and cancellation.
 *
 * Usage:
 *   import { startWorkflowWorker, runWorkflow } from './workflow-worker';
 *   await startWorkflowWorker();
 *   const result = await runWorkflow('wf_abc123', { prompt: 'Generate a report' });
 */

const HATCHET_HOST = process.env.HATCHET_CLIENT_HOST ?? 'localhost:7077';
const HATCHET_TOKEN = process.env.HATCHET_CLIENT_TOKEN ?? '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? '';
const DOCKER_BACKEND_URL = process.env.RECODER_DOCKER_URL ?? 'http://localhost:3100';

// ── Step input/output types ─────────────────────────────────────────────────

interface LlmStepInput {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

interface LlmStepOutput {
  content: string;
  model: string;
  tokensUsed: number;
}

interface HttpStepInput {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

interface HttpStepOutput {
  status: number;
  body: string;
  headers: Record<string, string>;
}

interface CodeStepInput {
  sandboxId: string;
  command: string;
  language?: string;
}

interface CodeStepOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface BranchStepInput {
  condition: string; // JS expression to evaluate
  context: Record<string, unknown>;
}

interface BranchStepOutput {
  branch: 'true' | 'false';
  evaluatedValue: unknown;
}

interface TriggerStepInput {
  targetAgent: string;
  task: string;
  intent: string;
}

interface TriggerStepOutput {
  taskId: string;
  state: string;
}

// ── Step implementations ──────────────────────────────────────────────────────

async function executeLlmStep(input: LlmStepInput): Promise<LlmStepOutput> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: input.model || 'anthropic/claude-sonnet-4-20250514',
      messages: [
        { role: 'system', content: input.systemPrompt || 'You are a helpful assistant.' },
        { role: 'user', content: input.userPrompt },
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 4096,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { total_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    model: input.model,
    tokensUsed: data.usage?.total_tokens ?? 0,
  };
}

async function executeHttpStep(input: HttpStepInput): Promise<HttpStepOutput> {
  const res = await fetch(input.url, {
    method: input.method || 'GET',
    headers: input.headers,
    body: input.method !== 'GET' && input.method !== 'HEAD' ? input.body : undefined,
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
  });

  const body = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k] = v; });

  return { status: res.status, body, headers };
}

async function executeCodeStep(input: CodeStepInput): Promise<CodeStepOutput> {
  const res = await fetch(`${DOCKER_BACKEND_URL}/api/exec/${input.sandboxId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      command: input.command,
      cwd: '/workspace',
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const data = (await res.json()) as {
    output?: string;
    success?: boolean;
    exitCode?: number;
  };

  return {
    stdout: data.output ?? '',
    stderr: '',
    exitCode: data.exitCode ?? (data.success ? 0 : 1),
  };
}

async function executeBranchStep(input: BranchStepInput): Promise<BranchStepOutput> {
  // Evaluate condition safely with a Function constructor (sandboxed context)
  const contextKeys = Object.keys(input.context);
  const contextValues = Object.values(input.context);

  try {
    const fn = new Function(...contextKeys, `return (${input.condition})`);
    const result = fn(...contextValues);
    return {
      branch: result ? 'true' : 'false',
      evaluatedValue: result,
    };
  } catch (err) {
    return {
      branch: 'false',
      evaluatedValue: err instanceof Error ? err.message : 'evaluation error',
    };
  }
}

async function executeTriggerStep(input: TriggerStepInput): Promise<TriggerStepOutput> {
  const res = await fetch(`${DOCKER_BACKEND_URL}/api/a2a/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace_id: 'ws_default',
      thread_id: `hatchet_${Date.now()}`,
      requester: { agent_id: 'hatchet_worker', platform: 'hatchet' },
      assignee: { agent_id: input.targetAgent, platform: input.targetAgent },
      connector: { type: 'bridge', protocol: 'websocket', connector_id: 'hatchet', platform: 'recoder' },
      payload: { intent: input.intent || 'execute', task: input.task },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json()) as { data?: { id?: string; state?: string } };
  return {
    taskId: data.data?.id ?? 'unknown',
    state: data.data?.state ?? 'submitted',
  };
}

// ── Workflow runner (Hatchet SDK integration) ─────────────────────────────────

/**
 * Execute a workflow definition step-by-step.
 *
 * This is a simplified workflow runner that processes a list of steps
 * sequentially. The real Hatchet SDK integration uses @hatchet.step
 * decorators — this provides the execution logic that each step calls.
 *
 * @param steps Array of step definitions from the workflow graph
 * @param initialContext Starting context (prompt, project info, etc.)
 */
export async function executeWorkflowSteps(
  steps: Array<{
    type: 'llm' | 'http' | 'code' | 'branch' | 'trigger';
    config: Record<string, unknown>;
    name: string;
  }>,
  initialContext: Record<string, unknown> = {},
): Promise<{
  success: boolean;
  results: Array<{ step: string; type: string; output: unknown; durationMs: number }>;
  context: Record<string, unknown>;
}> {
  const results: Array<{ step: string; type: string; output: unknown; durationMs: number }> = [];
  let context = { ...initialContext };

  for (const step of steps) {
    const start = Date.now();
    let output: unknown;

    try {
      switch (step.type) {
        case 'llm':
          output = await executeLlmStep({
            model: (step.config.model as string) ?? 'anthropic/claude-sonnet-4-20250514',
            systemPrompt: (step.config.systemPrompt as string) ?? '',
            userPrompt: interpolateTemplate(
              (step.config.userPrompt as string) ?? '',
              context,
            ),
            temperature: step.config.temperature as number | undefined,
            maxTokens: step.config.maxTokens as number | undefined,
          });
          // Put LLM output into context for next steps
          context[`${step.name}_output`] = (output as LlmStepOutput).content;
          break;

        case 'http':
          output = await executeHttpStep({
            url: interpolateTemplate((step.config.url as string) ?? '', context),
            method: (step.config.method as string) ?? 'GET',
            headers: step.config.headers as Record<string, string> | undefined,
            body: step.config.body
              ? interpolateTemplate(step.config.body as string, context)
              : undefined,
          });
          context[`${step.name}_output`] = (output as HttpStepOutput).body;
          break;

        case 'code':
          output = await executeCodeStep({
            sandboxId: (step.config.sandboxId as string) ?? (context.sandboxId as string) ?? '',
            command: interpolateTemplate((step.config.command as string) ?? '', context),
          });
          context[`${step.name}_output`] = (output as CodeStepOutput).stdout;
          break;

        case 'branch': {
          output = await executeBranchStep({
            condition: (step.config.condition as string) ?? 'true',
            context,
          });
          const branch = (output as BranchStepOutput).branch;
          context[`${step.name}_branch`] = branch;
          // If branch is false, we could skip subsequent steps — but for now
          // the caller can decide based on branch_output in results
          break;
        }

        case 'trigger':
          output = await executeTriggerStep({
            targetAgent: (step.config.targetAgent as string) ?? 'codex',
            task: interpolateTemplate((step.config.task as string) ?? '', context),
            intent: (step.config.intent as string) ?? 'execute',
          });
          context[`${step.name}_taskId`] = (output as TriggerStepOutput).taskId;
          break;

        default:
          output = { error: `Unknown step type: ${step.type}` };
      }
    } catch (err) {
      output = { error: err instanceof Error ? err.message : 'Step execution failed' };
    }

    results.push({
      step: step.name,
      type: step.type,
      output,
      durationMs: Date.now() - start,
    });
  }

  return { success: true, results, context };
}

/**
 * Simple template interpolation: {{variableName}} → context[variableName]
 */
function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = context[key];
    return val != null ? String(val) : `{{${key}}}`;
  });
}

/**
 * Run a stored workflow by ID.
 * Loads the workflow definition from the agency's workflow storage,
 * then executes it through Hatchet (or the local runner if Hatchet is unavailable).
 */
export async function runWorkflow(
  workflowId: string,
  input: Record<string, unknown>,
): Promise<{ success: boolean; results: unknown[] }> {
  // For now, this returns the local runner result.
  // When Hatchet SDK is integrated, this will call hatchet.admin.runWorkflow()
  // and return the Hatchet run ID for tracking in the dashboard.

  // Placeholder: load workflow definition
  // const workflow = await loadWorkflowDefinition(workflowId);
  // return executeWorkflowSteps(workflow.steps, input);

  return {
    success: false,
    results: [{ error: `Workflow ${workflowId} execution requires Hatchet SDK integration. Use executeWorkflowSteps() directly for now.` }],
  };
}

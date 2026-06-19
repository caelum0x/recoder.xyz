"use strict";
/**
 * @module workflow-step-executor
 *
 * Concrete step executors for the workflow trigger's `run-steps` endpoint.
 *
 * Each step type has a dedicated executor:
 *   - llm:     Calls an LLM via OpenRouter and returns the response
 *   - http:    Makes an HTTP request and returns the body
 *   - code:    Executes code in a Daytona sandbox
 *   - branch:  Evaluates a condition and returns a routing decision
 *   - trigger: Triggers another workflow run (via the WorkflowEngine)
 *
 * The `executeWorkflowSteps` function is the main entry point, used by
 * workflow-trigger.routes.ts `/run-steps`.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeWorkflowSteps = executeWorkflowSteps;
const logger_1 = require("../logger");
const openmeter_client_js_1 = require("../metering/openmeter-client.js");
const a2a_event_bus_1 = require("./a2a-event-bus");
const uuid_1 = require("uuid");
const byok_js_1 = require("./byok.js");
const compiled_instructions_js_1 = require("./compiled-instructions.js");
const a2a_1 = require("@recoder/shared/a2a");
const logger = (0, logger_1.createLogger)('workflow-step-executor');
// ---------------------------------------------------------------------------
// Streaming LLM response consumer
// ---------------------------------------------------------------------------
/**
 * Consume an SSE streaming response from OpenRouter.
 * Publishes token chunks as A2A task.stream events so SSE subscribers
 * see live output, then returns the assembled content.
 */
async function consumeStreamingResponse(res, model, context) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let chunkCount = 0;
    const taskId = context._taskId ? String(context._taskId) : undefined;
    const workspaceId = context._workspaceId ? String(context._workspaceId) : undefined;
    const bus = (0, a2a_event_bus_1.getA2AEventBus)();
    try {
        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            // Parse SSE lines
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.startsWith('data: '))
                    continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]')
                    continue;
                try {
                    const chunk = JSON.parse(data);
                    const delta = chunk.choices?.[0]?.delta?.content ?? '';
                    if (delta) {
                        content += delta;
                        chunkCount++;
                        // Publish token chunks in small batches to avoid flooding listeners.
                        if (chunkCount % 3 === 0 || delta.length > 20) {
                            bus.publish({
                                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                                type: a2a_event_bus_1.A2AEventType.TaskStream,
                                timestamp: new Date().toISOString(),
                                data: { chunk: delta, content: delta, accumulated: content.length, model, done: false },
                                taskId,
                                workspaceId,
                            });
                        }
                    }
                    if (chunk.usage) {
                        inputTokens = chunk.usage.prompt_tokens ?? 0;
                        outputTokens = chunk.usage.completion_tokens ?? 0;
                    }
                }
                catch { /* malformed SSE line */ }
            }
        }
    }
    finally {
        reader.releaseLock();
    }
    if (taskId) {
        bus.publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.TaskStream,
            timestamp: new Date().toISOString(),
            data: { chunk: '', accumulated: content.length, model, done: true },
            taskId,
            workspaceId,
        });
    }
    const userId = String(context._userId ?? 'workflow');
    (0, openmeter_client_js_1.trackLlmCall)({ userId, model, inputTokens, outputTokens, provider: 'openrouter', projectId: String(context._projectId ?? '') });
    return { content, model, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens }, streamed: true, chunks: chunkCount };
}
function getDaytonaUrl() {
    return process.env.DAYTONA_SERVER_URL ?? 'http://localhost:3900/api';
}
function getDaytonaKey() {
    return process.env.DAYTONA_API_KEY ?? '';
}
function buildWorkflowStepTaskEnvelope(input) {
    const metadata = {
        ...(typeof input.config.title === 'string' ? { title: input.config.title } : {}),
        ...(typeof input.config.goal === 'string' ? { goal: input.config.goal } : {}),
        ...(typeof input.config.intent === 'string' ? { intent: input.config.intent } : {}),
        ...(Array.isArray(input.config.acceptance) ? { acceptance: input.config.acceptance } : {}),
        ...(Array.isArray(input.config.acceptance_criteria) ? { acceptance_criteria: input.config.acceptance_criteria } : {}),
        ...(Array.isArray(input.config.verify) ? { verify: input.config.verify } : {}),
        ...(Array.isArray(input.config.verification_commands) ? { verification_commands: input.config.verification_commands } : {}),
        ...(Array.isArray(input.config.forbidden_actions) ? { forbidden_actions: input.config.forbidden_actions } : {}),
        ...(Array.isArray(input.config.forbidden_paths) ? { forbidden_paths: input.config.forbidden_paths } : {}),
        ...(Array.isArray(input.config.approval_required) ? { approval_required: input.config.approval_required } : {}),
        ...(Array.isArray(input.config.browser_checks) ? { browser_checks: input.config.browser_checks } : {}),
        ...(Array.isArray(input.config.pathRules) ? { pathRules: input.config.pathRules } : {}),
        ...(Array.isArray(input.config.recentFailures) ? { recentFailures: input.config.recentFailures } : {}),
        source: 'workflow-step-executor',
        stepName: input.stepName,
        stepType: input.stepType,
    };
    return (0, a2a_1.createTaskEnvelope)({
        id: `wfstep_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
        workspace_id: typeof input.context._workspaceId === 'string'
            ? input.context._workspaceId
            : 'workflow-step-executor',
        thread_id: typeof input.context._threadId === 'string'
            ? input.context._threadId
            : `workflow-step-${Date.now()}`,
        trace_id: typeof input.context._taskId === 'string'
            ? input.context._taskId
            : `workflow-step-${Date.now()}`,
        requester: {
            agent_id: 'workflow-step-executor',
            platform: 'recoder_backend',
            name: 'Workflow Step Executor',
        },
        assignee: {
            agent_id: input.assigneeId,
            platform: 'custom',
        },
        connector: {
            connector_id: `${input.stepType}:${input.assigneeId}`,
            platform: 'custom',
            protocol: 'rest',
        },
        payload: {
            kind: 'text',
            text: input.promptText,
        },
        metadata,
        tags: [`workflow-step:${input.stepType}`],
    });
}
// ---------------------------------------------------------------------------
// Step executors
// ---------------------------------------------------------------------------
async function executeLlmStep(config, context) {
    const prompt = String(config.prompt ?? '');
    const model = String(config.model ?? 'anthropic/claude-sonnet-4-20250514');
    const systemPrompt = config.system ? String(config.system) : undefined;
    const maxTokens = Number(config.maxTokens ?? 2048);
    const shouldStream = config.stream !== false; // default: stream
    const explicitProviderKeys = typeof context._providerKeys === 'object' && context._providerKeys && !Array.isArray(context._providerKeys)
        ? context._providerKeys
        : {};
    const openRouterKey = (typeof explicitProviderKeys.openrouter === 'string' && explicitProviderKeys.openrouter) ||
        (await (0, byok_js_1.getOpenRouterByokKey)(typeof context._userId === 'string' ? context._userId : undefined)) ||
        '';
    const startedAt = Date.now();
    if (!prompt)
        throw new Error('llm step requires config.prompt');
    if (!openRouterKey)
        throw new Error('No BYOK OpenRouter key available for workflow LLM step');
    // Inject context variables into prompt via {{key}} placeholders
    const resolvedPrompt = prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => (context[key] != null ? String(context[key]) : `{{${key}}}`));
    const envelope = buildWorkflowStepTaskEnvelope({
        stepName: String(config.name ?? 'llm-step'),
        stepType: 'llm',
        config,
        context,
        promptText: resolvedPrompt,
        assigneeId: model,
    });
    const instructionBundle = (0, compiled_instructions_js_1.compileInstructionBundleForTask)(envelope);
    const effectivePrompt = instructionBundle?.agent_specific_prompt || resolvedPrompt;
    const messages = [];
    if (systemPrompt)
        messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: effectivePrompt });
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            messages,
            max_tokens: maxTokens,
            stream: shouldStream,
            ...(shouldStream ? { stream_options: { include_usage: true } } : {}),
        }),
        signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM call failed ${res.status}: ${text.slice(0, 200)}`);
    }
    // ── Streaming path: parse SSE chunks and publish progress events ──
    if (shouldStream && res.body) {
        return consumeStreamingResponse(res, model, context);
    }
    // ── Non-streaming path ──
    const data = (await res.json());
    const content = data.choices?.[0]?.message?.content ?? '';
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const durationMs = Date.now() - startedAt;
    const userId = String(context._userId ?? 'workflow');
    (0, openmeter_client_js_1.trackLlmCall)({
        userId,
        model,
        inputTokens,
        outputTokens,
        provider: 'openrouter',
        projectId: String(context._projectId ?? ''),
        durationMs,
    });
    return {
        content,
        model,
        usage: data.usage,
        instructionBundle,
    };
}
async function executeHttpStep(config, context) {
    const url = String(config.url ?? '');
    const method = String(config.method ?? 'GET').toUpperCase();
    const headers = config.headers ?? {};
    const body = config.body;
    const timeoutMs = Number(config.timeoutMs ?? 30_000);
    if (!url)
        throw new Error('http step requires config.url');
    // Resolve placeholders in URL and headers
    const resolvedUrl = url.replace(/\{\{(\w+)\}\}/g, (_, key) => (context[key] != null ? String(context[key]) : `{{${key}}}`));
    const resolvedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
        resolvedHeaders[k] = String(v).replace(/\{\{(\w+)\}\}/g, (_, key) => (context[key] != null ? String(context[key]) : `{{${key}}}`));
    }
    const fetchOpts = {
        method,
        headers: resolvedHeaders,
        signal: AbortSignal.timeout(timeoutMs),
    };
    if (body && method !== 'GET' && method !== 'HEAD') {
        fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
        if (!resolvedHeaders['Content-Type'] && !resolvedHeaders['content-type']) {
            resolvedHeaders['Content-Type'] = 'application/json';
        }
    }
    const res = await fetch(resolvedUrl, fetchOpts);
    const responseText = await res.text();
    // Try to parse as JSON
    let parsed;
    try {
        parsed = JSON.parse(responseText);
    }
    catch {
        parsed = responseText;
    }
    return {
        status: res.status,
        ok: res.ok,
        body: parsed,
    };
}
async function executeCodeStep(config, context) {
    const code = String(config.code ?? '');
    const language = String(config.language ?? 'python');
    const sandboxId = String(config.sandboxId ?? context.sandboxId ?? '');
    const timeoutMs = Number(config.timeoutMs ?? 60_000);
    const daytonaKey = getDaytonaKey();
    const daytonaUrl = getDaytonaUrl();
    const startedAt = Date.now();
    if (!code)
        throw new Error('code step requires config.code');
    if (!sandboxId)
        throw new Error('code step requires config.sandboxId or context.sandboxId');
    if (!daytonaKey)
        throw new Error('DAYTONA_API_KEY not configured');
    const baseUrl = daytonaUrl.replace(/\/api\/?$/, '');
    const execUrl = `${baseUrl}/api/toolbox/${sandboxId}/toolbox/process/execute`;
    let command;
    if (language === 'python' || language === 'python3') {
        command = `python3 -c ${JSON.stringify(code)}`;
    }
    else if (language === 'node' || language === 'javascript') {
        command = `node -e ${JSON.stringify(code)}`;
    }
    else if (language === 'bash' || language === 'sh') {
        command = `sh -c ${JSON.stringify(code)}`;
    }
    else {
        command = `sh -c ${JSON.stringify(code)}`;
    }
    const res = await fetch(execUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${daytonaKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json());
    const stdout = data.result ?? data.stdout ?? '';
    const stderr = data.stderr ?? '';
    const exitCode = data.exitCode ?? data.exit_code ?? -1;
    const durationMs = Date.now() - startedAt;
    (0, openmeter_client_js_1.trackSandboxExec)({
        userId: String(context._userId ?? 'workflow'),
        projectId: String(context._projectId ?? sandboxId),
        command: command.slice(0, 200),
        durationMs,
        exitCode,
    });
    return { stdout, stderr, exitCode };
}
/** Safely evaluate a boolean condition against context in a sandboxed VM. */
function evaluateCondition(condition, context) {
    if (!condition)
        return false;
    try {
        const vm = require('vm');
        const sandbox = Object.freeze({
            context: Object.freeze({ ...context }),
            input: Object.freeze(context._lastOutput ?? ''),
        });
        return !!vm.runInNewContext(`!!(${condition})`, sandbox, { timeout: 100, displayErrors: false });
    }
    catch (err) {
        logger.warn({ condition, error: err instanceof Error ? err.message : String(err) }, 'Condition evaluation failed');
        return false;
    }
}
function executeBranchStep(config, context) {
    const condition = String(config.condition ?? '');
    if (!condition)
        throw new Error('branch step requires config.condition');
    const result = evaluateCondition(condition, context);
    return {
        condition,
        result,
        branch: result ? (config.thenLabel ?? 'then') : (config.elseLabel ?? 'else'),
    };
}
/**
 * Conditional step (openfang StepMode): evaluate `config.condition`, then run
 * `config.then[]` (true) or `config.else[]` (false) sub-steps sequentially.
 */
async function executeConditionalStep(config, ctx) {
    const condition = String(config.condition ?? '');
    if (!condition)
        throw new Error('conditional step requires config.condition');
    const passed = evaluateCondition(condition, ctx);
    const branch = passed ? config.then : config.else;
    const subSteps = Array.isArray(branch) ? branch : [];
    const results = [];
    for (const s of subSteps) {
        try {
            results.push({ name: s.name, type: s.type, output: await dispatchStep(s, ctx) });
        }
        catch (err) {
            results.push({ name: s.name, type: s.type, error: err instanceof Error ? err.message : String(err) });
        }
    }
    return {
        content: `condition ${passed ? 'true → then' : 'false → else'} (${subSteps.length} step(s))`,
        passed,
        results,
    };
}
async function executeTriggerStep(config, context) {
    const workflowId = String(config.workflowId ?? '');
    if (!workflowId)
        throw new Error('trigger step requires config.workflowId');
    // Lazy import to avoid circular dependency
    const { getWorkflowEngine } = await Promise.resolve().then(() => __importStar(require('./workflow-engine.service')));
    const engine = getWorkflowEngine();
    const def = engine.getWorkflow(workflowId);
    if (!def) {
        return { triggered: false, error: `Workflow ${workflowId} not registered` };
    }
    const input = config.input ? String(config.input) : JSON.stringify(context);
    const structuredExecutor = Object.assign(async (request) => {
        const result = await executeLlmStep({
            prompt: request.instructionBundle?.agent_specific_prompt ?? request.prompt,
            model: config.model ?? 'anthropic/claude-sonnet-4-20250514',
            name: 'trigger-step-task',
        }, context);
        return typeof result === 'string' ? result : JSON.stringify(result);
    }, { __agentOsStructured: true });
    const execution = await engine.execute(workflowId, input, structuredExecutor);
    return {
        triggered: true,
        executionId: execution.executionId,
        status: execution.status,
        output: execution.finalOutput,
        stepCount: execution.stepResults.length,
    };
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Execute a list of workflow steps sequentially.
 * Each step's output is merged into the shared context as `_lastOutput`.
 * Returns the full execution result.
 */
/**
 * Squad step: dispatch the (variable-resolved) task to a squad, fanning out to
 * its agent members by strategy. Connects workflows to the collaboration layer.
 */
async function executeSquadStep(config, context) {
    const squadId = String(config.squadId ?? '');
    const rawTask = String(config.task ?? '');
    const strategy = ['all', 'leader', 'round-robin', 'best-match'].includes(String(config.strategy))
        ? config.strategy
        : 'all';
    if (!squadId)
        throw new Error('squad step requires config.squadId');
    if (!rawTask)
        throw new Error('squad step requires config.task');
    const task = rawTask.replace(/\{\{(\w+)\}\}/g, (_, key) => (context[key] != null ? String(context[key]) : `{{${key}}}`));
    const createdBy = typeof context._userId === 'string' ? context._userId : 'workflow';
    const { dispatchToSquad } = await Promise.resolve().then(() => __importStar(require('./squad-dispatch.service.js')));
    const result = await dispatchToSquad({ squadId, task, strategy, createdBy });
    if (!result.ok)
        throw new Error(result.reason ?? 'squad dispatch failed');
    return {
        content: `Dispatched to squad ${squadId} via ${strategy} (${result.deliveredTo?.length ?? 0} delivered)`,
        squadTaskId: result.squadTask?.id,
        deliveredTo: result.deliveredTo ?? [],
    };
}
/** Dispatch a single step to its executor (shared by sequential + parallel). */
async function dispatchStep(step, ctx) {
    switch (step.type) {
        case 'llm': return executeLlmStep(step.config, ctx);
        case 'http': return executeHttpStep(step.config, ctx);
        case 'code': return executeCodeStep(step.config, ctx);
        case 'branch': return executeBranchStep(step.config, ctx);
        case 'trigger': return executeTriggerStep(step.config, ctx);
        case 'squad': return executeSquadStep(step.config, ctx);
        case 'parallel': return executeParallelStep(step.config, ctx);
        case 'conditional': return executeConditionalStep(step.config, ctx);
        default: throw new Error(`Unknown step type: ${step.type}`);
    }
}
/**
 * Parallel step (openfang StepMode): run `config.steps[]` concurrently against
 * the same context. Sub-step failures are isolated (Promise.allSettled) and
 * reported per-step; the overall step succeeds with a results array.
 */
async function executeParallelStep(config, ctx) {
    const subSteps = Array.isArray(config.steps) ? config.steps : [];
    if (subSteps.length === 0)
        throw new Error('parallel step requires a non-empty config.steps[]');
    const settled = await Promise.allSettled(subSteps.map((s) => dispatchStep(s, ctx)));
    const results = settled.map((r, i) => ({
        name: subSteps[i]?.name ?? `parallel-${i}`,
        type: subSteps[i]?.type,
        ...(r.status === 'fulfilled'
            ? { output: r.value }
            : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }),
    }));
    return { content: `Ran ${subSteps.length} step(s) in parallel`, results };
}
async function executeWorkflowSteps(steps, context = {}) {
    const results = [];
    const ctx = { ...context };
    let allSucceeded = true;
    for (const step of steps) {
        const start = Date.now();
        try {
            const output = await dispatchStep(step, ctx);
            const durationMs = Date.now() - start;
            // Merge output into context for next step
            if (output && typeof output === 'object') {
                const outputObj = output;
                if ('content' in outputObj)
                    ctx._lastOutput = outputObj.content;
                else if ('stdout' in outputObj)
                    ctx._lastOutput = outputObj.stdout;
                else if ('body' in outputObj)
                    ctx._lastOutput = outputObj.body;
                else
                    ctx._lastOutput = output;
            }
            else {
                ctx._lastOutput = output;
            }
            results.push({ step: step.name, type: step.type, output, durationMs });
            logger.info({ step: step.name, type: step.type, durationMs }, 'Workflow step completed');
        }
        catch (err) {
            const durationMs = Date.now() - start;
            const error = err instanceof Error ? err.message : String(err);
            results.push({
                step: step.name,
                type: step.type,
                output: { error },
                durationMs,
            });
            allSucceeded = false;
            logger.warn({ step: step.name, type: step.type, error, durationMs }, 'Workflow step failed');
            // Continue executing remaining steps (continue strategy)
        }
    }
    return { success: allSucceeded, results, context: ctx };
}

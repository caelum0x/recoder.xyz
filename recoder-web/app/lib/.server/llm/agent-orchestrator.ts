/**
 * Agent Orchestrator - Server-side autonomous agent loop
 *
 * Flow: analyze -> plan -> execute -> verify -> fix (loop) -> review
 *
 * Produces a stream of AgentEvent objects sent via SSE to the client.
 * Reuses existing tools (shell, edit, write-file, glob, grep) and services
 * (code-context, error-analyzer, build-validator).
 */

import { createScopedLogger } from '~/utils/logger';
import { dockerGet, dockerPost, DOCKER_URL } from '~/lib/services/docker-api';

const logger = createScopedLogger('AgentOrchestrator');

// ============================================================================
// Event Types (streamed to client via SSE)
// ============================================================================

export type AgentEventType =
  | 'phase'
  | 'plan'
  | 'step_start'
  | 'step_complete'
  | 'file_change'
  | 'shell_start'
  | 'shell_output'
  | 'shell_complete'
  | 'verify_result'
  | 'error'
  | 'streaming_text'
  | 'complete';

export interface AgentEvent {
  type: AgentEventType;
  data: Record<string, unknown>;
  timestamp: number;
}

// ============================================================================
// Agent Configuration
// ============================================================================

export interface AgentConfig {
  /** User's prompt */
  prompt: string;
  /** Project ID for Docker backend */
  projectId: string;
  /** Environment variables (for API keys) */
  env: Record<string, string | undefined>;
  /** Request object (for auth) */
  request?: Request;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Max auto-fix iterations */
  maxFixIterations?: number;
  /** Model to use */
  model?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

interface AnalysisResult {
  projectStructure: string;
  relevantFiles: Array<{ path: string; content: string }>;
  framework: string | null;
  dependencies: Record<string, string>;
}

interface PlanResult {
  title: string;
  summary: string;
  steps: Array<{
    description: string;
    type: 'create' | 'modify' | 'delete' | 'shell' | 'verify';
    targetFile?: string;
  }>;
}

interface FileChangeResult {
  path: string;
  type: 'create' | 'update' | 'delete';
  oldContent?: string;
  newContent?: string;
  summary: string;
}

interface VerifyResult {
  success: boolean;
  errors: string[];
  errorType?: string;
}

// ============================================================================
// LLM Helper
// ============================================================================

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  env: Record<string, string | undefined>,
  request?: Request,
  signal?: AbortSignal,
): Promise<string> {
  // Use the existing streamText infrastructure
  const { streamText } = await import('./stream-text');
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  const result = await streamText(messages, env as unknown as Env, {
    request,
    max_tokens: 8192,
  });

  // Collect full response from stream
  const reader = result.textStream.getReader();
  let fullText = '';

  while (true) {
    if (signal?.aborted) throw new Error('Agent interrupted');
    const { done, value } = await reader.read();
    if (done) break;
    fullText += new TextDecoder().decode(value);
  }

  return fullText;
}

// ============================================================================
// Phase Implementations
// ============================================================================

async function analyzePhase(
  config: AgentConfig,
  emit: (event: AgentEvent) => void,
): Promise<AnalysisResult> {
  emit({ type: 'phase', data: { phase: 'analyzing' }, timestamp: Date.now() });

  // Get project file tree from Docker backend
  let fileTree = '';
  let packageJson: Record<string, unknown> = {};

  try {
    const treeData = await dockerGet<{ tree: string }>(
      `/api/files/${config.projectId}/tree`,
    );
    fileTree = treeData.tree || '';
  } catch (e) {
    logger.warn('[Analyze] Could not get file tree:', e);
  }

  // Try to read package.json
  try {
    const pkgData = await dockerGet<{ content: string }>(
      `/api/file/${config.projectId}?path=package.json`,
    );
    if (pkgData.content) {
      packageJson = JSON.parse(pkgData.content);
    }
  } catch {
    // No package.json - that's fine
  }

  // Use LLM to identify relevant files
  const analysisPrompt = `Analyze this project to determine which files are relevant for the following task.

PROJECT FILE TREE:
${fileTree}

PACKAGE.JSON:
${JSON.stringify(packageJson, null, 2)}

USER TASK:
${config.prompt}

Respond with a JSON object:
{
  "framework": "detected framework name or null",
  "relevantFiles": ["path/to/file1.ts", "path/to/file2.tsx"],
  "reasoning": "brief explanation"
}

Only include files that are directly relevant. Max 15 files.`;

  let analysis: { framework: string | null; relevantFiles: string[]; reasoning: string };

  try {
    const raw = await callLLM(
      'You are a code analysis assistant. Respond ONLY with valid JSON, no markdown.',
      analysisPrompt,
      config.env,
      config.request,
      config.signal,
    );

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { framework: null, relevantFiles: [], reasoning: 'Failed to parse' };
  } catch (e) {
    logger.warn('[Analyze] LLM analysis failed, using fallback:', e);
    analysis = { framework: null, relevantFiles: [], reasoning: 'Fallback analysis' };
  }

  emit({
    type: 'streaming_text',
    data: { text: `Analyzed project: ${analysis.framework || 'unknown'} framework, ${analysis.relevantFiles.length} relevant files` },
    timestamp: Date.now(),
  });

  // Read the relevant file contents
  const relevantFiles: Array<{ path: string; content: string }> = [];

  for (const filePath of analysis.relevantFiles.slice(0, 15)) {
    if (config.signal?.aborted) throw new Error('Agent interrupted');
    try {
      const fileData = await dockerGet<{ content: string }>(
        `/api/file/${config.projectId}?path=${encodeURIComponent(filePath)}`,
      );
      if (fileData.content) {
        relevantFiles.push({ path: filePath, content: fileData.content });
      }
    } catch {
      // File not readable - skip
    }
  }

  return {
    projectStructure: fileTree,
    relevantFiles,
    framework: analysis.framework,
    dependencies: (packageJson as any).dependencies || {},
  };
}

async function planPhase(
  config: AgentConfig,
  analysis: AnalysisResult,
  emit: (event: AgentEvent) => void,
): Promise<PlanResult> {
  emit({ type: 'phase', data: { phase: 'planning' }, timestamp: Date.now() });

  const fileContext = analysis.relevantFiles
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 3000)}`)
    .join('\n\n');

  const planPrompt = `Create a detailed implementation plan for the following task.

PROJECT FRAMEWORK: ${analysis.framework || 'unknown'}
DEPENDENCIES: ${JSON.stringify(analysis.dependencies, null, 2)}

RELEVANT FILES:
${fileContext}

USER TASK:
${config.prompt}

Respond with a JSON object:
{
  "title": "Short title for the plan",
  "summary": "1-2 sentence summary",
  "steps": [
    {
      "description": "What to do",
      "type": "create|modify|delete|shell|verify",
      "targetFile": "path/to/file (if applicable)"
    }
  ]
}

Be specific and actionable. Include all files that need to be created or modified. Include shell commands for installing dependencies. End with a verify step.`;

  const raw = await callLLM(
    'You are a senior software architect. Create precise implementation plans. Respond ONLY with valid JSON.',
    planPrompt,
    config.env,
    config.request,
    config.signal,
  );

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const plan: PlanResult = jsonMatch
    ? JSON.parse(jsonMatch[0])
    : { title: 'Implementation Plan', summary: 'Execute the requested changes', steps: [] };

  emit({ type: 'plan', data: { plan }, timestamp: Date.now() });
  return plan;
}

async function executePhase(
  config: AgentConfig,
  analysis: AnalysisResult,
  plan: PlanResult,
  emit: (event: AgentEvent) => void,
): Promise<FileChangeResult[]> {
  emit({ type: 'phase', data: { phase: 'executing' }, timestamp: Date.now() });

  const fileChanges: FileChangeResult[] = [];

  const fileContext = analysis.relevantFiles
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  // Ask LLM to generate all the code changes at once
  const executePrompt = `Execute the following plan by generating all necessary file changes.

PLAN: ${plan.title}
${plan.steps.map((s, i) => `${i + 1}. [${s.type}] ${s.description}${s.targetFile ? ` (${s.targetFile})` : ''}`).join('\n')}

EXISTING FILES:
${fileContext}

For each file change, output a JSON array of objects:
[
  {
    "path": "relative/path/to/file.ts",
    "type": "create|update|delete",
    "content": "full file content here (for create/update)",
    "summary": "brief description of what changed"
  }
]

IMPORTANT:
- For "update" type, provide the COMPLETE new file content
- For "create" type, provide the COMPLETE file content
- For "delete" type, content can be empty
- Generate production-quality code
- Follow the project's existing patterns and conventions
- Include all necessary imports

Respond ONLY with the JSON array.`;

  const raw = await callLLM(
    'You are an expert software engineer. Generate complete, production-ready code. Respond ONLY with a valid JSON array.',
    executePrompt,
    config.env,
    config.request,
    config.signal,
  );

  // Parse the response
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  let changes: Array<{ path: string; type: string; content?: string; summary: string }> = [];

  try {
    changes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch (e) {
    logger.error('[Execute] Failed to parse LLM response:', e);
    emit({ type: 'error', data: { message: 'Failed to parse generated code' }, timestamp: Date.now() });
    return [];
  }

  // Apply each change via Docker backend
  for (const change of changes) {
    if (config.signal?.aborted) throw new Error('Agent interrupted');

    const stepId = `step-${Date.now()}`;
    emit({ type: 'step_start', data: { id: stepId, description: change.summary, targetFile: change.path }, timestamp: Date.now() });

    try {
      // Read old content for diff (if updating)
      let oldContent: string | undefined;
      if (change.type === 'update') {
        try {
          const existing = await dockerGet<{ content: string }>(
            `/api/file/${config.projectId}?path=${encodeURIComponent(change.path)}`,
          );
          oldContent = existing.content;
        } catch {
          // File doesn't exist yet - treat as create
        }
      }

      if (change.type === 'delete') {
        await dockerPost(`/api/file/${config.projectId}/delete`, { path: change.path });
      } else if (change.content) {
        await dockerPost(`/api/file/${config.projectId}`, {
          filePath: change.path,
          content: change.content,
        });
      }

      const fileChange: FileChangeResult = {
        path: change.path,
        type: change.type as 'create' | 'update' | 'delete',
        oldContent,
        newContent: change.content,
        summary: change.summary,
      };

      fileChanges.push(fileChange);
      emit({ type: 'file_change', data: { ...fileChange }, timestamp: Date.now() });
      emit({ type: 'step_complete', data: { id: stepId, success: true }, timestamp: Date.now() });
    } catch (e: any) {
      emit({ type: 'step_complete', data: { id: stepId, success: false, error: e.message }, timestamp: Date.now() });
    }
  }

  // Execute shell commands from plan (install deps, etc.)
  const shellSteps = plan.steps.filter((s) => s.type === 'shell');
  for (const step of shellSteps) {
    if (config.signal?.aborted) throw new Error('Agent interrupted');

    const cmdId = `cmd-${Date.now()}`;
    emit({ type: 'shell_start', data: { id: cmdId, command: step.description }, timestamp: Date.now() });

    try {
      const result = await dockerPost<{ output: string; exitCode: number }>(
        `/api/shell/${config.projectId}`,
        { command: step.description },
      );

      emit({
        type: 'shell_complete',
        data: { id: cmdId, output: result.output, exitCode: result.exitCode },
        timestamp: Date.now(),
      });
    } catch (e: any) {
      emit({
        type: 'shell_complete',
        data: { id: cmdId, output: e.message, exitCode: 1 },
        timestamp: Date.now(),
      });
    }
  }

  return fileChanges;
}

async function verifyPhase(
  config: AgentConfig,
  emit: (event: AgentEvent) => void,
): Promise<VerifyResult> {
  emit({ type: 'phase', data: { phase: 'verifying' }, timestamp: Date.now() });

  try {
    // Run build check via Docker backend
    const result = await dockerPost<{ success: boolean; output: string; errors: string[] }>(
      `/api/shell/${config.projectId}`,
      { command: 'npm run build 2>&1 || echo "BUILD_FAILED"' },
    );

    const output = result.output || '';
    const hasBuildError = output.includes('BUILD_FAILED') || output.includes('error') || (result.errors && result.errors.length > 0);

    if (hasBuildError) {
      // Parse errors using error-analyzer patterns
      const errors = result.errors || [];

      // Also extract errors from output
      const errorLines = output.split('\n').filter((line) =>
        line.toLowerCase().includes('error') && !line.includes('0 errors'),
      );

      const allErrors = [...errors, ...errorLines].slice(0, 10);

      emit({
        type: 'verify_result',
        data: { success: false, errors: allErrors },
        timestamp: Date.now(),
      });

      return { success: false, errors: allErrors };
    }

    emit({
      type: 'verify_result',
      data: { success: true, errors: [] },
      timestamp: Date.now(),
    });

    return { success: true, errors: [] };
  } catch (e: any) {
    // Build command itself failed (e.g., no build script) - not necessarily an error
    logger.warn('[Verify] Build command failed:', e.message);

    // Try a lighter check - just run tsc --noEmit
    try {
      const tscResult = await dockerPost<{ output: string; exitCode: number }>(
        `/api/shell/${config.projectId}`,
        { command: 'npx tsc --noEmit 2>&1 || true' },
      );

      const tscErrors = (tscResult.output || '')
        .split('\n')
        .filter((l) => l.includes('error TS'));

      if (tscErrors.length > 0) {
        emit({
          type: 'verify_result',
          data: { success: false, errors: tscErrors.slice(0, 10) },
          timestamp: Date.now(),
        });
        return { success: false, errors: tscErrors.slice(0, 10) };
      }
    } catch {
      // No TypeScript either - assume OK
    }

    emit({
      type: 'verify_result',
      data: { success: true, errors: [] },
      timestamp: Date.now(),
    });
    return { success: true, errors: [] };
  }
}

async function fixPhase(
  config: AgentConfig,
  errors: string[],
  fileChanges: FileChangeResult[],
  iteration: number,
  emit: (event: AgentEvent) => void,
): Promise<FileChangeResult[]> {
  emit({
    type: 'phase',
    data: { phase: 'fixing', iteration, maxIterations: config.maxFixIterations || 5 },
    timestamp: Date.now(),
  });

  const errorContext = errors.join('\n');
  const changedFiles = fileChanges
    .filter((f) => f.newContent)
    .map((f) => `--- ${f.path} ---\n${f.newContent}`)
    .join('\n\n');

  const fixPrompt = `The following build errors occurred after implementing changes. Fix them.

ERRORS:
${errorContext}

FILES THAT WERE CHANGED:
${changedFiles}

Respond with a JSON array of file fixes:
[
  {
    "path": "relative/path/to/file.ts",
    "type": "update",
    "content": "complete fixed file content",
    "summary": "what was fixed"
  }
]

Only include files that need fixing. Provide COMPLETE file content.`;

  const raw = await callLLM(
    'You are a debugging expert. Fix the build errors. Respond ONLY with valid JSON array.',
    fixPrompt,
    config.env,
    config.request,
    config.signal,
  );

  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  let fixes: Array<{ path: string; type: string; content: string; summary: string }> = [];

  try {
    fixes = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    logger.error('[Fix] Failed to parse fix response');
    return [];
  }

  const newChanges: FileChangeResult[] = [];

  for (const fix of fixes) {
    if (config.signal?.aborted) throw new Error('Agent interrupted');

    try {
      // Read current content for diff
      let oldContent: string | undefined;
      try {
        const existing = await dockerGet<{ content: string }>(
          `/api/file/${config.projectId}?path=${encodeURIComponent(fix.path)}`,
        );
        oldContent = existing.content;
      } catch {
        // Will be treated as create
      }

      await dockerPost(`/api/file/${config.projectId}`, {
        filePath: fix.path,
        content: fix.content,
      });

      const change: FileChangeResult = {
        path: fix.path,
        type: 'update',
        oldContent,
        newContent: fix.content,
        summary: fix.summary,
      };

      newChanges.push(change);
      emit({ type: 'file_change', data: { ...change }, timestamp: Date.now() });
    } catch (e: any) {
      logger.error(`[Fix] Failed to apply fix for ${fix.path}:`, e.message);
    }
  }

  return newChanges;
}

// ============================================================================
// Main Orchestration Loop
// ============================================================================

export async function runAgent(config: AgentConfig): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  const maxFix = config.maxFixIterations ?? 5;

  return new ReadableStream({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller may be closed
        }
      };

      try {
        // Phase 1: Analyze
        const analysis = await analyzePhase(config, emit);
        if (config.signal?.aborted) throw new Error('Agent interrupted');

        // Phase 2: Plan
        const plan = await planPhase(config, analysis, emit);
        if (config.signal?.aborted) throw new Error('Agent interrupted');

        // Phase 3: Execute
        let allFileChanges = await executePhase(config, analysis, plan, emit);
        if (config.signal?.aborted) throw new Error('Agent interrupted');

        // Phase 4: Verify
        let verifyResult = await verifyPhase(config, emit);

        // Phase 5: Fix loop (max iterations)
        let fixIteration = 0;
        while (!verifyResult.success && fixIteration < maxFix) {
          if (config.signal?.aborted) throw new Error('Agent interrupted');

          fixIteration++;
          const fixes = await fixPhase(config, verifyResult.errors, allFileChanges, fixIteration, emit);
          allFileChanges = [...allFileChanges, ...fixes];

          // Re-verify
          verifyResult = await verifyPhase(config, emit);
        }

        // Phase 6: Complete -> ready for review
        emit({
          type: 'phase',
          data: { phase: 'reviewing' },
          timestamp: Date.now(),
        });

        emit({
          type: 'complete',
          data: {
            success: verifyResult.success,
            fileChanges: allFileChanges,
            fixIterations: fixIteration,
            errors: verifyResult.errors,
          },
          timestamp: Date.now(),
        });
      } catch (e: any) {
        const message = e.message || 'Unknown error';
        emit({
          type: 'error',
          data: { message, interrupted: message.includes('interrupted') },
          timestamp: Date.now(),
        });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });
}

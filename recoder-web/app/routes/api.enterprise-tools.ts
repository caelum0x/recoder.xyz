import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  DockerHttpError,
  createDockerProxyHeaders,
  dockerFetchJson,
  getDockerBackendUrl,
  getSessionTokenFromRequest,
} from '~/lib/http/docker-server';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EnterpriseTools');
const WORKFLOW_CONTRACT_VERSION = 'internal-agent-workflow-v1' as const;

interface EnterpriseToolRequest {
  tool: string;
  params: Record<string, unknown>;
}

type WorkflowAuthMode = 'session-token' | 'none';
type WorkflowAuthSource = 'bearer-header' | 'session-cookie' | 'none';

interface WorkflowBackendDiagnostics {
  endpoint: string;
  contract: 'internal-agent-workflow-v1';
  responseContract: string | null;
  contractStatus: 'match' | 'mismatch' | 'missing';
  strictContract: boolean;
  authMode: WorkflowAuthMode;
  authSource: WorkflowAuthSource;
  attempts: number;
  maxAttempts: number;
  warnings: string[];
}

function resolveWorkflowAuth(request: Request): { authMode: WorkflowAuthMode; authSource: WorkflowAuthSource } {
  const authHeader = request.headers.get('Authorization');

  if (authHeader?.match(/^Bearer\s+.+$/i)) {
    return { authMode: 'session-token', authSource: 'bearer-header' };
  }

  if (getSessionTokenFromRequest(request)) {
    return { authMode: 'session-token', authSource: 'session-cookie' };
  }

  return { authMode: 'none', authSource: 'none' };
}

function getWorkflowRetryLimit(context: unknown): number {
  const env = (context as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  const raw =
    env?.RECODER_WORKFLOW_FETCH_RETRIES ||
    env?.OPENCLAW_WORKFLOW_FETCH_RETRIES ||
    process.env.RECODER_WORKFLOW_FETCH_RETRIES ||
    process.env.OPENCLAW_WORKFLOW_FETCH_RETRIES;
  const parsed = Number.parseInt(raw || '2', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
}

function isStrictWorkflowContractEnabled(context: unknown): boolean {
  const env = (context as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  const raw =
    env?.RECODER_WORKFLOW_STRICT_CONTRACT ||
    env?.OPENCLAW_WORKFLOW_STRICT_CONTRACT ||
    process.env.RECODER_WORKFLOW_STRICT_CONTRACT ||
    process.env.OPENCLAW_WORKFLOW_STRICT_CONTRACT ||
    '';
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

/**
 * Enterprise Tools API - Server-side execution of enhanced tools
 * This allows client-side code to use enterprise features without importing server modules
 * SECURITY: Requires authentication for all requests
 */
export async function action({ request, context }: ActionFunctionArgs) {
  // SECURITY: Verify user is authenticated
  const { verifySession } = await import('~/lib/auth/session.server');
  const session = await verifySession(request);

  if (!session?.user) {
    return json({
      success: false,
      error: 'Authentication required'
    }, { status: 401 });
  }

  // SECURITY: Log tool usage for audit
  logger.info(`[EnterpriseTools] User ${session.user.email} calling tool`);

  const { tool, params } = await request.json() as EnterpriseToolRequest;

  try {
    switch (tool) {
      case 'readFileEnhanced': {
        const { readFileEnhanced } = await import('~/lib/.server/llm/tools/read-file-enhanced');
        const readParams = params as { filePath: string; startLine?: number; endLine?: number };
        const result = await readFileEnhanced(readParams, '/workspace');
        return json(result);
      }

      case 'searchReplace': {
        const { searchReplace } = await import('~/lib/.server/llm/tools/search-replace');
        const replaceParams = params as { file_path: string; old_string: string; new_string: string };
        const result = await searchReplace(replaceParams, '/workspace');
        return json(result);
      }

      case 'discoverFiles': {
        const query = (params.query as string) || '';
        const workingDir = (params.workingDir as string) || '/workspace';
        const projectId = params.projectId as string | undefined;

        // If projectId is provided, prefer Docker backend file listing (container workspace)
        if (projectId) {
          const dockerBackendUrl = getDockerBackendUrl(context);
          const headers = createDockerProxyHeaders(request);

          try {
            const data = await dockerFetchJson<{ files?: string[] }>(
              `${dockerBackendUrl}/api/files/${projectId}`,
              {},
              headers,
            );
            const allFiles = (data.files || []).filter(Boolean);
            const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            const filtered = searchTerms.length === 0
              ? allFiles.slice(0, 20)
              : allFiles.filter(f => {
                  const lower = f.toLowerCase();
                  return searchTerms.some(term => lower.includes(term));
                }).slice(0, 20);
            return json(filtered);
          } catch (error) {
            logger.warn('[EnterpriseTools] Docker file discovery failed:', error);
          }
        }

        const { discoverRelevantFiles } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await discoverRelevantFiles(query, workingDir);
        return json(result);
      }

      case 'autoCommit': {
        const { autoCommitChanges } = await import('~/lib/.server/llm/enterprise-integration');
        const workingDir = params.workingDir as string;
        const files = params.files as string[];
        const result = await autoCommitChanges(workingDir, files);
        return json(result);
      }

      case 'codeAssist': {
        // Simplified code assist - returns contextual help based on query
        const query = params.query as string;
        const context = params.context as string | undefined;
        return json({
          success: true,
          output: `Code assist for: "${query}"${context ? ` with context: ${context.substring(0, 100)}...` : ''}`,
          suggestion: 'Use readFile and searchFiles tools to understand the codebase before making changes.'
        });
      }

      case 'delegateSubagent': {
        const agentType = params.agentType as string;
        const task = params.task as string;
        const contextText = params.context as string | undefined;
        const projectId = typeof params.projectId === 'string' && params.projectId.trim().length > 0
          ? params.projectId.trim()
          : undefined;
        const requestedPaths = Array.isArray(params.paths)
          ? params.paths.filter((value): value is string => typeof value === 'string')
          : undefined;
        const continuous = params.continuous !== false;
        const strictFromRequest = params.strict === true;
        const strictContract = strictFromRequest || isStrictWorkflowContractEnabled(context);

        const { buildSubagentWorkflowPlan } = await import('~/lib/services/subagent-workflow.server');
        let workflow = buildSubagentWorkflowPlan({
          task,
          agentType,
          requestedPaths,
          continuous,
        });
        let source: 'docker-backend' | 'local-fallback' = 'local-fallback';
        let fallbackReason: string | undefined;
        const dockerBackendUrl = getDockerBackendUrl(context);
        const endpoint = projectId
          ? `${dockerBackendUrl}/api/agent/workflow/${encodeURIComponent(projectId)}`
          : `${dockerBackendUrl}/api/agent/workflow`;
        const { authMode, authSource } = resolveWorkflowAuth(request);
        const maxAttempts = getWorkflowRetryLimit(context);
        const backend: WorkflowBackendDiagnostics = {
          endpoint,
          contract: WORKFLOW_CONTRACT_VERSION,
          responseContract: null,
          contractStatus: 'missing',
          strictContract,
          authMode,
          authSource,
          attempts: 0,
          maxAttempts,
          warnings: [],
        };

        try {
          const headers = createDockerProxyHeaders(request);
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            backend.attempts = attempt;
            try {
              const dockerResult = await dockerFetchJson<{
                contract?: string;
                workflow?: typeof workflow;
              }>(
                endpoint,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    task,
                    paths: requestedPaths,
                    continuous,
                  }),
                },
                headers,
              );
              const responseContract = typeof dockerResult.contract === 'string'
                ? dockerResult.contract
                : null;
              backend.responseContract = responseContract;
              backend.contractStatus = responseContract
                ? responseContract === backend.contract
                  ? 'match'
                  : 'mismatch'
                : 'missing';
              if (!responseContract) {
                backend.warnings.push(`response contract marker missing (expected ${backend.contract})`);
              } else if (responseContract !== backend.contract) {
                backend.warnings.push(`response contract mismatch: expected ${backend.contract}, got ${responseContract}`);
              }
              if (strictContract && backend.contractStatus !== 'match') {
                fallbackReason = `strict contract check failed: expected ${backend.contract}, got ${responseContract || 'missing'}`;
                backend.warnings.push(fallbackReason);
                break;
              }

              if (dockerResult.workflow) {
                workflow = dockerResult.workflow;
                source = 'docker-backend';
              } else {
                fallbackReason = 'docker backend returned no workflow payload';
                backend.warnings.push(fallbackReason);
              }
              break;
            } catch (error) {
              const internalReason = error instanceof DockerHttpError
                ? `attempt ${attempt}/${maxAttempts}: ${error.status} ${error.message}`
                : `attempt ${attempt}/${maxAttempts}: ${error instanceof Error ? error.message : String(error)}`;
              logger.warn('[EnterpriseTools] delegateSubagent retry', internalReason);
              const safeReason = `attempt ${attempt}/${maxAttempts}: backend unavailable`;
              backend.warnings.push(safeReason);
              fallbackReason = safeReason;
              if (attempt >= maxAttempts) {
                throw error;
              }
            }
          }
        } catch (error) {
          logger.warn('[EnterpriseTools] delegateSubagent docker workflow failed, using local fallback', error);
        }

        return json({
          success: true,
          output: workflow.summary,
          message: `Delegated to ${agentType}: ${task}`,
          context: contextText?.substring(0, 500),
          workflow,
          source,
          backend,
          ...(fallbackReason ? { fallbackReason } : {}),
        });
      }

      case 'webSearch': {
        const { webSearch } = await import('~/lib/.server/llm/tools/simple-wrappers');
        // Check for optional Tavily API key from environment
        const tavilyApiKey = process.env.TAVILY_API_KEY;
        const query = params.query as string;
        const options = params.options as { maxResults?: number } | undefined;
        const result = await webSearch(query, {
          maxResults: options?.maxResults || 5,
          tavilyApiKey,
        });
        return json(result);
      }

      case 'webFetch': {
        const { simpleFetch } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const url = params.url as string;
        const options = params.options as { timeout?: number; extractText?: boolean } | undefined;
        const result = await simpleFetch(url, options);
        return json(result);
      }

      case 'memory': {
        const { memoryOperation } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const operation = params.operation as 'store' | 'retrieve' | 'list' | 'delete';
        const data = params.data as { key?: string; value?: string } | undefined;
        const result = await memoryOperation(operation, data);
        return json(result);
      }

      case 'glob': {
        const { globSearch } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const pattern = params.pattern as string;
        const cwd = (params.path as string) || '/workspace';
        const ignore = params.ignore as string[] | undefined;
        const result = await globSearch(pattern, { cwd, ignore });
        return json(result);
      }

      case 'ripGrep': {
        const { simpleGrep } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const pattern = params.pattern as string;
        const searchPath = (params.path as string) || '/workspace';
        const caseSensitive = params.caseSensitive as boolean | undefined;
        const maxResults = params.maxResults as number | undefined;
        const result = await simpleGrep(pattern, searchPath, { caseSensitive, maxResults });
        return json(result);
      }

      case 'editFile': {
        const { applyEdits } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const filePath = params.filePath as string;
        const edits = params.edits as Array<{ lineNumber: number; operation: 'insert' | 'delete' | 'replace'; content?: string; endLine?: number }>;
        const workingDir = (params.workingDir as string) || '/workspace';
        const result = await applyEdits(filePath, edits, workingDir);
        return json(result);
      }

      case 'readManyFiles': {
        const { readMultipleFiles } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const files = params.files as string[];
        const workingDir = (params.workingDir as string) || '/workspace';
        const maxFileSize = params.maxFileSize as number | undefined;
        const result = await readMultipleFiles(files, workingDir, { maxFileSize });
        return json(result);
      }

      // Loop detection from enterprise services
      case 'checkLoops': {
        const { checkForLoops } = await import('~/lib/.server/llm/enterprise-integration');
        const messages = params.messages as unknown[];
        const result = await checkForLoops(messages);
        return json(result);
      }

      // Shell execution from enterprise services
      case 'executeShell': {
        const { executeShellCommand } = await import('~/lib/.server/llm/enterprise-integration');
        const command = params.command as string;
        const workingDir = (params.workingDir as string) || '/workspace';
        const result = await executeShellCommand(command, workingDir);
        return json(result);
      }

      // Multi-file atomic diff application
      case 'multiApplyDiff': {
        const { multiApplyDiff } = await import('~/lib/.server/llm/tools/multi-apply-diff');
        const diffs = params.diffs as Array<{ filePath: string; oldString: string; newString: string; startLine?: number }>;
        const workingDir = (params.workingDir as string) || '/workspace';
        const commitMessage = params.commitMessage as string | undefined;
        const result = await multiApplyDiff(diffs, workingDir, { commitMessage });
        return json(result);
      }

      // Browser automation for web testing and scraping
      case 'browserAutomation': {
        const { browserAutomation } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const action = params.action as 'launch' | 'click' | 'type' | 'screenshot' | 'extract' | 'execute' | 'scroll_down' | 'scroll_up' | 'close';
        const projectId = params.projectId as string;
        const url = params.url as string | undefined;
        const selector = params.selector as string | undefined;
        const text = params.text as string | undefined;
        const script = params.script as string | undefined;
        const result = await browserAutomation({ action, projectId, url, selector, text, script });
        return json(result);
      }

      // Semantic code search - find code by meaning
      case 'codeSearch': {
        const { codeSearch } = await import('~/lib/.server/llm/tools/simple-wrappers');
        const action = params.action as 'index' | 'search' | 'status' | 'clear';
        const projectId = params.projectId as string;
        const workspacePath = params.workspacePath as string | undefined;
        const query = params.query as string | undefined;
        const openaiApiKey = (params.openaiApiKey as string) || process.env.OPENAI_API_KEY;
        const maxResults = params.maxResults as number | undefined;
        const directoryPrefix = params.directoryPrefix as string | undefined;
        const result = await codeSearch({
          action,
          projectId,
          workspacePath,
          query,
          openaiApiKey,
          maxResults,
          directoryPrefix,
        });
        return json(result);
      }

      default:
        return json({ success: false, error: `Unknown tool: ${tool}` }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Enterprise tool error (${tool}):`, error);
    return json({
      success: false,
      error: 'Enterprise tool operation failed',
      tool
    }, { status: 500 });
  }
}

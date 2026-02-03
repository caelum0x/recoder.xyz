import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

interface EnterpriseToolRequest {
  tool: string;
  params: Record<string, unknown>;
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
  console.log(`[EnterpriseTools] User ${session.user.email} calling tool`);

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
          const env = (context as any)?.cloudflare?.env || process.env || {};
          const dockerBackendUrl =
            (env as any).DOCKER_BACKEND_URL ||
            (env as any).VITE_DOCKER_BACKEND_URL ||
            process.env.DOCKER_BACKEND_URL ||
            'http://localhost:3100';

          try {
            const response = await fetch(`${dockerBackendUrl}/api/files/${projectId}`, {
              headers: { 'Content-Type': 'application/json' },
            });
            if (response.ok) {
              const data = await response.json() as { files?: string[] };
              const allFiles = (data.files || []).filter(Boolean);
              const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
              const filtered = searchTerms.length === 0
                ? allFiles.slice(0, 20)
                : allFiles.filter(f => {
                    const lower = f.toLowerCase();
                    return searchTerms.some(term => lower.includes(term));
                  }).slice(0, 20);
              return json(filtered);
            }
          } catch (error) {
            console.warn('[EnterpriseTools] Docker file discovery failed:', error);
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
        // Simplified subagent delegation using built-in agent types
        const agentType = params.agentType as string;
        const task = params.task as string;
        const context = params.context as string | undefined;

        // Built-in agent type responses
        const agentResponses: Record<string, string> = {
          coder: 'Code implementation agent ready. Use file tools to read, write, and modify code.',
          debugger: 'Debug agent ready. Use readFile and shell tools to investigate errors.',
          architect: 'Architecture agent ready. Use listFiles and readFile to analyze project structure.',
          tester: 'Test agent ready. Use shell tool to run tests and readFile to check test files.',
        };

        return json({
          success: true,
          output: agentResponses[agentType] || `Unknown agent type: ${agentType}`,
          message: `Delegated to ${agentType}: ${task}`,
          context: context?.substring(0, 500)
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
    console.error(`Enterprise tool error (${tool}):`, error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      tool
    }, { status: 500 });
  }
}

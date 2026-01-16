import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * Enterprise Tools API - Server-side execution of enhanced tools
 * This allows client-side code to use enterprise features without importing server modules
 */
export async function action({ request }: ActionFunctionArgs) {
  const { tool, params } = await request.json();

  try {
    switch (tool) {
      case 'readFileEnhanced': {
        const { readFileEnhanced } = await import('~/lib/.server/llm/tools/read-file-enhanced');
        const result = await readFileEnhanced(params, '/workspace');
        return json(result);
      }

      case 'searchReplace': {
        const { searchReplace } = await import('~/lib/.server/llm/tools/search-replace');
        const result = await searchReplace(params, '/workspace');
        return json(result);
      }

      case 'discoverFiles': {
        const { discoverRelevantFiles } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await discoverRelevantFiles(params.query, params.workingDir);
        return json(result);
      }

      case 'autoCommit': {
        const { autoCommitChanges } = await import('~/lib/.server/llm/enterprise-integration');
        const result = await autoCommitChanges(params.files, params.workingDir);
        return json(result);
      }

      case 'codeAssist': {
        const { CodeAssistServer } = await import('~/lib/.server/llm/code_assist/server');
        const server = new CodeAssistServer();
        const result = await server.query(params.query, params.context);
        return json(result);
      }

      case 'delegateSubagent': {
        const { SubagentManager } = await import('~/lib/.server/llm/subagents/subagent-manager');
        const manager = new SubagentManager();
        const result = await manager.delegate(params.agentType, params.task, params.context);
        return json(result);
      }

      case 'webSearch': {
        const { webSearch } = await import('~/lib/.server/llm/tools/web-search');
        const result = await webSearch(params.query, params.options);
        return json(result);
      }

      case 'webFetch': {
        const { webFetch } = await import('~/lib/.server/llm/tools/web-fetch');
        const result = await webFetch(params.url, params.options);
        return json(result);
      }

      case 'memory': {
        const { memoryTool } = await import('~/lib/.server/llm/tools/memoryTool');
        const result = await memoryTool(params.operation, params.data);
        return json(result);
      }

      case 'glob': {
        const { globTool } = await import('~/lib/.server/llm/tools/glob');
        const result = await globTool(params.pattern, params.options);
        return json(result);
      }

      case 'ripGrep': {
        const { ripGrep } = await import('~/lib/.server/llm/tools/ripGrep');
        const result = await ripGrep(params.pattern, params.path, params.options);
        return json(result);
      }

      case 'editFile': {
        const { editFile } = await import('~/lib/.server/llm/tools/edit');
        const result = await editFile(params.filePath, params.edits, params.workingDir);
        return json(result);
      }

      case 'readManyFiles': {
        const { readManyFiles } = await import('~/lib/.server/llm/tools/read-many-files');
        const result = await readManyFiles(params.files, params.workingDir);
        return json(result);
      }

      default:
        return json({ success: false, error: 'Unknown tool' }, { status: 400 });
    }
  } catch (error) {
    return json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

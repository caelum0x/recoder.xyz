import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

// In-memory store for server-side (would use DB in production)
const toolsStore = new Map<string, any>();

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  
  if (!projectId) {
    return json({ error: 'projectId required' }, { status: 400 });
  }

  const tools = toolsStore.get(projectId) || [];
  return json({ tools });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json() as {
    projectId?: string;
    action?: string;
    tool?: any;
    toolId?: string;
  };
  const { projectId, action, tool, toolId } = body;

  if (!projectId) {
    return json({ error: 'projectId required' }, { status: 400 });
  }

  const tools = toolsStore.get(projectId) || [];

  switch (action) {
    case 'add': {
      const newTool = { ...tool, id: `tool-${Date.now()}`, createdAt: Date.now() };
      tools.push(newTool);
      toolsStore.set(projectId, tools);
      return json({ tool: newTool });
    }

    case 'update': {
      const idx = tools.findIndex((t: any) => t.id === toolId);
      if (idx === -1) return json({ error: 'Tool not found' }, { status: 404 });
      tools[idx] = { ...tools[idx], ...tool };
      toolsStore.set(projectId, tools);
      return json({ tool: tools[idx] });
    }

    case 'delete': {
      const filtered = tools.filter((t: any) => t.id !== toolId);
      toolsStore.set(projectId, filtered);
      return json({ success: true });
    }

    case 'execute': {
      const targetTool = tools.find((t: any) => t.id === toolId);
      if (!targetTool) return json({ error: 'Tool not found' }, { status: 404 });
      // Execution happens client-side via terminal
      return json({ tool: targetTool, command: targetTool.command });
    }

    default:
      return json({ error: 'Invalid action' }, { status: 400 });
  }
}

import { map, atom } from 'nanostores';

export interface CustomTool {
  id: string;
  name: string;
  description: string;
  command: string;
  workingDir?: string;
  env?: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}

export interface ToolExecution {
  toolId: string;
  status: 'running' | 'success' | 'error';
  output: string;
  startedAt: number;
  finishedAt?: number;
}

const STORAGE_KEY = 'recoder-custom-tools';

// Load from localStorage
const loadTools = (): CustomTool[] => {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : getDefaultTools();
  } catch {
    return getDefaultTools();
  }
};

const getDefaultTools = (): CustomTool[] => [
  { id: 'format', name: 'format', description: 'Format code with Prettier', command: 'npx prettier --write .', enabled: true, createdAt: Date.now() },
  { id: 'lint', name: 'lint', description: 'Run ESLint and fix issues', command: 'npx eslint . --fix', enabled: true, createdAt: Date.now() },
  { id: 'typecheck', name: 'typecheck', description: 'Run TypeScript type checking', command: 'npx tsc --noEmit', enabled: true, createdAt: Date.now() },
  { id: 'test', name: 'test', description: 'Run test suite', command: 'npm test', enabled: false, createdAt: Date.now() },
  { id: 'build', name: 'build', description: 'Build for production', command: 'npm run build', enabled: true, createdAt: Date.now() },
];

// Stores
export const customToolsStore = map<Record<string, CustomTool>>({});
export const toolExecutionsStore = map<Record<string, ToolExecution>>({});
export const isLoadedStore = atom(false);

// Initialize store
export const initCustomTools = () => {
  if (isLoadedStore.get()) return;
  const tools = loadTools();
  const toolsMap: Record<string, CustomTool> = {};
  tools.forEach(t => toolsMap[t.id] = t);
  customToolsStore.set(toolsMap);
  isLoadedStore.set(true);
};

// Save to localStorage
const persist = () => {
  if (typeof window === 'undefined') return;
  const tools = Object.values(customToolsStore.get());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
};

// Actions
export const addCustomTool = (tool: Omit<CustomTool, 'id' | 'createdAt'>) => {
  const id = `tool-${Date.now()}`;
  const newTool: CustomTool = { ...tool, id, createdAt: Date.now() };
  customToolsStore.setKey(id, newTool);
  persist();
  return newTool;
};

export const updateCustomTool = (id: string, updates: Partial<CustomTool>) => {
  const existing = customToolsStore.get()[id];
  if (!existing) return;
  customToolsStore.setKey(id, { ...existing, ...updates });
  persist();
};

export const deleteCustomTool = (id: string) => {
  const tools = { ...customToolsStore.get() };
  delete tools[id];
  customToolsStore.set(tools);
  persist();
};

export const toggleCustomTool = (id: string) => {
  const tool = customToolsStore.get()[id];
  if (tool) {
    customToolsStore.setKey(id, { ...tool, enabled: !tool.enabled });
    persist();
  }
};

export const getEnabledTools = (): CustomTool[] => {
  return Object.values(customToolsStore.get()).filter(t => t.enabled);
};

export const getToolByName = (name: string): CustomTool | undefined => {
  return Object.values(customToolsStore.get()).find(t => t.name === name && t.enabled);
};

// Tool execution
export const executeCustomTool = async (
  toolId: string,
  executor: (command: string, cwd?: string) => Promise<string>
): Promise<ToolExecution> => {
  const tool = customToolsStore.get()[toolId];
  if (!tool) throw new Error(`Tool not found: ${toolId}`);

  const execution: ToolExecution = {
    toolId,
    status: 'running',
    output: '',
    startedAt: Date.now(),
  };
  toolExecutionsStore.setKey(toolId, execution);

  try {
    const output = await executor(tool.command, tool.workingDir);
    const result: ToolExecution = {
      ...execution,
      status: 'success',
      output,
      finishedAt: Date.now(),
    };
    toolExecutionsStore.setKey(toolId, result);
    return result;
  } catch (err: any) {
    const result: ToolExecution = {
      ...execution,
      status: 'error',
      output: err.message || String(err),
      finishedAt: Date.now(),
    };
    toolExecutionsStore.setKey(toolId, result);
    return result;
  }
};

// Export tools for AI context
export const getToolsForAI = (): string => {
  const tools = getEnabledTools();
  if (tools.length === 0) return '';
  
  return `
## Available Custom Tools
The user has configured these custom tools you can use:

${tools.map(t => `- **${t.name}**: ${t.description}
  Command: \`${t.command}\``).join('\n\n')}

To use a tool, execute its command in the terminal.
`;
};

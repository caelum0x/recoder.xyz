import { useStore } from '@nanostores/react';
import { useEffect, useCallback } from 'react';
import {
  customToolsStore,
  toolExecutionsStore,
  initCustomTools,
  addCustomTool,
  updateCustomTool,
  deleteCustomTool,
  toggleCustomTool,
  executeCustomTool,
  getEnabledTools,
  getToolByName,
  type CustomTool,
  type ToolExecution,
} from '../stores/custom-tools';
import { workbenchStore } from '../stores/workbench';

export function useCustomTools() {
  const tools = useStore(customToolsStore);
  const executions = useStore(toolExecutionsStore);

  useEffect(() => {
    initCustomTools();
  }, []);

  const runTool = useCallback(async (toolId: string) => {
    const tool = tools[toolId];
    if (!tool) return;

    // Execute via terminal
    const terminalStoreGetter = workbenchStore.terminalStore;
    const terminalStore = terminalStoreGetter.get();

    return executeCustomTool(toolId, async (command) => {
      // Write command to active terminal
      const terminals = terminalStore.getTerminals();
      if (terminals.length > 0) {
        const terminal = terminals[0];
        // Send command to terminal
        (terminal.terminal as any).paste?.(command + '\n') || terminal.terminal.write(command + '\n');
      }
      return 'Command sent to terminal';
    });
  }, [tools]);

  const runToolByName = useCallback(async (name: string) => {
    const tool = getToolByName(name);
    if (tool) {
      return runTool(tool.id);
    }
  }, [runTool]);

  return {
    tools: Object.values(tools),
    toolsMap: tools,
    executions,
    enabledTools: getEnabledTools(),
    addTool: addCustomTool,
    updateTool: updateCustomTool,
    deleteTool: deleteCustomTool,
    toggleTool: toggleCustomTool,
    runTool,
    runToolByName,
    getToolByName,
  };
}

// Hook for AI to access tools
export function useToolsForAI() {
  const { enabledTools } = useCustomTools();
  
  return enabledTools.map(t => ({
    name: t.name,
    description: t.description,
    command: t.command,
  }));
}

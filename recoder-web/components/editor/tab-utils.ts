/**
 * Tab management utilities for the editor
 */

interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  isDirty: boolean;
  content: string;
  fileType?: string;
}

/**
 * Create a new tab from a file path
 */
export function createTabFromFile(filePath: string, content: string = ''): EditorTab {
  const fileName = filePath.split('/').pop() || 'untitled';
  const fileType = fileName.split('.').pop()?.toLowerCase();
  
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    filePath,
    fileName,
    isDirty: false,
    content,
    fileType
  };
}

/**
 * Update tab content and mark as dirty if changed
 */
export function updateTabContent(tab: EditorTab, newContent: string): EditorTab {
  return {
    ...tab,
    content: newContent,
    isDirty: tab.content !== newContent
  };
}

/**
 * Mark tab as saved (clean)
 */
export function markTabSaved(tab: EditorTab): EditorTab {
  return {
    ...tab,
    isDirty: false
  };
}

/**
 * Find tab by file path
 */
export function findTabByFilePath(tabs: EditorTab[], filePath: string): EditorTab | undefined {
  return tabs.find(tab => tab.filePath === filePath);
}

/**
 * Find tab by ID
 */
export function findTabById(tabs: EditorTab[], tabId: string): EditorTab | undefined {
  return tabs.find(tab => tab.id === tabId);
}

/**
 * Get active tab
 */
export function getActiveTab(tabs: EditorTab[], activeTabId: string): EditorTab | undefined {
  return findTabById(tabs, activeTabId);
}

/**
 * Close tab and return updated tabs array and new active tab ID
 */
export function closeTab(tabs: EditorTab[], tabIdToClose: string, activeTabId: string): {
  newTabs: EditorTab[];
  newActiveTabId: string;
} {
  const newTabs = tabs.filter(tab => tab.id !== tabIdToClose);
  
  // If we closed the active tab, select a new one
  let newActiveTabId = activeTabId;
  if (tabIdToClose === activeTabId) {
    if (newTabs.length > 0) {
      // Find the index of the closed tab to select the next logical tab
      const closedTabIndex = tabs.findIndex(tab => tab.id === tabIdToClose);
      if (closedTabIndex >= newTabs.length) {
        // Select the last tab if we closed the last one
        newActiveTabId = newTabs[newTabs.length - 1].id;
      } else {
        // Select the tab at the same position
        newActiveTabId = newTabs[closedTabIndex].id;
      }
    } else {
      newActiveTabId = '';
    }
  }
  
  return { newTabs, newActiveTabId };
}

/**
 * Reorder tabs
 */
export function reorderTabs(tabs: EditorTab[], fromIndex: number, toIndex: number): EditorTab[] {
  const newTabs = [...tabs];
  const [removed] = newTabs.splice(fromIndex, 1);
  newTabs.splice(toIndex, 0, removed);
  return newTabs;
}

/**
 * Get file extension for syntax highlighting
 */
export function getFileLanguage(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'json': 'json',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'xml': 'xml',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'sol': 'solidity',
    'php': 'php',
    'rb': 'ruby',
    'swift': 'swift',
    'kt': 'kotlin',
    'dart': 'dart'
  };

  return languageMap[extension || ''] || 'text';
}
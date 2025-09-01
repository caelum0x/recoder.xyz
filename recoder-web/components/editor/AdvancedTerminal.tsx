'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Terminal, X, Plus, Maximize2, Minimize2, Settings,
  Copy, Download, Upload, RefreshCw, Folder, FileText,
  Zap, Activity, Clock, User, GitBranch, Package,
  Play, Square, RotateCcw, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TerminalTab {
  id: string;
  name: string;
  workingDirectory: string;
  history: TerminalEntry[];
  isActive: boolean;
  status: 'idle' | 'running' | 'error';
  pid?: number;
}

interface TerminalEntry {
  id: string;
  command: string;
  output: string;
  errorOutput?: string;
  timestamp: string;
  duration: number;
  exitCode: number;
  type: 'command' | 'output' | 'error' | 'system';
}

interface AdvancedTerminalProps {
  projectId: string;
  isVisible: boolean;
  onClose: () => void;
  initialDirectory?: string;
}

const AdvancedTerminal: React.FC<AdvancedTerminalProps> = ({
  projectId,
  isVisible,
  onClose,
  initialDirectory = '/'
}) => {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const [theme, setTheme] = useState<'dark' | 'light' | 'matrix'>('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isVisible && tabs.length === 0) {
      createNewTab();
    }
  }, [isVisible]);

  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [tabs, activeTabId, autoScroll]);

  const createNewTab = () => {
    const newTab: TerminalTab = {
      id: `terminal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Terminal ${tabs.length + 1}`,
      workingDirectory: initialDirectory,
      history: [{
        id: `entry_${Date.now()}`,
        command: '',
        output: `Welcome to Recoder Terminal
Project: ${projectId}
Working Directory: ${initialDirectory}
Type 'help' for available commands.

`,
        timestamp: new Date().toISOString(),
        duration: 0,
        exitCode: 0,
        type: 'system'
      }],
      isActive: false,
      status: 'idle'
    };

    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return; // Don't close the last tab
    
    setTabs(prev => prev.filter(tab => tab.id !== tabId));
    
    if (activeTabId === tabId) {
      const remainingTabs = tabs.filter(tab => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTabId(remainingTabs[0].id);
      }
    }
  };

  const executeCommand = async (command: string, tabId?: string) => {
    const targetTabId = tabId || activeTabId;
    if (!targetTabId || !command.trim()) return;

    const startTime = Date.now();
    
    // Add command to history
    setCommandHistory(prev => [...prev.slice(-99), command]); // Keep last 100 commands
    setHistoryIndex(-1);
    
    // Update tab status to running
    setTabs(prev => prev.map(tab => 
      tab.id === targetTabId 
        ? { ...tab, status: 'running' as const }
        : tab
    ));

    try {
      // Add command entry
      const commandEntry: TerminalEntry = {
        id: `entry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        command,
        output: '',
        timestamp: new Date().toISOString(),
        duration: 0,
        exitCode: 0,
        type: 'command'
      };

      setTabs(prev => prev.map(tab =>
        tab.id === targetTabId
          ? { ...tab, history: [...tab.history, commandEntry] }
          : tab
      ));

      // Execute command via API
      const response = await fetch(`/api/projects/${projectId}/terminal/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command,
          workingDirectory: tabs.find(t => t.id === targetTabId)?.workingDirectory || initialDirectory,
          tabId: targetTabId
        })
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (data.success) {
        // Add output entry
        const outputEntry: TerminalEntry = {
          id: `output_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          command: '',
          output: data.output || '',
          errorOutput: data.errorOutput,
          timestamp: new Date().toISOString(),
          duration,
          exitCode: data.exitCode || 0,
          type: data.errorOutput ? 'error' : 'output'
        };

        setTabs(prev => prev.map(tab =>
          tab.id === targetTabId
            ? { 
                ...tab, 
                history: [...tab.history, outputEntry],
                workingDirectory: data.workingDirectory || tab.workingDirectory,
                status: 'idle' as const
              }
            : tab
        ));
      } else {
        // Add error entry
        const errorEntry: TerminalEntry = {
          id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          command: '',
          output: '',
          errorOutput: data.error || 'Command failed',
          timestamp: new Date().toISOString(),
          duration,
          exitCode: 1,
          type: 'error'
        };

        setTabs(prev => prev.map(tab =>
          tab.id === targetTabId
            ? { 
                ...tab, 
                history: [...tab.history, errorEntry],
                status: 'error' as const
              }
            : tab
        ));
      }
    } catch (error) {
      console.error('Terminal command error:', error);
      
      const errorEntry: TerminalEntry = {
        id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        command: '',
        output: '',
        errorOutput: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        exitCode: 1,
        type: 'error'
      };

      setTabs(prev => prev.map(tab =>
        tab.id === targetTabId
          ? { 
              ...tab, 
              history: [...tab.history, errorEntry],
              status: 'error' as const
            }
          : tab
      ));
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (currentCommand.trim()) {
        executeCommand(currentCommand);
        setCurrentCommand('');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // TODO: Implement tab completion
    }
  };

  const clearTerminal = (tabId?: string) => {
    const targetTabId = tabId || activeTabId;
    if (!targetTabId) return;

    setTabs(prev => prev.map(tab =>
      tab.id === targetTabId
        ? { ...tab, history: [] }
        : tab
    ));
  };

  const copyOutput = (entry: TerminalEntry) => {
    navigator.clipboard.writeText(entry.output + (entry.errorOutput || ''));
  };

  const getThemeClasses = () => {
    switch (theme) {
      case 'light':
        return 'bg-white text-black border-gray-300';
      case 'matrix':
        return 'bg-black text-green-400 border-green-500 font-mono';
      default:
        return 'bg-gray-900 text-gray-100 border-gray-700';
    }
  };

  const getStatusColor = (status: TerminalTab['status']) => {
    switch (status) {
      case 'running': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-green-500';
    }
  };

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  if (!isVisible) return null;

  return (
    <div className={`fixed ${isFullscreen ? 'inset-0' : 'bottom-0 left-0 right-0 h-80'} bg-gray-900 border-t border-gray-700 z-50 flex flex-col`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-2 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-gray-300">Advanced Terminal</span>
          
          {/* Tab Navigation */}
          <div className="flex items-center gap-1 ml-4">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer ${
                  tab.id === activeTabId
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className={`w-2 h-2 rounded-full ${getStatusColor(tab.status)}`} />
                <span>{tab.name}</span>
                {tabs.length > 1 && (
                  <X
                    className="h-3 w-3 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  />
                )}
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={createNewTab}
              className="h-6 w-6 p-0 text-gray-400 hover:text-white"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Terminal Controls */}
          <Select value={theme} onValueChange={(value: any) => setTheme(value)}>
            <SelectTrigger className="w-20 h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="matrix">Matrix</SelectItem>
            </SelectContent>
          </Select>

          <Select value={fontSize.toString()} onValueChange={(value) => setFontSize(parseInt(value))}>
            <SelectTrigger className="w-16 h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12px</SelectItem>
              <SelectItem value="14">14px</SelectItem>
              <SelectItem value="16">16px</SelectItem>
              <SelectItem value="18">18px</SelectItem>
            </SelectContent>
          </Select>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowSearch(!showSearch)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <Search className="h-3 w-3" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => clearTerminal()}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="h-6 w-6 p-0 text-gray-400 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>

          <X
            className="h-4 w-4 cursor-pointer text-gray-400 hover:text-red-400"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="p-2 border-b border-gray-700 bg-gray-800">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search terminal output..."
            className="text-xs bg-gray-700 border-gray-600 text-gray-300"
          />
        </div>
      )}

      {/* Terminal Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab && (
          <>
            {/* Terminal Output */}
            <div
              ref={terminalRef}
              className={`flex-1 overflow-y-auto p-4 font-mono text-sm ${getThemeClasses()}`}
              style={{ fontSize: `${fontSize}px` }}
            >
              {activeTab.history.map((entry) => (
                <div key={entry.id} className="mb-2">
                  {entry.type === 'command' && (
                    <div className="flex items-center gap-2 text-blue-400">
                      <span className="text-green-400">$</span>
                      <span>{entry.command}</span>
                      <span className="text-xs text-gray-500 ml-auto">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  
                  {entry.output && (
                    <div className="whitespace-pre-wrap text-gray-300 ml-4">
                      {searchQuery && entry.output.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                        <span
                          dangerouslySetInnerHTML={{
                            __html: entry.output.replace(
                              new RegExp(searchQuery, 'gi'),
                              '<mark class="bg-yellow-400 text-black">$&</mark>'
                            )
                          }}
                        />
                      ) : (
                        entry.output
                      )}
                    </div>
                  )}
                  
                  {entry.errorOutput && (
                    <div className="whitespace-pre-wrap text-red-400 ml-4">
                      {entry.errorOutput}
                    </div>
                  )}
                  
                  {entry.type === 'command' && entry.duration > 0 && (
                    <div className="text-xs text-gray-500 ml-4">
                      Executed in {entry.duration}ms • Exit code: {entry.exitCode}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyOutput(entry)}
                        className="h-4 w-4 p-0 ml-2 text-gray-500 hover:text-white"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Command Input */}
            <div className={`border-t border-gray-700 p-2 ${getThemeClasses()}`}>
              <div className="flex items-center gap-2">
                <span className="text-green-400">$</span>
                <span className="text-blue-400 text-xs">{activeTab.workingDirectory}</span>
                <span className="text-gray-400">{'>'}</span>
                <input
                  ref={inputRef}
                  value={currentCommand}
                  onChange={(e) => setCurrentCommand(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="flex-1 bg-transparent outline-none text-gray-300"
                  placeholder="Enter command..."
                  style={{ fontSize: `${fontSize}px` }}
                />
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Activity className={`h-3 w-3 ${getStatusColor(activeTab.status)}`} />
                  <span className="capitalize">{activeTab.status}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdvancedTerminal;

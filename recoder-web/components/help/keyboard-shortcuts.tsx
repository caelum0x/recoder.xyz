'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Keyboard, Search, Command, Settings, Eye, EyeOff, Filter,
  Code, Play, Save, Copy, Undo, Redo, FileText, FolderOpen,
  X, CheckCircle, AlertCircle, Lightbulb, Zap, Users, Globe,
  Monitor, Smartphone, Tablet, Download, Upload, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface KeyboardShortcut {
  id: string;
  name: string;
  description: string;
  keys: string[];
  category: string;
  context: string;
  customizable: boolean;
  enabled: boolean;
  conflicts?: string[];
}

interface ShortcutCategory {
  id: string;
  name: string;
  icon: any;
  description: string;
  shortcuts: KeyboardShortcut[];
}

export default function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('general');
  const [showDisabled, setShowDisabled] = useState(false);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string[]>>({});
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);

  const shortcutCategories: ShortcutCategory[] = [
    {
      id: 'general',
      name: 'General',
      icon: Command,
      description: 'Global platform shortcuts',
      shortcuts: [
        {
          id: 'help',
          name: 'Open Help',
          description: 'Open the help center',
          keys: ['?'],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'command-palette',
          name: 'Command Palette',
          description: 'Open command palette for quick actions',
          keys: ['Ctrl', 'K'],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'search',
          name: 'Global Search',
          description: 'Search across projects and files',
          keys: ['Ctrl', 'Shift', 'F'],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'settings',
          name: 'Open Settings',
          description: 'Open user settings',
          keys: ['Ctrl', ','],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'new-project',
          name: 'New Project',
          description: 'Create a new project',
          keys: ['Ctrl', 'Shift', 'N'],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'dashboard',
          name: 'Go to Dashboard',
          description: 'Navigate to dashboard',
          keys: ['G', 'D'],
          category: 'general',
          context: 'global',
          customizable: true,
          enabled: true
        }
      ]
    },
    {
      id: 'editor',
      name: 'Code Editor',
      icon: Code,
      description: 'Code editing and navigation',
      shortcuts: [
        {
          id: 'save',
          name: 'Save File',
          description: 'Save current file',
          keys: ['Ctrl', 'S'],
          category: 'editor',
          context: 'editor',
          customizable: false,
          enabled: true
        },
        {
          id: 'save-all',
          name: 'Save All Files',
          description: 'Save all modified files',
          keys: ['Ctrl', 'Shift', 'S'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'undo',
          name: 'Undo',
          description: 'Undo last action',
          keys: ['Ctrl', 'Z'],
          category: 'editor',
          context: 'editor',
          customizable: false,
          enabled: true
        },
        {
          id: 'redo',
          name: 'Redo',
          description: 'Redo last undone action',
          keys: ['Ctrl', 'Y'],
          category: 'editor',
          context: 'editor',
          customizable: false,
          enabled: true
        },
        {
          id: 'copy-line',
          name: 'Copy Line',
          description: 'Copy current line',
          keys: ['Ctrl', 'C'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'duplicate-line',
          name: 'Duplicate Line',
          description: 'Duplicate current line',
          keys: ['Ctrl', 'D'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'comment-toggle',
          name: 'Toggle Comment',
          description: 'Toggle line/block comment',
          keys: ['Ctrl', '/'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'format-code',
          name: 'Format Code',
          description: 'Auto-format current file',
          keys: ['Shift', 'Alt', 'F'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'go-to-line',
          name: 'Go to Line',
          description: 'Go to specific line number',
          keys: ['Ctrl', 'G'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'find-replace',
          name: 'Find and Replace',
          description: 'Open find and replace dialog',
          keys: ['Ctrl', 'H'],
          category: 'editor',
          context: 'editor',
          customizable: true,
          enabled: true
        }
      ]
    },
    {
      id: 'ai',
      name: 'AI Features',
      icon: Zap,
      description: 'AI-powered development tools',
      shortcuts: [
        {
          id: 'ai-generate',
          name: 'Generate Code',
          description: 'Open AI code generation dialog',
          keys: ['Ctrl', 'Shift', 'A'],
          category: 'ai',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'ai-explain',
          name: 'Explain Code',
          description: 'Get AI explanation of selected code',
          keys: ['Ctrl', 'Shift', 'E'],
          category: 'ai',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'ai-refactor',
          name: 'Refactor Code',
          description: 'AI-powered code refactoring',
          keys: ['Ctrl', 'Shift', 'R'],
          category: 'ai',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'ai-optimize',
          name: 'Optimize Code',
          description: 'AI code optimization suggestions',
          keys: ['Ctrl', 'Shift', 'O'],
          category: 'ai',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'ai-chat',
          name: 'AI Chat',
          description: 'Open AI assistant chat',
          keys: ['Ctrl', 'Shift', 'C'],
          category: 'ai',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'ai-review',
          name: 'Code Review',
          description: 'AI-powered code review',
          keys: ['Ctrl', 'Shift', 'V'],
          category: 'ai',
          context: 'editor',
          customizable: true,
          enabled: true
        }
      ]
    },
    {
      id: 'project',
      name: 'Project Management',
      icon: FolderOpen,
      description: 'Project and file operations',
      shortcuts: [
        {
          id: 'open-file',
          name: 'Open File',
          description: 'Quick file opener',
          keys: ['Ctrl', 'P'],
          category: 'project',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'new-file',
          name: 'New File',
          description: 'Create new file',
          keys: ['Ctrl', 'N'],
          category: 'project',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'close-file',
          name: 'Close File',
          description: 'Close current file',
          keys: ['Ctrl', 'W'],
          category: 'project',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'close-all',
          name: 'Close All Files',
          description: 'Close all open files',
          keys: ['Ctrl', 'Shift', 'W'],
          category: 'project',
          context: 'editor',
          customizable: true,
          enabled: true
        },
        {
          id: 'toggle-sidebar',
          name: 'Toggle Sidebar',
          description: 'Show/hide project sidebar',
          keys: ['Ctrl', 'B'],
          category: 'project',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'file-explorer',
          name: 'Focus File Explorer',
          description: 'Focus on file explorer',
          keys: ['Ctrl', 'Shift', 'E'],
          category: 'project',
          context: 'global',
          customizable: true,
          enabled: true
        }
      ]
    },
    {
      id: 'deployment',
      name: 'Deployment',
      icon: Globe,
      description: 'Deployment and build operations',
      shortcuts: [
        {
          id: 'deploy',
          name: 'Deploy Project',
          description: 'Deploy current project',
          keys: ['Ctrl', 'Shift', 'D'],
          category: 'deployment',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'build',
          name: 'Build Project',
          description: 'Build current project',
          keys: ['Ctrl', 'Shift', 'B'],
          category: 'deployment',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'preview',
          name: 'Preview',
          description: 'Open preview window',
          keys: ['Ctrl', 'Shift', 'P'],
          category: 'deployment',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'logs',
          name: 'View Logs',
          description: 'Open deployment logs',
          keys: ['Ctrl', 'Shift', 'L'],
          category: 'deployment',
          context: 'global',
          customizable: true,
          enabled: true
        }
      ]
    },
    {
      id: 'collaboration',
      name: 'Collaboration',
      icon: Users,
      description: 'Team and sharing features',
      shortcuts: [
        {
          id: 'share-project',
          name: 'Share Project',
          description: 'Share current project',
          keys: ['Ctrl', 'Shift', 'U'],
          category: 'collaboration',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'invite-member',
          name: 'Invite Team Member',
          description: 'Invite team member to project',
          keys: ['Ctrl', 'Shift', 'I'],
          category: 'collaboration',
          context: 'global',
          customizable: true,
          enabled: true
        },
        {
          id: 'live-share',
          name: 'Start Live Share',
          description: 'Start collaborative editing session',
          keys: ['Ctrl', 'Shift', 'J'],
          category: 'collaboration',
          context: 'editor',
          customizable: true,
          enabled: true
        }
      ]
    }
  ];

  const filteredShortcuts = shortcutCategories
    .find(cat => cat.id === selectedCategory)
    ?.shortcuts.filter(shortcut => {
      const matchesSearch = searchQuery === '' || 
        shortcut.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEnabled = showDisabled || shortcut.enabled;
      return matchesSearch && matchesEnabled;
    }) || [];

  useEffect(() => {
    // Load custom shortcuts from localStorage
    const saved = localStorage.getItem('keyboard-shortcuts');
    if (saved) {
      try {
        setCustomShortcuts(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load custom shortcuts:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Set up global keyboard listener
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const formatKeys = (keys: string[]) => {
    return keys.map(key => {
      // Convert to more readable format
      const keyMap: Record<string, string> = {
        'Ctrl': '⌘',
        'Alt': '⌥',
        'Shift': '⇧',
        'Enter': '↩',
        'Tab': '⇥',
        'Escape': '⎋',
        'Backspace': '⌫',
        'Delete': '⌦',
        'ArrowUp': '↑',
        'ArrowDown': '↓',
        'ArrowLeft': '←',
        'ArrowRight': '→'
      };
      
      return keyMap[key] || key;
    });
  };

  const startRecordingKeys = (shortcutId: string) => {
    setEditingShortcut(shortcutId);
    setRecordingKeys([]);
    
    const handleKeyRecord = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      const keys: string[] = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.altKey) keys.push('Alt');
      if (e.shiftKey) keys.push('Shift');
      if (e.metaKey) keys.push('Meta');
      
      const key = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        keys.push(key.length === 1 ? key.toUpperCase() : key);
        
        // Save the new shortcut
        const newShortcuts = { ...customShortcuts, [shortcutId]: keys };
        setCustomShortcuts(newShortcuts);
        localStorage.setItem('keyboard-shortcuts', JSON.stringify(newShortcuts));
        
        setEditingShortcut(null);
        document.removeEventListener('keydown', handleKeyRecord, true);
        
        toast.success('Shortcut updated successfully!');
      } else {
        setRecordingKeys(keys);
      }
    };
    
    document.addEventListener('keydown', handleKeyRecord, true);
    
    // Auto-cancel after 5 seconds
    setTimeout(() => {
      if (editingShortcut === shortcutId) {
        setEditingShortcut(null);
        document.removeEventListener('keydown', handleKeyRecord, true);
        toast.error('Shortcut recording cancelled');
      }
    }, 5000);
  };

  const resetShortcut = (shortcutId: string) => {
    const newShortcuts = { ...customShortcuts };
    delete newShortcuts[shortcutId];
    setCustomShortcuts(newShortcuts);
    localStorage.setItem('keyboard-shortcuts', JSON.stringify(newShortcuts));
    toast.success('Shortcut reset to default');
  };

  const exportShortcuts = () => {
    const data = {
      customShortcuts,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recoder-shortcuts.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Shortcuts exported successfully!');
  };

  const importShortcuts = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.customShortcuts) {
          setCustomShortcuts(data.customShortcuts);
          localStorage.setItem('keyboard-shortcuts', JSON.stringify(data.customShortcuts));
          toast.success('Shortcuts imported successfully!');
        } else {
          toast.error('Invalid shortcuts file format');
        }
      } catch (error) {
        toast.error('Failed to import shortcuts');
      }
    };
    reader.readAsText(file);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setIsOpen(false)}>
      <div 
        className="fixed inset-4 bg-white rounded-xl shadow-2xl overflow-hidden max-w-6xl mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Keyboard className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Keyboard Shortcuts</h2>
                <p className="text-blue-100">Customize and learn platform shortcuts</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r overflow-y-auto">
            <div className="p-4">
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search shortcuts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center justify-between mb-4">
                <Label htmlFor="show-disabled" className="text-sm">Show disabled</Label>
                <Switch
                  id="show-disabled"
                  checked={showDisabled}
                  onCheckedChange={setShowDisabled}
                />
              </div>
            </div>

            {/* Categories */}
            <nav className="px-2">
              {shortcutCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors mb-1 ${
                    selectedCategory === category.id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <category.icon className="w-4 h-4" />
                  <div className="flex-1">
                    <div className="font-medium">{category.name}</div>
                    <div className="text-xs text-gray-500">{category.shortcuts.length} shortcuts</div>
                  </div>
                </button>
              ))}
            </nav>

            {/* Actions */}
            <div className="p-4 border-t mt-4">
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportShortcuts}
                  className="w-full justify-start"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={importShortcuts}
                    className="hidden"
                    id="import-shortcuts"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('import-shortcuts')?.click()}
                    className="w-full justify-start"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Import
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h3 className="text-2xl font-bold mb-2">
                {shortcutCategories.find(cat => cat.id === selectedCategory)?.name} Shortcuts
              </h3>
              <p className="text-gray-600">
                {shortcutCategories.find(cat => cat.id === selectedCategory)?.description}
              </p>
            </div>

            <div className="space-y-3">
              {filteredShortcuts.map((shortcut) => {
                const isEditing = editingShortcut === shortcut.id;
                const currentKeys = customShortcuts[shortcut.id] || shortcut.keys;
                const isCustomized = !!customShortcuts[shortcut.id];
                
                return (
                  <Card key={shortcut.id} className={`${!shortcut.enabled ? 'opacity-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{shortcut.name}</h4>
                            {isCustomized && (
                              <Badge variant="secondary" className="text-xs">
                                Custom
                              </Badge>
                            )}
                            {!shortcut.enabled && (
                              <Badge variant="outline" className="text-xs">
                                Disabled
                              </Badge>
                            )}
                            {shortcut.conflicts && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Conflict
                              </Badge>
                            )}
                          </div>
                          <p className="text-gray-600 text-sm mb-2">{shortcut.description}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {shortcut.context}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {/* Shortcut Keys */}
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                {recordingKeys.length > 0 ? (
                                  recordingKeys.map((key, index) => (
                                    <kbd key={index} className="px-2 py-1 bg-gray-100 text-xs rounded border">
                                      {formatKeys([key])[0]}
                                    </kbd>
                                  ))
                                ) : (
                                  <Badge variant="destructive" className="animate-pulse">
                                    Recording...
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              formatKeys(currentKeys).map((key, index) => (
                                <kbd key={index} className="px-2 py-1 bg-gray-100 text-xs rounded border">
                                  {key}
                                </kbd>
                              ))
                            )}
                          </div>
                          
                          {/* Actions */}
                          {shortcut.customizable && (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => startRecordingKeys(shortcut.id)}
                                disabled={isEditing}
                                className="h-8 px-2"
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                              {isCustomized && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetShortcut(shortcut.id)}
                                  className="h-8 px-2"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {shortcut.conflicts && (
                        <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                          <div className="flex items-center gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span className="font-medium">Shortcut Conflict</span>
                          </div>
                          <p className="text-red-600 text-xs mt-1">
                            This shortcut conflicts with: {shortcut.conflicts.join(', ')}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              
              {filteredShortcuts.length === 0 && (
                <div className="text-center py-12">
                  <Keyboard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">
                    {searchQuery ? `No shortcuts found for "${searchQuery}"` : 'No shortcuts available'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4" />
                <span>Press <kbd className="px-1 bg-gray-200 rounded">?</kbd> to open this dialog</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span>{filteredShortcuts.filter(s => s.enabled).length} active shortcuts</span>
              <span>{Object.keys(customShortcuts).length} customized</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Code2, Save, Download, Upload, Settings, Search, Replace, 
  ZoomIn, ZoomOut, RotateCcw, RotateCw, Play, Pause, Terminal,
  FileText, Folder, FolderOpen, Plus, X, ChevronRight, ChevronDown,
  GitBranch, GitCommit, Users, MessageCircle, Bell, Star,
  Lightbulb, Zap, Bug, CheckCircle, AlertTriangle, Sparkles,
  Monitor, Smartphone, Tablet, Eye, EyeOff, Maximize, Minimize,
  Wifi, WifiOff, RefreshCw
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CodeEditorPage() {
  const [activeFile, setActiveFile] = useState('App.jsx');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState('desktop');
  const [darkMode, setDarkMode] = useState(true);
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false);
  const [engineConnected, setEngineConnected] = useState(false);
  const [engineStatus, setEngineStatus] = useState('checking');
  const [generationLoading, setGenerationLoading] = useState(false);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [lastGenerationResult, setLastGenerationResult] = useState(null);

  const files = [
    { name: 'src', type: 'folder', expanded: true, children: [
      { name: 'components', type: 'folder', expanded: true, children: [
        { name: 'Header.jsx', type: 'file', language: 'javascript' },
        { name: 'Button.jsx', type: 'file', language: 'javascript' },
        { name: 'Card.jsx', type: 'file', language: 'javascript' }
      ]},
      { name: 'pages', type: 'folder', expanded: false, children: [
        { name: 'Home.jsx', type: 'file', language: 'javascript' },
        { name: 'About.jsx', type: 'file', language: 'javascript' }
      ]},
      { name: 'App.jsx', type: 'file', language: 'javascript' },
      { name: 'index.js', type: 'file', language: 'javascript' }
    ]},
    { name: 'public', type: 'folder', expanded: false, children: [
      { name: 'index.html', type: 'file', language: 'html' },
      { name: 'favicon.ico', type: 'file', language: 'asset' }
    ]},
    { name: 'package.json', type: 'file', language: 'json' },
    { name: 'README.md', type: 'file', language: 'markdown' }
  ];

  const openTabs = [
    { name: 'App.jsx', modified: true, active: true },
    { name: 'Header.jsx', modified: false, active: false },
    { name: 'package.json', modified: true, active: false }
  ];

  const collaborators = [
    { name: 'Alex Johnson', avatar: '👨‍💻', status: 'online', cursor: { line: 45, color: '#3B82F6' } },
    { name: 'Sarah Chen', avatar: '👩‍💻', status: 'online', cursor: { line: 78, color: '#10B981' } },
    { name: 'Mike Wilson', avatar: '👨‍🎨', status: 'away', cursor: null }
  ];

  const aiSuggestions = [
    {
      type: 'optimization',
      title: 'Optimize React Component',
      description: 'This component can be optimized using React.memo to prevent unnecessary re-renders',
      line: 32,
      severity: 'info'
    },
    {
      type: 'bug',
      title: 'Potential Memory Leak',
      description: 'useEffect hook is missing dependency array, which may cause memory leaks',
      line: 67,
      severity: 'warning'
    },
    {
      type: 'enhancement',
      title: 'Add PropTypes',
      description: 'Consider adding PropTypes for better type checking and documentation',
      line: 12,
      severity: 'suggestion'
    }
  ];

  const codeContent = `import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Button } from './components/Button';
import { Card } from './components/Card';
import './App.css';

function App() {
  const [count, setCount] = useState(0);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/data');
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const incrementCount = () => {
    setCount(prev => prev + 1);
  };

  return (
    <div className="app">
      <Header title="My App" />
      
      <main className="main-content">
        <Card>
          <h1>Welcome to Recoder</h1>
          <p>AI-powered development platform</p>
          
          <div className="counter-section">
            <p>Count: {count}</p>
            <Button onClick={incrementCount}>
              Increment
            </Button>
          </div>
          
          <div className="data-section">
            <h2>Data from API</h2>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <ul>
                {data.map(item => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

export default App;`;

  const renderFileTree = (files: any[], level = 0) => {
    return files.map((file, index) => (
      <div key={index} className="select-none">
        <div 
          className={`flex items-center py-1 px-2 hover:bg-slate-700/50 cursor-pointer rounded text-sm ${
            file.name === activeFile ? 'bg-blue-600/20 text-blue-300' : 'text-slate-300'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => {
            if (file.type === 'file') {
              setActiveFile(file.name);
            }
          }}
        >
          {file.type === 'folder' ? (
            file.expanded ? <ChevronDown className="w-4 h-4 mr-1" /> : <ChevronRight className="w-4 h-4 mr-1" />
          ) : null}
          
          {file.type === 'folder' ? (
            file.expanded ? <FolderOpen className="w-4 h-4 mr-2" /> : <Folder className="w-4 h-4 mr-2" />
          ) : (
            <FileText className="w-4 h-4 mr-2" />
          )}
          
          <span>{file.name}</span>
          {file.modified && <div className="w-2 h-2 bg-orange-400 rounded-full ml-auto" />}
        </div>
        
        {file.children && file.expanded && (
          <div>{renderFileTree(file.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  // Check production engine connectivity
  useEffect(() => {
    checkEngineConnection();
  }, []);

  const checkEngineConnection = async () => {
    try {
      setEngineStatus('checking');
      const response = await fetch('/api/generate');
      if (response.ok) {
        setEngineConnected(true);
        setEngineStatus('connected');
      } else {
        setEngineConnected(false);
        setEngineStatus('error');
      }
    } catch (error) {
      setEngineConnected(false);
      setEngineStatus('disconnected');
    }
  };

  const generateCode = async () => {
    if (!generationPrompt.trim()) return;

    setGenerationLoading(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: generationPrompt,
          type: 'component',
          framework: 'react',
          features: ['typescript', 'responsive', 'accessible'],
          userId: 'editor-user'
        })
      });

      const result = await response.json();
      setLastGenerationResult(result);
      
      if (result.success) {
        // Update the editor with generated code
        console.log('Code generated successfully:', result);
      }
    } catch (error) {
      console.error('Code generation failed:', error);
    } finally {
      setGenerationLoading(false);
    }
  };

  return (
    <div className={`h-screen flex flex-col ${darkMode ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'}`}>
      {/* Top Bar */}
      <div className={`h-12 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-100 border-gray-200'} border-b flex items-center justify-between px-4`}>
        <div className="flex items-center space-x-4">
          <h1 className="text-lg font-bold text-blue-400">Recoder Editor</h1>
          <div className="flex items-center space-x-2 text-sm text-slate-400">
            <span>my-react-app</span>
            <GitBranch className="w-4 h-4" />
            <span>main</span>
          </div>
          
          {/* Production Engine Status */}
          <div className="flex items-center space-x-2">
            {engineConnected ? (
              <div className="flex items-center space-x-1 text-green-400">
                <Wifi className="w-4 h-4" />
                <span className="text-xs">Engine Connected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-red-400">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs">Engine Offline</span>
                <button 
                  onClick={checkEngineConnection}
                  className="text-xs hover:text-red-300"
                  title="Retry connection"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Collaborators */}
          <div className="flex items-center space-x-1">
            {collaborators.map((collab, index) => (
              <div key={index} className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs">
                  {collab.avatar}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-800 ${
                  collab.status === 'online' ? 'bg-green-400' : 'bg-yellow-400'
                }`} />
              </div>
            ))}
            <button 
              onClick={() => setCollaboratorsOpen(!collaboratorsOpen)}
              className="text-slate-400 hover:text-white"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={() => setAiAssistOpen(!aiAssistOpen)}
            className="text-slate-400 hover:text-white"
          >
            <Sparkles className="w-5 h-5" />
          </button>
          
          <button className="text-slate-400 hover:text-white">
            <Bell className="w-5 h-5" />
          </button>
          
          <button className="text-slate-400 hover:text-white">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className={`w-64 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'} border-r flex flex-col`}>
            <div className="p-3 border-b border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">Explorer</h3>
                <button className="text-slate-400 hover:text-white">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search files..."
                  className="w-full pl-8 pr-3 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {renderFileTree(files)}
            </div>
          </div>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-100 border-gray-200'} border-b flex`}>
            {openTabs.map((tab, index) => (
              <div 
                key={index}
                className={`flex items-center px-4 py-2 border-r border-slate-700 cursor-pointer ${
                  tab.active ? 'bg-slate-900' : 'hover:bg-slate-700/50'
                }`}
                onClick={() => setActiveFile(tab.name)}
              >
                <FileText className="w-4 h-4 mr-2" />
                <span className="text-sm">{tab.name}</span>
                {tab.modified && <div className="w-2 h-2 bg-orange-400 rounded-full ml-2" />}
                <button className="ml-2 text-slate-400 hover:text-white">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Editor Toolbar */}
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-100 border-gray-200'} border-b px-4 py-2 flex items-center justify-between`}>
            <div className="flex items-center space-x-2">
              <button className="text-slate-400 hover:text-white p-1">
                <Save className="w-4 h-4" />
              </button>
              <button className="text-slate-400 hover:text-white p-1">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button className="text-slate-400 hover:text-white p-1">
                <RotateCw className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-slate-600 mx-2" />
              <button className="text-slate-400 hover:text-white p-1">
                <Search className="w-4 h-4" />
              </button>
              <button className="text-slate-400 hover:text-white p-1">
                <Replace className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1">
                <button 
                  onClick={() => setPreviewMode('desktop')}
                  className={`p-1 ${previewMode === 'desktop' ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <Monitor className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setPreviewMode('tablet')}
                  className={`p-1 ${previewMode === 'tablet' ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <Tablet className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setPreviewMode('mobile')}
                  className={`p-1 ${previewMode === 'mobile' ? 'text-blue-400' : 'text-slate-400 hover:text-white'}`}
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              </div>
              
              <button className="text-slate-400 hover:text-white p-1">
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400">100%</span>
              <button className="text-slate-400 hover:text-white p-1">
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Editor Content */}
          <div className="flex-1 flex">
            {/* Code Editor */}
            <div className="flex-1 relative">
              <div className={`h-full ${darkMode ? 'bg-slate-900' : 'bg-white'} font-mono text-sm overflow-auto`}>
                <div className="flex">
                  {/* Line Numbers */}
                  <div className="w-12 bg-slate-800 text-slate-500 text-right pr-2 py-4 select-none">
                    {codeContent.split('\n').map((_, index) => (
                      <div key={index} className="leading-6">
                        {index + 1}
                      </div>
                    ))}
                  </div>
                  
                  {/* Code Content */}
                  <div className="flex-1 p-4 relative">
                    <pre className="leading-6 text-slate-200">
                      <code>{codeContent}</code>
                    </pre>
                    
                    {/* Collaborator Cursors */}
                    {collaborators.filter(c => c.cursor).map((collab, index) => (
                      <div 
                        key={index}
                        className="absolute w-0.5 h-6 animate-pulse"
                        style={{ 
                          backgroundColor: collab.cursor?.color,
                          top: `${(collab.cursor?.line || 0) * 24 + 16}px`,
                          left: '200px'
                        }}
                      >
                        <div 
                          className="absolute -top-6 left-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
                          style={{ backgroundColor: collab.cursor?.color }}
                        >
                          {collab.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Suggestions Overlay */}
              {aiSuggestions.map((suggestion, index) => (
                <div 
                  key={index}
                  className="absolute left-12 bg-yellow-500/20 border border-yellow-500/50 rounded-md px-2 py-1 cursor-pointer hover:bg-yellow-500/30"
                  style={{ top: `${suggestion.line * 24 + 16}px` }}
                  title={suggestion.description}
                >
                  <div className="flex items-center space-x-1">
                    {suggestion.severity === 'warning' && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                    {suggestion.severity === 'info' && <Lightbulb className="w-3 h-3 text-blue-500" />}
                    {suggestion.severity === 'suggestion' && <Sparkles className="w-3 h-3 text-purple-500" />}
                    <span className="text-xs">{suggestion.title}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Assistant Panel */}
            {aiAssistOpen && (
              <div className={`w-80 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-50 border-gray-200'} border-l flex flex-col`}>
                <div className="p-4 border-b border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-blue-400">AI Assistant</h3>
                    <button onClick={() => setAiAssistOpen(false)}>
                      <X className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="p-3 bg-slate-700/50 rounded-lg">
                      <div className="flex items-center space-x-2 mb-2">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium">Code Analysis</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Your code looks good! I found 2 potential optimizations and 1 suggestion.
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      {aiSuggestions.map((suggestion, index) => (
                        <div key={index} className="p-2 bg-slate-700/30 rounded border-l-2 border-blue-500">
                          <div className="flex items-center space-x-2 mb-1">
                            {suggestion.severity === 'warning' && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                            {suggestion.severity === 'info' && <Lightbulb className="w-3 h-3 text-blue-500" />}
                            {suggestion.severity === 'suggestion' && <Sparkles className="w-3 h-3 text-purple-500" />}
                            <span className="text-xs font-medium">{suggestion.title}</span>
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{suggestion.description}</p>
                          <button className="text-xs text-blue-400 hover:text-blue-300">
                            Apply Fix →
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 p-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">Quick Actions</h4>
                      <div className="space-y-2">
                        <button className="w-full text-left p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded text-sm">
                          Generate component tests
                        </button>
                        <button className="w-full text-left p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded text-sm">
                          Add TypeScript types
                        </button>
                        <button className="w-full text-left p-2 bg-slate-700/30 hover:bg-slate-700/50 rounded text-sm">
                          Optimize performance
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium text-slate-300 mb-2">Ask AI</h4>
                      <div className="flex space-x-2">
                        <input 
                          type="text" 
                          placeholder="How can I improve this code?"
                          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                        />
                        <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">
                          Ask
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Terminal */}
          {terminalOpen && (
            <div className={`h-48 ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-gray-900 border-gray-700'} border-t`}>
              <div className="flex items-center justify-between px-4 py-2 bg-slate-800">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-slate-300">Terminal</span>
                </div>
                <button onClick={() => setTerminalOpen(false)}>
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="p-4 font-mono text-sm text-green-400">
                <div>$ npm run dev</div>
                <div className="text-slate-400">Starting development server...</div>
                <div className="text-blue-400">✓ Server running on http://localhost:3000</div>
                <div className="text-slate-400">$ </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className={`h-6 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gray-100 border-gray-200'} border-t flex items-center justify-between px-4 text-xs`}>
        <div className="flex items-center space-x-4">
          <span className="text-slate-400">Line 32, Column 15</span>
          <span className="text-slate-400">JavaScript React</span>
          <span className="text-slate-400">UTF-8</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => setTerminalOpen(!terminalOpen)}
            className="text-slate-400 hover:text-white"
          >
            <Terminal className="w-3 h-3 mr-1 inline" />
            Terminal
          </button>
          <span className="text-green-400">● Connected</span>
          <span className="text-slate-400">2 collaborators</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Code, 
  Eye, 
  Download, 
  Folder,
  Terminal,
  FileText,
  Send,
  Loader2,
  Zap,
  Sparkles,
  MessageSquare,
  Settings,
  RefreshCw
} from 'lucide-react';
import { useAITracking } from '@/hooks/use-ai-tracking';
import { useSmartUpgrade } from '@/components/smart-upgrade/SmartUpgradeProvider';
import { toast } from 'sonner';

interface GeneratedFile {
  name: string;
  content: string;
  type: 'javascript' | 'typescript' | 'css' | 'html' | 'json' | 'markdown';
  path: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  files?: GeneratedFile[];
}

interface AppProject {
  id: string;
  name: string;
  description: string;
  files: GeneratedFile[];
  framework: 'react' | 'vue' | 'svelte' | 'vanilla';
  preview_url?: string;
  created_at: Date;
  updated_at: Date;
}

export default function AIAppGenerator() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! I'm your AI development assistant. I can help you build complete web applications from scratch. Just describe what you want to build, and I'll generate the code, create a live preview, and help you iterate on it.\n\nTry something like:\n• \"Build a todo app with React and Tailwind\"\n• \"Create a weather dashboard with charts\"\n• \"Make a portfolio website with animations\"",
      timestamp: new Date()
    }
  ]);
  const [currentInput, setCurrentInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentProject, setCurrentProject] = useState<AppProject | null>(null);
  const [activeTab, setActiveTab] = useState<'chat' | 'code' | 'preview'>('chat');
  const [selectedFile, setSelectedFile] = useState<GeneratedFile | null>(null);
  
  const { trackTextGeneration } = useAITracking();
  const { checkAndPromptUpgrade } = useSmartUpgrade();
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateApp = async (prompt: string) => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentInput('');

    try {
      // Call AI generation API
      const response = await fetch('/api/ai/generate-project-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          type: 'full_application',
          framework: 'react',
          features: ['responsive', 'modern', 'interactive'],
          include_preview: true
        })
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Track usage
      await trackTextGeneration(
        'claude-3-sonnet',
        prompt,
        result.data?.code || '',
        'app_generation'
      );

      // Parse generated files
      const files: GeneratedFile[] = result.data?.files || [
        {
          name: 'App.tsx',
          content: result.data?.code || `// Generated App\nimport React from 'react';\n\nexport default function App() {\n  return (\n    <div className="p-8">\n      <h1 className="text-2xl font-bold">Generated App</h1>\n      <p>Your app based on: "${prompt}"</p>\n    </div>\n  );\n}`,
          type: 'typescript' as const,
          path: 'src/App.tsx'
        }
      ];

      // Create or update project
      const project: AppProject = currentProject ? {
        ...currentProject,
        files: [...currentProject.files, ...files],
        updated_at: new Date()
      } : {
        id: Date.now().toString(),
        name: extractAppName(prompt),
        description: prompt,
        files,
        framework: 'react',
        created_at: new Date(),
        updated_at: new Date()
      };

      setCurrentProject(project);

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.data?.explanation || `I've generated a ${project.framework} application based on your request. The app includes:\n\n${files.map(f => `• ${f.name} - ${f.type} file`).join('\n')}\n\nYou can view the code in the Code tab and see the live preview in the Preview tab. Feel free to ask for modifications or improvements!`,
        timestamp: new Date(),
        files
      };

      setMessages(prev => [...prev, assistantMessage]);
      setActiveTab('code');
      
      if (files.length > 0) {
        setSelectedFile(files[0]);
      }

      toast.success('App generated successfully!');

    } catch (error) {
      console.error('Generation failed:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error while generating your app: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or rephrase your request.`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
      toast.error('Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const extractAppName = (prompt: string): string => {
    const words = prompt.toLowerCase().split(' ');
    const appWords = words.filter(word => 
      !['build', 'create', 'make', 'a', 'an', 'the', 'with', 'using'].includes(word)
    ).slice(0, 3);
    return appWords.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'Generated App';
  };

  const downloadProject = () => {
    if (!currentProject) return;

    // Create a zip-like structure for download
    const projectData = {
      name: currentProject.name,
      files: currentProject.files.reduce((acc, file) => {
        acc[file.path] = file.content;
        return acc;
      }, {} as Record<string, string>)
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Project downloaded!');
  };

  const [previewKey, setPreviewKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  
  const previewContent = currentProject?.files.find(f => f.name.includes('App') || f.type === 'html')?.content || '';
  
  // Generate live preview HTML for React components
  const generatePreviewHTML = (code: string, files: GeneratedFile[]) => {
    try {
      // Find CSS files
      const cssFiles = files.filter(f => f.type === 'css');
      const cssContent = cssFiles.map(f => f.content).join('\n');
      
      // Create a complete HTML document with live React rendering
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Live Preview</title>
            <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { 
                margin: 0; 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              }
              .error-boundary {
                padding: 20px;
                border: 2px solid #ef4444;
                border-radius: 8px;
                background: #fee2e2;
                color: #dc2626;
                margin: 20px;
              }
              ${cssContent}
            </style>
          </head>
          <body>
            <div id="root"></div>
            <div id="error-boundary" class="error-boundary" style="display: none;">
              <h3>Preview Error</h3>
              <div id="error-message"></div>
            </div>
            <script type="text/babel">
              const { useState, useEffect, useRef } = React;
              
              // Error boundary component
              class ErrorBoundary extends React.Component {
                constructor(props) {
                  super(props);
                  this.state = { hasError: false, error: null };
                }
                
                static getDerivedStateFromError(error) {
                  return { hasError: true, error: error.message };
                }
                
                componentDidCatch(error, errorInfo) {
                  console.error('Preview Error:', error, errorInfo);
                  document.getElementById('error-boundary').style.display = 'block';
                  document.getElementById('error-message').textContent = error.message;
                }
                
                render() {
                  if (this.state.hasError) {
                    return React.createElement('div', {
                      className: 'error-boundary',
                      style: { margin: '20px', padding: '20px' }
                    }, [
                      React.createElement('h3', { key: 'title' }, 'Component Error'),
                      React.createElement('p', { key: 'message' }, this.state.error)
                    ]);
                  }
                  return this.props.children;
                }
              }
              
              try {
                // Transform the React component code
                let transformedCode = \`${code}\`;
                
                // Remove import statements and export default
                transformedCode = transformedCode
                  .replace(/import.*?from.*?['"];?/g, '')
                  .replace(/export\\s+default\\s+/, '')
                  .replace(/export\\s+\\{[^}]*\\}\\s*;?/g, '');
                
                // Extract component name
                const componentMatch = transformedCode.match(/(?:function|const)\\s+(\\w+)/);
                const componentName = componentMatch ? componentMatch[1] : 'App';
                
                // Create the component
                eval(transformedCode);
                
                // Render the component
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(
                  React.createElement(ErrorBoundary, {}, 
                    React.createElement(eval(componentName))
                  )
                );
                
              } catch (error) {
                console.error('Preview compilation error:', error);
                document.getElementById('error-boundary').style.display = 'block';
                document.getElementById('error-message').textContent = 'Compilation Error: ' + error.message;
              }
            </script>
          </body>
        </html>
      `;
    } catch (error) {
      setPreviewError('Failed to generate preview: ' + (error instanceof Error ? error.message : 'Unknown error'));
      return '<html><body><div style="padding: 20px; color: red;">Preview generation failed</div></body></html>';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI App Generator</h1>
            <p className="text-sm text-gray-600">Build apps with AI like bolt.new and cursor</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {currentProject && (
            <>
              <Badge variant="outline" className="flex items-center gap-1">
                <Folder className="h-3 w-3" />
                {currentProject.name}
              </Badge>
              <Button size="sm" variant="outline" onClick={downloadProject}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </>
          )}
          <Button size="sm" variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value)} className="flex-1 flex flex-col">
          <TabsList className="mx-6 mt-4 w-fit">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="code" className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Code
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 m-6 mt-4">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  AI Development Chat
                </CardTitle>
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-96">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg p-3 ${
                        message.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        {message.files && message.files.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-opacity-20 border-gray-500">
                            <div className="text-xs opacity-75 mb-1">Generated files:</div>
                            <div className="flex flex-wrap gap-1">
                              {message.files.map((file, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {file.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="text-xs opacity-75 mt-1">
                          {message.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <Textarea
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    placeholder="Describe the app you want to build..."
                    className="flex-1 min-h-[60px] max-h-32"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        generateApp(currentInput);
                      }
                    }}
                  />
                  <Button
                    onClick={() => generateApp(currentInput)}
                    disabled={isGenerating || !currentInput.trim()}
                    className="px-4"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="code" className="flex-1 m-6 mt-4">
            <div className="h-full flex gap-4">
              {/* File Explorer */}
              <Card className="w-64 flex-shrink-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Folder className="h-4 w-4" />
                    Files
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2">
                  {currentProject ? (
                    <div className="space-y-1">
                      {currentProject.files.map((file, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedFile(file)}
                          className={`w-full text-left p-2 rounded text-sm hover:bg-gray-100 flex items-center gap-2 ${
                            selectedFile?.name === file.name ? 'bg-blue-50 text-blue-700' : ''
                          }`}
                        >
                          <FileText className="h-3 w-3" />
                          {file.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 py-8">
                      <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No files yet</p>
                      <p className="text-xs">Generate an app to see files</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Code Editor */}
              <Card className="flex-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Code className="h-4 w-4" />
                    {selectedFile?.name || 'Code Editor'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedFile ? (
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-96 text-sm">
                      <code>{selectedFile.content}</code>
                    </pre>
                  ) : (
                    <div className="text-center text-gray-500 py-16">
                      <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg mb-2">No file selected</p>
                      <p className="text-sm">Select a file from the explorer or generate an app</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 m-6 mt-4">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="h-full">
                {currentProject ? (
                  <div className="h-full bg-white border rounded-lg overflow-hidden">
                    <iframe
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
                            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                            <script src="https://cdn.tailwindcss.com"></script>
                            <style>body { margin: 0; padding: 16px; }</style>
                          </head>
                          <body>
                            <div id="root"></div>
                            <script>
                              try {
                                ${previewContent.replace('export default', 'const App =')}
                                ReactDOM.render(React.createElement(App), document.getElementById('root'));
                              } catch (e) {
                                document.getElementById('root').innerHTML = '<div style="padding: 20px; color: red;">Preview Error: ' + e.message + '</div>';
                              }
                            </script>
                          </body>
                        </html>
                      `}
                      className="w-full h-full border-0"
                      title="App Preview"
                    />
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-16">
                    <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">No preview available</p>
                    <p className="text-sm">Generate an app to see the live preview</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
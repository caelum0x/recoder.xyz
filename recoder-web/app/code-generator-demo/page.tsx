'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function CodeGeneratorDemo() {
  return (
    <div className="container mx-auto p-6">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span>🚀 Multi-language Code Generator</span>
              <Badge variant="secondary">Demo</Badge>
            </CardTitle>
            <p className="text-muted-foreground">
              Complete end-to-end code execution platform with Docker containers, 
              real-time collaboration, and advanced features.
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {/* Features Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">🐳 Docker Containers</h3>
                  <p className="text-sm text-muted-foreground">
                    Secure, sandboxed execution environments for JS, Python, Java, C++, Rust, Go
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">🔒 Security</h3>
                  <p className="text-sm text-muted-foreground">
                    Resource limits, network isolation, and comprehensive security scanning
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">📦 Package Managers</h3>
                  <p className="text-sm text-muted-foreground">
                    Integrated npm, pip, cargo, go modules, vcpkg, and maven support
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">⚡ Real-time Execution</h3>
                  <p className="text-sm text-muted-foreground">
                    Live code execution with progress tracking and performance metrics
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">👥 Collaboration</h3>
                  <p className="text-sm text-muted-foreground">
                    Real-time collaborative editing with WebSocket synchronization
                  </p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2">🎨 Monaco Editor</h3>
                  <p className="text-sm text-muted-foreground">
                    Professional code editor with IntelliSense and syntax highlighting
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* API Endpoints */}
            <div>
              <h3 className="text-lg font-semibold mb-3">📡 Backend APIs</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">POST</Badge>
                  <code className="text-sm">/api/code-generator/compile</code>
                  <span className="text-sm text-muted-foreground">- Code compilation endpoint</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">POST</Badge>
                  <code className="text-sm">/api/code-generator/execute</code>
                  <span className="text-sm text-muted-foreground">- Code execution endpoint</span>
                </div>
              </div>
            </div>

            {/* Components */}
            <div>
              <h3 className="text-lg font-semibold mb-3">🧩 Frontend Components</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-muted/50 rounded">
                  <h4 className="font-medium">CodePlayground</h4>
                  <p className="text-sm text-muted-foreground">Main code execution interface</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <h4 className="font-medium">LanguageSelector</h4>
                  <p className="text-sm text-muted-foreground">Multi-language support with configs</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <h4 className="font-medium">CodeEditor</h4>
                  <p className="text-sm text-muted-foreground">Monaco-based code editor</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <h4 className="font-medium">OutputConsole</h4>
                  <p className="text-sm text-muted-foreground">Execution results and statistics</p>
                </div>
                <div className="p-3 bg-muted/50 rounded">
                  <h4 className="font-medium">CollaborationPanel</h4>
                  <p className="text-sm text-muted-foreground">Real-time collaborative features</p>
                </div>
              </div>
            </div>

            {/* Docker Containers */}
            <div>
              <h3 className="text-lg font-semibold mb-3">🐳 Docker Containers</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { name: 'JavaScript', image: 'recoder-javascript', color: '#f7df1e' },
                  { name: 'Python', image: 'recoder-python', color: '#3776ab' },
                  { name: 'Java', image: 'recoder-java', color: '#ed8b00' },
                  { name: 'C++', image: 'recoder-cpp', color: '#00599c' },
                  { name: 'Rust', image: 'recoder-rust', color: '#000000' },
                  { name: 'Go', image: 'recoder-go', color: '#00add8' }
                ].map((lang) => (
                  <div key={lang.name} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: lang.color }}
                    />
                    <span className="text-sm font-medium">{lang.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button onClick={() => window.open('/playground', '_blank')}>
                🚀 Launch Full Playground
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.open('http://localhost:3003/api/code-generator/execute', '_blank')}
              >
                📡 Test API Endpoint
              </Button>
              <Button 
                variant="outline"
                onClick={() => window.open('/api-docs/code-generator', '_blank')}
              >
                📚 View Documentation
              </Button>
            </div>

            {/* Status */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-4">
              <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                ✅ Implementation Status: COMPLETE
              </h4>
              <ul className="text-sm text-green-700 dark:text-green-300 space-y-1">
                <li>✅ Docker containers for all 6 languages</li>
                <li>✅ Sandboxed execution environment</li>
                <li>✅ Package manager integration</li>
                <li>✅ Backend API endpoints (/compile, /execute)</li>
                <li>✅ Frontend code playground component</li>
                <li>✅ Language selector with rich metadata</li>
                <li>✅ Output console with statistics</li>
                <li>✅ Collaboration features framework</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

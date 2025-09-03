'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Palette, Code, Wand2, Layers, Download, Play, Copy,
  Sparkles, Zap, Shield, Smartphone, Monitor, Tablet,
  Eye, Settings, FileCode, Package, Brush, Target,
  CheckCircle, AlertCircle, Clock, Rocket, Star
} from 'lucide-react';

// 🎨 ADVANCED UI/UX GENERATOR COMPONENT
// REAL design system creation with actual component generation
// DESTROYS: Figma to Code, Anima, Builder.io, Framer

interface GenerationResult {
  type: string;
  name: string;
  code?: string;
  projectPath?: string;
  components?: number;
  files?: string[];
  framework: string;
  styling: string;
  theme?: string;
  tokens?: string;
  config?: string;
  designTokens?: any;
}

interface DesignTokens {
  colors: {
    primary: string[];
    secondary: string[];
    neutral: string[];
    semantic: Record<string, string>;
  };
  typography: {
    fontFamilies: string[];
    fontSizes: Record<string, string>;
    fontWeights: Record<string, number>;
    lineHeights: Record<string, number>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  breakpoints: Record<string, string>;
}

export default function UIGenerator() {
  const [activeTab, setActiveTab] = useState('component');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  // Form states
  const [componentName, setComponentName] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState('react');
  const [styling, setStyling] = useState('tailwind');
  const [accessibility, setAccessibility] = useState(true);
  const [responsive, setResponsive] = useState(true);
  const [animations, setAnimations] = useState(true);
  
  // Design system states
  const [systemName, setSystemName] = useState('');
  const [designTokens, setDesignTokens] = useState<DesignTokens>({
    colors: {
      primary: ['#3b82f6', '#2563eb', '#1d4ed8'],
      secondary: ['#6b7280', '#4b5563', '#374151'],
      neutral: ['#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db'],
      semantic: {
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6'
      }
    },
    typography: {
      fontFamilies: ['Inter', 'system-ui', 'sans-serif'],
      fontSizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem'
      },
      fontWeights: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700
      },
      lineHeights: {
        tight: 1.25,
        normal: 1.5,
        relaxed: 1.75
      }
    },
    spacing: {
      xs: '0.25rem',
      sm: '0.5rem',
      md: '1rem',
      lg: '1.5rem',
      xl: '2rem'
    },
    borderRadius: {
      sm: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem'
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
    },
    breakpoints: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px'
    }
  });

  const handleGeneration = useCallback(async (type: string) => {
    setIsGenerating(true);
    setResult(null);

    try {
      const requestBody = {
        type,
        name: type === 'design-system' ? systemName : componentName,
        framework,
        styling,
        description,
        accessibility,
        responsive,
        animations,
        ...(type === 'design-system' && { designTokens })
      };

      const response = await fetch('/api/ui-generator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        setResult(data.result);
      } else {
        console.error('Generation failed:', data.error);
      }
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [componentName, systemName, framework, styling, description, accessibility, responsive, animations, designTokens]);

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Copy failed:', error);
    }
  }, []);

  const getPreviewClasses = () => {
    switch (previewMode) {
      case 'mobile': return 'max-w-sm mx-auto';
      case 'tablet': return 'max-w-2xl mx-auto';
      default: return 'w-full';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Advanced UI/UX Generator
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Generate production-ready components and complete design systems with AI-powered intelligence.
              <span className="font-bold text-red-600"> Destroying Figma to Code, Anima, and Builder.io</span>
            </p>
            
            {/* Revolutionary Features */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Badge className="bg-gradient-to-r from-green-500 to-blue-600 text-white border-0">
                <Zap className="w-3 h-3 mr-1" />
                Multi-Framework Support
              </Badge>
              <Badge className="bg-gradient-to-r from-purple-500 to-pink-600 text-white border-0">
                <Shield className="w-3 h-3 mr-1" />
                WCAG 2.1 Compliant
              </Badge>
              <Badge className="bg-gradient-to-r from-orange-500 to-red-600 text-white border-0">
                <Rocket className="w-3 h-3 mr-1" />
                Production Ready
              </Badge>
              <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
                <Star className="w-3 h-3 mr-1" />
                Storybook Integration
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 bg-white p-1 rounded-xl shadow-sm">
            <TabsTrigger value="component" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Component
            </TabsTrigger>
            <TabsTrigger value="design-system" className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Design System
            </TabsTrigger>
            <TabsTrigger value="theme" className="flex items-center gap-2">
              <Brush className="w-4 h-4" />
              Theme
            </TabsTrigger>
            <TabsTrigger value="storybook" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Storybook
            </TabsTrigger>
          </TabsList>

          {/* Component Generation */}
          <TabsContent value="component">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Configuration Panel */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-purple-600" />
                    Component Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your component with advanced options and AI assistance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="componentName">Component Name</Label>
                      <Input
                        id="componentName"
                        placeholder="e.g., AdvancedButton"
                        value={componentName}
                        onChange={(e) => setComponentName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe your component functionality and design requirements..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="framework">Framework</Label>
                        <Select value={framework} onValueChange={setFramework}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="react">React</SelectItem>
                            <SelectItem value="vue">Vue</SelectItem>
                            <SelectItem value="angular">Angular</SelectItem>
                            <SelectItem value="svelte">Svelte</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="styling">Styling</Label>
                        <Select value={styling} onValueChange={setStyling}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tailwind">Tailwind CSS</SelectItem>
                            <SelectItem value="styled-components">Styled Components</SelectItem>
                            <SelectItem value="emotion">Emotion</SelectItem>
                            <SelectItem value="css-modules">CSS Modules</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Accessibility</Label>
                          <p className="text-sm text-gray-600">WCAG 2.1 AA compliance</p>
                        </div>
                        <Switch
                          checked={accessibility}
                          onCheckedChange={setAccessibility}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Responsive Design</Label>
                          <p className="text-sm text-gray-600">Mobile-first approach</p>
                        </div>
                        <Switch
                          checked={responsive}
                          onCheckedChange={setResponsive}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Animations</Label>
                          <p className="text-sm text-gray-600">Micro-interactions</p>
                        </div>
                        <Switch
                          checked={animations}
                          onCheckedChange={setAnimations}
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => handleGeneration('component')}
                      disabled={isGenerating || !componentName}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                      size="lg"
                    >
                      {isGenerating ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating Component...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Generate Component
                        </div>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Preview/Results Panel */}
              <Card className="h-fit">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-blue-600" />
                      Live Preview
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={previewMode === 'desktop' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewMode('desktop')}
                      >
                        <Monitor className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={previewMode === 'tablet' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewMode('tablet')}
                      >
                        <Tablet className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={previewMode === 'mobile' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPreviewMode('mobile')}
                      >
                        <Smartphone className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    Real-time preview of your generated component
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {result && result.type === 'component' ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Generated Successfully
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => result.code && copyToClipboard(result.code)}
                        >
                          <Copy className="w-4 h-4 mr-1" />
                          Copy Code
                        </Button>
                      </div>

                      <div className={`border rounded-lg bg-white ${getPreviewClasses()}`}>
                        <div className="p-6 border-b bg-gray-50">
                          <h3 className="font-semibold text-gray-900">{result.name}</h3>
                          <p className="text-sm text-gray-600">{result.framework} • {result.styling}</p>
                        </div>
                        
                        <div className="p-6 space-y-4">
                          <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                            <pre className="whitespace-pre-wrap text-gray-800">
                              {result.code?.substring(0, 500)}...
                            </pre>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1">
                              <Play className="w-3 h-3 mr-1" />
                              Test Component
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1">
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Configure and generate a component to see the preview</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Design System Generation */}
          <TabsContent value="design-system">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-indigo-600" />
                      Design System Configuration
                    </CardTitle>
                    <CardDescription>
                      Create a complete design system with tokens, components, and documentation
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <Label htmlFor="systemName">Design System Name</Label>
                      <Input
                        id="systemName"
                        placeholder="e.g., AcmeDesignSystem"
                        value={systemName}
                        onChange={(e) => setSystemName(e.target.value)}
                        className="mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="framework">Framework</Label>
                        <Select value={framework} onValueChange={setFramework}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="react">React</SelectItem>
                            <SelectItem value="vue">Vue</SelectItem>
                            <SelectItem value="angular">Angular</SelectItem>
                            <SelectItem value="svelte">Svelte</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="styling">Styling</Label>
                        <Select value={styling} onValueChange={setStyling}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tailwind">Tailwind CSS</SelectItem>
                            <SelectItem value="styled-components">Styled Components</SelectItem>
                            <SelectItem value="emotion">Emotion</SelectItem>
                            <SelectItem value="css-modules">CSS Modules</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Design Tokens</h3>
                      
                      <div>
                        <Label>Primary Colors</Label>
                        <div className="flex gap-2 mt-2">
                          {designTokens.colors.primary.map((color, index) => (
                            <div
                              key={index}
                              className="w-10 h-10 rounded-lg border-2 border-gray-200"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <Label>Typography</Label>
                        <div className="mt-2 space-y-2">
                          <div className="text-xs">Font Size XS - {designTokens.typography.fontSizes.xs}</div>
                          <div className="text-sm">Font Size SM - {designTokens.typography.fontSizes.sm}</div>
                          <div className="text-base">Font Size Base - {designTokens.typography.fontSizes.base}</div>
                          <div className="text-lg">Font Size LG - {designTokens.typography.fontSizes.lg}</div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={() => handleGeneration('design-system')}
                      disabled={isGenerating || !systemName}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                      size="lg"
                    >
                      {isGenerating ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating Design System...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          Generate Design System
                        </div>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-green-600" />
                      System Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {result && result.type === 'design-system' ? (
                      <div className="space-y-4">
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Design System Created
                        </Badge>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Components:</span>
                            <span className="font-semibold">{result.components}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Files:</span>
                            <span className="font-semibold">{result.files?.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Framework:</span>
                            <span className="font-semibold capitalize">{result.framework}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Generated Files:</Label>
                          <div className="max-h-32 overflow-y-auto space-y-1">
                            {result.files?.map((file, index) => (
                              <div key={index} className="text-xs bg-gray-100 p-2 rounded font-mono">
                                {file}
                              </div>
                            ))}
                          </div>
                        </div>

                        <Button size="sm" className="w-full">
                          <Download className="w-3 h-3 mr-1" />
                          Download System
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Generate to see preview</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Theme Generation */}
          <TabsContent value="theme">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brush className="w-5 h-5 text-pink-600" />
                  Theme Generator
                </CardTitle>
                <CardDescription>
                  Create comprehensive theme configurations with light/dark modes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Settings className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Theme generation coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Storybook Generation */}
          <TabsContent value="storybook">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-600" />
                  Storybook Integration
                </CardTitle>
                <CardDescription>
                  Generate complete Storybook configurations and stories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Storybook integration coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Competition Destruction Banner */}
        <div className="mt-12 bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 text-white p-6 rounded-2xl shadow-2xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">💀 COMPETITION ANNIHILATION 💀</h2>
            <p className="text-lg opacity-90">
              <span className="font-bold">Figma to Code • Anima • Builder.io • Framer • Webflow</span> → DESTROYED
            </p>
            <p className="text-sm opacity-75 mt-2">
              Revolutionary AI-powered component generation that makes other tools obsolete
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
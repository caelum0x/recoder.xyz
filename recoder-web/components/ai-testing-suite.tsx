'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  TestTube, Play, Download, Code, Zap, Target, Shield, 
  Globe, Smartphone, Monitor, CheckCircle, AlertCircle,
  Clock, Cpu, Eye, Settings, FileCode, Bot, Rocket,
  GitBranch, Database, Cloud, Search, BarChart3, Users,
  Camera, Video, Bug, Lightbulb, ArrowRight, Plus, X
} from 'lucide-react';

// 🤖 AI-POWERED TESTING SUITE COMPONENT
// REAL test generation with actual E2E testing frameworks
// DESTROYS: Cypress Cloud, Playwright Studio, TestComplete

interface TestScenario {
  name: string;
  description: string;
  steps: TestStep[];
  assertions: TestAssertion[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
}

interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'scroll' | 'hover' | 'select' | 'upload' | 'drag' | 'custom';
  selector?: string;
  value?: string;
  timeout?: number;
  description: string;
}

interface TestAssertion {
  type: 'visible' | 'text' | 'value' | 'attribute' | 'count' | 'url' | 'status' | 'custom';
  selector?: string;
  expected: any;
  description: string;
}

interface TestResult {
  framework: string;
  scenarios: number;
  testFiles: string[];
  projectPath: string;
  runCommand: string;
  features: string[];
}

export default function AITestingSuite() {
  const [activeTab, setActiveTab] = useState('generator');
  const [isGenerating, setIsGenerating] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Test configuration
  const [testType, setTestType] = useState('e2e');
  const [framework, setFramework] = useState('playwright');
  const [target, setTarget] = useState('web');
  const [testUrl, setTestUrl] = useState('http://localhost:3000');
  const [description, setDescription] = useState('');
  
  // Advanced options
  const [aiGenerated, setAiGenerated] = useState(true);
  const [crossBrowser, setCrossBrowser] = useState(true);
  const [accessibility, setAccessibility] = useState(true);
  const [performance, setPerformance] = useState(true);
  const [visualRegression, setVisualRegression] = useState(false);
  const [mobileDevices, setMobileDevices] = useState<string[]>(['iPhone 12', 'Pixel 5']);

  // Manual scenarios
  const [scenarios, setScenarios] = useState<TestScenario[]>([]);
  const [newScenario, setNewScenario] = useState<Partial<TestScenario>>({
    name: '',
    description: '',
    priority: 'medium',
    tags: [],
    steps: [],
    assertions: []
  });

  const handleGenerateTests = useCallback(async () => {
    setIsGenerating(true);
    setTestResult(null);

    try {
      const requestBody = {
        type: testType,
        framework,
        target,
        url: testUrl,
        description,
        scenarios: aiGenerated ? [] : scenarios,
        aiGenerated,
        crossBrowser,
        accessibility,
        performance,
        visualRegression,
        mobileDevices,
        config: {
          baseUrl: testUrl,
          timeout: 30000,
          retries: 2,
          parallel: true,
          headless: true,
          screenshots: true,
          videos: true
        }
      };

      const response = await fetch('/api/testing-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        setTestResult(data.result);
      } else {
        console.error('Test generation failed:', data.error);
      }
    } catch (error) {
      console.error('Test generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [testType, framework, target, testUrl, description, scenarios, aiGenerated, crossBrowser, accessibility, performance, visualRegression, mobileDevices]);

  const addScenario = useCallback(() => {
    if (newScenario.name && newScenario.description) {
      setScenarios(prev => [...prev, {
        name: newScenario.name!,
        description: newScenario.description!,
        priority: newScenario.priority || 'medium',
        tags: newScenario.tags || [],
        steps: newScenario.steps || [],
        assertions: newScenario.assertions || []
      }]);
      setNewScenario({
        name: '',
        description: '',
        priority: 'medium',
        tags: [],
        steps: [],
        assertions: []
      });
    }
  }, [newScenario]);

  const removeScenario = useCallback((index: number) => {
    setScenarios(prev => prev.filter((_, i) => i !== index));
  }, []);

  const getFrameworkIcon = (fw: string) => {
    switch (fw) {
      case 'playwright': return <TestTube className="w-4 h-4" />;
      case 'cypress': return <Globe className="w-4 h-4" />;
      case 'jest': return <Code className="w-4 h-4" />;
      default: return <TestTube className="w-4 h-4" />;
    }
  };

  const getTestTypeIcon = (type: string) => {
    switch (type) {
      case 'e2e': return <Globe className="w-4 h-4" />;
      case 'api': return <Database className="w-4 h-4" />;
      case 'unit': return <Code className="w-4 h-4" />;
      case 'accessibility': return <Shield className="w-4 h-4" />;
      case 'performance': return <Zap className="w-4 h-4" />;
      case 'visual': return <Eye className="w-4 h-4" />;
      default: return <TestTube className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
                <TestTube className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent">
                AI-Powered Testing Suite
              </h1>
            </div>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Generate comprehensive test suites with AI-powered scenarios and real testing framework integration.
              <span className="font-bold text-red-600"> Destroying Cypress Cloud, Playwright Studio, and TestComplete</span>
            </p>
            
            {/* Feature badges */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Badge className="bg-gradient-to-r from-green-500 to-blue-600 text-white border-0">
                <Bot className="w-3 h-3 mr-1" />
                AI Test Generation
              </Badge>
              <Badge className="bg-gradient-to-r from-purple-500 to-pink-600 text-white border-0">
                <Globe className="w-3 h-3 mr-1" />
                Multi-Framework
              </Badge>
              <Badge className="bg-gradient-to-r from-orange-500 to-red-600 text-white border-0">
                <Shield className="w-3 h-3 mr-1" />
                Accessibility Testing
              </Badge>
              <Badge className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
                <Zap className="w-3 h-3 mr-1" />
                Performance Testing
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 bg-white p-1 rounded-xl shadow-sm">
            <TabsTrigger value="generator" className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              Generator
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="flex items-center gap-2">
              <FileCode className="w-4 h-4" />
              Scenarios
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="runner" className="flex items-center gap-2">
              <Play className="w-4 h-4" />
              Test Runner
            </TabsTrigger>
          </TabsList>

          {/* Test Generator Tab */}
          <TabsContent value="generator">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Configuration Panel */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-green-600" />
                      Test Configuration
                    </CardTitle>
                    <CardDescription>
                      Configure your test suite generation with AI assistance
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Basic Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="testType">Test Type</Label>
                        <Select value={testType} onValueChange={setTestType}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="e2e">End-to-End (E2E)</SelectItem>
                            <SelectItem value="api">API Testing</SelectItem>
                            <SelectItem value="unit">Unit Testing</SelectItem>
                            <SelectItem value="integration">Integration</SelectItem>
                            <SelectItem value="accessibility">Accessibility</SelectItem>
                            <SelectItem value="performance">Performance</SelectItem>
                            <SelectItem value="visual">Visual Regression</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="framework">Testing Framework</Label>
                        <Select value={framework} onValueChange={setFramework}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="playwright">Playwright</SelectItem>
                            <SelectItem value="cypress">Cypress</SelectItem>
                            <SelectItem value="jest">Jest</SelectItem>
                            <SelectItem value="vitest">Vitest</SelectItem>
                            <SelectItem value="puppeteer">Puppeteer</SelectItem>
                            <SelectItem value="selenium">Selenium</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="target">Target Platform</Label>
                        <Select value={target} onValueChange={setTarget}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="web">Web Application</SelectItem>
                            <SelectItem value="mobile">Mobile App</SelectItem>
                            <SelectItem value="api">API/Backend</SelectItem>
                            <SelectItem value="desktop">Desktop App</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="testUrl">Application URL</Label>
                        <Input
                          id="testUrl"
                          placeholder="https://your-app.com"
                          value={testUrl}
                          onChange={(e) => setTestUrl(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="description">Test Description</Label>
                      <Textarea
                        id="description"
                        placeholder="Describe what you want to test (e.g., user login flow, checkout process, API endpoints)..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1"
                        rows={3}
                      />
                    </div>

                    <Separator />

                    {/* Advanced Options */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Advanced Options</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>AI Test Generation</Label>
                              <p className="text-sm text-gray-600">Let AI create test scenarios</p>
                            </div>
                            <Switch
                              checked={aiGenerated}
                              onCheckedChange={setAiGenerated}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Cross-Browser Testing</Label>
                              <p className="text-sm text-gray-600">Test across multiple browsers</p>
                            </div>
                            <Switch
                              checked={crossBrowser}
                              onCheckedChange={setCrossBrowser}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Accessibility Testing</Label>
                              <p className="text-sm text-gray-600">WCAG compliance checks</p>
                            </div>
                            <Switch
                              checked={accessibility}
                              onCheckedChange={setAccessibility}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Performance Testing</Label>
                              <p className="text-sm text-gray-600">Load time and performance metrics</p>
                            </div>
                            <Switch
                              checked={performance}
                              onCheckedChange={setPerformance}
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label>Visual Regression</Label>
                              <p className="text-sm text-gray-600">Screenshot comparison testing</p>
                            </div>
                            <Switch
                              checked={visualRegression}
                              onCheckedChange={setVisualRegression}
                            />
                          </div>
                        </div>
                      </div>

                      {target === 'web' && (
                        <div>
                          <Label>Mobile Devices</Label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {['iPhone 12', 'iPhone 14', 'Pixel 5', 'Galaxy S21', 'iPad'].map(device => (
                              <Badge
                                key={device}
                                variant={mobileDevices.includes(device) ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => {
                                  if (mobileDevices.includes(device)) {
                                    setMobileDevices(prev => prev.filter(d => d !== device));
                                  } else {
                                    setMobileDevices(prev => [...prev, device]);
                                  }
                                }}
                              >
                                <Smartphone className="w-3 h-3 mr-1" />
                                {device}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={handleGenerateTests}
                      disabled={isGenerating || (!aiGenerated && scenarios.length === 0)}
                      className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
                      size="lg"
                    >
                      {isGenerating ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Generating Test Suite...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Rocket className="w-4 h-4" />
                          Generate Test Suite
                        </div>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {/* Preview Panel */}
              <div>
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-blue-600" />
                      Test Preview
                    </CardTitle>
                    <CardDescription>
                      Preview of your test configuration
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {testResult ? (
                      <div className="space-y-4">
                        <Badge className="bg-green-100 text-green-800 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Tests Generated
                        </Badge>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Framework:</span>
                            <span className="font-semibold capitalize">{testResult.framework}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Scenarios:</span>
                            <span className="font-semibold">{testResult.scenarios}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Test Files:</span>
                            <span className="font-semibold">{testResult.testFiles.length}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Features:</Label>
                          <div className="space-y-1">
                            {testResult.features.map((feature, index) => (
                              <div key={index} className="text-xs bg-gray-100 p-2 rounded flex items-center gap-2">
                                <CheckCircle className="w-3 h-3 text-green-500" />
                                {feature}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Run Command:</Label>
                          <div className="bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">
                            {testResult.runCommand}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1">
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm" className="flex-1">
                            <Play className="w-3 h-3 mr-1" />
                            Run Tests
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <TestTube className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>Configure and generate tests to see preview</p>
                        <div className="mt-4 space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            {getTestTypeIcon(testType)}
                            <span>{testType.toUpperCase()} Testing</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            {getFrameworkIcon(framework)}
                            <span className="capitalize">{framework}</span>
                          </div>
                          {aiGenerated && (
                            <div className="flex items-center gap-2 text-sm">
                              <Bot className="w-4 h-4" />
                              <span>AI-Generated Scenarios</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Manual Scenarios Tab */}
          <TabsContent value="scenarios">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-purple-600" />
                    Add Test Scenario
                  </CardTitle>
                  <CardDescription>
                    Create custom test scenarios manually
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="scenarioName">Scenario Name</Label>
                    <Input
                      id="scenarioName"
                      placeholder="e.g., User Login Flow"
                      value={newScenario.name || ''}
                      onChange={(e) => setNewScenario(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="scenarioDescription">Description</Label>
                    <Textarea
                      id="scenarioDescription"
                      placeholder="Describe what this scenario tests..."
                      value={newScenario.description || ''}
                      onChange={(e) => setNewScenario(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label>Priority</Label>
                    <Select 
                      value={newScenario.priority || 'medium'} 
                      onValueChange={(value: any) => setNewScenario(prev => ({ ...prev, priority: value }))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={addScenario} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Scenario
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCode className="w-5 h-5 text-indigo-600" />
                    Test Scenarios ({scenarios.length})
                  </CardTitle>
                  <CardDescription>
                    Your custom test scenarios
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {scenarios.length > 0 ? (
                    <div className="space-y-3">
                      {scenarios.map((scenario, index) => (
                        <div key={index} className="border rounded-lg p-4 bg-white">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-gray-900">{scenario.name}</h3>
                                <Badge className={getPriorityColor(scenario.priority)}>
                                  {scenario.priority}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{scenario.description}</p>
                              {scenario.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {scenario.tags.map((tag, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeScenario(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No scenarios added yet</p>
                      <p className="text-sm">Add scenarios manually or use AI generation</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  Test Results & Analytics
                </CardTitle>
                <CardDescription>
                  Detailed test execution results and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium text-gray-700">Test Analytics Dashboard</p>
                  <p className="text-gray-500">Execute tests to see detailed results and metrics</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test Runner Tab */}
          <TabsContent value="runner">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="w-5 h-5 text-blue-600" />
                  Test Execution Engine
                </CardTitle>
                <CardDescription>
                  Run your generated tests and monitor execution
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium text-gray-700">Test Runner</p>
                  <p className="text-gray-500">Generate a test suite first to run tests</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Competition Destruction Banner */}
        <div className="mt-12 bg-gradient-to-r from-red-600 via-orange-600 to-yellow-600 text-white p-6 rounded-2xl shadow-2xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">💀 TESTING TOOL ANNIHILATION 💀</h2>
            <p className="text-lg opacity-90">
              <span className="font-bold">Cypress Cloud • Playwright Studio • TestComplete • Selenium IDE</span> → OBLITERATED
            </p>
            <p className="text-sm opacity-75 mt-2">
              Revolutionary AI-powered test generation that makes manual test creation obsolete
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
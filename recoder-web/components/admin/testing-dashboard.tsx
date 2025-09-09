'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Play, 
  Square, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Code, 
  FileText, 
  Settings,
  TrendingUp,
  AlertTriangle,
  Eye,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface TestSuite {
  id: string;
  name: string;
  description?: string;
  framework: string;
  testType: string;
  configuration: any;
  createdAt: string;
  executions?: TestExecution[];
  _count?: { executions: number };
}

interface TestExecution {
  id: string;
  status: 'running' | 'passed' | 'failed' | 'error';
  results?: any;
  createdAt: string;
  completedAt?: string;
  triggeredBy: string;
}

interface CreateTestSuiteForm {
  name: string;
  description: string;
  projectId: string;
  framework: string;
  testType: string;
  configuration: {
    timeout: number;
    retries: number;
    parallel: boolean;
    coverage: boolean;
    browser?: string;
    viewport: { width: number; height: number };
    environment: Record<string, string>;
  };
  testFiles: { path: string; content: string }[];
}

export default function TestingDashboard() {
  const { toast } = useToast();
  
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [executionStats, setExecutionStats] = useState({
    totalTests: 0,
    passRate: 0,
    avgExecutionTime: 0,
    testCoverage: 0,
    recentActivity: [] as any[]
  });

  const [createForm, setCreateForm] = useState<CreateTestSuiteForm>({
    name: '',
    description: '',
    projectId: '',
    framework: 'jest',
    testType: 'unit',
    configuration: {
      timeout: 30000,
      retries: 1,
      parallel: false,
      coverage: true,
      viewport: { width: 1920, height: 1080 },
      environment: {}
    },
    testFiles: [{ path: 'test.js', content: '// Your test code here' }]
  });

  useEffect(() => {
    loadTestSuites();
    loadExecutionStats();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadTestSuites();
      loadExecutionStats();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const loadTestSuites = async () => {
    try {
      const response = await fetch('/api/testing/automated-tests');
      if (response.ok) {
        const data = await response.json();
        setTestSuites(data.testSuites || []);
      }
    } catch (error) {
      console.error('Failed to load test suites:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadExecutionStats = async () => {
    try {
      const response = await fetch('/api/testing/analytics');
      if (response.ok) {
        const data = await response.json();
        setExecutionStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load execution stats:', error);
    }
  };

  const createTestSuite = async () => {
    try {
      const response = await fetch('/api/testing/automated-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          ...createForm
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Test suite created",
          description: `${createForm.name} has been created successfully`,
        });
        setShowCreateForm(false);
        loadTestSuites();
        resetCreateForm();
      } else {
        const error = await response.json();
        toast({
          title: "Creation failed",
          description: error.error || "Failed to create test suite",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Creation failed",
        description: "Failed to create test suite",
        variant: "destructive",
      });
    }
  };

  const executeTestSuite = async (suiteId: string) => {
    try {
      const response = await fetch('/api/testing/automated-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'execute',
          suiteId,
          environment: 'local',
          options: {
            headless: true,
            video: false,
            screenshots: false,
            debug: false
          }
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Test execution started",
          description: "Test suite is now running",
        });
        loadTestSuites();
      } else {
        const error = await response.json();
        toast({
          title: "Execution failed",
          description: error.error || "Failed to execute test suite",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Execution failed",
        description: "Failed to execute test suite",
        variant: "destructive",
      });
    }
  };

  const resetCreateForm = () => {
    setCreateForm({
      name: '',
      description: '',
      projectId: '',
      framework: 'jest',
      testType: 'unit',
      configuration: {
        timeout: 30000,
        retries: 1,
        parallel: false,
        coverage: true,
        viewport: { width: 1920, height: 1080 },
        environment: {}
      },
      testFiles: [{ path: 'test.js', content: '// Your test code here' }]
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'running': return 'text-blue-600';
      case 'error': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'running': return <Clock className="h-4 w-4" />;
      case 'error': return <AlertTriangle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const mockTrendData = [
    { date: '2024-01-01', passed: 85, failed: 15, coverage: 78 },
    { date: '2024-01-02', passed: 92, failed: 8, coverage: 82 },
    { date: '2024-01-03', passed: 88, failed: 12, coverage: 85 },
    { date: '2024-01-04', passed: 94, failed: 6, coverage: 87 },
    { date: '2024-01-05', passed: 90, failed: 10, coverage: 89 },
    { date: '2024-01-06', passed: 96, failed: 4, coverage: 91 },
    { date: '2024-01-07', passed: 93, failed: 7, coverage: 88 }
  ];

  const frameworkData = [
    { name: 'Jest', value: 45, color: '#8884d8' },
    { name: 'Cypress', value: 25, color: '#82ca9d' },
    { name: 'Playwright', value: 20, color: '#ffc658' },
    { name: 'Vitest', value: 10, color: '#ff7c7c' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Testing Dashboard</h2>
          <p className="text-muted-foreground">
            Automated test suite management and execution results
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => loadTestSuites()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Suite
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="suites">Test Suites</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Test Suites</p>
                  <p className="text-2xl font-bold">{testSuites.length}</p>
                </div>
                <Code className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">94%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Execution Time</p>
                  <p className="text-2xl font-bold">2.4s</p>
                </div>
                <Clock className="h-8 w-8 text-blue-600" />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex items-center justify-between p-6">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Code Coverage</p>
                  <p className="text-2xl font-bold text-purple-600">89%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-600" />
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Test Executions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {testSuites.slice(0, 5).map((suite) => (
                    <div key={suite.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(suite.executions?.[0]?.status || 'pending')}
                        <div>
                          <p className="font-medium">{suite.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {suite.framework} • {suite.testType}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {suite._count?.executions || 0} runs
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Framework Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={frameworkData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {frameworkData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-4">
                  {frameworkData.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm">{item.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Test Suites Tab */}
        <TabsContent value="suites" className="space-y-4">
          <div className="grid gap-4">
            {testSuites.map((suite) => (
              <Card key={suite.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {suite.name}
                        <Badge variant="outline">{suite.framework}</Badge>
                        <Badge variant="secondary">{suite.testType}</Badge>
                      </CardTitle>
                      <CardDescription>{suite.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => executeTestSuite(suite.id)}
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Run
                      </Button>
                      <Button size="sm" variant="outline">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="font-medium">Executions</p>
                      <p className="text-muted-foreground">{suite._count?.executions || 0}</p>
                    </div>
                    <div>
                      <p className="font-medium">Last Status</p>
                      <p className={getStatusColor(suite.executions?.[0]?.status || 'pending')}>
                        {suite.executions?.[0]?.status || 'Not run'}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Timeout</p>
                      <p className="text-muted-foreground">{suite.configuration?.timeout / 1000}s</p>
                    </div>
                    <div>
                      <p className="font-medium">Coverage</p>
                      <p className="text-muted-foreground">
                        {suite.configuration?.coverage ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Pass Rate Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={mockTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="passed" stroke="#10b981" name="Passed %" />
                    <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Code Coverage Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mockTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="coverage" fill="#8b5cf6" name="Coverage %" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Other tabs would be implemented similarly */}
        <TabsContent value="executions">
          <Card>
            <CardHeader>
              <CardTitle>Test Execution History</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Execution history details would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <Card>
            <CardHeader>
              <CardTitle>Code Coverage Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Coverage reports and analysis would be displayed here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Testing Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Global testing settings and preferences would be configured here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Test Suite Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <CardHeader>
              <CardTitle>Create Test Suite</CardTitle>
              <CardDescription>
                Set up a new automated test suite with configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Test suite name"
                  />
                </div>
                <div>
                  <Label htmlFor="framework">Framework</Label>
                  <Select
                    value={createForm.framework}
                    onValueChange={(value) => setCreateForm({ ...createForm, framework: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="jest">Jest</SelectItem>
                      <SelectItem value="cypress">Cypress</SelectItem>
                      <SelectItem value="playwright">Playwright</SelectItem>
                      <SelectItem value="vitest">Vitest</SelectItem>
                      <SelectItem value="mocha">Mocha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe what this test suite covers"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="testType">Test Type</Label>
                  <Select
                    value={createForm.testType}
                    onValueChange={(value) => setCreateForm({ ...createForm, testType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unit">Unit Tests</SelectItem>
                      <SelectItem value="integration">Integration Tests</SelectItem>
                      <SelectItem value="e2e">End-to-End Tests</SelectItem>
                      <SelectItem value="performance">Performance Tests</SelectItem>
                      <SelectItem value="security">Security Tests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="timeout">Timeout (ms)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    value={createForm.configuration.timeout}
                    onChange={(e) => setCreateForm({
                      ...createForm,
                      configuration: { ...createForm.configuration, timeout: parseInt(e.target.value) }
                    })}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="coverage"
                  checked={createForm.configuration.coverage}
                  onCheckedChange={(checked) => setCreateForm({
                    ...createForm,
                    configuration: { ...createForm.configuration, coverage: checked }
                  })}
                />
                <Label htmlFor="coverage">Enable code coverage</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                  Cancel
                </Button>
                <Button onClick={createTestSuite}>
                  Create Suite
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
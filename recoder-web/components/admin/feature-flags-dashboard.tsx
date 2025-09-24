'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Line, 
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  Flag, 
  Plus, 
  Edit, 
  Trash2, 
  Activity, 
  Users, 
  TrendingUp,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Target,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';

interface FeatureFlag {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  rolloutPercentage: number;
  userSegments?: string[];
  startDate?: string;
  endDate?: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

interface FeatureFlagAnalytics {
  usageOverTime: Array<{
    flagName: string;
    date: string;
    usageCount: number;
    uniqueUsers: number;
  }>;
  rolloutPerformance: Array<{
    name: string;
    rolloutPercentage: number;
    enabled: boolean;
    usageCount: number;
  }>;
  mostUsedFlags: Array<{
    flagId: string;
    name: string;
    usageCount: number;
  }>;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function FeatureFlagsDashboard() {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [analytics, setAnalytics] = useState<FeatureFlagAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: true,
    rolloutPercentage: 100,
    userSegments: [] as string[],
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchFeatureFlags();
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchFeatureFlags();
      }, 30000); // Refresh every 30 seconds
      setRefreshInterval(interval);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [autoRefresh]);

  const fetchFeatureFlags = async () => {
    try {
      const response = await fetch('/api/admin/feature-flags?includeAnalytics=true');
      const data = await response.json();
      setFeatureFlags(data.featureFlags || []);
      setAnalytics(data.analytics);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingFlag 
        ? `/api/admin/feature-flags?id=${editingFlag.id}` 
        : '/api/admin/feature-flags';
      const method = editingFlag ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsDialogOpen(false);
        setEditingFlag(null);
        resetForm();
        fetchFeatureFlags();
      }
    } catch (error) {
      console.error('Failed to save feature flag:', error);
    }
  };

  const handleEdit = (flag: FeatureFlag) => {
    setEditingFlag(flag);
    setFormData({
      name: flag.name,
      description: flag.description || '',
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      userSegments: flag.userSegments || [],
      startDate: flag.startDate ? flag.startDate.split('T')[0] : '',
      endDate: flag.endDate ? flag.endDate.split('T')[0] : '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (flagId: string) => {
    if (!confirm('Are you sure you want to delete this feature flag?')) return;
    
    try {
      const response = await fetch(`/api/admin/feature-flags?id=${flagId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchFeatureFlags();
      }
    } catch (error) {
      console.error('Failed to delete feature flag:', error);
    }
  };

  const toggleFlag = async (flag: FeatureFlag) => {
    try {
      const response = await fetch(`/api/admin/feature-flags?id=${flag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !flag.enabled }),
      });

      if (response.ok) {
        fetchFeatureFlags();
      }
    } catch (error) {
      console.error('Failed to toggle feature flag:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      enabled: true,
      rolloutPercentage: 100,
      userSegments: [],
      startDate: '',
      endDate: '',
    });
  };

  const getStatusBadge = (flag: FeatureFlag) => {
    const now = new Date();
    const startDate = flag.startDate ? new Date(flag.startDate) : null;
    const endDate = flag.endDate ? new Date(flag.endDate) : null;

    if (!flag.enabled) {
      return <Badge variant="secondary">Disabled</Badge>;
    }
    if (startDate && now < startDate) {
      return <Badge variant="outline">Scheduled</Badge>;
    }
    if (endDate && now > endDate) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (flag.rolloutPercentage < 100) {
      return <Badge variant="default">Partial Rollout</Badge>;
    }
    return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  const enabledFlags = featureFlags.filter(f => f.enabled).length;
  const totalUsage = featureFlags.reduce((sum, flag) => sum + flag.usageCount, 0);
  const avgRollout = featureFlags.length > 0 
    ? featureFlags.reduce((sum, flag) => sum + flag.rolloutPercentage, 0) / featureFlags.length
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">Manage feature rollouts and experiments</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
            Auto Refresh
          </Button>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Flag
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{featureFlags.length}</div>
            <p className="text-xs text-muted-foreground">
              {enabledFlags} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Usage</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsage.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Flag evaluations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rollout</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgRollout.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              Average rollout percentage
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">99.2%</div>
            <p className="text-xs text-muted-foreground">
              Flag evaluation success
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="flags" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flags">Feature Flags</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="usage">Usage Patterns</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="flags">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Manage and monitor your feature flags
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rollout</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureFlags.map((flag) => (
                    <TableRow key={flag.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{flag.name}</div>
                          {flag.description && (
                            <div className="text-sm text-muted-foreground">
                              {flag.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(flag)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${flag.rolloutPercentage}%` }}
                            />
                          </div>
                          <span className="text-sm">{flag.rolloutPercentage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{flag.usageCount.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(flag.updatedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleFlag(flag)}
                          >
                            {flag.enabled ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(flag)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(flag.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          {analytics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Usage Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.usageOverTime.slice(-30)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="usageCount" stroke="#8884d8" />
                      <Line type="monotone" dataKey="uniqueUsers" stroke="#82ca9d" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Most Used Flags</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.mostUsedFlags}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="usageCount" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Rollout Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Flag Name</TableHead>
                        <TableHead>Rollout %</TableHead>
                        <TableHead>Usage Count</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Performance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.rolloutPerformance.map((flag, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{flag.name}</TableCell>
                          <TableCell>{flag.rolloutPercentage}%</TableCell>
                          <TableCell>{flag.usageCount.toLocaleString()}</TableCell>
                          <TableCell>
                            {flag.enabled ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {flag.usageCount > 1000 ? (
                                <TrendingUp className="h-4 w-4 text-green-600" />
                              ) : flag.usageCount > 100 ? (
                                <TrendingUp className="h-4 w-4 text-yellow-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-gray-400" />
                              )}
                              <span className="text-sm">
                                {flag.usageCount > 1000 ? 'High' : 
                                 flag.usageCount > 100 ? 'Medium' : 'Low'} Usage
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Flag Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Enabled', value: enabledFlags },
                        { name: 'Disabled', value: featureFlags.length - enabledFlags }
                      ]}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {[{ name: 'Enabled' }, { name: 'Disabled' }].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rollout Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {featureFlags.map((flag) => (
                    <div key={flag.id} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{flag.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {flag.rolloutPercentage}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${flag.rolloutPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Evaluation Speed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">1.2ms</div>
                <p className="text-xs text-muted-foreground">
                  Average evaluation time
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Hit Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">94.8%</div>
                <p className="text-xs text-muted-foreground">
                  Flag evaluations from cache
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">0.01%</div>
                <p className="text-xs text-muted-foreground">
                  Flag evaluation errors
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingFlag ? 'Edit Feature Flag' : 'Create Feature Flag'}
            </DialogTitle>
            <DialogDescription>
              {editingFlag ? 'Update the feature flag settings' : 'Create a new feature flag for your application'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="feature-name"
                  required
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
                <Label htmlFor="enabled">Enabled</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this feature flag controls..."
                rows={2}
              />
            </div>

            <div>
              <Label>Rollout Percentage: {formData.rolloutPercentage}%</Label>
              <Slider
                value={[formData.rolloutPercentage]}
                onValueChange={(value) => setFormData({ ...formData, rolloutPercentage: value[0] })}
                max={100}
                step={1}
                className="mt-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingFlag ? 'Update Flag' : 'Create Flag'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
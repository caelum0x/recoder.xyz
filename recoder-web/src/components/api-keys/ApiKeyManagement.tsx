// API Key Management Dashboard
// Developer portal for managing API keys and monitoring usage

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Key, 
  Plus, 
  Copy, 
  Eye, 
  EyeOff, 
  Edit, 
  Trash2, 
  RefreshCw, 
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Shield,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

interface ApiKey {
  id: string;
  name: string;
  keyDisplay: string;
  permissions: string[];
  rateLimit: {
    requests: number;
    tokens: number;
    window: number;
  };
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  usage?: {
    requests: number;
    tokens: number;
    cost: number;
    errors: number;
  };
}

interface RateLimitStatus {
  requests: { used: number; limit: number; remaining: number };
  tokens: { used: number; limit: number; remaining: number };
  resetTime: number;
  resetIn: number;
}

const ApiKeyManagement: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [showKeyValue, setShowKeyValue] = useState<{ [keyId: string]: boolean }>({});
  const [rateLimitStatus, setRateLimitStatus] = useState<{ [keyId: string]: RateLimitStatus }>({});
  const [newKeyForm, setNewKeyForm] = useState({
    name: '',
    permissions: ['read'] as string[],
    expiresIn: 30
  });

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/keys');
      const data = await response.json();
      
      if (data.success) {
        setApiKeys(data.apiKeys);
        
        // Fetch rate limit status for each key
        data.apiKeys.forEach((key: ApiKey) => {
          fetchRateLimitStatus(key.id);
        });
      } else {
        toast.error('Failed to load API keys');
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
      toast.error('Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchRateLimitStatus = async (keyId: string) => {
    try {
      const response = await fetch(`/api/keys/${keyId}/rate-limit`);
      const data = await response.json();
      
      if (data.success) {
        setRateLimitStatus(prev => ({
          ...prev,
          [keyId]: data.rateLimit
        }));
      }
    } catch (error) {
      console.error('Error fetching rate limit status:', error);
    }
  };

  const createApiKey = async () => {
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newKeyForm)
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('API key created successfully');
        setCreateDialogOpen(false);
        setNewKeyForm({ name: '', permissions: ['read'], expiresIn: 30 });
        
        // Show the new key value
        toast.success(
          <div className="space-y-2">
            <p>Your new API key:</p>
            <code className="block p-2 bg-gray-100 rounded text-sm font-mono break-all">
              {data.key}
            </code>
            <p className="text-xs text-gray-600">Save this key now - it won't be shown again!</p>
          </div>,
          { duration: 10000 }
        );
        
        fetchApiKeys();
      } else {
        toast.error(data.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Failed to create API key');
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/keys/${keyId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('API key revoked successfully');
        fetchApiKeys();
      } else {
        toast.error(data.error || 'Failed to revoke API key');
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
      toast.error('Failed to revoke API key');
    }
  };

  const regenerateApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to regenerate this API key? The old key will be revoked immediately.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/keys/regenerate/${keyId}`, {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success(
          <div className="space-y-2">
            <p>API key regenerated successfully!</p>
            <code className="block p-2 bg-gray-100 rounded text-sm font-mono break-all">
              {data.key}
            </code>
            <p className="text-xs text-gray-600">Save this new key now - it won't be shown again!</p>
          </div>,
          { duration: 10000 }
        );
        
        fetchApiKeys();
      } else {
        toast.error(data.error || 'Failed to regenerate API key');
      }
    } catch (error) {
      console.error('Error regenerating API key:', error);
      toast.error('Failed to regenerate API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (key: ApiKey) => {
    if (!key.isActive) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    const rateLimits = rateLimitStatus[key.id];
    if (rateLimits) {
      const requestsUsagePercent = (rateLimits.requests.used / rateLimits.requests.limit) * 100;
      const tokensUsagePercent = (rateLimits.tokens.used / rateLimits.tokens.limit) * 100;
      
      if (requestsUsagePercent > 90 || tokensUsagePercent > 90) {
        return <Badge variant="destructive">Near Limit</Badge>;
      }
      
      if (requestsUsagePercent > 70 || tokensUsagePercent > 70) {
        return <Badge className="bg-yellow-100 text-yellow-800">High Usage</Badge>;
      }
    }
    
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  const getPermissionIcon = (permission: string) => {
    switch (permission) {
      case 'read': return <Eye className="h-3 w-3" />;
      case 'write': return <Edit className="h-3 w-3" />;
      case 'admin': return <Shield className="h-3 w-3" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center space-x-2">
            <Key className="h-8 w-8 text-blue-500" />
            <span>API Keys</span>
          </h1>
          <p className="text-gray-600 mt-1">
            Manage your API keys and monitor usage across your applications
          </p>
        </div>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create API Key</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New API Key</DialogTitle>
              <DialogDescription>
                Generate a new API key for your application. Choose permissions carefully.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Key Name</Label>
                <Input
                  id="name"
                  placeholder="My Application API Key"
                  value={newKeyForm.name}
                  onChange={(e) => setNewKeyForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              
              <div>
                <Label>Permissions</Label>
                <div className="space-y-2 mt-2">
                  {['read', 'write', 'admin'].map((permission) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission}
                        checked={newKeyForm.permissions.includes(permission)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setNewKeyForm(prev => ({
                              ...prev,
                              permissions: [...prev.permissions, permission]
                            }));
                          } else {
                            setNewKeyForm(prev => ({
                              ...prev,
                              permissions: prev.permissions.filter(p => p !== permission)
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={permission} className="flex items-center space-x-1 cursor-pointer">
                        {getPermissionIcon(permission)}
                        <span className="capitalize">{permission}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <Label htmlFor="expires">Expires In (Days)</Label>
                <Select
                  value={newKeyForm.expiresIn.toString()}
                  onValueChange={(value) => setNewKeyForm(prev => ({ ...prev, expiresIn: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex space-x-2 pt-4">
                <Button onClick={createApiKey} className="flex-1">
                  Create Key
                </Button>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* API Keys List */}
      {apiKeys.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No API Keys</h3>
            <p className="text-gray-600 mb-6">
              Create your first API key to start using the Recoder.xyz API
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              Create Your First API Key
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {apiKeys.map((key) => (
            <Card key={key.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold">{key.name}</h3>
                      {getStatusBadge(key)}
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="px-3 py-1 bg-gray-100 rounded text-sm font-mono">
                        {key.keyDisplay}
                      </code>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(key.keyDisplay)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <Label className="text-xs text-gray-500">PERMISSIONS</Label>
                        <div className="flex space-x-1 mt-1">
                          {key.permissions.map((permission) => (
                            <Badge key={permission} variant="outline" className="text-xs">
                              {getPermissionIcon(permission)}
                              <span className="ml-1 capitalize">{permission}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-xs text-gray-500">LAST USED</Label>
                        <p className="text-sm">
                          {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-xs text-gray-500">EXPIRES</Label>
                        <p className="text-sm">
                          {key.expiresAt ? formatDate(key.expiresAt) : 'Never'}
                        </p>
                      </div>
                    </div>
                    
                    {/* Rate Limit Status */}
                    {rateLimitStatus[key.id] && (
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Requests ({rateLimitStatus[key.id].requests.used}/{rateLimitStatus[key.id].requests.limit})</span>
                            <span>{rateLimitStatus[key.id].requests.remaining} remaining</span>
                          </div>
                          <Progress 
                            value={(rateLimitStatus[key.id].requests.used / rateLimitStatus[key.id].requests.limit) * 100}
                            className="h-2"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between text-sm mb-1">
                            <span>Tokens ({rateLimitStatus[key.id].tokens.used.toLocaleString()}/{rateLimitStatus[key.id].tokens.limit.toLocaleString()})</span>
                            <span>{rateLimitStatus[key.id].tokens.remaining.toLocaleString()} remaining</span>
                          </div>
                          <Progress 
                            value={(rateLimitStatus[key.id].tokens.used / rateLimitStatus[key.id].tokens.limit) * 100}
                            className="h-2"
                          />
                        </div>
                        
                        <p className="text-xs text-gray-500">
                          Resets in {Math.ceil(rateLimitStatus[key.id].resetIn / 60)} minutes
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => fetchRateLimitStatus(key.id)}
                      title="Refresh status"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerateApiKey(key.id)}
                      title="Regenerate key"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeApiKey(key.id)}
                      className="text-red-600 hover:text-red-700"
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {/* Usage Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Quick Start Guide</span>
          </CardTitle>
          <CardDescription>
            Learn how to use your API keys with the Recoder.xyz API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Authentication</h4>
            <code className="block p-3 bg-gray-100 rounded text-sm">
              curl -H "Authorization: Bearer YOUR_API_KEY" https://api.recoder.xyz/v1/generate
            </code>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Rate Limits</h4>
            <p className="text-sm text-gray-600">
              Rate limits are enforced per hour and vary by subscription plan. 
              Check the progress bars above to monitor your usage.
            </p>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Documentation</h4>
            <Button variant="outline" size="sm">
              View Full API Documentation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ApiKeyManagement;
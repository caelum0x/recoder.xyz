'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Settings,
  Plus,
  Check,
  X,
  Key,
  Link,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Shield,
  Activity,
  Zap,
  CreditCard,
  Mail,
  MessageSquare,
  Users,
  Github,
  Slack,
  MessageCircle,
  Database,
  Cloud
} from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  lastSync?: string;
  config?: any;
}

interface IntegrationManagerProps {
  integrations: Integration[];
  onIntegrationUpdate: (integrations: Integration[]) => void;
}

const providerIcons: Record<string, React.ReactNode> = {
  stripe: <CreditCard className="h-5 w-5" />,
  auth0: <Users className="h-5 w-5" />,
  sendgrid: <Mail className="h-5 w-5" />,
  twilio: <MessageSquare className="h-5 w-5" />,
  google: <Mail className="h-5 w-5" />,
  microsoft: <Database className="h-5 w-5" />,
  github: <Github className="h-5 w-5" />,
  slack: <Slack className="h-5 w-5" />,
  discord: <MessageCircle className="h-5 w-5" />,
  aws: <Cloud className="h-5 w-5" />
};

const statusColors = {
  connected: 'bg-green-100 text-green-800 border-green-200',
  disconnected: 'bg-gray-100 text-gray-800 border-gray-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  connecting: 'bg-yellow-100 text-yellow-800 border-yellow-200'
};

const statusIndicators = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
  connecting: 'bg-yellow-500'
};

export function IntegrationManager({ integrations, onIntegrationUpdate }: IntegrationManagerProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [connectionForm, setConnectionForm] = useState<any>({});
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  const handleConnect = async (integration: Integration, connectionType: 'oauth' | 'api_key') => {
    setIsConnecting(integration.id);
    
    try {
      if (connectionType === 'oauth') {
        await initiateOAuthFlow(integration);
      } else {
        await connectWithApiKey(integration, connectionForm);
      }
      
      // Update integration status
      const updatedIntegrations = integrations.map(i => 
        i.id === integration.id 
          ? { ...i, status: 'connected' as const, lastSync: new Date().toISOString() }
          : i
      );
      
      onIntegrationUpdate(updatedIntegrations);
      setShowConnectionDialog(false);
      setConnectionForm({});
      
    } catch (error) {
      console.error('Connection failed:', error);
      
      // Update integration status to error
      const updatedIntegrations = integrations.map(i => 
        i.id === integration.id 
          ? { ...i, status: 'error' as const }
          : i
      );
      
      onIntegrationUpdate(updatedIntegrations);
    } finally {
      setIsConnecting(null);
    }
  };

  const initiateOAuthFlow = async (integration: Integration) => {
    // Get OAuth authorization URL
    const response = await fetch('/api/integrations/oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get_auth_url',
        provider: integration.provider
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      // Open OAuth window
      const authWindow = window.open(
        data.result.auth_url, 
        'oauth', 
        'width=600,height=600,scrollbars=yes'
      );
      
      // Listen for OAuth callback
      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (authWindow?.closed) {
            clearInterval(checkClosed);
            // Check if auth was successful by making a test request
            testConnection(integration)
              .then(resolve)
              .catch(reject);
          }
        }, 1000);
        
        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(checkClosed);
          if (authWindow && !authWindow.closed) {
            authWindow.close();
          }
          reject(new Error('OAuth flow timed out'));
        }, 300000);
      });
    } else {
      throw new Error(data.error || 'Failed to get OAuth URL');
    }
  };

  const connectWithApiKey = async (integration: Integration, formData: any) => {
    // Test the connection with provided credentials
    const response = await fetch(`/api/integrations/${integration.provider}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_connection',
        data: formData
      })
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Connection test failed');
    }
    
    // Store credentials securely (in production, encrypt these)
    localStorage.setItem(`integration_${integration.provider}`, JSON.stringify(formData));
  };

  const testConnection = async (integration: Integration) => {
    try {
      const response = await fetch(`/api/integrations/${integration.provider}`);
      const data = await response.json();
      
      if (data.status === 'operational') {
        return true;
      } else {
        throw new Error('Service not operational');
      }
    } catch (error) {
      throw new Error('Connection test failed');
    }
  };

  const handleDisconnect = async (integration: Integration) => {
    // Remove stored credentials
    localStorage.removeItem(`integration_${integration.provider}`);
    
    // Update integration status
    const updatedIntegrations = integrations.map(i => 
      i.id === integration.id 
        ? { ...i, status: 'disconnected' as const, lastSync: undefined }
        : i
    );
    
    onIntegrationUpdate(updatedIntegrations);
  };

  const handleRefresh = async (integration: Integration) => {
    setIsConnecting(integration.id);
    
    try {
      await testConnection(integration);
      
      const updatedIntegrations = integrations.map(i => 
        i.id === integration.id 
          ? { ...i, status: 'connected' as const, lastSync: new Date().toISOString() }
          : i
      );
      
      onIntegrationUpdate(updatedIntegrations);
    } catch (error) {
      const updatedIntegrations = integrations.map(i => 
        i.id === integration.id 
          ? { ...i, status: 'error' as const }
          : i
      );
      
      onIntegrationUpdate(updatedIntegrations);
    } finally {
      setIsConnecting(null);
    }
  };

  const renderConnectionForm = (integration: Integration) => {
    const provider = integration.provider;
    
    // OAuth providers
    const oauthProviders = ['google', 'microsoft', 'github', 'slack', 'discord'];
    
    if (oauthProviders.includes(provider)) {
      return (
        <div className="space-y-4">
          <div className="text-center py-6">
            <Shield className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Connect with OAuth 2.0
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This integration uses secure OAuth 2.0 authentication. 
              You'll be redirected to {integration.name} to authorize access.
            </p>
            <Button 
              onClick={() => handleConnect(integration, 'oauth')}
              disabled={isConnecting === integration.id}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              {isConnecting === integration.id ? 'Connecting...' : `Connect to ${integration.name}`}
            </Button>
          </div>
        </div>
      );
    }
    
    // API Key providers
    switch (provider) {
      case 'stripe':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="api_key">Stripe Secret Key</Label>
              <Input
                id="api_key"
                type="password"
                placeholder="sk_test_..."
                value={connectionForm.api_key || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, api_key: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Find your secret key in the Stripe Dashboard under API keys
              </p>
            </div>
            
            <div>
              <Label htmlFor="webhook_secret">Webhook Signing Secret (optional)</Label>
              <Input
                id="webhook_secret"
                type="password"
                placeholder="whsec_..."
                value={connectionForm.webhook_secret || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, webhook_secret: e.target.value })}
              />
            </div>
          </div>
        );
        
      case 'sendgrid':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="api_key">SendGrid API Key</Label>
              <Input
                id="api_key"
                type="password"
                placeholder="SG...."
                value={connectionForm.api_key || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, api_key: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="from_email">From Email Address</Label>
              <Input
                id="from_email"
                type="email"
                placeholder="noreply@example.com"
                value={connectionForm.from_email || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, from_email: e.target.value })}
              />
            </div>
          </div>
        );
        
      case 'twilio':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="account_sid">Account SID</Label>
              <Input
                id="account_sid"
                placeholder="AC..."
                value={connectionForm.account_sid || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, account_sid: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="auth_token">Auth Token</Label>
              <Input
                id="auth_token"
                type="password"
                value={connectionForm.auth_token || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, auth_token: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="phone_number">Twilio Phone Number</Label>
              <Input
                id="phone_number"
                placeholder="+1234567890"
                value={connectionForm.phone_number || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, phone_number: e.target.value })}
              />
            </div>
          </div>
        );
        
      case 'auth0':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="domain">Auth0 Domain</Label>
              <Input
                id="domain"
                placeholder="your-domain.auth0.com"
                value={connectionForm.domain || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, domain: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="client_id">Management API Client ID</Label>
              <Input
                id="client_id"
                value={connectionForm.client_id || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, client_id: e.target.value })}
              />
            </div>
            
            <div>
              <Label htmlFor="client_secret">Management API Client Secret</Label>
              <Input
                id="client_secret"
                type="password"
                value={connectionForm.client_secret || ''}
                onChange={(e) => setConnectionForm({ ...connectionForm, client_secret: e.target.value })}
              />
            </div>
          </div>
        );
        
      default:
        return (
          <div className="text-center py-6">
            <AlertCircle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Connection configuration not available for this provider yet.
            </p>
          </div>
        );
    }
  };

  const connectedIntegrations = integrations.filter(i => i.status === 'connected');
  const disconnectedIntegrations = integrations.filter(i => i.status !== 'connected');

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Integration Status</h3>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Connected: {connectedIntegrations.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <span>Available: {disconnectedIntegrations.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="connected" className="h-full">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="connected">
              <Check className="h-3 w-3 mr-1" />
              Connected ({connectedIntegrations.length})
            </TabsTrigger>
            <TabsTrigger value="available">
              <Plus className="h-3 w-3 mr-1" />
              Available ({disconnectedIntegrations.length})
            </TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent value="connected" className="space-y-3 mt-0">
              {connectedIntegrations.length === 0 ? (
                <div className="text-center py-8">
                  <Link className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No integrations connected</p>
                  <p className="text-xs text-gray-400">Connect integrations to start building workflows</p>
                </div>
              ) : (
                connectedIntegrations.map(integration => (
                  <Card key={integration.id} className="p-3 border-green-200 bg-green-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white">
                          {providerIcons[integration.provider] || <Activity className="h-4 w-4" />}
                        </div>
                        
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{integration.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${statusIndicators[integration.status]}`}></div>
                            <span className="text-xs text-gray-600 capitalize">{integration.status}</span>
                            {integration.lastSync && (
                              <span className="text-xs text-gray-500">
                                • Last sync: {new Date(integration.lastSync).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRefresh(integration)}
                          disabled={isConnecting === integration.id}
                          className="h-8 w-8 p-0"
                        >
                          <RefreshCw className={`h-3 w-3 ${isConnecting === integration.id ? 'animate-spin' : ''}`} />
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnect(integration)}
                          className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="available" className="space-y-3 mt-0">
              {disconnectedIntegrations.map(integration => (
                <Card key={integration.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center text-white">
                        {providerIcons[integration.provider] || <Activity className="h-4 w-4" />}
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">{integration.name}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <div className={`w-2 h-2 rounded-full ${statusIndicators[integration.status]}`}></div>
                          <span className="text-xs text-gray-600 capitalize">{integration.status}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Dialog 
                      open={showConnectionDialog && selectedIntegration?.id === integration.id}
                      onOpenChange={(open) => {
                        setShowConnectionDialog(open);
                        if (!open) {
                          setSelectedIntegration(null);
                          setConnectionForm({});
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedIntegration(integration)}
                        >
                          <Link className="h-3 w-3 mr-1" />
                          Connect
                        </Button>
                      </DialogTrigger>
                      
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-gray-600 rounded flex items-center justify-center text-white">
                              {providerIcons[integration.provider] || <Activity className="h-3 w-3" />}
                            </div>
                            Connect {integration.name}
                          </DialogTitle>
                        </DialogHeader>
                        
                        <div className="py-4">
                          {selectedIntegration && renderConnectionForm(selectedIntegration)}
                        </div>
                        
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline"
                            onClick={() => {
                              setShowConnectionDialog(false);
                              setSelectedIntegration(null);
                              setConnectionForm({});
                            }}
                          >
                            Cancel
                          </Button>
                          
                          {selectedIntegration && !['google', 'microsoft', 'github', 'slack', 'discord'].includes(selectedIntegration.provider) && (
                            <Button
                              onClick={() => handleConnect(selectedIntegration, 'api_key')}
                              disabled={isConnecting === selectedIntegration.id}
                            >
                              {isConnecting === selectedIntegration.id ? 'Connecting...' : 'Connect'}
                            </Button>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </Card>
              ))}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
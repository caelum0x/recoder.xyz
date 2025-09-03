'use client';

import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  X, 
  Save, 
  TestTube, 
  Plus, 
  Minus,
  Settings,
  Code,
  Database,
  Key,
  Info
} from 'lucide-react';

interface NodeConfigPanelProps {
  node: Node;
  integrations: any[];
  onSave: (nodeId: string, config: any) => void;
  onCancel: () => void;
}

interface FieldMapping {
  source: string;
  target: string;
  operation: string;
}

export function NodeConfigPanel({ node, integrations, onSave, onCancel }: NodeConfigPanelProps) {
  const [config, setConfig] = useState(node.data.config || {});
  const [isValid, setIsValid] = useState(true);
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const nodeType = node.type;
  const provider = node.data.provider;
  const operation = node.data.operation;

  // Get integration status
  const integration = integrations.find(i => i.provider === provider);
  const isConnected = integration?.status === 'connected';

  useEffect(() => {
    validateConfig();
  }, [config]);

  const validateConfig = () => {
    let valid = true;
    
    // Basic validation based on node type
    switch (nodeType) {
      case 'trigger':
        // Triggers usually need minimal config
        break;
      case 'action':
        // Actions need operation-specific config
        if (provider === 'sendgrid' && operation === 'send_email') {
          valid = !!(config.to && config.subject);
        } else if (provider === 'slack' && operation === 'send_message') {
          valid = !!(config.channel && config.text);
        }
        break;
      case 'condition':
        valid = !!config.condition;
        break;
      case 'transform':
        valid = !!(config.transformations && config.transformations.length > 0);
        break;
      case 'delay':
        valid = !!(config.delay_ms || config.delay_seconds || config.delay_minutes || config.delay_hours);
        break;
    }
    
    setIsValid(valid);
  };

  const handleConfigChange = (key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNestedConfigChange = (parentKey: string, index: number, key: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      [parentKey]: prev[parentKey]?.map((item: any, i: number) => 
        i === index ? { ...item, [key]: value } : item
      ) || []
    }));
  };

  const addFieldMapping = () => {
    const newMapping: FieldMapping = {
      source: '',
      target: '',
      operation: 'copy'
    };
    
    setConfig(prev => ({
      ...prev,
      transformations: [...(prev.transformations || []), newMapping]
    }));
  };

  const removeFieldMapping = (index: number) => {
    setConfig(prev => ({
      ...prev,
      transformations: prev.transformations?.filter((_: any, i: number) => i !== index) || []
    }));
  };

  const testConfiguration = async () => {
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const response = await fetch(`/api/integrations/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_connection', // Most integrations support this
          data: config
        })
      });
      
      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        error: 'Failed to test configuration'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (isValid) {
      onSave(node.id, config);
    }
  };

  const renderTriggerConfig = () => {
    switch (operation) {
      case 'payment_succeeded':
        return (
          <div className="space-y-4">
            <div>
              <Label>Events to Monitor</Label>
              <div className="mt-2 space-y-2">
                {['payment_intent.succeeded', 'invoice.payment_succeeded', 'subscription_schedule.completed'].map(event => (
                  <div key={event} className="flex items-center space-x-2">
                    <Switch 
                      checked={config.events?.includes(event)}
                      onCheckedChange={(checked) => {
                        const events = config.events || [];
                        if (checked) {
                          handleConfigChange('events', [...events, event]);
                        } else {
                          handleConfigChange('events', events.filter((e: string) => e !== event));
                        }
                      }}
                    />
                    <Label className="text-sm">{event}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      
      case 'new_email':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="label">Label Filter</Label>
              <Select value={config.label || 'INBOX'} onValueChange={(value) => handleConfigChange('label', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOX">Inbox</SelectItem>
                  <SelectItem value="UNREAD">Unread</SelectItem>
                  <SelectItem value="IMPORTANT">Important</SelectItem>
                  <SelectItem value="STARRED">Starred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="from_filter">From Filter (optional)</Label>
              <Input
                id="from_filter"
                placeholder="sender@example.com"
                value={config.from_filter || ''}
                onChange={(e) => handleConfigChange('from_filter', e.target.value)}
              />
            </div>
          </div>
        );
        
      default:
        return (
          <div>
            <p className="text-sm text-gray-500">No specific configuration required for this trigger.</p>
          </div>
        );
    }
  };

  const renderActionConfig = () => {
    switch (operation) {
      case 'send_email':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="to">To Email *</Label>
              <Input
                id="to"
                placeholder="recipient@example.com"
                value={config.to || ''}
                onChange={(e) => handleConfigChange('to', e.target.value)}
                className={!config.to ? 'border-red-300' : ''}
              />
            </div>
            
            <div>
              <Label htmlFor="subject">Subject *</Label>
              <Input
                id="subject"
                placeholder="Email subject"
                value={config.subject || ''}
                onChange={(e) => handleConfigChange('subject', e.target.value)}
                className={!config.subject ? 'border-red-300' : ''}
              />
            </div>
            
            <div>
              <Label htmlFor="html">HTML Content</Label>
              <Textarea
                id="html"
                placeholder="Email HTML content"
                value={config.html || ''}
                onChange={(e) => handleConfigChange('html', e.target.value)}
                rows={6}
              />
            </div>
            
            <div>
              <Label htmlFor="text">Plain Text (optional)</Label>
              <Textarea
                id="text"
                placeholder="Plain text version"
                value={config.text || ''}
                onChange={(e) => handleConfigChange('text', e.target.value)}
                rows={3}
              />
            </div>
          </div>
        );
        
      case 'send_message':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="channel">Channel *</Label>
              <Input
                id="channel"
                placeholder="#general"
                value={config.channel || ''}
                onChange={(e) => handleConfigChange('channel', e.target.value)}
                className={!config.channel ? 'border-red-300' : ''}
              />
            </div>
            
            <div>
              <Label htmlFor="text">Message *</Label>
              <Textarea
                id="text"
                placeholder="Message content"
                value={config.text || ''}
                onChange={(e) => handleConfigChange('text', e.target.value)}
                className={!config.text ? 'border-red-300' : ''}
                rows={4}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch 
                checked={config.link_names}
                onCheckedChange={(checked) => handleConfigChange('link_names', checked)}
              />
              <Label>Link names and channels</Label>
            </div>
          </div>
        );
        
      case 'send_sms':
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="to">To Phone Number *</Label>
              <Input
                id="to"
                placeholder="+1234567890"
                value={config.to || ''}
                onChange={(e) => handleConfigChange('to', e.target.value)}
                className={!config.to ? 'border-red-300' : ''}
              />
            </div>
            
            <div>
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                placeholder="SMS message"
                value={config.message || ''}
                onChange={(e) => handleConfigChange('message', e.target.value)}
                className={!config.message ? 'border-red-300' : ''}
                rows={3}
              />
            </div>
          </div>
        );
        
      default:
        return (
          <div>
            <p className="text-sm text-gray-500">Generic action configuration</p>
          </div>
        );
    }
  };

  const renderConditionConfig = () => {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="condition">Condition Expression *</Label>
          <Textarea
            id="condition"
            placeholder="email.importance == 'high' OR amount > 100"
            value={config.condition || ''}
            onChange={(e) => handleConfigChange('condition', e.target.value)}
            className={!config.condition ? 'border-red-300' : ''}
            rows={3}
          />
          <p className="text-xs text-gray-500 mt-1">
            Use field names, operators (==, !=, {'>'},{'<'}, {'>'}=, {'<'}=), and logical operators (AND, OR)
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="true_path">True Path Label</Label>
            <Input
              id="true_path"
              placeholder="Success"
              value={config.true_path || ''}
              onChange={(e) => handleConfigChange('true_path', e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="false_path">False Path Label</Label>
            <Input
              id="false_path"
              placeholder="Failed"
              value={config.false_path || ''}
              onChange={(e) => handleConfigChange('false_path', e.target.value)}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderTransformConfig = () => {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Field Transformations</Label>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={addFieldMapping}
            className="h-8"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Mapping
          </Button>
        </div>
        
        <div className="space-y-3">
          {(config.transformations || []).map((transform: FieldMapping, index: number) => (
            <Card key={index} className="p-3">
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Label className="text-xs">Source Field</Label>
                  <Input
                    placeholder="source_field"
                    value={transform.source}
                    onChange={(e) => handleNestedConfigChange('transformations', index, 'source', e.target.value)}
                    className="h-8"
                  />
                </div>
                
                <div className="col-span-3">
                  <Label className="text-xs">Operation</Label>
                  <Select 
                    value={transform.operation} 
                    onValueChange={(value) => handleNestedConfigChange('transformations', index, 'operation', value)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="copy">Copy</SelectItem>
                      <SelectItem value="uppercase">Uppercase</SelectItem>
                      <SelectItem value="lowercase">Lowercase</SelectItem>
                      <SelectItem value="format_date">Format Date</SelectItem>
                      <SelectItem value="json_parse">Parse JSON</SelectItem>
                      <SelectItem value="json_stringify">Stringify JSON</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="col-span-4">
                  <Label className="text-xs">Target Field</Label>
                  <Input
                    placeholder="target_field"
                    value={transform.target}
                    onChange={(e) => handleNestedConfigChange('transformations', index, 'target', e.target.value)}
                    className="h-8"
                  />
                </div>
                
                <div className="col-span-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => removeFieldMapping(index)}
                    className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        
        {(!config.transformations || config.transformations.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            <Database className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No transformations configured</p>
            <p className="text-xs">Click "Add Mapping" to create field transformations</p>
          </div>
        )}
      </div>
    );
  };

  const renderDelayConfig = () => {
    return (
      <div className="space-y-4">
        <div>
          <Label>Delay Type</Label>
          <Select 
            value={config.delay_type || 'fixed'} 
            onValueChange={(value) => handleConfigChange('delay_type', value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed Duration</SelectItem>
              <SelectItem value="dynamic">Dynamic (from data)</SelectItem>
              <SelectItem value="until">Wait Until Time</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {config.delay_type !== 'until' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="delay_hours">Hours</Label>
              <Input
                id="delay_hours"
                type="number"
                min="0"
                value={config.delay_hours || ''}
                onChange={(e) => handleConfigChange('delay_hours', parseInt(e.target.value) || 0)}
              />
            </div>
            
            <div>
              <Label htmlFor="delay_minutes">Minutes</Label>
              <Input
                id="delay_minutes"
                type="number"
                min="0"
                max="59"
                value={config.delay_minutes || ''}
                onChange={(e) => handleConfigChange('delay_minutes', parseInt(e.target.value) || 0)}
              />
            </div>
            
            <div>
              <Label htmlFor="delay_seconds">Seconds</Label>
              <Input
                id="delay_seconds"
                type="number"
                min="0"
                max="59"
                value={config.delay_seconds || ''}
                onChange={(e) => handleConfigChange('delay_seconds', parseInt(e.target.value) || 0)}
              />
            </div>
            
            <div>
              <Label htmlFor="delay_ms">Milliseconds</Label>
              <Input
                id="delay_ms"
                type="number"
                min="0"
                max="999"
                value={config.delay_ms || ''}
                onChange={(e) => handleConfigChange('delay_ms', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        )}
        
        {config.delay_type === 'until' && (
          <div>
            <Label htmlFor="until_time">Wait Until</Label>
            <Input
              id="until_time"
              type="datetime-local"
              value={config.until_time || ''}
              onChange={(e) => handleConfigChange('until_time', e.target.value)}
            />
          </div>
        )}
        
        {config.delay_type === 'dynamic' && (
          <div>
            <Label htmlFor="delay_field">Delay Field</Label>
            <Input
              id="delay_field"
              placeholder="Field containing delay value"
              value={config.delay_field || ''}
              onChange={(e) => handleConfigChange('delay_field', e.target.value)}
            />
          </div>
        )}
      </div>
    );
  };

  const renderConfigForm = () => {
    switch (nodeType) {
      case 'trigger':
        return renderTriggerConfig();
      case 'action':
        return renderActionConfig();
      case 'condition':
        return renderConditionConfig();
      case 'transform':
        return renderTransformConfig();
      case 'delay':
        return renderDelayConfig();
      default:
        return <div>Unknown node type</div>;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Configure Node</h2>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {nodeType?.toUpperCase()}
          </Badge>
          <span className="text-sm text-gray-600">{node.data.label}</span>
        </div>
        
        {/* Connection Status */}
        <div className="mt-2 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}></div>
          <span className="text-xs text-gray-500">
            {provider} - {isConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="config" className="h-full">
          <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
            <TabsTrigger value="config">
              <Settings className="h-3 w-3 mr-1" />
              Config
            </TabsTrigger>
            <TabsTrigger value="advanced">
              <Code className="h-3 w-3 mr-1" />
              Advanced
            </TabsTrigger>
            <TabsTrigger value="help">
              <Info className="h-3 w-3 mr-1" />
              Help
            </TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent value="config" className="space-y-4 mt-0">
              {!isConnected && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">
                      Integration Not Connected
                    </span>
                  </div>
                  <p className="text-xs text-yellow-700 mt-1">
                    This integration needs to be connected before the node can be used.
                  </p>
                </div>
              )}
              
              {renderConfigForm()}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-0">
              <div>
                <Label htmlFor="custom_headers">Custom Headers (JSON)</Label>
                <Textarea
                  id="custom_headers"
                  placeholder='{"Authorization": "Bearer token"}'
                  value={config.custom_headers ? JSON.stringify(config.custom_headers, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      handleConfigChange('custom_headers', parsed);
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  rows={4}
                />
              </div>
              
              <div>
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  value={config.timeout || 30}
                  onChange={(e) => handleConfigChange('timeout', parseInt(e.target.value) || 30)}
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={config.retry_on_failure}
                  onCheckedChange={(checked) => handleConfigChange('retry_on_failure', checked)}
                />
                <Label>Retry on failure</Label>
              </div>
            </TabsContent>

            <TabsContent value="help" className="mt-0">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Node Information</h3>
                  <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                    <div><span className="font-medium">Type:</span> {nodeType}</div>
                    <div><span className="font-medium">Provider:</span> {provider}</div>
                    <div><span className="font-medium">Operation:</span> {operation}</div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Available Variables</h3>
                  <div className="bg-gray-50 rounded p-3 text-sm">
                    <p className="mb-2">You can use these variables in your configuration:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                      <li><code>{'{{trigger.data}}'}</code> - Data from trigger node</li>
                      <li><code>{'{{previous.result}}'}</code> - Result from previous node</li>
                      <li><code>{'{{workflow.variables}}'}</code> - Workflow variables</li>
                      <li><code>{'{{current.timestamp}}'}</code> - Current timestamp</li>
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className="p-4 border-t border-gray-200">
          <div className={`p-3 rounded ${
            testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${
                testResult.success ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className={`text-sm font-medium ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                Test {testResult.success ? 'Successful' : 'Failed'}
              </span>
            </div>
            {testResult.error && (
              <p className="text-xs text-red-700">{testResult.error}</p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={testConfiguration}
            disabled={isTesting || !isConnected}
          >
            <TestTube className="h-3 w-3 mr-1" />
            {isTesting ? 'Testing...' : 'Test'}
          </Button>
          
          {!isValid && (
            <span className="text-xs text-red-600">
              Required fields missing
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="h-3 w-3 mr-1" />
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
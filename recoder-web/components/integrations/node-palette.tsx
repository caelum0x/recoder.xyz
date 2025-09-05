'use client';

import React, { useState } from 'react';
import { useDrag } from 'react-dnd';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Zap, 
  Play, 
  GitBranch, 
  Shuffle, 
  Clock, 
  Settings2,
  Mail,
  MessageSquare,
  CreditCard,
  Users,
  Database,
  Cloud,
  Github,
  Slack,
  MessageCircle,
  Calendar,
  FileText,
  BarChart,
  Shield
} from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
}

interface NodePaletteProps {
  integrations: Integration[];
}

interface NodeTemplate {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'transform' | 'delay';
  category: string;
  provider: string;
  operation: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  connected: boolean;
}

// Draggable Node Component
function DraggableNode({ node, disabled }: { node: NodeTemplate; disabled?: boolean }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'integration-node',
    item: {
      type: node.type,
      provider: node.provider,
      operation: node.operation,
      label: node.label,
    },
    canDrag: !disabled,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag as any}
      className={`
        group relative p-3 rounded-lg border cursor-grab transition-all duration-200
        ${isDragging ? 'opacity-50 rotate-3 scale-105' : ''}
        ${disabled 
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md active:cursor-grabbing'
        }
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`
          flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-white
          ${disabled ? 'bg-gray-400' : node.color}
        `}>
          {node.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`text-sm font-medium truncate ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
              {node.label}
            </h4>
            <Badge 
              variant="secondary" 
              className={`text-xs ${disabled ? 'bg-gray-200 text-gray-400' : ''}`}
            >
              {node.type}
            </Badge>
          </div>
          
          <p className={`text-xs mb-2 line-clamp-2 ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
            {node.description}
          </p>
          
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono ${disabled ? 'text-gray-400' : 'text-gray-600'}`}>
              {node.provider}
            </span>
            
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${
                disabled ? 'bg-gray-300' :
                node.connected ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className={`text-xs ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
                {disabled ? 'Disabled' : node.connected ? 'Connected' : 'Not Connected'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Drag indicator */}
      {!disabled && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-0.5"></div>
          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-0.5"></div>
        </div>
      )}
    </div>
  );
}

export function NodePalette({ integrations }: NodePaletteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Check if integration is connected
  const isIntegrationConnected = (provider: string) => {
    const integration = integrations.find(i => i.provider === provider);
    return integration?.status === 'connected';
  };

  // Define all available node templates
  const nodeTemplates: NodeTemplate[] = [
    // Trigger Nodes
    {
      id: 'stripe-payment-trigger',
      type: 'trigger',
      category: 'payment',
      provider: 'stripe',
      operation: 'payment_succeeded',
      label: 'Payment Received',
      description: 'Triggers when a Stripe payment is successfully processed',
      icon: <CreditCard className="h-4 w-4" />,
      color: 'bg-green-600',
      connected: isIntegrationConnected('stripe')
    },
    {
      id: 'gmail-new-email-trigger',
      type: 'trigger',
      category: 'communication',
      provider: 'google',
      operation: 'new_email',
      label: 'New Email',
      description: 'Triggers when a new email is received in Gmail',
      icon: <Mail className="h-4 w-4" />,
      color: 'bg-green-600',
      connected: isIntegrationConnected('google')
    },
    {
      id: 'webhook-trigger',
      type: 'trigger',
      category: 'general',
      provider: 'webhook',
      operation: 'receive_webhook',
      label: 'Webhook Received',
      description: 'Triggers when a webhook is received at a specified URL',
      icon: <Zap className="h-4 w-4" />,
      color: 'bg-green-600',
      connected: true
    },
    {
      id: 'schedule-trigger',
      type: 'trigger',
      category: 'general',
      provider: 'schedule',
      operation: 'cron_schedule',
      label: 'Scheduled Trigger',
      description: 'Triggers on a predefined schedule (cron format)',
      icon: <Calendar className="h-4 w-4" />,
      color: 'bg-green-600',
      connected: true
    },

    // Action Nodes
    {
      id: 'sendgrid-send-email',
      type: 'action',
      category: 'communication',
      provider: 'sendgrid',
      operation: 'send_email',
      label: 'Send Email',
      description: 'Send an email using SendGrid',
      icon: <Mail className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('sendgrid')
    },
    {
      id: 'slack-send-message',
      type: 'action',
      category: 'communication',
      provider: 'slack',
      operation: 'send_message',
      label: 'Send Slack Message',
      description: 'Send a message to a Slack channel',
      icon: <Slack className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('slack')
    },
    {
      id: 'twilio-send-sms',
      type: 'action',
      category: 'communication',
      provider: 'twilio',
      operation: 'send_sms',
      label: 'Send SMS',
      description: 'Send an SMS message using Twilio',
      icon: <MessageSquare className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('twilio')
    },
    {
      id: 'auth0-create-user',
      type: 'action',
      category: 'authentication',
      provider: 'auth0',
      operation: 'create_user',
      label: 'Create User',
      description: 'Create a new user in Auth0',
      icon: <Users className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('auth0')
    },
    {
      id: 'stripe-create-customer',
      type: 'action',
      category: 'payment',
      provider: 'stripe',
      operation: 'create_customer',
      label: 'Create Customer',
      description: 'Create a new customer in Stripe',
      icon: <CreditCard className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('stripe')
    },
    {
      id: 'github-create-issue',
      type: 'action',
      category: 'development',
      provider: 'github',
      operation: 'create_issue',
      label: 'Create GitHub Issue',
      description: 'Create a new issue in a GitHub repository',
      icon: <Github className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('github')
    },
    {
      id: 'google-sheets-append',
      type: 'action',
      category: 'data',
      provider: 'google',
      operation: 'append_sheet_row',
      label: 'Add Sheet Row',
      description: 'Append a new row to a Google Sheets spreadsheet',
      icon: <FileText className="h-4 w-4" />,
      color: 'bg-blue-600',
      connected: isIntegrationConnected('google')
    },

    // Condition Nodes
    {
      id: 'condition-if',
      type: 'condition',
      category: 'logic',
      provider: 'workflow',
      operation: 'if_condition',
      label: 'If Condition',
      description: 'Execute different paths based on a condition',
      icon: <GitBranch className="h-4 w-4" />,
      color: 'bg-yellow-600',
      connected: true
    },
    {
      id: 'condition-filter',
      type: 'condition',
      category: 'logic',
      provider: 'workflow',
      operation: 'filter',
      label: 'Filter Data',
      description: 'Filter data based on specified criteria',
      icon: <Settings2 className="h-4 w-4" />,
      color: 'bg-yellow-600',
      connected: true
    },

    // Transform Nodes
    {
      id: 'transform-format',
      type: 'transform',
      category: 'data',
      provider: 'workflow',
      operation: 'format_data',
      label: 'Format Data',
      description: 'Transform and format data between different formats',
      icon: <Shuffle className="h-4 w-4" />,
      color: 'bg-purple-600',
      connected: true
    },
    {
      id: 'transform-merge',
      type: 'transform',
      category: 'data',
      provider: 'workflow',
      operation: 'merge_data',
      label: 'Merge Data',
      description: 'Combine data from multiple sources',
      icon: <Database className="h-4 w-4" />,
      color: 'bg-purple-600',
      connected: true
    },

    // Delay Nodes
    {
      id: 'delay-wait',
      type: 'delay',
      category: 'flow',
      provider: 'workflow',
      operation: 'wait',
      label: 'Wait/Delay',
      description: 'Add a delay before continuing the workflow',
      icon: <Clock className="h-4 w-4" />,
      color: 'bg-gray-600',
      connected: true
    }
  ];

  // Filter nodes based on search and category
  const filteredNodes = nodeTemplates.filter(node => {
    const matchesSearch = searchTerm === '' || 
      node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.provider.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || 
      node.category === selectedCategory ||
      node.type === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = [
    { id: 'all', label: 'All', count: nodeTemplates.length },
    { id: 'trigger', label: 'Triggers', count: nodeTemplates.filter(n => n.type === 'trigger').length },
    { id: 'action', label: 'Actions', count: nodeTemplates.filter(n => n.type === 'action').length },
    { id: 'condition', label: 'Conditions', count: nodeTemplates.filter(n => n.type === 'condition').length },
    { id: 'transform', label: 'Transform', count: nodeTemplates.filter(n => n.type === 'transform').length },
    { id: 'communication', label: 'Communication', count: nodeTemplates.filter(n => n.category === 'communication').length },
    { id: 'payment', label: 'Payment', count: nodeTemplates.filter(n => n.category === 'payment').length },
    { id: 'data', label: 'Data', count: nodeTemplates.filter(n => n.category === 'data').length },
  ];

  const connectedNodes = filteredNodes.filter(node => node.connected);
  const disconnectedNodes = filteredNodes.filter(node => !node.connected);

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search integrations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 py-2 border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                selectedCategory === category.id
                  ? 'bg-blue-100 text-blue-700 border border-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {category.label} ({category.count})
            </button>
          ))}
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {connectedNodes.length > 0 && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <h3 className="text-sm font-medium text-gray-900">Connected Integrations</h3>
              <Badge variant="secondary" className="text-xs">
                {connectedNodes.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {connectedNodes.map(node => (
                <DraggableNode key={node.id} node={node} />
              ))}
            </div>
          </div>
        )}

        {disconnectedNodes.length > 0 && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <h3 className="text-sm font-medium text-gray-500">Not Connected</h3>
              <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-500">
                {disconnectedNodes.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {disconnectedNodes.map(node => (
                <DraggableNode key={node.id} node={node} disabled />
              ))}
            </div>
          </div>
        )}

        {filteredNodes.length === 0 && (
          <div className="p-4 text-center">
            <div className="text-gray-400 mb-2">
              <Search className="h-8 w-8 mx-auto" />
            </div>
            <p className="text-sm text-gray-500">
              No integrations found matching your search
            </p>
          </div>
        )}
      </div>

      {/* Usage Instructions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-3 bg-gray-300 rounded border border-gray-400"></div>
            <span>Drag nodes to the canvas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Green = Connected & Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
}
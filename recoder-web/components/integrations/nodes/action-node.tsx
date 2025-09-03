'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Trash2, 
  Play,
  Mail,
  MessageSquare,
  CreditCard,
  Users,
  Github,
  Database,
  FileText,
  Slack,
  Activity
} from 'lucide-react';

interface ActionNodeData {
  label: string;
  provider: string;
  operation: string;
  config?: any;
  status: 'idle' | 'running' | 'success' | 'error';
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

const providerIcons: Record<string, React.ReactNode> = {
  sendgrid: <Mail className="h-4 w-4" />,
  slack: <Slack className="h-4 w-4" />,
  twilio: <MessageSquare className="h-4 w-4" />,
  stripe: <CreditCard className="h-4 w-4" />,
  auth0: <Users className="h-4 w-4" />,
  github: <Github className="h-4 w-4" />,
  google: <FileText className="h-4 w-4" />,
  database: <Database className="h-4 w-4" />,
  default: <Activity className="h-4 w-4" />
};

const statusColors = {
  idle: 'bg-gray-100 text-gray-600 border-gray-200',
  running: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse',
  success: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200'
};

const statusIndicators = {
  idle: 'bg-gray-400',
  running: 'bg-blue-500',
  success: 'bg-green-500',
  error: 'bg-red-500'
};

export const ActionNode = memo(({ id, data, selected }: NodeProps<ActionNodeData>) => {
  const icon = providerIcons[data.provider] || providerIcons.default;
  const statusClass = statusColors[data.status];
  const statusIndicator = statusIndicators[data.status];

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onEdit(id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    data.onDelete(id);
  };

  return (
    <div className="action-node">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
        style={{ left: -6 }}
      />

      <Card className={`
        min-w-[200px] max-w-[250px] transition-all duration-200
        ${selected ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}
        ${statusClass}
      `}>
        {/* Status Indicator */}
        <div className={`absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${statusIndicator}`}>
          {data.status === 'running' && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-500 animate-ping"></div>
          )}
        </div>

        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                {icon}
              </div>
              <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                ACTION
              </Badge>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-gray-200"
                onClick={handleEdit}
              >
                <Settings className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                onClick={handleDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="mb-3">
            <h3 className="font-medium text-sm text-gray-900 mb-1 truncate">
              {data.label}
            </h3>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span className="font-mono">{data.provider}</span>
              <span>•</span>
              <span>{data.operation}</span>
            </div>
          </div>

          {/* Configuration Summary */}
          {data.config && Object.keys(data.config).length > 0 && (
            <div className="mb-2">
              <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                {Object.entries(data.config).slice(0, 2).map(([key, value]) => {
                  const displayValue = typeof value === 'string' && value.length > 20 
                    ? `${value.substring(0, 20)}...` 
                    : String(value);
                  
                  return (
                    <div key={key} className="truncate">
                      <span className="font-medium">{key}:</span> {displayValue}
                    </div>
                  );
                })}
                {Object.keys(data.config).length > 2 && (
                  <div className="text-gray-400">
                    +{Object.keys(data.config).length - 2} more settings
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status and Execution Info */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 capitalize">
              {data.status}
            </span>
            
            {data.status === 'running' && (
              <div className="flex items-center gap-1 text-xs text-blue-600">
                <Play className="h-3 w-3" />
                <span>Executing...</span>
              </div>
            )}
            
            {data.status === 'success' && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Completed</span>
              </div>
            )}
            
            {data.status === 'error' && (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span>Failed</span>
              </div>
            )}
          </div>

          {/* Input/Output Indicators */}
          {(data.config?.input_fields || data.config?.output_fields) && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <div className="flex justify-between text-xs text-gray-500">
                {data.config.input_fields && (
                  <span>Input: {data.config.input_fields.length} fields</span>
                )}
                {data.config.output_fields && (
                  <span>Output: {data.config.output_fields.length} fields</span>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
        style={{ right: -6 }}
      />
    </div>
  );
});

ActionNode.displayName = 'ActionNode';
'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Trash2, 
  GitBranch,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface ConditionNodeData {
  label: string;
  provider: string;
  operation: string;
  config?: {
    condition?: string;
    operator?: string;
    value?: any;
    true_path?: string;
    false_path?: string;
  };
  status: 'idle' | 'running' | 'success' | 'error';
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

const operationIcons: Record<string, React.ReactNode> = {
  if_condition: <GitBranch className="h-4 w-4" />,
  filter: <Filter className="h-4 w-4" />,
  switch: <GitBranch className="h-4 w-4" />,
  default: <AlertCircle className="h-4 w-4" />
};

const statusColors = {
  idle: 'bg-gray-100 text-gray-600 border-gray-200',
  running: 'bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse',
  success: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200'
};

const statusIndicators = {
  idle: 'bg-gray-400',
  running: 'bg-yellow-500',
  success: 'bg-green-500',
  error: 'bg-red-500'
};

export const ConditionNode = memo(({ id, data, selected }: NodeProps<ConditionNodeData>) => {
  const icon = operationIcons[data.operation] || operationIcons.default;
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

  const getConditionSummary = () => {
    if (!data.config?.condition) return 'No condition set';
    
    if (data.config.condition.length > 30) {
      return `${data.config.condition.substring(0, 30)}...`;
    }
    
    return data.config.condition;
  };

  return (
    <div className="condition-node">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-yellow-500 border-2 border-white"
        style={{ left: -6 }}
      />

      <Card className={`
        min-w-[200px] max-w-[250px] transition-all duration-200
        ${selected ? 'ring-2 ring-yellow-500 shadow-lg' : 'hover:shadow-md'}
        ${statusClass}
      `}>
        {/* Status Indicator */}
        <div className={`absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${statusIndicator}`}>
          {data.status === 'running' && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-yellow-500 animate-ping"></div>
          )}
        </div>

        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-yellow-600 rounded-lg flex items-center justify-center text-white">
                {icon}
              </div>
              <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700">
                CONDITION
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
            <div className="text-xs text-gray-500">
              <span className="font-mono">{data.operation}</span>
            </div>
          </div>

          {/* Condition Summary */}
          <div className="mb-3">
            <div className="text-xs text-gray-700 bg-yellow-50 rounded px-2 py-2 border border-yellow-200">
              <div className="font-medium mb-1">Condition:</div>
              <code className="text-xs text-gray-800">
                {getConditionSummary()}
              </code>
            </div>
          </div>

          {/* Path Information */}
          {(data.config?.true_path || data.config?.false_path) && (
            <div className="mb-2 space-y-1">
              {data.config.true_path && (
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle className="h-3 w-3 text-green-600" />
                  <span className="text-gray-600">True: {data.config.true_path}</span>
                </div>
              )}
              {data.config.false_path && (
                <div className="flex items-center gap-2 text-xs">
                  <XCircle className="h-3 w-3 text-red-600" />
                  <span className="text-gray-600">False: {data.config.false_path}</span>
                </div>
              )}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 capitalize">
              {data.status}
            </span>
            
            {data.status === 'running' && (
              <div className="flex items-center gap-1 text-xs text-yellow-600">
                <GitBranch className="h-3 w-3" />
                <span>Evaluating...</span>
              </div>
            )}
            
            {data.status === 'success' && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                <span>Evaluated</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Output Handles - True and False paths */}
      <Handle
        id="true"
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-green-500 border-2 border-white"
        style={{ right: -6, top: '40%' }}
      />
      
      <Handle
        id="false" 
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-red-500 border-2 border-white"
        style={{ right: -6, top: '60%' }}
      />

      {/* Path Labels */}
      <div className="absolute -right-8 text-xs text-gray-500" style={{ top: '35%' }}>
        <div className="bg-white px-1 rounded border">T</div>
      </div>
      <div className="absolute -right-8 text-xs text-gray-500" style={{ top: '55%' }}>
        <div className="bg-white px-1 rounded border">F</div>
      </div>
    </div>
  );
});

ConditionNode.displayName = 'ConditionNode';
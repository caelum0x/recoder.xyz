'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Trash2, 
  Shuffle,
  Database,
  ArrowUpDown,
  Code,
  FileText,
  Zap
} from 'lucide-react';

interface TransformNodeData {
  label: string;
  provider: string;
  operation: string;
  config?: {
    transformations?: Array<{
      source: string;
      target: string;
      operation: string;
    }>;
    format?: string;
    template?: string;
  };
  status: 'idle' | 'running' | 'success' | 'error';
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

const operationIcons: Record<string, React.ReactNode> = {
  format_data: <FileText className="h-4 w-4" />,
  merge_data: <Database className="h-4 w-4" />,
  split_data: <ArrowUpDown className="h-4 w-4" />,
  map_fields: <Shuffle className="h-4 w-4" />,
  execute_code: <Code className="h-4 w-4" />,
  default: <Zap className="h-4 w-4" />
};

const statusColors = {
  idle: 'bg-gray-100 text-gray-600 border-gray-200',
  running: 'bg-purple-100 text-purple-700 border-purple-200 animate-pulse',
  success: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200'
};

const statusIndicators = {
  idle: 'bg-gray-400',
  running: 'bg-purple-500',
  success: 'bg-green-500',
  error: 'bg-red-500'
};

export const TransformNode = memo(({ id, data, selected }: NodeProps<TransformNodeData>) => {
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

  const getTransformationSummary = () => {
    if (!data.config?.transformations || data.config.transformations.length === 0) {
      return 'No transformations configured';
    }
    
    const count = data.config.transformations.length;
    const firstTransform = data.config.transformations[0];
    
    if (count === 1) {
      return `${firstTransform.source} → ${firstTransform.target} (${firstTransform.operation})`;
    }
    
    return `${count} transformations`;
  };

  return (
    <div className="transform-node">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-purple-500 border-2 border-white"
        style={{ left: -6 }}
      />

      <Card className={`
        min-w-[200px] max-w-[250px] transition-all duration-200
        ${selected ? 'ring-2 ring-purple-500 shadow-lg' : 'hover:shadow-md'}
        ${statusClass}
      `}>
        {/* Status Indicator */}
        <div className={`absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${statusIndicator}`}>
          {data.status === 'running' && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-purple-500 animate-ping"></div>
          )}
        </div>

        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white">
                {icon}
              </div>
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                TRANSFORM
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

          {/* Transformation Summary */}
          <div className="mb-3">
            <div className="text-xs text-gray-700 bg-purple-50 rounded px-2 py-2 border border-purple-200">
              <div className="font-medium mb-1 flex items-center gap-1">
                <Shuffle className="h-3 w-3" />
                Transformations:
              </div>
              <div className="text-xs text-gray-800">
                {getTransformationSummary()}
              </div>
            </div>
          </div>

          {/* Transformation Details */}
          {data.config?.transformations && data.config.transformations.length > 0 && (
            <div className="mb-2">
              <div className="space-y-1">
                {data.config.transformations.slice(0, 2).map((transform, index) => (
                  <div key={index} className="text-xs bg-gray-50 rounded px-2 py-1">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-blue-600">{transform.source}</span>
                      <ArrowUpDown className="h-2 w-2 text-gray-400" />
                      <span className="font-mono text-green-600">{transform.target}</span>
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {transform.operation}
                    </div>
                  </div>
                ))}
                {data.config.transformations.length > 2 && (
                  <div className="text-xs text-gray-400 text-center py-1">
                    +{data.config.transformations.length - 2} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Format Information */}
          {data.config?.format && (
            <div className="mb-2">
              <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                <span className="font-medium">Format:</span> {data.config.format}
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 capitalize">
              {data.status}
            </span>
            
            {data.status === 'running' && (
              <div className="flex items-center gap-1 text-xs text-purple-600">
                <Shuffle className="h-3 w-3" />
                <span>Transforming...</span>
              </div>
            )}
            
            {data.status === 'success' && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>Transformed</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-purple-500 border-2 border-white"
        style={{ right: -6 }}
      />
    </div>
  );
});

TransformNode.displayName = 'TransformNode';
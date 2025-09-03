'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Settings, 
  Trash2, 
  Clock,
  Timer,
  Calendar,
  Pause,
  PlayCircle
} from 'lucide-react';

interface DelayNodeData {
  label: string;
  provider: string;
  operation: string;
  config?: {
    delay_ms?: number;
    delay_seconds?: number;
    delay_minutes?: number;
    delay_hours?: number;
    delay_type?: 'fixed' | 'dynamic' | 'until';
    until_time?: string;
    condition?: string;
  };
  status: 'idle' | 'running' | 'success' | 'error';
  onEdit: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

const operationIcons: Record<string, React.ReactNode> = {
  wait: <Clock className="h-4 w-4" />,
  delay: <Timer className="h-4 w-4" />,
  schedule_until: <Calendar className="h-4 w-4" />,
  default: <Pause className="h-4 w-4" />
};

const statusColors = {
  idle: 'bg-gray-100 text-gray-600 border-gray-200',
  running: 'bg-orange-100 text-orange-700 border-orange-200',
  success: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200'
};

const statusIndicators = {
  idle: 'bg-gray-400',
  running: 'bg-orange-500',
  success: 'bg-green-500',
  error: 'bg-red-500'
};

export const DelayNode = memo(({ id, data, selected }: NodeProps<DelayNodeData>) => {
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

  const formatDelayDuration = () => {
    if (!data.config) return 'No delay configured';
    
    const { delay_ms, delay_seconds, delay_minutes, delay_hours, delay_type, until_time } = data.config;
    
    if (delay_type === 'until' && until_time) {
      return `Until ${new Date(until_time).toLocaleString()}`;
    }
    
    if (delay_hours) {
      return delay_hours === 1 ? '1 hour' : `${delay_hours} hours`;
    }
    
    if (delay_minutes) {
      return delay_minutes === 1 ? '1 minute' : `${delay_minutes} minutes`;
    }
    
    if (delay_seconds) {
      return delay_seconds === 1 ? '1 second' : `${delay_seconds} seconds`;
    }
    
    if (delay_ms) {
      return `${delay_ms}ms`;
    }
    
    return 'Custom delay';
  };

  const getDelayType = () => {
    if (!data.config?.delay_type) return 'fixed';
    return data.config.delay_type;
  };

  const getRemainingTime = () => {
    // This would typically come from execution status
    // For now, just show a placeholder
    if (data.status === 'running') {
      return 'Calculating...';
    }
    return null;
  };

  return (
    <div className="delay-node">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-500 border-2 border-white"
        style={{ left: -6 }}
      />

      <Card className={`
        min-w-[200px] max-w-[250px] transition-all duration-200
        ${selected ? 'ring-2 ring-gray-500 shadow-lg' : 'hover:shadow-md'}
        ${statusClass}
      `}>
        {/* Status Indicator */}
        <div className={`absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-white ${statusIndicator}`}>
          {data.status === 'running' && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-orange-500 animate-ping"></div>
          )}
        </div>

        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gray-600 rounded-lg flex items-center justify-center text-white">
                {icon}
              </div>
              <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700">
                DELAY
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

          {/* Delay Configuration */}
          <div className="mb-3">
            <div className="text-xs text-gray-700 bg-orange-50 rounded px-2 py-2 border border-orange-200">
              <div className="font-medium mb-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Duration:
              </div>
              <div className="text-sm font-mono text-gray-800">
                {formatDelayDuration()}
              </div>
              <div className="text-xs text-gray-600 mt-1 capitalize">
                Type: {getDelayType()}
              </div>
            </div>
          </div>

          {/* Remaining Time (when running) */}
          {data.status === 'running' && getRemainingTime() && (
            <div className="mb-2">
              <div className="text-xs bg-orange-100 rounded px-2 py-1 border border-orange-300">
                <div className="flex items-center gap-1 text-orange-700">
                  <Timer className="h-3 w-3" />
                  <span>Remaining: {getRemainingTime()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Condition (if dynamic) */}
          {data.config?.condition && (
            <div className="mb-2">
              <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                <span className="font-medium">Condition:</span>
                <div className="font-mono mt-0.5">{data.config.condition}</div>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 capitalize">
              {data.status}
            </span>
            
            {data.status === 'running' && (
              <div className="flex items-center gap-1 text-xs text-orange-600">
                <Clock className="h-3 w-3" />
                <span>Waiting...</span>
              </div>
            )}
            
            {data.status === 'success' && (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <PlayCircle className="h-3 w-3" />
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

          {/* Progress Bar (when running) */}
          {data.status === 'running' && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1">
              <div className="bg-orange-500 h-1 rounded-full animate-pulse" style={{ width: '40%' }}></div>
            </div>
          )}
        </div>
      </Card>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-500 border-2 border-white"
        style={{ right: -6 }}
      />
    </div>
  );
});

DelayNode.displayName = 'DelayNode';
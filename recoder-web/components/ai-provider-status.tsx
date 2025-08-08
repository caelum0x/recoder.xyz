"use client";

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Download, ExternalLink, Zap, DollarSign } from 'lucide-react';
import { getWebProviderStatus, getWebSetupInstructions, getWebProviderRecommendation } from '../lib/api/providers/local-first-web-ai';

interface ProviderStatusProps {
  className?: string;
  showInstructions?: boolean;
  taskType?: string;
}

export default function AIProviderStatus({ className = '', showInstructions = true, taskType = 'web' }: ProviderStatusProps) {
  const [status, setStatus] = useState<any>(null);
  const [instructions, setInstructions] = useState<string>('');
  const [recommendation, setRecommendation] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(getWebProviderStatus());
      setInstructions(getWebSetupInstructions());
      setRecommendation(getWebProviderRecommendation(taskType));
    };

    updateStatus();
    // Update status periodically
    const interval = setInterval(updateStatus, 30000); // Every 30 seconds
    
    return () => clearInterval(interval);
  }, [taskType]);

  if (!status) return null;

  const hasLocalAI = status.local.ollama || status.local.lmstudio;
  const hasCloudAI = status.cloud.anthropic || status.cloud.groq || status.cloud.openrouter || status.cloud.gemini;
  const hasAnyAI = hasLocalAI || hasCloudAI;

  const StatusIcon = ({ available, type }: { available: boolean; type: 'local' | 'cloud' }) => {
    if (available) {
      return <CheckCircle className={`w-4 h-4 ${type === 'local' ? 'text-green-500' : 'text-blue-500'}`} />;
    }
    return <XCircle className="w-4 h-4 text-gray-400" />;
  };

  const CostBadge = ({ cost }: { cost: 'free' | 'cheap' | 'premium' }) => {
    const styles = {
      free: 'bg-green-100 text-green-800 border-green-200',
      cheap: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      premium: 'bg-purple-100 text-purple-800 border-purple-200'
    };

    const icons = {
      free: <Zap className="w-3 h-3" />,
      cheap: <DollarSign className="w-3 h-3" />,
      premium: <DollarSign className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border ${styles[cost]}`}>
        {icons[cost]}
        {cost.toUpperCase()}
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              {hasAnyAI ? (
                <CheckCircle className="w-6 h-6 text-green-500" />
              ) : (
                <AlertCircle className="w-6 h-6 text-orange-500" />
              )}
              {hasLocalAI && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              )}
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900">
                AI Provider Status
                {hasLocalAI && <span className="ml-2 text-green-600">(Local AI Active)</span>}
              </h3>
              <p className="text-sm text-gray-500">
                {status.priority.length > 0 ? `${status.priority.length} providers available` : 'No providers configured'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-gray-400 hover:text-gray-600"
          >
            {isExpanded ? '−' : '+'}
          </button>
        </div>

        {/* Quick Status */}
        {!isExpanded && status.priority.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">Active:</span>
              <span className="font-medium text-gray-900">{status.priority[0]}</span>
              <CostBadge cost={recommendation?.cost || 'free'} />
            </div>
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Current Recommendation */}
          <div className="bg-blue-50 rounded-lg p-3">
            <h4 className="font-medium text-blue-900 mb-2">Recommended for {taskType}:</h4>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-blue-800">{recommendation?.provider}</span>
                  <CostBadge cost={recommendation?.cost || 'free'} />
                </div>
                <p className="text-sm text-blue-700 mt-1">{recommendation?.reason}</p>
              </div>
            </div>
          </div>

          {/* Local AI Status */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">🆓 Local AI (Free)</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-3">
                  <StatusIcon available={status.local.ollama} type="local" />
                  <span className="text-sm">Ollama</span>
                </div>
                {!status.local.ollama && (
                  <a 
                    href="https://ollama.ai" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    Install <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              
              <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center gap-3">
                  <StatusIcon available={status.local.lmstudio} type="local" />
                  <span className="text-sm">LM Studio</span>
                </div>
                {!status.local.lmstudio && (
                  <a 
                    href="https://lmstudio.ai" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    Install <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Cloud AI Status */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">☁️ Cloud AI (Premium)</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(status.cloud).map(([provider, available]) => (
                <div key={provider} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <StatusIcon available={available as boolean} type="cloud" />
                  <span className="text-sm capitalize">{provider}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Priority List */}
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Provider Priority</h4>
            <div className="space-y-1">
              {status.priority.map((provider: string, index: number) => (
                <div key={provider} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 w-4">{index + 1}.</span>
                  <span className={index === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}>
                    {provider}
                  </span>
                  {index === 0 && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">ACTIVE</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Setup Instructions */}
          {showInstructions && instructions && (
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Setup Instructions</h4>
              <div className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 p-3 rounded">
                {instructions}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
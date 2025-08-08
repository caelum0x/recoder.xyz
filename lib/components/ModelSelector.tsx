/**
 * Model Selection UI Component
 * Unified model selection interface for all platforms
 */

'use client';

import React, { useState, useEffect } from 'react';
import { modelManager, ModelInfo, ModelRecommendation, DownloadProgress } from '../services/ModelManager';
import { unifiedAIRouter, AIProvider } from '../services/UnifiedAIRouter';

interface ModelSelectorProps {
  onModelSelect: (modelId: string) => void;
  selectedModel?: string;
  taskType?: 'coding' | 'general' | 'reasoning' | 'multimodal';
  showRecommendations?: boolean;
  allowDownload?: boolean;
  compact?: boolean;
}

interface ModelCardProps {
  model: ModelInfo;
  isSelected: boolean;
  onSelect: () => void;
  onDownload?: () => void;
  downloadProgress?: DownloadProgress;
  isRecommended?: boolean;
  recommendationReason?: string;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  isSelected,
  onSelect,
  onDownload,
  downloadProgress,
  isRecommended,
  recommendationReason
}) => {
  const getStatusColor = (status: ModelInfo['status']): string => {
    switch (status) {
      case 'installed': return 'text-green-600';
      case 'downloading': return 'text-blue-600';
      case 'available': return 'text-gray-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: ModelInfo['status']): string => {
    switch (status) {
      case 'installed': return '✅';
      case 'downloading': return '⏳';
      case 'available': return '📦';
      case 'error': return '❌';
      default: return '❓';
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)}GB`;
  };

  const getPerformanceBadge = (quality: number): { text: string; color: string } => {
    if (quality >= 9) return { text: 'Excellent', color: 'bg-green-100 text-green-800' };
    if (quality >= 8) return { text: 'Very Good', color: 'bg-blue-100 text-blue-800' };
    if (quality >= 7) return { text: 'Good', color: 'bg-yellow-100 text-yellow-800' };
    return { text: 'Basic', color: 'bg-gray-100 text-gray-800' };
  };

  const performanceBadge = getPerformanceBadge(model.performance.quality);

  return (
    <div className={`
      relative p-4 rounded-lg border-2 cursor-pointer transition-all
      ${isSelected 
        ? 'border-blue-500 bg-blue-50' 
        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }
      ${isRecommended ? 'ring-2 ring-amber-400 ring-opacity-50' : ''}
    `}>
      {/* Recommended badge */}
      {isRecommended && (
        <div className="absolute -top-2 -right-2 bg-amber-400 text-white text-xs px-2 py-1 rounded-full">
          ⭐ Recommended
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{model.displayName}</h3>
          <p className="text-sm text-gray-600">{model.provider}</p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-sm font-medium ${getStatusColor(model.status)}`}>
            {getStatusIcon(model.status)} {model.status}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-700 mb-3">{model.description}</p>

      {/* Recommendation reason */}
      {isRecommended && recommendationReason && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
          💡 {recommendationReason}
        </div>
      )}

      {/* Specialties */}
      <div className="flex flex-wrap gap-1 mb-3">
        {model.specialties.slice(0, 3).map((specialty, index) => (
          <span key={index} className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
            {specialty}
          </span>
        ))}
        {model.specialties.length > 3 && (
          <span className="text-xs text-gray-500">+{model.specialties.length - 3} more</span>
        )}
      </div>

      {/* Performance indicators */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-4">
          <div className="text-xs">
            <span className="text-gray-500">Speed:</span>
            <span className="ml-1 font-medium">{model.performance.speed} t/s</span>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">RAM:</span>
            <span className="ml-1 font-medium">{model.performance.memory}GB</span>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${performanceBadge.color}`}>
          {performanceBadge.text}
        </span>
      </div>

      {/* Size and requirements */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-600">Size: {model.size}</span>
        <div className="flex items-center text-xs text-gray-500">
          <span>Min RAM: {model.requirements.minRam}GB</span>
          {model.requirements.gpuOptional && (
            <span className="ml-2">🎮 GPU Optional</span>
          )}
        </div>
      </div>

      {/* Download progress */}
      {downloadProgress && downloadProgress.status === 'downloading' && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Downloading...</span>
            <span>{downloadProgress.progress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${downloadProgress.progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatSize(downloadProgress.downloaded)} / {formatSize(downloadProgress.total)}</span>
            <span>ETA: {Math.round(downloadProgress.eta / 60)}m</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex space-x-2">
        {model.status === 'installed' && (
          <button
            onClick={onSelect}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {isSelected ? 'Selected' : 'Select Model'}
          </button>
        )}

        {model.status === 'available' && onDownload && (
          <button
            onClick={onDownload}
            className="flex-1 py-2 px-3 bg-green-100 text-green-700 hover:bg-green-200 rounded text-sm font-medium transition-colors"
          >
            📦 Download
          </button>
        )}

        {model.status === 'downloading' && (
          <button
            disabled
            className="flex-1 py-2 px-3 bg-gray-100 text-gray-500 rounded text-sm font-medium cursor-not-allowed"
          >
            ⏳ Downloading...
          </button>
        )}

        {model.status === 'error' && onDownload && (
          <button
            onClick={onDownload}
            className="flex-1 py-2 px-3 bg-red-100 text-red-700 hover:bg-red-200 rounded text-sm font-medium transition-colors"
          >
            🔄 Retry Download
          </button>
        )}
      </div>
    </div>
  );
};

const ModelSelector: React.FC<ModelSelectorProps> = ({
  onModelSelect,
  selectedModel,
  taskType = 'coding',
  showRecommendations = true,
  allowDownload = true,
  compact = false
}) => {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([]);
  const [recommendations, setRecommendations] = useState<ModelRecommendation[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [activeTab, setActiveTab] = useState<'recommended' | 'installed' | 'available' | 'cloud'>('recommended');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    setupEventListeners();
  }, [taskType]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load models
      const available = modelManager.getAvailableModels();
      const installed = modelManager.getInstalledModels();
      const recs = await modelManager.getRecommendations('developer', taskType);
      const providersList = unifiedAIRouter.getProviders();
      
      setAvailableModels(available);
      setInstalledModels(installed);
      setRecommendations(recs);
      setProviders(providersList);
      
      // Load download progress
      const progress = modelManager.getDownloadProgress();
      const progressMap = new Map();
      progress.forEach(p => progressMap.set(p.modelId, p));
      setDownloadProgress(progressMap);
      
    } catch (error) {
      console.error('Error loading model data:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupEventListeners = () => {
    const onDownloadProgress = (progress: DownloadProgress) => {
      setDownloadProgress(prev => new Map(prev.set(progress.modelId, progress)));
    };

    const onDownloadCompleted = ({ modelId }: { modelId: string }) => {
      setDownloadProgress(prev => {
        const newMap = new Map(prev);
        newMap.delete(modelId);
        return newMap;
      });
      loadData(); // Refresh data
    };

    modelManager.on('download-progress', onDownloadProgress);
    modelManager.on('download-completed', onDownloadCompleted);
    modelManager.on('download-error', onDownloadCompleted);

    return () => {
      modelManager.off('download-progress', onDownloadProgress);
      modelManager.off('download-completed', onDownloadCompleted);
      modelManager.off('download-error', onDownloadCompleted);
    };
  };

  const handleDownload = async (modelId: string) => {
    try {
      await modelManager.downloadModel(modelId);
    } catch (error) {
      console.error('Download failed:', error);
      // You would show a toast/notification here
    }
  };

  const handleModelSelect = (modelId: string) => {
    onModelSelect(modelId);
  };

  const getModelsForTab = (): ModelInfo[] => {
    switch (activeTab) {
      case 'recommended':
        return recommendations.map(r => r.model);
      case 'installed':
        return installedModels;
      case 'available':
        return availableModels.filter(m => !installedModels.some(im => im.id === m.id));
      case 'cloud':
        return []; // Would show cloud models here
      default:
        return availableModels;
    }
  };

  const getRecommendationReason = (modelId: string): string | undefined => {
    return recommendations.find(r => r.model.id === modelId)?.reason;
  };

  const isModelRecommended = (modelId: string): boolean => {
    return recommendations.some(r => r.model.id === modelId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading models...</span>
      </div>
    );
  }

  if (compact) {
    // Compact dropdown version
    return (
      <div className="relative">
        <select
          value={selectedModel || ''}
          onChange={(e) => handleModelSelect(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Select Model...</option>
          {installedModels.map(model => (
            <option key={model.id} value={model.id}>
              {model.displayName} ({model.provider})
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose AI Model</h2>
        <p className="text-gray-600">
          Select the best AI model for {taskType} tasks. Local models are free, while cloud models offer premium features.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 border-b border-gray-200">
        {[
          { id: 'recommended', label: '⭐ Recommended', count: recommendations.length },
          { id: 'installed', label: '✅ Installed', count: installedModels.length },
          { id: 'available', label: '📦 Available', count: availableModels.length - installedModels.length },
          { id: 'cloud', label: '☁️ Cloud', count: providers.filter(p => p.type === 'premium').length }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-2 px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Model grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {getModelsForTab().map(model => (
          <ModelCard
            key={model.id}
            model={model}
            isSelected={selectedModel === model.id}
            onSelect={() => handleModelSelect(model.id)}
            onDownload={allowDownload ? () => handleDownload(model.id) : undefined}
            downloadProgress={downloadProgress.get(model.id)}
            isRecommended={isModelRecommended(model.id)}
            recommendationReason={getRecommendationReason(model.id)}
          />
        ))}
      </div>

      {/* Empty state */}
      {getModelsForTab().length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🤖</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {activeTab === 'installed' && 'No Models Installed'}
            {activeTab === 'available' && 'No Models Available'}
            {activeTab === 'cloud' && 'Cloud Models Coming Soon'}
            {activeTab === 'recommended' && 'No Recommendations'}
          </h3>
          <p className="text-gray-600 mb-4">
            {activeTab === 'installed' && 'Download local models to get started for free'}
            {activeTab === 'available' && 'All models are already installed'}
            {activeTab === 'cloud' && 'Cloud provider integration is in development'}
            {activeTab === 'recommended' && 'Add your system specifications to get recommendations'}
          </p>
          {activeTab === 'installed' && (
            <button
              onClick={() => setActiveTab('available')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Browse Available Models
            </button>
          )}
        </div>
      )}

      {/* Status info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            <strong>{installedModels.length}</strong> models installed • 
            <strong> {availableModels.length - installedModels.length}</strong> available for download
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span>Free Local Models</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span>Premium Cloud Models</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelSelector;
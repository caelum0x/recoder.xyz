'use client';

import { useModelStore } from '@/stores/model-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountState } from '@/hooks/billing';
import { useAuth } from '@/components/AuthProvider';

const CUSTOM_MODELS_STORAGE_KEY = 'customModels';

interface CustomModel {
  id: string;
  label: string;
}

function loadCustomModels(): CustomModel[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CustomModel[];
  } catch {
    return [];
  }
}

function saveCustomModels(models: CustomModel[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_MODELS_STORAGE_KEY, JSON.stringify(models));
  } catch {
    // localStorage unavailable
  }
}

export interface ModelOption {
  id: string;
  label: string;
  requiresSubscription: boolean;
  description?: string;
  priority?: number;
  recommended?: boolean;
  capabilities?: string[];
  contextWindow?: number;
}

// Helper to check if user has a PAID subscription (not free tier)
const isPaidTier = (tierKey: string | undefined): boolean => {
  if (!tierKey) return false;
  return tierKey !== 'free' && tierKey !== 'none';
};

const getDefaultModel = (accessibleModels: ModelOption[]): string => {
  // Pick the first accessible model (sorted by priority)
  // recoder/power is the default for all users (free and paid)
  const powerModel = accessibleModels.find(m => m.id === 'recoder/power');
  if (powerModel) return powerModel.id;

  const basicModel = accessibleModels.find(m => m.id === 'recoder/basic');
  if (basicModel) return basicModel.id;

  // Fallback: pick from accessible models sorted by priority
  if (accessibleModels.length > 0) {
    return accessibleModels[0].id;
  }

  return '';
};

export const useModelSelection = () => {
  const { user, isLoading: isAuthLoading } = useAuth();

  // Get account state which includes models
  const { data: accountState, isLoading } = useAccountState({
    enabled: !!user && !isAuthLoading
  });

  const { selectedModel, setSelectedModel } = useModelStore();

  // Track previous tier to detect upgrades
  const prevTierKey = useRef<string | null>(null);

  const hasPaidSubscription = useMemo(() => {
    return isPaidTier(accountState?.subscription?.tier_key);
  }, [accountState?.subscription?.tier_key]);

  // Transform API data to ModelOption format
  // The backend's `allowed` field is the source of truth!
  const availableModels = useMemo<ModelOption[]>(() => {
    if (!accountState?.models) return [];

    return accountState.models.map(model => ({
      id: model.id,
      label: model.name,
      requiresSubscription: !model.allowed, // Backend already computed this correctly
      priority: model.priority || 0,
      recommended: model.recommended || false,
      capabilities: model.capabilities || [],
      contextWindow: model.context_window || 128000,
    })).sort((a, b) => {
      // Sort accessible models first, then by priority
      if (a.requiresSubscription !== b.requiresSubscription) {
        return a.requiresSubscription ? 1 : -1;
      }
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.label.localeCompare(b.label);
    });
  }, [accountState?.models]);

  // Get accessible models - use the backend's `allowed` field directly!
  const accessibleModels = useMemo(() => {
    return availableModels.filter(model => !model.requiresSubscription);
  }, [availableModels]);

  // Initialize selected model when data loads
  useEffect(() => {
    if (isLoading || !accessibleModels.length) return;

    // If no model selected or selected model is not accessible, set a default
    const needsUpdate = !selectedModel ||
                        !accessibleModels.some(m => m.id === selectedModel);

    if (needsUpdate) {
      const defaultModelId = getDefaultModel(accessibleModels);

      if (defaultModelId && defaultModelId !== selectedModel) {
        
        setSelectedModel(defaultModelId);
      }
    }
  }, [selectedModel, accessibleModels, isLoading, setSelectedModel, accountState?.subscription?.tier_key]);

  useEffect(() => {
    if (isLoading || !availableModels.length) return;

    const currentTier = accountState?.subscription?.tier_key;
    const wasFree = prevTierKey.current === 'free' || prevTierKey.current === 'none';
    const isNowPaid = isPaidTier(currentTier);

    if (wasFree && isNowPaid && prevTierKey.current !== null) {
      const powerModel = availableModels.find(m => m.id === 'recoder/power' && !m.requiresSubscription);
      if (powerModel) {
        
        setSelectedModel('recoder/power');
      }
    }

    prevTierKey.current = currentTier || null;
  }, [accountState?.subscription?.tier_key, availableModels, isLoading, setSelectedModel]);

  const handleModelChange = useCallback((modelId: string) => {
    const model = accessibleModels.find(m => m.id === modelId);
    // In BYOK mode (tier_key === 'byok'), allow any model selection
    const isByok = accountState?.subscription?.tier_key === 'byok';
    if (model || isByok) {
      setSelectedModel(modelId);
    }
  }, [accessibleModels, accountState?.subscription?.tier_key, setSelectedModel]);

  // subscriptionStatus for UI purposes - based on tier, not status
  const subscriptionStatus = hasPaidSubscription ? 'active' as const : 'no_subscription' as const;

  // Stable callback for checking model access
  const canAccessModel = useCallback((modelId: string) => {
    // Use the backend's `allowed` field directly - it's the source of truth
    const model = availableModels.find(m => m.id === modelId);
    if (!model) return false;
    return !model.requiresSubscription; // requiresSubscription = !allowed from backend
  }, [availableModels]);

  // Stable callback for checking subscription requirement
  const isSubscriptionRequired = useCallback((modelId: string) => {
    const model = availableModels.find(m => m.id === modelId);
    return model?.requiresSubscription || false;
  }, [availableModels]);

  // Stable callback for getting actual model ID
  const getActualModelId = useCallback((modelId: string) => modelId, []);

  // Custom model state (localStorage-persisted, local mode only)
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);

  // Load custom models from localStorage on mount
  useEffect(() => {
    setCustomModels(loadCustomModels());
  }, []);

  const refreshCustomModels = useCallback(() => {
    setCustomModels(loadCustomModels());
  }, []);

  const addCustomModel = useCallback((model: unknown) => {
    const m = model as CustomModel;
    if (!m?.id) return;
    setCustomModels(prev => {
      const updated = [...prev, { id: m.id, label: m.label || m.id }];
      saveCustomModels(updated);
      return updated;
    });
  }, []);

  const updateCustomModel = useCallback((id: string, model: unknown) => {
    const m = model as CustomModel;
    if (!m?.id) return;
    setCustomModels(prev => {
      const updated = prev.map(cm =>
        cm.id === id ? { id: m.id, label: m.label || m.id } : cm
      );
      saveCustomModels(updated);
      return updated;
    });
  }, []);

  const removeCustomModel = useCallback((id: string) => {
    setCustomModels(prev => {
      const updated = prev.filter(cm => cm.id !== id);
      saveCustomModels(updated);
      return updated;
    });
  }, []);

  return {
    selectedModel,
    setSelectedModel: handleModelChange,
    availableModels: accessibleModels,
    allModels: availableModels,
    isLoading,
    modelsData: accountState?.subscription ? { models: accountState.models, tier: accountState.subscription.tier_key } : undefined,
    subscriptionStatus,
    canAccessModel,
    isSubscriptionRequired,
    handleModelChange,
    customModels,
    addCustomModel,
    updateCustomModel,
    removeCustomModel,
    getActualModelId,
    refreshCustomModels,
  };
};

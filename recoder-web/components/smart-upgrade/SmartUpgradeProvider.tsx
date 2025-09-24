'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePaymentStore } from '@/lib/payment-service';
import { useUpgradePrompt } from '@/components/usage/UpgradePrompt';
import { toast } from 'sonner';

interface SmartUpgradeContext {
  checkAndPromptUpgrade: (usage: { tokens: number; cost: number; feature?: string }) => Promise<boolean>;
  forceUpgradeCheck: () => Promise<void>;
  dismissUpgradePrompts: () => void;
  isUpgradeRecommended: boolean;
}

const SmartUpgradeContext = createContext<SmartUpgradeContext | null>(null);

export function useSmartUpgrade() {
  const context = useContext(SmartUpgradeContext);
  if (!context) {
    throw new Error('useSmartUpgrade must be used within SmartUpgradeProvider');
  }
  return context;
}

interface SmartUpgradeProviderProps {
  children: ReactNode;
}

export function SmartUpgradeProvider({ children }: SmartUpgradeProviderProps) {
  const [isUpgradeRecommended, setIsUpgradeRecommended] = useState(false);
  const [lastPromptTime, setLastPromptTime] = useState<number>(0);
  const [dismissedUntil, setDismissedUntil] = useState<number>(0);
  
  const { usageStats, subscriptions, fetchUsageStats } = usePaymentStore();
  const { showUpgradePrompt, hideUpgradePrompt, UpgradePromptComponent } = useUpgradePrompt();

  useEffect(() => {
    fetchUsageStats();
  }, [fetchUsageStats]);

  useEffect(() => {
    if (usageStats) {
      analyzeUpgradeNeed();
    }
  }, [usageStats]);

  const analyzeUpgradeNeed = () => {
    if (!usageStats) return;

    const tokensPercentage = (usageStats.usage.tokens / usageStats.limits.tokens) * 100;
    const costPercentage = usageStats.cost.percentage;
    const currentPlan = subscriptions[0]?.plan_name || 'Free';

    // Determine if upgrade is recommended
    const shouldRecommend = (
      tokensPercentage > 85 || 
      costPercentage > 85 || 
      usageStats.warnings.approaching_limit ||
      (currentPlan.toLowerCase() === 'free' && tokensPercentage > 50)
    );

    setIsUpgradeRecommended(shouldRecommend);
  };

  const checkAndPromptUpgrade = async (usage: { tokens: number; cost: number; feature?: string }): Promise<boolean> => {
    const now = Date.now();
    
    // Don't prompt if dismissed recently (1 hour)
    if (now < dismissedUntil) {
      return false;
    }

    // Don't prompt more than once every 10 minutes
    if (now - lastPromptTime < 10 * 60 * 1000) {
      return false;
    }

    if (!usageStats) {
      await fetchUsageStats();
      return false;
    }

    const tokensUsed = usageStats.usage.tokens + usage.tokens;
    const tokensLimit = usageStats.limits.tokens;
    const tokensPercentage = (tokensUsed / tokensLimit) * 100;
    
    const costUsed = usageStats.cost.monthly + usage.cost;
    const costLimit = usageStats.cost.limit;
    const costPercentage = (costUsed / costLimit) * 100;

    const currentPlan = subscriptions[0]?.plan_name || 'Free';

    let shouldPrompt = false;
    let reason: 'tokens' | 'cost' | 'requests' | 'concurrency' = 'tokens';
    let urgency: 'warning' | 'critical' = 'warning';

    // Critical: Will exceed limits with this usage
    if (tokensPercentage > 100) {
      shouldPrompt = true;
      reason = 'tokens';
      urgency = 'critical';
    } else if (costPercentage > 100) {
      shouldPrompt = true;
      reason = 'cost';
      urgency = 'critical';
    }
    // Warning: Approaching limits
    else if (tokensPercentage > 90) {
      shouldPrompt = true;
      reason = 'tokens';
      urgency = 'warning';
    } else if (costPercentage > 90) {
      shouldPrompt = true;
      reason = 'cost';
      urgency = 'warning';
    }
    // Smart recommendations
    else if (currentPlan.toLowerCase() === 'free' && tokensPercentage > 70) {
      shouldPrompt = true;
      reason = 'tokens';
      urgency = 'warning';
    }

    if (shouldPrompt) {
      setLastPromptTime(now);
      
      if (urgency === 'critical') {
        // Show immediate upgrade prompt
        showUpgradePrompt(reason, currentPlan, {
          used: reason === 'tokens' ? tokensUsed : costUsed,
          limit: reason === 'tokens' ? tokensLimit : costLimit,
          percentage: reason === 'tokens' ? tokensPercentage : costPercentage
        });
      } else {
        // Show toast warning with upgrade option
        toast.warning(
          `You're using ${tokensPercentage.toFixed(0)}% of your ${reason} limit`,
          {
            duration: 8000,
            action: {
              label: 'Upgrade Plan',
              onClick: () => showUpgradePrompt(reason, currentPlan, {
                used: reason === 'tokens' ? tokensUsed : costUsed,
                limit: reason === 'tokens' ? tokensLimit : costLimit,
                percentage: reason === 'tokens' ? tokensPercentage : costPercentage
              })
            }
          }
        );
      }

      return true;
    }

    return false;
  };

  const forceUpgradeCheck = async () => {
    await fetchUsageStats();
    analyzeUpgradeNeed();
    
    if (isUpgradeRecommended && usageStats) {
      const currentPlan = subscriptions[0]?.plan_name || 'Free';
      const tokensPercentage = (usageStats.usage.tokens / usageStats.limits.tokens) * 100;
      
      showUpgradePrompt('tokens', currentPlan, {
        used: usageStats.usage.tokens,
        limit: usageStats.limits.tokens,
        percentage: tokensPercentage
      });
    }
  };

  const dismissUpgradePrompts = () => {
    hideUpgradePrompt();
    setDismissedUntil(Date.now() + 60 * 60 * 1000); // 1 hour
    toast.info('Upgrade prompts dismissed for 1 hour');
  };

  return (
    <SmartUpgradeContext.Provider value={{
      checkAndPromptUpgrade,
      forceUpgradeCheck,
      dismissUpgradePrompts,
      isUpgradeRecommended
    }}>
      {children}
      <UpgradePromptComponent />
    </SmartUpgradeContext.Provider>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Crown, 
  X, 
  TrendingUp,
  Zap
} from 'lucide-react';
import { usePaymentStore, formatTokenCount, formatCurrency, calculateUsagePercentage } from '@/lib/payment-service';
import { useSmartUpgrade } from './SmartUpgradeProvider';

export default function UpgradeNotificationBanner() {
  const [isVisible, setIsVisible] = useState(false);
  const [bannerType, setBannerType] = useState<'warning' | 'critical' | 'recommendation' | null>(null);
  const [bannerMessage, setBannerMessage] = useState('');
  
  const { usageStats, subscriptions } = usePaymentStore();
  const { isUpgradeRecommended, forceUpgradeCheck } = useSmartUpgrade();

  useEffect(() => {
    checkBannerVisibility();
  }, [usageStats, subscriptions, isUpgradeRecommended]);

  const checkBannerVisibility = () => {
    if (!usageStats) return;

    const tokensUsed = usageStats.usage.tokens;
    const tokensLimit = usageStats.limits.tokens;
    const tokensPercentage = calculateUsagePercentage(tokensUsed, tokensLimit);
    
    const costUsed = usageStats.cost.monthly;
    const costLimit = usageStats.cost.limit;
    const costPercentage = usageStats.cost.percentage;

    const currentPlan = subscriptions[0]?.plan_name || 'Free';

    // Critical: Over 95% usage
    if (tokensPercentage > 95 || costPercentage > 95) {
      setIsVisible(true);
      setBannerType('critical');
      setBannerMessage(
        `Critical: You've used ${Math.max(tokensPercentage, costPercentage).toFixed(0)}% of your ${tokensPercentage > costPercentage ? 'token' : 'cost'} limit. Upgrade now to avoid service interruption.`
      );
    }
    // Warning: Over 85% usage
    else if (tokensPercentage > 85 || costPercentage > 85) {
      setIsVisible(true);
      setBannerType('warning');
      setBannerMessage(
        `Warning: You've used ${Math.max(tokensPercentage, costPercentage).toFixed(0)}% of your ${tokensPercentage > costPercentage ? 'token' : 'cost'} limit. Consider upgrading to avoid overage charges.`
      );
    }
    // Recommendation: Free plan with moderate usage
    else if (currentPlan.toLowerCase() === 'free' && tokensPercentage > 60) {
      setIsVisible(true);
      setBannerType('recommendation');
      setBannerMessage(
        `You're actively using Recoder! Upgrade to Pro for 50x more tokens and advanced features.`
      );
    }
    // High usage trend
    else if (usageStats.warnings.high_usage && isUpgradeRecommended) {
      setIsVisible(true);
      setBannerType('recommendation');
      setBannerMessage(
        `Your usage is trending high. Upgrade for better value and unlimited features.`
      );
    }
    else {
      setIsVisible(false);
      setBannerType(null);
    }
  };

  const handleUpgrade = () => {
    forceUpgradeCheck();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    // Auto-show again after 1 hour if still relevant
    setTimeout(checkBannerVisibility, 60 * 60 * 1000);
  };

  if (!isVisible || !bannerType) {
    return null;
  }

  const getBannerStyle = () => {
    switch (bannerType) {
      case 'critical':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800';
      case 'recommendation':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800';
    }
  };

  const getIcon = () => {
    switch (bannerType) {
      case 'critical':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <TrendingUp className="h-4 w-4 text-yellow-600" />;
      case 'recommendation':
        return <Crown className="h-4 w-4 text-blue-600" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  const getBadgeText = () => {
    switch (bannerType) {
      case 'critical':
        return 'Action Required';
      case 'warning':
        return 'High Usage';
      case 'recommendation':
        return 'Upgrade Available';
      default:
        return 'Notice';
    }
  };

  return (
    <Alert className={`${getBannerStyle()} border-0 rounded-none py-3 px-6`}>
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getBadgeText()}
            </Badge>
            <AlertDescription className="text-sm font-medium mb-0">
              {bannerMessage}
            </AlertDescription>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={bannerType === 'critical' ? 'destructive' : 'default'}
            onClick={handleUpgrade}
            className="text-xs px-3 py-1"
          >
            <Crown className="h-3 w-3 mr-1" />
            {bannerType === 'critical' ? 'Upgrade Now' : 'View Plans'}
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="text-xs px-2 py-1 opacity-70 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </Alert>
  );
}
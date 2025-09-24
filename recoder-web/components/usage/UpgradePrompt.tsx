'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  AlertTriangle, 
  Zap, 
  Crown, 
  Star, 
  Check,
  X,
  TrendingUp 
} from 'lucide-react';
import { usePaymentStore } from '@/lib/payment-service';
import { cn } from '@/lib/utils';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  reason: 'tokens' | 'cost' | 'requests' | 'concurrency';
  currentPlan: string;
  usageDetails?: {
    used: number;
    limit: number;
    percentage: number;
  };
}

export default function UpgradePrompt({ 
  isOpen, 
  onClose, 
  reason, 
  currentPlan, 
  usageDetails 
}: UpgradePromptProps) {
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);
  const { plans, createPaymentLink } = usePaymentStore();

  const getReasonDetails = () => {
    switch (reason) {
      case 'tokens':
        return {
          icon: <Zap className="h-5 w-5 text-yellow-600" />,
          title: 'Token Limit Reached',
          description: 'You\'ve used all your monthly AI tokens.',
          metric: 'tokens'
        };
      case 'cost':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-red-600" />,
          title: 'Cost Limit Reached',
          description: 'You\'ve reached your monthly cost allowance.',
          metric: 'cost'
        };
      case 'requests':
        return {
          icon: <TrendingUp className="h-5 w-5 text-blue-600" />,
          title: 'Request Limit Reached',
          description: 'You\'ve used all your API requests for this month.',
          metric: 'requests'
        };
      case 'concurrency':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
          title: 'Too Many Concurrent Requests',
          description: 'You have too many AI requests running at once.',
          metric: 'concurrency'
        };
    }
  };

  const handleUpgrade = async (planId: string) => {
    try {
      setIsUpgrading(planId);
      const paymentLink = await createPaymentLink(planId);
      
      // Open payment link
      window.open(paymentLink.payment_link, '_blank', 'width=600,height=800,scrollbars=yes');
      
      // Close the dialog after a delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Upgrade failed:', error);
    } finally {
      setIsUpgrading(null);
    }
  };

  const getRecommendedPlans = () => {
    const currentPlanIndex = plans.findIndex(p => p.id === currentPlan);
    return plans.filter((_, index) => index > currentPlanIndex);
  };

  const reasonDetails = getReasonDetails();
  const recommendedPlans = getRecommendedPlans();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {reasonDetails.icon}
            {reasonDetails.title}
          </DialogTitle>
          <DialogDescription>
            {reasonDetails.description} Upgrade your plan to continue using Recoder's AI features.
          </DialogDescription>
        </DialogHeader>

        {/* Usage Details */}
        {usageDetails && (
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              You've used <strong>{usageDetails.used.toLocaleString()}</strong> of your{' '}
              <strong>{usageDetails.limit.toLocaleString()}</strong> {reasonDetails.metric} limit{' '}
              (<strong>{usageDetails.percentage.toFixed(1)}%</strong>)
            </AlertDescription>
          </Alert>
        )}

        {/* Current Plan */}
        <Card className="border-gray-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Current Plan</CardTitle>
              <Badge variant="outline">{currentPlan}</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-gray-600">
              You're currently on the {currentPlan} plan. Upgrade to get more {reasonDetails.metric} and additional features.
            </p>
          </CardContent>
        </Card>

        {/* Recommended Plans */}
        <div className="space-y-3">
          <h3 className="font-medium">Recommended Upgrades</h3>
          {recommendedPlans.length > 0 ? (
            <div className="grid gap-3">
              {recommendedPlans.map((plan, index) => (
                <Card 
                  key={plan.id} 
                  className={cn(
                    'border cursor-pointer transition-all hover:shadow-md',
                    index === 0 ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{plan.name}</h4>
                          {index === 0 && (
                            <Badge className="bg-blue-100 text-blue-700">
                              <Star className="h-3 w-3 mr-1" />
                              Recommended
                            </Badge>
                          )}
                          {plan.id === 'enterprise' && (
                            <Badge className="bg-purple-100 text-purple-700">
                              <Crown className="h-3 w-3 mr-1" />
                              Most Popular
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {plan.price_formatted}/month • {plan.limits.tokens.toLocaleString()} tokens
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {plan.features.slice(0, 2).map((feature, i) => (
                            <div key={i} className="flex items-center text-xs text-gray-500">
                              <Check className="h-3 w-3 text-green-500 mr-1" />
                              {feature}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right">
                          <div className="text-lg font-bold">{plan.price_formatted}</div>
                          <div className="text-xs text-gray-500">per month</div>
                        </div>
                        <Button
                          size="sm"
                          variant={index === 0 ? 'default' : 'outline'}
                          onClick={() => handleUpgrade(plan.id)}
                          disabled={isUpgrading === plan.id}
                          className="min-w-[80px]"
                        >
                          {isUpgrading === plan.id ? 'Upgrading...' : 'Upgrade'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-6">
                <Crown className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                <p className="text-gray-600">You're already on our highest tier!</p>
                <p className="text-sm text-gray-500 mt-1">
                  Contact support for custom enterprise solutions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between pt-4 border-t">
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4 mr-2" />
            Continue with Current Plan
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/subscription'}>
            View All Plans
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to easily trigger upgrade prompts
export function useUpgradePrompt() {
  const [upgradePrompt, setUpgradePrompt] = useState<{
    isOpen: boolean;
    reason: 'tokens' | 'cost' | 'requests' | 'concurrency';
    currentPlan: string;
    usageDetails?: {
      used: number;
      limit: number;
      percentage: number;
    };
  }>({
    isOpen: false,
    reason: 'tokens',
    currentPlan: 'free',
  });

  const showUpgradePrompt = (
    reason: 'tokens' | 'cost' | 'requests' | 'concurrency',
    currentPlan: string,
    usageDetails?: { used: number; limit: number; percentage: number }
  ) => {
    setUpgradePrompt({
      isOpen: true,
      reason,
      currentPlan,
      usageDetails
    });
  };

  const hideUpgradePrompt = () => {
    setUpgradePrompt(prev => ({ ...prev, isOpen: false }));
  };

  return {
    upgradePrompt,
    showUpgradePrompt,
    hideUpgradePrompt,
    UpgradePromptComponent: () => (
      <UpgradePrompt
        isOpen={upgradePrompt.isOpen}
        onClose={hideUpgradePrompt}
        reason={upgradePrompt.reason}
        currentPlan={upgradePrompt.currentPlan}
        usageDetails={upgradePrompt.usageDetails}
      />
    )
  };
}
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, Zap, Crown, Building } from 'lucide-react';
import { usePaymentStore, SubscriptionPlan, formatCurrency } from '@/lib/payment-service';
import { cn } from '@/lib/utils';

interface SubscriptionCardProps {
  plan: SubscriptionPlan;
  isCurrentPlan?: boolean;
  isPopular?: boolean;
  onSubscribe?: (planId: string) => Promise<void>;
  className?: string;
}

const planIcons = {
  'recoder-weekly': Zap,
  'recoder-monthly': Check,
  'recoder-enterprise': Crown
};

const planColors = {
  'recoder-weekly': 'border-blue-200 bg-blue-50/50',
  'recoder-monthly': 'border-green-200 bg-green-50/50 ring-2 ring-green-200',
  'recoder-enterprise': 'border-purple-200 bg-purple-50/50'
};

export default function SubscriptionCard({ 
  plan, 
  isCurrentPlan = false, 
  isPopular = false,
  onSubscribe,
  className 
}: SubscriptionCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { createPaymentLink } = usePaymentStore();
  
  const IconComponent = planIcons[plan.id as keyof typeof planIcons] || Check;
  const cardColor = planColors[plan.id as keyof typeof planColors] || 'border-gray-200';

  const handleSubscribe = async () => {
    if (isCurrentPlan || !onSubscribe) return;
    
    try {
      setIsLoading(true);
      await onSubscribe(plan.id);
    } catch (error) {
      console.error('Subscription failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDirectSubscribe = async () => {
    if (isCurrentPlan) return;
    
    try {
      setIsLoading(true);
      const paymentLink = await createPaymentLink(plan.id);
      window.open(paymentLink.payment_link, '_blank');
    } catch (error) {
      console.error('Failed to create payment link:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className={cn(
      'relative transition-all duration-200 hover:shadow-lg',
      cardColor,
      isCurrentPlan && 'ring-2 ring-blue-500',
      className
    )}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
          <Badge className="bg-gradient-to-r from-green-500 to-blue-500 text-white px-3 py-1">
            Most Popular
          </Badge>
        </div>
      )}
      
      {isCurrentPlan && (
        <div className="absolute -top-3 right-4">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            Current Plan
          </Badge>
        </div>
      )}

      <CardHeader className="text-center pb-4">
        <div className="mx-auto mb-4 p-3 rounded-full bg-white shadow-sm">
          <IconComponent className="h-6 w-6 text-gray-700" />
        </div>
        <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
        <CardDescription className="text-sm text-gray-600 min-h-[40px]">
          {plan.id === 'recoder-weekly' && 'Perfect for trying out Recoder with full AI access'}
          {plan.id === 'recoder-monthly' && 'Ideal for regular development with advanced features'}
          {plan.id === 'recoder-enterprise' && 'For teams and high-volume development projects'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pricing */}
        <div className="text-center">
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-3xl font-bold">{plan.price_formatted}</span>
            <span className="text-gray-500 text-sm">
              /{plan.id === 'recoder-weekly' ? 'week' : 'month'}
            </span>
          </div>
          {plan.id === 'recoder-monthly' && (
            <div className="text-sm text-green-600 font-medium mt-1">
              Save 50% vs weekly
            </div>
          )}
        </div>

        {/* Usage Limits */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">AI Tokens</span>
            <span className="font-medium">
              {plan.limits.tokens >= 1000000 
                ? `${(plan.limits.tokens / 1000000).toFixed(1)}M` 
                : `${(plan.limits.tokens / 1000).toFixed(0)}K`}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">API Requests</span>
            <span className="font-medium">
              {plan.limits.requests >= 1000 
                ? `${(plan.limits.requests / 1000).toFixed(0)}K` 
                : plan.limits.requests}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Cost Limit</span>
            <span className="font-medium">{formatCurrency(plan.cost_limit / 100)}</span>
          </div>
        </div>

        {/* Features */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-900 mb-2">Features included:</h4>
          <ul className="space-y-1">
            {plan.features.slice(0, 5).map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                {feature}
              </li>
            ))}
            {plan.features.length > 5 && (
              <li className="text-sm text-gray-500 italic">
                +{plan.features.length - 5} more features
              </li>
            )}
          </ul>
        </div>
      </CardContent>

      <CardFooter className="pt-4">
        <Button 
          className="w-full" 
          onClick={onSubscribe ? handleSubscribe : handleDirectSubscribe}
          disabled={isCurrentPlan || isLoading}
          variant={isCurrentPlan ? 'outline' : 'default'}
          size="lg"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isCurrentPlan ? 'Current Plan' : `Subscribe to ${plan.name}`}
        </Button>
        
        {!isCurrentPlan && (
          <div className="w-full text-center mt-2">
            <p className="text-xs text-gray-500">
              Cancel anytime • No setup fees • Instant activation
            </p>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
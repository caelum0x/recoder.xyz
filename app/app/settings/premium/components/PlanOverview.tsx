'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Calendar, CreditCard, AlertCircle } from 'lucide-react';

interface PlanOverviewProps {
  premiumData: any;
  onRefresh: () => void;
}

export default function PlanOverview({ premiumData, onRefresh }: PlanOverviewProps) {
  const subscription = premiumData?.subscription;
  const details = subscription?.details;
  
  const isPremium = subscription?.plan !== 'free';
  const isActive = subscription?.status === 'active';
  
  const planColors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-800',
    weekly: 'bg-blue-100 text-blue-800',
    monthly: 'bg-purple-100 text-purple-800',
    pro: 'bg-yellow-100 text-yellow-800',
    enterprise: 'bg-red-100 text-red-800'
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Crown className={`w-5 h-5 ${isPremium ? 'text-yellow-500' : 'text-gray-400'}`} />
            Current Plan
          </h2>
          <p className="text-sm text-gray-600 mt-1">Your subscription details</p>
        </div>
        <Badge className={planColors[subscription?.plan] || planColors.free}>
          {subscription?.plan?.toUpperCase() || 'FREE'}
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-700">Status</p>
            <p className="text-lg font-semibold text-gray-900 capitalize">{subscription?.status || 'Active'}</p>
          </div>
          {!isActive && <AlertCircle className="w-5 h-5 text-yellow-500" />}
        </div>

        {isPremium && details && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <Calendar className="w-5 h-5 text-gray-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">Current Period</p>
                <p className="text-sm text-gray-900 mt-1">{formatDate(details.currentPeriodStart)}</p>
                <p className="text-xs text-gray-600">Renews: {formatDate(details.currentPeriodEnd)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <CreditCard className="w-5 h-5 text-gray-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-700">Billing Amount</p>
                <p className="text-sm text-gray-900 mt-1">${details.amount} {details.currency}</p>
                <p className="text-xs text-gray-600">Billed {details.interval}ly</p>
              </div>
            </div>
          </div>
        )}

        {subscription?.limits?.features && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Plan Features</p>
            <div className="flex flex-wrap gap-2">
              {subscription.limits.features.slice(0, 4).map((feature: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">{feature}</Badge>
              ))}
              {subscription.limits.features.length > 4 && (
                <Badge variant="secondary" className="text-xs">+{subscription.limits.features.length - 4} more</Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t">
          {!isPremium ? (
            <Button 
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              onClick={() => window.location.href = '/pricing'}
            >
              Upgrade to Premium
            </Button>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/settings/subscription'}>
                Manage Subscription
              </Button>
              {details?.cancelAtPeriodEnd ? (
                <Button className="flex-1" onClick={onRefresh}>Reactivate</Button>
              ) : (
                <Button variant="outline" className="flex-1" onClick={() => window.location.href = '/pricing'}>Change Plan</Button>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

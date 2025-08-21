'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface PricingTier {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  features: string[];
  limits: {
    codeGeneration: number;
    apiCalls: number;
    deployments: number;
    teamMembers: number;
  };
  isPopular: boolean;
  isEnterprise: boolean;
}

interface BillingInfo {
  currentTier: string;
  status: string;
  nextBillingDate: string;
  paymentMethod: {
    type: string;
    last4: string;
    expiry: string;
  };
  billingHistory: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    description: string;
  }>;
}

export default function BillingPage() {
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [billingInfo, setBillingInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  useEffect(() => {
    fetchPricingData();
  }, []);

  const fetchPricingData = async () => {
    try {
      // This would connect to the production engine billing API
      const pricingResponse = await fetch('http://localhost:4567/api/billing/pricing');
      const billingResponse = await fetch('http://localhost:4567/api/billing/subscription/current-user', {
        headers: {
          'x-user-id': 'current-user',
          'Authorization': 'Bearer ' + localStorage.getItem('authToken')
        }
      });

      if (pricingResponse.ok) {
        const pricingData = await pricingResponse.json();
        setPricingTiers(pricingData.data || getMockPricingTiers());
      } else {
        setPricingTiers(getMockPricingTiers());
      }

      if (billingResponse.ok) {
        const billingData = await billingResponse.json();
        setBillingInfo(billingData.data);
      } else {
        setBillingInfo(getMockBillingInfo());
      }
    } catch (error) {
      console.error('Billing fetch error:', error);
      setPricingTiers(getMockPricingTiers());
      setBillingInfo(getMockBillingInfo());
    } finally {
      setLoading(false);
    }
  };

  const getMockPricingTiers = (): PricingTier[] => [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'USD',
      billingCycle: 'forever',
      features: [
        '5,000 lines of code generation',
        '100 API calls per month',
        '2 deployments per month',
        'Community support',
        'Basic templates'
      ],
      limits: {
        codeGeneration: 5000,
        apiCalls: 100,
        deployments: 2,
        teamMembers: 1
      },
      isPopular: false,
      isEnterprise: false
    },
    {
      id: 'professional',
      name: 'Professional',
      price: 29,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        '100,000 lines of code generation',
        '5,000 API calls per month',
        '50 deployments per month',
        'Priority support',
        'All templates',
        'GitHub/GitLab integration',
        'Advanced analytics'
      ],
      limits: {
        codeGeneration: 100000,
        apiCalls: 5000,
        deployments: 50,
        teamMembers: 5
      },
      isPopular: true,
      isEnterprise: false
    },
    {
      id: 'business',
      name: 'Business',
      price: 99,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        '500,000 lines of code generation',
        '25,000 API calls per month',
        'Unlimited deployments',
        '24/7 priority support',
        'Custom templates',
        'Team collaboration',
        'Advanced security',
        'SOC 2 compliance'
      ],
      limits: {
        codeGeneration: 500000,
        apiCalls: 25000,
        deployments: -1,
        teamMembers: 25
      },
      isPopular: false,
      isEnterprise: false
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 499,
      currency: 'USD',
      billingCycle: 'monthly',
      features: [
        'Unlimited code generation',
        'Unlimited API calls',
        'Unlimited deployments',
        'Dedicated support team',
        'On-premise deployment',
        'Custom integrations',
        'White-label options',
        'SLA guarantees'
      ],
      limits: {
        codeGeneration: -1,
        apiCalls: -1,
        deployments: -1,
        teamMembers: -1
      },
      isPopular: false,
      isEnterprise: true
    }
  ];

  const getMockBillingInfo = (): BillingInfo => ({
    currentTier: 'professional',
    status: 'active',
    nextBillingDate: '2024-09-20',
    paymentMethod: {
      type: 'Visa',
      last4: '4242',
      expiry: '12/26'
    },
    billingHistory: [
      {
        id: 'inv_001',
        date: '2024-08-20',
        amount: 29.00,
        status: 'paid',
        description: 'Professional Plan - Monthly'
      },
      {
        id: 'inv_002',
        date: '2024-07-20',
        amount: 29.00,
        status: 'paid',
        description: 'Professional Plan - Monthly'
      }
    ]
  });

  const handleUpgrade = async (tierId: string) => {
    setUpgrading(true);
    setSelectedTier(tierId);

    try {
      // This would integrate with the production engine billing service
      const response = await fetch('http://localhost:4567/api/billing/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current-user',
          'Authorization': 'Bearer ' + localStorage.getItem('authToken')
        },
        body: JSON.stringify({ tierIds: tierId })
      });

      if (response.ok) {
        // Handle successful upgrade
        alert('Plan upgraded successfully!');
        fetchPricingData(); // Refresh data
      } else {
        // Handle payment flow - this would integrate with Stripe or similar
        handlePaymentFlow(tierId);
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Upgrade failed. Please try again.');
    } finally {
      setUpgrading(false);
      setSelectedTier(null);
    }
  };

  const handlePaymentFlow = (tierId: string) => {
    // This would integrate with Stripe Elements or similar
    const tier = pricingTiers.find(t => t.id === tierId);
    if (tier) {
      alert(`Payment flow for ${tier.name} plan ($${tier.price}/month) would be handled here.`);
    }
  };

  const formatNumber = (num: number) => {
    if (num === -1) return 'Unlimited';
    return num.toLocaleString();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">Billing & Subscription</h1>
        <p className="text-xl text-gray-600">
          Choose the perfect plan for your AI development needs
        </p>
      </div>

      {/* Current Subscription Info */}
      {billingInfo && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Current Subscription
              <Badge variant={billingInfo.status === 'active' ? 'default' : 'secondary'}>
                {billingInfo.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-gray-600">Current Plan</Label>
                <p className="font-semibold capitalize">{billingInfo.currentTier}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Next Billing</Label>
                <p className="font-semibold">{billingInfo.nextBillingDate}</p>
              </div>
              <div>
                <Label className="text-sm text-gray-600">Payment Method</Label>
                <p className="font-semibold">
                  {billingInfo.paymentMethod.type} ••••{billingInfo.paymentMethod.last4}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {pricingTiers.map((tier) => (
          <Card 
            key={tier.id} 
            className={`relative ${tier.isPopular ? 'border-blue-500 shadow-lg scale-105' : ''}`}
          >
            {tier.isPopular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-blue-500">Most Popular</Badge>
              </div>
            )}
            
            <CardHeader className="text-center">
              <CardTitle className="text-xl">{tier.name}</CardTitle>
              <div className="space-y-1">
                <div className="text-3xl font-bold">
                  ${tier.price}
                  {tier.price > 0 && (
                    <span className="text-sm font-normal text-gray-600">
                      /{tier.billingCycle}
                    </span>
                  )}
                </div>
                {tier.price === 0 && (
                  <div className="text-sm text-gray-600">Forever free</div>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {tier.features.map((feature, index) => (
                  <li key={index} className="flex items-start text-sm">
                    <span className="text-green-500 mr-2">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="border-t pt-4 space-y-2">
                <div className="text-xs text-gray-600">Usage Limits:</div>
                <div className="text-xs space-y-1">
                  <div>Code: {formatNumber(tier.limits.codeGeneration)} lines</div>
                  <div>API: {formatNumber(tier.limits.apiCalls)} calls</div>
                  <div>Deploys: {formatNumber(tier.limits.deployments)}</div>
                  <div>Team: {formatNumber(tier.limits.teamMembers)} members</div>
                </div>
              </div>

              <Button 
                className="w-full"
                variant={tier.isPopular ? 'default' : 'outline'}
                disabled={upgrading && selectedTier === tier.id}
                onClick={() => handleUpgrade(tier.id)}
              >
                {upgrading && selectedTier === tier.id ? (
                  'Processing...'
                ) : billingInfo?.currentTier === tier.id ? (
                  'Current Plan'
                ) : tier.isEnterprise ? (
                  'Contact Sales'
                ) : (
                  `${tier.price === 0 ? 'Get Started' : 'Upgrade'}`
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Billing History */}
      {billingInfo && billingInfo.billingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Billing History</CardTitle>
            <CardDescription>Your recent payment history</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {billingInfo.billingHistory.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <p className="font-medium">{invoice.description}</p>
                    <p className="text-sm text-gray-600">{invoice.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">${invoice.amount}</p>
                    <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Method */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your payment information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                placeholder="1234 5678 9012 3456"
                value={billingInfo ? `••••••••••••${billingInfo.paymentMethod.last4}` : ''}
                readOnly
              />
            </div>
            <div>
              <Label htmlFor="expiry">Expiry Date</Label>
              <Input
                id="expiry"
                placeholder="MM/YY"
                value={billingInfo?.paymentMethod.expiry || ''}
                readOnly
              />
            </div>
          </div>
          <Button variant="outline" className="mt-4">
            Update Payment Method
          </Button>
        </CardContent>
      </Card>

      {/* Enterprise Contact */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader>
          <CardTitle>Need Something Custom?</CardTitle>
          <CardDescription>
            Enterprise solutions with custom pricing, on-premise deployment, and dedicated support
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg">
              Contact Enterprise Sales
            </Button>
            <Button variant="outline" size="lg">
              Schedule Demo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
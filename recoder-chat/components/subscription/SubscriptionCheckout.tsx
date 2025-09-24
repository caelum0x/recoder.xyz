// Subscription Checkout Component
// Handles DODO Payments subscription creation

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Shield, Lock } from 'lucide-react';

interface BillingAddress {
  country: string;
  state: string;
  city: string;
  street: string;
  zipcode: string;
}

interface PricingPlan {
  id: string;
  name: string;
  price: number;
  priceFormatted: string;
  billingPeriod: string;
  description: string;
  features: string[];
}

interface SubscriptionCheckoutProps {
  planId: string;
}

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'AU', name: 'Australia' },
  // Add more countries as needed
];

const SubscriptionCheckout: React.FC<SubscriptionCheckoutProps> = ({ planId }) => {
  const [plan, setPlan] = useState<PricingPlan | null>(null);
  const [billingAddress, setBillingAddress] = useState<BillingAddress>({
    country: 'US',
    state: '',
    city: '',
    street: '',
    zipcode: ''
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetchPlan();
  }, [planId]);

  const fetchPlan = async () => {
    try {
      const response = await fetch('/api/subscriptions/plans');
      const data = await response.json();
      
      if (data.success) {
        const selectedPlan = data.plans.find((p: PricingPlan) => p.id === planId);
        if (selectedPlan) {
          setPlan(selectedPlan);
        } else {
          toast.error('Invalid plan selected');
          router.push('/pricing');
        }
      } else {
        toast.error('Failed to load plan details');
      }
    } catch (error) {
      console.error('Error fetching plan:', error);
      toast.error('Failed to load plan details');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof BillingAddress, value: string) => {
    setBillingAddress(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = (): boolean => {
    const required = ['country', 'state', 'city', 'street', 'zipcode'];
    
    for (const field of required) {
      if (!billingAddress[field as keyof BillingAddress]) {
        toast.error(`${field.charAt(0).toUpperCase() + field.slice(1)} is required`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    if (!session) {
      toast.error('Please sign in to continue');
      return;
    }

    setProcessing(true);

    try {
      const response = await fetch('/api/subscriptions/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId,
          billingAddress,
          returnUrl: `${window.location.origin}/subscription/success`
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.subscription.paymentLink) {
          // Redirect to DODO Payments checkout
          window.location.href = data.subscription.paymentLink;
        } else {
          toast.success('Subscription created successfully!');
          router.push('/dashboard');
        }
      } else {
        toast.error(data.error || 'Failed to create subscription');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      toast.error('Failed to create subscription');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p>Plan not found</p>
            <Button onClick={() => router.push('/pricing')} className="mt-4">
              Back to Pricing
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <CreditCard className="h-5 w-5" />
                <span>Order Summary</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>
              
              <Separator />
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{plan.priceFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>Calculated at checkout</span>
                </div>
              </div>
              
              <Separator />
              
              <div className="flex justify-between font-semibold text-lg">
                <span>Total</span>
                <span>{plan.priceFormatted}</span>
              </div>
              
              <div className="text-xs text-gray-500">
                Billed {plan.billingPeriod.toLowerCase()}. Cancel anytime.
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center space-x-2 text-blue-700">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm font-medium">Secure Payment</span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Powered by DODO Payments. Your payment information is encrypted and secure.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Checkout Form */}
        <div className="lg:col-span-2">
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">Checkout</h1>
            <p className="text-gray-600">Complete your subscription to {plan.name}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Account Information */}
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>
                  Subscription will be linked to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={session?.user?.name || ''} disabled />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input value={session?.user?.email || ''} disabled />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Address */}
            <Card>
              <CardHeader>
                <CardTitle>Billing Address</CardTitle>
                <CardDescription>
                  Enter your billing address for payment processing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Country *</Label>
                    <Select 
                      value={billingAddress.country} 
                      onValueChange={(value) => handleInputChange('country', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="state">State/Province *</Label>
                    <Input
                      id="state"
                      value={billingAddress.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="Enter state or province"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="street">Street Address *</Label>
                  <Input
                    id="street"
                    value={billingAddress.street}
                    onChange={(e) => handleInputChange('street', e.target.value)}
                    placeholder="Enter street address"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={billingAddress.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Enter city"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipcode">ZIP/Postal Code *</Label>
                    <Input
                      id="zipcode"
                      value={billingAddress.zipcode}
                      onChange={(e) => handleInputChange('zipcode', e.target.value)}
                      placeholder="Enter ZIP code"
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Terms and Conditions */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start space-x-3">
                  <Lock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div className="text-sm text-gray-600">
                    <p>
                      By completing this purchase, you agree to our{' '}
                      <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
                      {' '}and{' '}
                      <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>.
                      You can cancel your subscription at any time.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={processing}
            >
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  Complete Subscription
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionCheckout;
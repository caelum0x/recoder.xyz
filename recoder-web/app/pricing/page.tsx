// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
/**
 * Pricing Page for Recoder.xyz
 * 
 * Main pricing page with tier comparison and features
 */

import PricingPage from '@/components/pricing/pricing-page';

export default function Pricing() {
  return (
    <div className="container mx-auto px-4 py-8">
      <PricingPage />
    </div>
  );
}

export const metadata = {
  title: 'Pricing - Recoder.xyz',
  description: 'Choose the perfect AI development plan. From free local models to enterprise-grade multi-AI orchestration with transparent pricing.',
};
// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
/**
 * Cost Monitoring Dashboard Page
 * 
 * Main page for cost monitoring and optimization insights
 */

import CostMonitoringDashboard from '@/components/dashboard/cost-monitoring-dashboard';

export default function CostDashboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <CostMonitoringDashboard />
    </div>
  );
}

export const metadata = {
  title: 'Cost Monitoring - Recoder.xyz',
  description: 'Real-time usage tracking and cost optimization for your AI development workflow',
};
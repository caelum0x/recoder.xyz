// Admin Testing Page - Professional testing dashboard interface
import { Metadata } from 'next';
import TestingDashboard from '@/components/admin/testing-dashboard';

export const metadata: Metadata = {
  title: 'Testing Dashboard - Admin | Recoder.xyz',
  description: 'Automated test suite management, execution monitoring, and analytics for comprehensive quality assurance.',
  keywords: 'testing, QA, test automation, Jest, Cypress, Playwright, test analytics, code coverage',
};

export default function AdminTestingPage() {
  return (
    <div className="container mx-auto py-6">
      <TestingDashboard />
    </div>
  );
}
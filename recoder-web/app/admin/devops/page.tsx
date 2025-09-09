// Admin DevOps Page - Infrastructure automation and deployment management
import { Metadata } from 'next';
import DevOpsAutomationDashboard from '@/components/admin/devops-automation-dashboard';

export const metadata: Metadata = {
  title: 'DevOps Automation - Admin | Recoder.xyz',
  description: 'Infrastructure automation, CI/CD pipeline management, deployment orchestration, and comprehensive DevOps monitoring for scalable application deployment.',
  keywords: 'DevOps, infrastructure automation, CI/CD, deployment, AWS, Docker, Kubernetes, monitoring, pipeline',
};

export default function AdminDevOpsPage() {
  return (
    <div className="container mx-auto py-6">
      <DevOpsAutomationDashboard />
    </div>
  );
}
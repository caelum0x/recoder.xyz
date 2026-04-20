import DashboardLayoutContent from '@/components/dashboard/layout-content';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const dynamic = 'force-dynamic';

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

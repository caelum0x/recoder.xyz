import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Usage Reports',
  description: 'View and export usage reports for your agents, models, and costs.',
};

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

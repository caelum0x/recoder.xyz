import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Marketplace',
  description: 'Browse, install, and publish agents in the Recoder marketplace.',
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

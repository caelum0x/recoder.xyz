import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API Keys | Recoder',
  description: 'Manage your API keys for programmatic access to Recoder',
  openGraph: {
    title: 'API Keys | Recoder',
    description: 'Manage your API keys for programmatic access to Recoder',
    type: 'website',
  },
};

export default async function APIKeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

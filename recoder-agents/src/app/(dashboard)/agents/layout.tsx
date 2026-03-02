import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Worker Conversation | Recoder',
  description: 'Interactive Worker conversation powered by Recoder',
  openGraph: {
    title: 'Worker Conversation | Recoder',
    description: 'Interactive Worker conversation powered by Recoder',
    type: 'website',
  },
};

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

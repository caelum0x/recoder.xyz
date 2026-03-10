import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Activity Log | Recoder',
  description: 'View your platform activity across all Recoder apps',
  openGraph: {
    title: 'Activity Log | Recoder',
    description: 'View your platform activity across all Recoder apps',
    type: 'website',
  },
};

export default function ActivityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

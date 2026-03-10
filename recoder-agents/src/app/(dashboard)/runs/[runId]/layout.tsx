import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Run Detail | Recoder',
  description: 'Watch agent execution in real time',
  openGraph: {
    title: 'Run Detail | Recoder',
    description: 'Watch agent execution in real time',
    type: 'website',
  },
};

export default function RunDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

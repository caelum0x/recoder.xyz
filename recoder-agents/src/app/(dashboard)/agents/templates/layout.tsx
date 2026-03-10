import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Templates',
  description: 'Browse and create agents from proven templates across multiple categories.',
};

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Recoder.xyz',
  description: 'Recoder dashboard for active platform surfaces.',
  openGraph: {
    title: 'Dashboard - Recoder.xyz',
    description: 'Recoder dashboard for active platform surfaces.',
    url: 'https://recoder.xyz/dashboard',
    type: 'website',
  },
  robots: {
    index: false,
    follow: true,
  },
  alternates: {
    canonical: 'https://recoder.xyz/dashboard',
  },
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

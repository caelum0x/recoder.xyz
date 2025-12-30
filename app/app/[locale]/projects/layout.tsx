import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Projects - Recoder.xyz | Web IDE Projects Dashboard',
  description: 'View and manage all your Web IDE projects. Download to local with CLI commands. Seamless sync between browser and terminal.',
  openGraph: {
    title: 'My Projects - Recoder.xyz',
    description: 'Manage your Web IDE projects. Download with CLI, sync seamlessly.',
    url: 'https://recoder.xyz/projects',
    type: 'website',
  },
  robots: {
    index: false, // Don't index user-specific pages
    follow: true,
  },
  alternates: {
    canonical: 'https://recoder.xyz/projects',
  },
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

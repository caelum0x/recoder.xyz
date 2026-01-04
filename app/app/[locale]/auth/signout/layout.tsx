import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Out - Recoder.xyz',
  description: 'Sign out from Recoder.xyz securely.',
  robots: {
    index: false, // Don't index auth pages
    follow: false,
  },
};

export default function SignOutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

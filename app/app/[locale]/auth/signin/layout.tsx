import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in | Recoder.xyz',
  description: 'Sign in to Recoder.xyz with GitHub or Google and continue into the BYOK-first AI workflow.',
  openGraph: {
    title: 'Sign in | Recoder.xyz',
    description: 'Continue into Recoder with GitHub or Google.',
    url: 'https://recoder.xyz/auth/signin',
    type: 'website',
  },
  robots: {
    index: false, // Don't index auth pages
    follow: false,
  },
  alternates: {
    canonical: 'https://recoder.xyz/auth/signin',
  },
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

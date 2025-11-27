import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Recoder.xyz | Access FREE AI Coding Platform',
  description: 'Sign in to Recoder.xyz. Access Web IDE + CLI with 40+ AI models. 100% FREE beta with BYOK.',
  openGraph: {
    title: 'Sign In - Recoder.xyz',
    description: 'Access FREE AI coding platform with Web IDE + CLI sync.',
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

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create account | Recoder.xyz',
  description: 'Create your Recoder account with GitHub or Google, then connect your provider keys and start building.',
  keywords: [
    'sign up free AI coding',
    'BYOK AI platform',
    'free AI development account',
    'no credit card AI tool',
    'Claude GPT-4 access',
  ],
  openGraph: {
    title: 'Create account | Recoder.xyz',
    description: 'Join Recoder and start with a BYOK-first AI workflow.',
    url: 'https://recoder.xyz/auth/signup',
    type: 'website',
  },
  robots: {
    index: false, // Don't index auth pages
    follow: false,
  },
  alternates: {
    canonical: 'https://recoder.xyz/auth/signup',
  },
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

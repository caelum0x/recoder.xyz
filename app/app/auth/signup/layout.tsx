import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up FREE - Recoder.xyz | AI Coding Platform with BYOK',
  description: 'Create your FREE account. No credit card required. Bring your own API key. Access 40+ AI models including Claude, GPT-4, Gemini. Web IDE + CLI sync.',
  keywords: [
    'sign up free AI coding',
    'BYOK AI platform',
    'free AI development account',
    'no credit card AI tool',
    'Claude GPT-4 access',
  ],
  openGraph: {
    title: 'Sign Up FREE - Recoder.xyz',
    description: 'Join FREE beta. No credit card. BYOK. 40+ AI models. Web IDE + CLI.',
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

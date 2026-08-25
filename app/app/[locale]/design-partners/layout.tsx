import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Design-partner pilots | Recoder',
  description: 'Apply to run a measured Recoder pilot on a repeated coding-agent workflow.',
};

export default function DesignPartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}

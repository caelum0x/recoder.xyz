import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// This page is a client component and cannot export metadata directly, so the
// canonical URL is declared here. It points at the English URL so the locale
// variants (/tr, /es, /zh, /de) consolidate to a single indexable page.
export const metadata: Metadata = {
  alternates: { canonical: 'https://recoder.xyz/partnerships' },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

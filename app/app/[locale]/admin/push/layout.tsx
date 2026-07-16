import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Push Tools | Recoder Admin',
  robots: { index: false, follow: false },
};

export default function AdminPushLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

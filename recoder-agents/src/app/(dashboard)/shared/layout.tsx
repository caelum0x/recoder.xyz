import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shared with me | Recoder',
  description: 'View threads and agents shared with you',
  openGraph: {
    title: 'Shared with me | Recoder',
    description: 'View threads and agents shared with you',
    type: 'website',
  },
};

export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

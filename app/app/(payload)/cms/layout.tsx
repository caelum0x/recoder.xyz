import type { ReactNode } from 'react';
import config from '@/payload.config';
import { RootLayout } from '@payloadcms/next/layouts';
import { importMap } from './importMap';
import { payloadCmsServerFunction } from './actions';

export const dynamic = 'force-dynamic';

export default function PayloadCmsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <RootLayout
      config={Promise.resolve(config)}
      importMap={importMap}
      serverFunction={payloadCmsServerFunction}
    >
      {children}
    </RootLayout>
  );
}

'use client';

import React from 'react';
import Link from 'next/link';
import { PartyPopper } from 'lucide-react';

export default function BillingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full items-center justify-center p-8">
      <div className="max-w-md text-center space-y-4">
        <PartyPopper className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Recoder is free!
        </h1>
        <p className="text-muted-foreground">
          There is nothing to manage here. Enjoy the platform at no cost.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

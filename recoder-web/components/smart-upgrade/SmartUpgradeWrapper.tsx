'use client';

import { SmartUpgradeProvider } from './SmartUpgradeProvider';
import { ReactNode } from 'react';

interface SmartUpgradeWrapperProps {
  children: ReactNode;
}

export function SmartUpgradeWrapper({ children }: SmartUpgradeWrapperProps) {
  return (
    <SmartUpgradeProvider>
      {children}
    </SmartUpgradeProvider>
  );
}
/**
 * Onboarding Layout
 * Shared layout for onboarding flow pages
 */

import { ReactNode } from 'react';

interface OnboardingLayoutProps {
  children: ReactNode;
}

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <div className="onboarding-flow">
      {children}
    </div>
  );
}

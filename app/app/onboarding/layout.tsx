/**
 * Onboarding Layout
 * Shared layout for onboarding flow pages
 */

import React from 'react';

export default function OnboardingLayout({ children }: React.PropsWithChildren) {
  return (
    <div className="onboarding-flow">
      {children}
    </div>
  );
}

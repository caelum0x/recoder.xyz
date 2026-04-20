import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { mockUseOnboarding } = vi.hoisted(() => ({
  mockUseOnboarding: vi.fn(),
}));

vi.mock('@/hooks/onboarding', () => ({
  useOnboarding: mockUseOnboarding,
}));

vi.mock('@/components/onboarding/new-onboarding-page', () => ({
  NewOnboardingPage: ({ onComplete, onClose }: { onComplete?: () => void; onClose?: () => void }) => (
    <div>
      <span data-testid="mock-onboarding">Onboarding</span>
      <button onClick={onComplete}>complete</button>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { OnboardingProvider } from '@/components/onboarding/onboarding-provider';

describe('OnboardingProvider', () => {
  it('does not auto-start onboarding when closed', () => {
    const completeOnboarding = vi.fn();
    const startOnboarding = vi.fn();

    mockUseOnboarding.mockReturnValue({
      isOpen: false,
      hasCompletedOnboarding: false,
      startOnboarding,
      completeOnboarding,
    });

    render(
      <OnboardingProvider>
        <div data-testid="child">child</div>
      </OnboardingProvider>
    );

    expect(screen.getByTestId('child')).toBeDefined();
    expect(screen.queryByTestId('mock-onboarding')).toBeNull();
    expect(startOnboarding).not.toHaveBeenCalled();
  });

  it('renders onboarding only when explicitly opened', () => {
    const completeOnboarding = vi.fn();

    mockUseOnboarding.mockReturnValue({
      isOpen: true,
      completeOnboarding,
    });

    render(
      <OnboardingProvider>
        <div>child</div>
      </OnboardingProvider>
    );

    expect(screen.getByTestId('mock-onboarding')).toBeDefined();
  });
});

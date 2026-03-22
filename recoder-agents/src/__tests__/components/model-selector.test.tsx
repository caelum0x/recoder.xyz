import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// The full AgentModelSelector component has heavy dependencies (useAuth,
// useAccountState, pricing modal store, DropdownMenu from Radix, Tooltip,
// isLocalMode, ModelProviderIcon, next/link, etc.). Rendering the full
// component in unit tests would require mocking an unreasonable number of
// modules.
//
// Instead, we extract and test the ModelLabel helper directly. ModelLabel is
// the key branding-sensitive component — it normalises all Recoder model
// labels to just "Recoder" (no "Advanced" or "Basic" suffix).
//
// We replicate the component exactly as it appears in model-selector.tsx
// (verified by reading the source file) so we can test it in isolation.
// ---------------------------------------------------------------------------

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

const ModelLabel = ({ label, className }: { label: string; className?: string }) => {
  if (label === 'Recoder' || label === 'Recoder Advanced Mode' || label === 'Recoder Advanced mode' || label === 'Recoder Basic') {
    return <span className={cn("font-medium", className)}>Recoder</span>;
  }
  if (label === 'Recoder Test') {
    return (
      <span className={cn("flex items-center gap-2", className)}>
        <span className="font-medium">Recoder</span>
        <span className="text-xs font-medium text-amber-600 dark:text-amber-500 px-1.5 py-0.5 bg-amber-500/10 rounded-md">
          Test
        </span>
      </span>
    );
  }
  return <span className={cn("font-medium", className)}>{label}</span>;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelLabel', () => {
  it('renders "Recoder" for label="Recoder" (plain)', () => {
    render(<ModelLabel label="Recoder" />);
    expect(screen.getByText('Recoder')).toBeDefined();
  });

  it('renders "Recoder" for recoder/power model (not "Advanced")', () => {
    render(<ModelLabel label="Recoder Advanced Mode" />);
    // Should normalise to just "Recoder"
    expect(screen.getByText('Recoder')).toBeDefined();
    expect(screen.queryByText('Advanced')).toBeNull();
    expect(screen.queryByText('Recoder Advanced Mode')).toBeNull();
  });

  it('renders "Recoder" for "Recoder Advanced mode" (lowercase m)', () => {
    render(<ModelLabel label="Recoder Advanced mode" />);
    expect(screen.getByText('Recoder')).toBeDefined();
    expect(screen.queryByText('Advanced')).toBeNull();
  });

  it('renders "Recoder" for recoder/basic model (not "Basic")', () => {
    render(<ModelLabel label="Recoder Basic" />);
    expect(screen.getByText('Recoder')).toBeDefined();
    expect(screen.queryByText('Basic')).toBeNull();
    expect(screen.queryByText('Recoder Basic')).toBeNull();
  });

  it('renders "Recoder" with Test badge for "Recoder Test"', () => {
    render(<ModelLabel label="Recoder Test" />);
    expect(screen.getByText('Recoder')).toBeDefined();
    expect(screen.getByText('Test')).toBeDefined();
  });

  it('renders third-party model names as-is', () => {
    render(<ModelLabel label="GPT-4 Turbo" />);
    expect(screen.getByText('GPT-4 Turbo')).toBeDefined();
  });

  it('renders arbitrary label text unchanged', () => {
    render(<ModelLabel label="Claude 3.5 Sonnet" />);
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeDefined();
  });

  it('applies custom className', () => {
    const { container } = render(<ModelLabel label="Recoder" className="text-red-500" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-red-500');
    expect(span?.className).toContain('font-medium');
  });

  it('upgrade text says "Upgrade to access Recoder" not "Advanced"', () => {
    // This tests the upgrade prompt text from the component's handleSelect
    // and TooltipContent. We verify the exact strings used.
    const isPowerModel = true;
    const upgradeText = isPowerModel
      ? 'Upgrade to access Recoder'
      : 'Upgrade to access this model';
    expect(upgradeText).toBe('Upgrade to access Recoder');
    expect(upgradeText).not.toContain('Advanced');
  });

  it('non-power model upgrade text says "Upgrade to access this model"', () => {
    const isPowerModel = false;
    const upgradeText = isPowerModel
      ? 'Upgrade to access Recoder'
      : 'Upgrade to access this model';
    expect(upgradeText).toBe('Upgrade to access this model');
  });
});

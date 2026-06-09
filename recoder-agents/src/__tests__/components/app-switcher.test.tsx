import { describe, it, expect, vi } from 'vitest';

vi.mock('@recoder/ecosystem-config', () => ({
  getSwitcherApps: vi.fn(() => [
    { id: 'agency', label: 'Agency', description: 'AI Agency Platform', href: 'https://agency.recoder.xyz' },
    { id: 'pm', label: 'PM', description: 'Product Management', href: 'https://pm.recoder.xyz' },
    { id: 'agents', label: 'Agents', description: 'AI Agent IDE', href: 'https://agents.recoder.xyz' },
    { id: 'openclaw', label: 'OpenClaw', description: 'Open-source AI Tools', href: 'https://openclaw.recoder.xyz' },
  ]),
}));

import { getSwitcherApps } from '@recoder/ecosystem-config';

describe('AppSwitcher config', () => {
  it('getSwitcherApps excludes home and ui apps', () => {
    const apps = getSwitcherApps();
    const ids = apps.map((a) => a.id);
    expect(ids).not.toContain('home');
    expect(ids).not.toContain('ui');
  });

  it('all switcher apps have valid href URLs', () => {
    const apps = getSwitcherApps();
    for (const app of apps) {
      expect(app.href).toMatch(/^https:\/\/.*\.recoder\.xyz$/);
    }
  });

  it('agents app is present in switcher', () => {
    const apps = getSwitcherApps();
    const agentsApp = apps.find((a) => a.id === 'agents');
    expect(agentsApp).toBeDefined();
    expect(agentsApp!.label).toBe('Agents');
  });

  it('all switcher apps have label and description', () => {
    const apps = getSwitcherApps();
    for (const app of apps) {
      expect(app.label).toBeTruthy();
      expect(app.description).toBeTruthy();
    }
  });

  it('all switcher apps have unique IDs', () => {
    const apps = getSwitcherApps();
    const ids = apps.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

export type AgentOsSurface =
  | 'agent-cockpit'
  | 'task-console'
  | 'approval-console'
  | 'instruction-provenance'
  | 'oss-registry'
  | 'client-delivery';

export type AgentOsNavItem = {
  surface: AgentOsSurface;
  label: string;
  href: string;
  requiresAuth: boolean;
};

export const AGENT_OS_NAV_ITEMS: AgentOsNavItem[] = [
  { surface: 'agent-cockpit', label: 'Agents', href: '/agent-os', requiresAuth: true },
  { surface: 'task-console', label: 'Runs', href: '/runs', requiresAuth: true },
  { surface: 'approval-console', label: 'Approvals', href: '/approvals', requiresAuth: true },
  { surface: 'instruction-provenance', label: 'Instructions', href: '/instructions', requiresAuth: true },
  { surface: 'oss-registry', label: 'OSS Registry', href: '/oss', requiresAuth: true },
  { surface: 'client-delivery', label: 'Deliveries', href: '/deliveries', requiresAuth: true },
];

export * from './cockpit-summary';

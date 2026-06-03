export interface ProductAction {
  href: string;
  label: string;
  external?: boolean;
}

export interface ActiveProduct {
  id: string;
  name: string;
  eyebrow: string;
  description: string;
  category: 'Core surface' | 'Support surface' | 'Tooling';
  status: 'Current app path' | 'Ready to use' | 'Install or configure';
  primaryAction: ProductAction;
  secondaryAction?: ProductAction;
}

export const ACTIVE_PRODUCTS: readonly ActiveProduct[] = [
  {
    id: 'spaces',
    name: 'Spaces',
    eyebrow: 'Shared workspace and shipping loop',
    description:
      'Create a workspace, connect agents, track the task timeline, open previews, and approve real delivery work from one signed-in path.',
    category: 'Core surface',
    status: 'Current app path',
    primaryAction: {
      href: '/dashboard/spaces',
      label: 'Open Spaces',
    },
    secondaryAction: {
      href: '/dashboard',
      label: 'Open dashboard',
    },
  },
  {
    id: 'agents',
    name: 'Agents',
    eyebrow: 'External agent connection and live execution',
    description:
      'Register Claude Code, Codex, and custom runtimes, then inspect sessions, runs, and workspace execution state.',
    category: 'Core surface',
    status: 'Ready to use',
    primaryAction: {
      href: 'https://agents.recoder.xyz',
      label: 'Open Agents',
      external: true,
    },
    secondaryAction: {
      href: '/agents',
      label: 'See overview',
    },
  },
  {
    id: 'pm',
    name: 'PM',
    eyebrow: 'Task state, approvals, and artifacts',
    description:
      'Review delivery state, task history, approvals, and artifact proof around the execution loop.',
    category: 'Support surface',
    status: 'Ready to use',
    primaryAction: {
      href: 'https://pm.recoder.xyz',
      label: 'Open PM',
      external: true,
    },
    secondaryAction: {
      href: '/platform/pm',
      label: 'See role',
    },
  },
  {
    id: 'agency',
    name: 'Agency',
    eyebrow: 'Delivery packaging for downstream client work',
    description:
      'Use the client-facing wrapper when work needs presentation, packaging, and handoff after the core proof loop is complete.',
    category: 'Support surface',
    status: 'Ready to use',
    primaryAction: {
      href: 'https://agency.recoder.xyz',
      label: 'Open Agency',
      external: true,
    },
    secondaryAction: {
      href: '/platform/agency',
      label: 'See role',
    },
  },
  {
    id: 'cli',
    name: 'CLI',
    eyebrow: 'Terminal entry for Recoder workflows',
    description:
      'Install the CLI, authenticate it to your account, and hand real software work into the same Recoder workflow from your terminal.',
    category: 'Tooling',
    status: 'Install or configure',
    primaryAction: {
      href: '/cli',
      label: 'Open CLI guide',
    },
    secondaryAction: {
      href: 'https://www.npmjs.com/package/recoder-code',
      label: 'View package',
      external: true,
    },
  },
  {
    id: 'docs',
    name: 'Docs',
    eyebrow: 'Setup, A2A, MCP, and BYOK reference',
    description:
      'Read the getting-started path, connection guides, API reference, and operational docs that explain how the product surfaces fit together.',
    category: 'Tooling',
    status: 'Ready to use',
    primaryAction: {
      href: '/docs/getting-started',
      label: 'Read docs',
    },
    secondaryAction: {
      href: '/platform',
      label: 'See platform map',
    },
  },
  {
    id: 'providers',
    name: 'AI Providers',
    eyebrow: 'BYOK model access and budget control',
    description:
      'Connect OpenAI, Anthropic, Google, OpenRouter, or other provider keys so Recoder controls the workflow while you control spend.',
    category: 'Tooling',
    status: 'Install or configure',
    primaryAction: {
      href: '/settings/ai-providers',
      label: 'Manage providers',
    },
    secondaryAction: {
      href: '/pricing',
      label: 'See plans',
    },
  },
] as const;

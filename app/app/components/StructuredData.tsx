/**
 * Structured Data (JSON-LD) components for SEO
 * Helps search engines understand site content and enables rich snippets
 */

export function OrganizationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Recoder.xyz',
    url: 'https://recoder.xyz',
    logo: 'https://recoder.xyz/logo.png',
    sameAs: [
      'https://github.com/recoderxyz',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@recoder.xyz',
      contactType: 'Customer Support',
    },
    description: 'Control plane for external coding agents executing software work across code, preview, task state, and handoff.',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Recoder.xyz',
    url: 'https://recoder.xyz',
    description: 'Connect external coding agents to execute software work with BYOK workflow control and runtime visibility.',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function SoftwareApplicationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Recoder CLI',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Bring your own provider keys and route external coding agents through Recoder workflow control.',
    },
    description: 'Terminal and MCP entrypoint for external coding agents with BYOK routing and shared execution context.',
    downloadUrl: 'https://www.npmjs.com/package/recoder-code',
    screenshot: 'https://recoder.xyz/og-image.png',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebApplicationSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Recoder Web IDE',
    applicationCategory: 'DeveloperApplication',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Bring your own provider keys and run software work in the browser runtime lane with preview capture.',
    },
    description: 'Browser runtime lane for connected coding agents with live preview, code execution, and artifact capture.',
    url: 'https://web.recoder.xyz',
    screenshot: 'https://recoder.xyz/og-image.png',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FAQPageSchema() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What does Recoder do?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Recoder connects external coding agents to runtime, preview, task state, and handoff so teams can execute real software work with control.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is BYOK (Bring Your Own Key)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'BYOK means you connect your own provider keys from OpenRouter, Anthropic, OpenAI, Google, or similar vendors. Recoder encrypts stored keys and you pay the provider directly.',
        },
      },
      {
        '@type': 'Question',
        name: 'What are teams paying for?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Teams pay Recoder for workflow control, approvals, artifacts, run visibility, and multi-surface execution rather than subsidized tokens.',
        },
      },
      {
        '@type': 'Question',
        name: 'How do external agents connect?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Agents connect through MCP and A2A surfaces so Claude Code, Codex, and custom runtimes can execute tasks with shared task and artifact state.',
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Platform Service Schemas (Product-level JSON-LD for each Recoder service)
// ---------------------------------------------------------------------------

interface PlatformServiceSchemaProps {
  name: string;
  description: string;
  url: string;
  applicationCategory: string;
}

/**
 * Reusable component that renders a SoftwareApplication JSON-LD schema
 * for a single platform service.
 */
export function PlatformServiceSchema({
  name,
  description,
  url,
  applicationCategory,
}: PlatformServiceSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    url,
    applicationCategory,
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free tier available',
    },
    isPartOf: {
      '@type': 'SoftwareApplication',
      name: 'Recoder.xyz',
      url: 'https://recoder.xyz',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// --- Individual service schema components ---

export function RecoderAgentsSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Agents"
      description="Connection and execution surface for external coding agents with run visibility, task routing, and runtime access."
      url="https://recoder.xyz/platform/agents"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderAgencySchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Agency"
      description="Optional client-facing delivery wrapper for packaging approved outputs from the Recoder agent work loop."
      url="https://recoder.xyz/platform/agency"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderWebSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Web IDE"
      description="Browser runtime lane with preview, logs, terminal access, and artifact capture for connected external coding agents."
      url="https://recoder.xyz/platform/web"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderPMSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder PM"
      description="Task state, approvals, artifacts, and status visibility that wrap around the Recoder software execution loop."
      url="https://recoder.xyz/platform/pm"
      applicationCategory="ProjectManagement"
    />
  );
}

export function RecoderAPISchema() {
  return (
    <PlatformServiceSchema
      name="Recoder API"
      description="API and bridge layer for A2A, MCP, BYOK routing, run history, and the external-agent control plane."
      url="https://recoder.xyz/platform/api"
      applicationCategory="DeveloperApplication"
    />
  );
}

/**
 * Renders JSON-LD schemas for all platform services at once.
 * Drop this into the platform layout to emit every service schema in one shot.
 */
export function AllPlatformServicesSchema() {
  return (
    <>
      <RecoderAgentsSchema />
      <RecoderAgencySchema />
      <RecoderWebSchema />
      <RecoderPMSchema />
      <RecoderAPISchema />
    </>
  );
}

export function BreadcrumbSchema({ items }: { items: Array<{ name: string; url: string }> }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

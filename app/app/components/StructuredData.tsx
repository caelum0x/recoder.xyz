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
    description: 'BYOK-first AI development platform for agents, CLI, browser coding, PM, and agency workflows.',
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
    description: 'BYOK-first AI development platform for agents, browser coding, CLI, PM, and agency workflows.',
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
      description: 'Bring your own provider key and use Recoder across CLI and browser surfaces.',
    },
    description: 'Terminal-first AI coding tool with provider flexibility, agent workflows, and browser sync.',
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
      description: 'Bring your own provider key and use the browser coding workspace directly.',
    },
    description: 'Browser-based AI workspace with live preview, coding assistance, and BYOK provider support.',
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
        name: 'Is Recoder.xyz really free?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Recoder is BYOK-first. You connect your own provider keys so you keep model choice and pay providers directly.',
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
        name: 'How does Web ↔ CLI sync work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Recoder is designed so teams can move between browser and terminal surfaces without changing the overall workflow or provider setup.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI models are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Recoder supports a broad multi-provider model stack through connected vendors such as OpenRouter, Anthropic, OpenAI, and Google.',
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
      description="AI agent IDE with multi-turn conversations, 40+ model support, agent configuration, snapshots, and real-time monitoring."
      url="https://recoder.xyz/platform/agents"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderAgencySchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Agency"
      description="AI-powered agency workflows for managing clients, projects, quotes, and deliverables with template library and client portal."
      url="https://recoder.xyz/platform/agency"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderWebSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Web IDE"
      description="Browser-based AI IDE supporting 40+ AI models via BYOK, real-time preview, integrated terminal, and instant deployment for full-stack development."
      url="https://recoder.xyz/platform/web"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderPMSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder PM"
      description="AI-powered project management with task tracking, sprint management, AI agent task assignment, cross-platform coordination, project analytics, and workflow automation."
      url="https://recoder.xyz/platform/pm"
      applicationCategory="ProjectManagement"
    />
  );
}

export function RecoderAPISchema() {
  return (
    <PlatformServiceSchema
      name="Recoder API"
      description="Unified API gateway and task engine with real-time streaming, queue management, rate limiting, BYOK proxy, public API versioning, and A2A (Agent-to-Agent) protocol support."
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

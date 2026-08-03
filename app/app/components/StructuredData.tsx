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
      'https://github.com/recoder-xyz',
      'https://twitter.com/recoderxyz',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'support@recoder.xyz',
      contactType: 'Customer Support',
    },
    description: 'Self-hosted desktop workspace that runs coding agents in parallel isolated git worktrees, then helps you review and merge the best result. BYOK (Bring Your Own Key).',
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
    name: 'Recoder Desktop',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free with BYOK (Bring Your Own Key)',
    },
    description: 'Desktop workspace that runs coding agents like Claude Code, Codex, and opencode in parallel isolated git worktrees, then helps you review and merge the best result.',
    downloadUrl: 'https://recoder.xyz/download',
    screenshot: 'https://recoder.xyz/cli-screenshot.png',
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
    '@type': 'SoftwareApplication',
    name: 'Recoder Desktop',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Windows, Linux',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: 'Free with BYOK',
    },
    description: 'Self-hosted desktop workspace that runs coding agents in parallel isolated git worktrees with review and merge tooling.',
    url: 'https://recoder.xyz/download',
    screenshot: 'https://recoder.xyz/web-ide-screenshot.png',
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
          text: 'Yes! During our FREE BETA, all features are 100% free. Just bring your own API key (BYOK) from OpenRouter, Anthropic, OpenAI, or Groq.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is BYOK (Bring Your Own Key)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'BYOK means you use your own API keys from AI providers. We encrypt them with AES-256-GCM and never see your usage or conversations. You only pay the AI provider directly.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does Recoder run my coding agents?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Recoder is a desktop app that runs the agent CLIs you already use — Claude Code, Codex, opencode, and more — in parallel isolated git worktrees. When the runs finish, you compare the diffs side by side and merge the best result.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI models are supported?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We support 40+ models including Claude 3.5 Sonnet, GPT-4 Turbo, Gemini Pro, Groq LLaMA, and more through OpenRouter, Anthropic, OpenAI, and Groq APIs.',
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
      name="Recoder Desktop"
      description="Desktop workspace that runs coding agents in parallel isolated git worktrees with BYOK, live terminals per run, and side-by-side diff review and merge."
      url="https://recoder.xyz/download"
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

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
    description: 'The only AI coding platform with seamless Web IDE + Terminal CLI sync. 100% FREE beta with BYOK (Bring Your Own Key).',
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
      description: '100% FREE beta with BYOK (Bring Your Own Key)',
    },
    description: 'Terminal-first AI coding tool with 40+ AI models. Seamlessly sync with Web IDE.',
    softwareVersion: '2.4.4',
    downloadUrl: 'https://www.npmjs.com/package/recoder-code',
    screenshot: 'https://recoder.xyz/cli-screenshot.png',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '100',
    },
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
      description: '100% FREE beta with BYOK',
    },
    description: 'Browser-based AI coding IDE with live preview and 40+ AI models.',
    url: 'https://web.recoder.xyz',
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
        name: 'How does Web ↔ CLI sync work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Start projects in our Web IDE, then download them locally with "recoder web download <id>". Edit with any editor, then sync back with "recoder web sync". Seamless workflow between browser and terminal.',
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

export function RecoderStudioSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Studio"
      description="Visual AI workflow designer for building, simulating, and deploying AI agent pipelines with drag-and-drop interface, canary deployments, simulation gates, and real-time monitoring."
      url="https://recoder.xyz/platform/studio"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderAgencySchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Agency"
      description="Multi-agent orchestration platform for building, deploying, and managing collaborative AI agent workflows with role definitions, inter-agent communication, custom triggers, and performance monitoring."
      url="https://recoder.xyz/platform/agency"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderFrontendSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Frontend"
      description="Autonomous AI coding environment with browser automation, sandboxed execution, multi-model support including Claude, GPT-4, and Gemini, Git integration, and end-to-end development workflow automation."
      url="https://recoder.xyz/platform/frontend"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function RecoderWebSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Web"
      description="Browser-based AI IDE supporting 40+ AI models via BYOK, real-time preview, integrated terminal, WebContainer-based execution, and instant deployment for full-stack development."
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

export function RecoderBackendSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Backend"
      description="FastAPI AI processing engine handling multi-model orchestration, sandbox management, browser automation, file operations, and real-time agent execution with scalable async architecture."
      url="https://recoder.xyz/platform/backend"
      applicationCategory="DeveloperApplication"
    />
  );
}

export function OpenClawSchema() {
  return (
    <PlatformServiceSchema
      name="OpenClaw"
      description="Open-source AI agent framework with CLI workflow management, plugin and extension system, lane-based parallel execution, diagnostics, and JSON schema for DevOps automation."
      url="https://recoder.xyz/platform/openclaw"
      applicationCategory="DeveloperApplication"
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

export function RecoderChatSchema() {
  return (
    <PlatformServiceSchema
      name="Recoder Chat"
      description="AI conversation interface for coding assistance with multi-AI model conversations, code context awareness, artifact generation, and cross-platform session synchronization."
      url="https://recoder.xyz/platform/chat"
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
      <RecoderStudioSchema />
      <RecoderAgencySchema />
      <RecoderFrontendSchema />
      <RecoderWebSchema />
      <RecoderPMSchema />
      <RecoderBackendSchema />
      <OpenClawSchema />
      <RecoderAPISchema />
      <RecoderChatSchema />
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

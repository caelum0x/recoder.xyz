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

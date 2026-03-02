import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

// ---------------------------------------------------------------------------
// Post data
// ---------------------------------------------------------------------------

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  content: string;
}

const posts: BlogPost[] = [
  {
    slug: 'introducing-recoder-xyz',
    title:
      'Introducing Recoder.xyz — Free AI Coding Platform with 40+ Models',
    excerpt:
      'Today we are launching Recoder.xyz into public beta: a completely free AI coding platform that gives every developer access to 40+ models through both a browser-based Web IDE and a terminal CLI.',
    date: '2025-02-10',
    author: 'Recoder Team',
    category: 'Launch',
    readTime: '6 min read',
    content: `# Introducing Recoder.xyz

We started Recoder because we were frustrated. The best AI coding tools were either expensive, locked to a single model, or forced you to choose between a terminal and a browser. We thought developers deserved something better: a platform that is completely free during beta, supports every major model family, and lets you work wherever you are most productive.

Today we are making that vision real. Recoder.xyz is now in public beta.

## What Recoder gives you

At its core, Recoder is two things that stay perfectly in sync: a **terminal CLI** and a **browser-based Web IDE**. Start a session from your laptop, review generated code in the browser on your tablet, then push to production from either surface. Your context, files, and agent state travel with you.

Under the hood you get access to **more than 40 AI models** — Claude 3.5 Sonnet and Claude Opus from Anthropic, the full GPT-4 family from OpenAI, Gemini 2.0 Flash and Pro from Google, DeepSeek R1 for advanced reasoning, and dozens more through OpenRouter. Every model is available through a single, consistent interface with no vendor lock-in.

## Why free?

We believe AI-powered development should be accessible to everyone, not just teams with enterprise budgets. During the beta period every feature of the platform is available at no cost. If you prefer to bring your own API keys (what we call **BYOK — Bring Your Own Key**), you can plug them in and pay your provider directly. If you do not have keys yet, Recoder includes shared access so you can try things immediately.

## Key capabilities

### Multi-model routing
Different problems benefit from different models. Recoder routes your request to the best available model for the task — or lets you pick one explicitly. Need Claude for nuanced reasoning? GPT-4 for broad general knowledge? Gemini for multimodal input? Switch in a single keystroke.

### 17 pre-configured MCP servers
Out of the box Recoder connects to GitHub, Slack, PostgreSQL, Redis, Linear, Notion, and more through the Model Context Protocol. Your AI agents can read issues, post messages, query databases, and trigger deployments without any manual plumbing.

### Prompt caching and cost optimization
Recoder's caching layer intercepts repeated context windows and deduplicates them before they hit the model API. Early users are seeing **50 to 90 percent savings** on token costs compared to raw API calls. Even if you are on a free shared quota, caching makes the whole platform faster and more responsive.

### Sandbox execution
Every code-generation session can run inside an isolated Docker sandbox. The AI can install packages, run tests, and iterate on errors without touching your host machine. When you are happy with the result, promote the output to your real project with a single command.

## Getting started

Install the CLI with a single command:

\`\`\`bash
npm install -g recoder-code
recoder-code
\`\`\`

Or open the Web IDE at [https://recoder.xyz](https://recoder.xyz) and sign up. No credit card, no trial timer — just start building.

## What is next

This launch is only the beginning. Over the coming months we will be shipping:

- **Custom AI agents** — build and share agents tuned to your workflow.
- **Team workspaces** — collaborate on projects with shared context and permissions.
- **Enterprise tier** — SOC 2 compliance, SSO, audit logs, and dedicated support.
- **Plugin marketplace** — extend Recoder with community-built MCP servers and tools.

We are building Recoder in public and our roadmap is shaped by community feedback. Join our Discord, open issues on GitHub, and tell us what you need.

Welcome aboard. We cannot wait to see what you build.`,
  },
  {
    slug: 'why-we-built-byok',
    title: 'Why We Built BYOK (Bring Your Own Key) Support',
    excerpt:
      'Most AI coding tools lock you into a single provider and a fixed monthly bill. BYOK lets you plug in your own keys and pay only for what you use.',
    date: '2025-02-17',
    author: 'Recoder Team',
    category: 'Product',
    readTime: '5 min read',
    content: `# Why We Built BYOK

BYOK stands for Bring Your Own Key. Instead of funneling every request through a single vendor, Recoder lets you plug in API keys from OpenAI, Anthropic, Google, Mistral, or any OpenRouter-compatible provider. Your keys are encrypted at rest and never logged.

## The problem with flat-rate AI

Most AI coding platforms charge a fixed monthly subscription and cap your usage. If you are an occasional user you overpay; if you are a power user you hit limits. Neither outcome is great.

With BYOK, you pay your model provider directly, at their published per-token rates. Recoder takes zero margin on API calls. Combined with our prompt-caching layer, this means you get high-quality AI assistance at the lowest possible cost.

## How it works

1. Go to **Settings > API Keys** in the Web IDE or run \`recoder-code config\` in the CLI.
2. Paste your key for one or more providers.
3. Recoder encrypts the key with AES-256-GCM and stores it server-side.
4. When you make a request, Recoder attaches your key and routes it to the provider.

You can also run models locally through Ollama. Point Recoder at your local endpoint and every request stays on your machine.

## Why this matters

- **No vendor lock-in.** Switch providers any time.
- **Full cost transparency.** See exactly what each session costs.
- **Privacy.** Your code and prompts go directly to the provider you chose, not through a middleman.
- **Access to every model.** New model released today? Add the key and use it immediately.

BYOK is one of the foundational decisions we made early on. It keeps Recoder honest and keeps you in control.`,
  },
  {
    slug: 'cli-web-ide-cross-platform',
    title: 'Recoder CLI + Web IDE: Seamless Cross-Platform Development',
    excerpt:
      'Start a coding session in your terminal, pick it up in the browser, and push to production from either surface.',
    date: '2025-02-24',
    author: 'Recoder Team',
    category: 'Engineering',
    readTime: '7 min read',
    content: `# CLI + Web IDE: Cross-Platform Development

Most AI coding tools force a choice: terminal or browser. We built Recoder so you never have to pick.

## Two surfaces, one session

The Recoder CLI (\`recoder-code\`) and the Recoder Web IDE share the same backend session. When the AI generates a file in your terminal, it appears in the browser instantly. When you edit a file in the Web IDE, the CLI picks up the change. Conversation history, agent state, and file diffs are synchronized in real time over WebSocket connections.

## Why this matters

### Flow state
Some tasks are faster in a terminal: running tests, grepping logs, piping output. Other tasks benefit from a visual canvas: reviewing diffs, browsing file trees, previewing a UI. With Recoder you switch between them without losing context.

### Device flexibility
Start a session on your desktop CLI, commute, and resume on your laptop or tablet in the Web IDE. The session is tied to your account, not your device.

### Pair programming with AI
Open the Web IDE side-by-side with your regular editor. Let the AI prototype in the Web IDE sandbox while you write production code locally. Merge the results when you are ready.

## Architecture overview

\`\`\`
CLI  <-->  Session API  <-->  Web IDE
             |
         Agent Runtime
             |
      Sandbox (Docker)
\`\`\`

The Session API is the single source of truth. Both the CLI and Web IDE are thin clients that send user input and render agent output. The Agent Runtime manages model calls, tool execution, and MCP server connections. Sandboxed execution happens in Docker containers that persist for the lifetime of the session.

## Getting started

Install the CLI:

\`\`\`bash
npm install -g recoder-code
recoder-code
\`\`\`

Then open [https://recoder.xyz](https://recoder.xyz) in a browser and sign in with the same account. Your active session will appear automatically.

We are constantly improving the sync layer. If you run into edge cases, let us know on Discord or GitHub — your feedback shapes the roadmap.`,
  },
];

function getPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

// ---------------------------------------------------------------------------
// Static generation
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      url: `https://recoder.xyz/blog/${post.slug}`,
      siteName: 'Recoder.xyz',
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: [
        {
          url: 'https://recoder.xyz/og-image.png',
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      creator: '@recoderxyz',
      images: ['https://recoder.xyz/og-image.png'],
    },
    alternates: {
      canonical: `https://recoder.xyz/blog/${post.slug}`,
    },
  };
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (no dependencies)
// ---------------------------------------------------------------------------

function renderMarkdown(raw: string) {
  const lines = raw.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={elements.length}
          className="my-6 rounded-lg bg-[#0d0d0d] border border-white/10 p-4 overflow-x-auto"
        >
          <code className="text-sm text-gray-300 font-mono leading-relaxed">
            {codeLines.join('\n')}
          </code>
        </pre>,
      );
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h3
          key={elements.length}
          className="text-xl font-semibold mt-10 mb-4 text-white"
        >
          {renderInline(line.slice(4))}
        </h3>,
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2
          key={elements.length}
          className="text-2xl font-bold mt-12 mb-5 text-white"
        >
          {renderInline(line.slice(3))}
        </h2>,
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      // Skip the top-level heading since we render the title separately
      i++;
      continue;
    }

    // Unordered list
    if (line.trimStart().startsWith('- ')) {
      const listItems: React.ReactNode[] = [];
      while (
        i < lines.length &&
        lines[i].trimStart().startsWith('- ')
      ) {
        listItems.push(
          <li key={listItems.length} className="text-gray-300 leading-relaxed">
            {renderInline(lines[i].trimStart().slice(2))}
          </li>,
        );
        i++;
      }
      elements.push(
        <ul
          key={elements.length}
          className="my-4 ml-6 list-disc space-y-2"
        >
          {listItems}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line.trimStart())) {
      const listItems: React.ReactNode[] = [];
      while (
        i < lines.length &&
        /^\d+\.\s/.test(lines[i].trimStart())
      ) {
        const text = lines[i].trimStart().replace(/^\d+\.\s/, '');
        listItems.push(
          <li key={listItems.length} className="text-gray-300 leading-relaxed">
            {renderInline(text)}
          </li>,
        );
        i++;
      }
      elements.push(
        <ol
          key={elements.length}
          className="my-4 ml-6 list-decimal space-y-2"
        >
          {listItems}
        </ol>,
      );
      continue;
    }

    // Paragraph (collect consecutive non-blank lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].trimStart().startsWith('- ') &&
      !lines[i].trim().startsWith('```') &&
      !/^\d+\.\s/.test(lines[i].trimStart())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p
          key={elements.length}
          className="text-gray-300 leading-relaxed mb-4"
        >
          {renderInline(paraLines.join(' '))}
        </p>,
      );
    }
  }

  return elements;
}

/** Render bold, inline code, and links inside a text string. */
function renderInline(text: string): React.ReactNode {
  // Split by **bold**, `code`, and [text](url)
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold
      parts.push(
        <strong key={parts.length} className="text-white font-semibold">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // Inline code
      parts.push(
        <code
          key={parts.length}
          className="px-1.5 py-0.5 bg-white/10 rounded text-orange-400 text-sm font-mono"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5]) {
      // Link
      parts.push(
        <a
          key={parts.length}
          href={match[7]}
          className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          {match[6]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function categoryColor(category: string): string {
  switch (category) {
    case 'Launch':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    case 'Product':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
    case 'Engineering':
      return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
    default:
      return 'bg-white/10 text-gray-400 border-white/20';
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Breadcrumb */}
      <div className="pt-20 pb-4 px-6">
        <div className="container mx-auto max-w-3xl">
          <nav className="flex items-center space-x-2 text-sm text-gray-500">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/blog" className="hover:text-white transition-colors">
              Blog
            </Link>
            <span>/</span>
            <span className="text-gray-400 truncate">{post.title}</span>
          </nav>
        </div>
      </div>

      {/* Article */}
      <article className="px-6 pb-24">
        <div className="container mx-auto max-w-3xl">
          {/* Category badge */}
          <div className="mb-5">
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${categoryColor(post.category)}`}
            >
              {post.category}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-6">
            {post.title}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-5 text-sm text-gray-400 mb-10 pb-8 border-b border-white/10">
            <span>{post.author}</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>{post.readTime}</span>
          </div>

          {/* Body */}
          <div className="max-w-none">{renderMarkdown(post.content)}</div>

          {/* Back link */}
          <div className="mt-16 pt-8 border-t border-white/10">
            <Link
              href="/blog"
              className="inline-flex items-center text-orange-400 hover:text-orange-300 font-medium transition-colors"
            >
              &larr;&nbsp; Back to all posts
            </Link>
          </div>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}

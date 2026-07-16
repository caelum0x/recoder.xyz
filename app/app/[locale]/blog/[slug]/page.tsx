import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getBlogPostBySlug } from '@/lib/cms/blog';
import { fallbackBlogPosts } from '@/lib/cms/blog-content';

// ---------------------------------------------------------------------------
// Static generation
// ---------------------------------------------------------------------------

export function generateStaticParams() {
  return fallbackBlogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
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
          className="my-6 rounded-lg bg-zinc-950 border border-white/10 p-4 overflow-x-auto"
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
  const post = await getBlogPostBySlug(slug);

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

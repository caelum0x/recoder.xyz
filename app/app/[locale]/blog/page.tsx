import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { getBlogPosts } from '@/lib/cms/blog';

export const metadata: Metadata = {
  title: 'Blog - Engineering & Product Updates | Recoder.xyz',
  description:
    'Engineering insights, product updates, and deep dives from the Recoder team. Learn about AI-powered development, BYOK architecture, and the future of coding tools.',
};

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

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero */}
      <section className="pt-20 pb-16 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-500 bg-clip-text text-transparent">
              Blog
            </span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Engineering and product updates from the Recoder team.
          </p>
        </div>
      </section>

      {/* Posts Grid */}
      <section className="pb-24 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group relative flex flex-col bg-zinc-900 border border-white/10 rounded-xl overflow-hidden hover:border-white/25 transition-all"
              >
                {/* Gradient banner */}
                <div className="h-2 w-full bg-gradient-to-r from-orange-500 via-purple-500 to-cyan-500" />

                <div className="flex flex-col flex-1 p-6">
                  {/* Category + read time */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-full border ${categoryColor(post.category)}`}
                    >
                      {post.category}
                    </span>
                    <span className="text-xs text-gray-500">
                      {post.readTime}
                    </span>
                  </div>

                  {/* Title */}
                  <h2 className="text-lg font-semibold mb-3 leading-snug group-hover:text-orange-400 transition-colors">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  <p className="text-sm text-gray-400 leading-relaxed mb-6 flex-1">
                    {post.excerpt}
                  </p>

                  {/* Footer: author + date */}
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-white/5">
                    <span>{post.author}</span>
                    <time dateTime={post.date}>{formatDate(post.date)}</time>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

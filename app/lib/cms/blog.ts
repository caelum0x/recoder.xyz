import { cache } from 'react';
import type { BlogPost } from '@/lib/cms/blog-content';
import { fallbackBlogPosts } from '@/lib/cms/blog-content';
import {
  getPayloadClient,
  isPayloadCmsEnabled,
  logPayloadCmsError,
} from '@/lib/cms/payload';

function formatDateValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function mapBlogPost(doc: any): BlogPost | null {
  if (!doc?.slug || !doc?.title || !doc?.excerpt || !doc?.content) {
    return null;
  }

  return {
    slug: String(doc.slug),
    title: String(doc.title),
    excerpt: String(doc.excerpt),
    date: formatDateValue(
      typeof doc.publishedAt === 'string' ? doc.publishedAt : '',
    ),
    author: typeof doc.author === 'string' ? doc.author : 'Recoder Team',
    category: typeof doc.category === 'string' ? doc.category : 'Product',
    readTime: typeof doc.readTime === 'string' ? doc.readTime : '5 min read',
    content: String(doc.content),
  };
}

const fetchBlogPosts = cache(async (): Promise<BlogPost[]> => {
  if (!isPayloadCmsEnabled()) {
    return fallbackBlogPosts;
  }

  const payload = await getPayloadClient();
  if (!payload) {
    return fallbackBlogPosts;
  }

  try {
    const result = await payload.find({
      collection: 'blog-posts',
      depth: 0,
      limit: 100,
      pagination: false,
      overrideAccess: true,
      sort: '-publishedAt',
      where: {
        _status: {
          equals: 'published',
        },
      },
    });

    const posts = result.docs
      .map(mapBlogPost)
      .filter(Boolean) as BlogPost[];

    return posts.length > 0 ? posts : fallbackBlogPosts;
  } catch (error) {
    logPayloadCmsError('failed to load blog posts', error);
    return fallbackBlogPosts;
  }
});

export async function getBlogPosts(): Promise<BlogPost[]> {
  return fetchBlogPosts();
}

export async function getBlogPostBySlug(
  slug: string,
): Promise<BlogPost | undefined> {
  const posts = await getBlogPosts();
  return posts.find((post) => post.slug === slug);
}

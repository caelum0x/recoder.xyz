import type { CollectionConfig } from 'payload';
import { indexNowAfterChange, indexNowAfterDelete } from '../hooks/indexnow';

/** Public URL(s) a blog-post doc maps to: its own page plus the /blog index. */
function blogPostPaths(doc: Record<string, unknown>): string[] {
  const slug = typeof doc.slug === 'string' ? doc.slug : '';
  return slug ? [`/blog/${slug}`, '/blog'] : ['/blog'];
}

export const BlogPosts: CollectionConfig = {
  slug: 'blog-posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: true,
  },
  hooks: {
    // Notify search engines the moment a post is published/updated or removed.
    // Degrade-safe + fire-and-forget: never blocks or fails the CMS write.
    afterChange: [indexNowAfterChange('blog-posts', blogPostPaths)],
    afterDelete: [indexNowAfterDelete('blog-posts', blogPostPaths)],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
    },
    {
      name: 'author',
      type: 'text',
      defaultValue: 'Recoder Team',
      required: true,
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'Product',
      options: [
        { label: 'Launch', value: 'Launch' },
        { label: 'Product', value: 'Product' },
        { label: 'Engineering', value: 'Engineering' },
      ],
    },
    {
      name: 'readTime',
      type: 'text',
      defaultValue: '5 min read',
      required: true,
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
    },
  ],
};

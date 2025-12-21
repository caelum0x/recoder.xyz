# Next.js Blog with MDX

A modern, fast blog built with Next.js 14, MDX, and Tailwind CSS.

## Features

- **MDX Support**: Write blog posts in Markdown with React components
- **Syntax Highlighting**: Code blocks with highlight.js
- **Categories & Tags**: Organize posts by category and tags
- **Reading Time**: Automatic reading time estimation
- **RSS Feed**: Auto-generated RSS feed at `/feed.xml`
- **SEO Optimized**: Meta tags, Open Graph, Twitter Cards
- **Responsive Design**: Mobile-first design with Tailwind CSS
- **Fast Performance**: Static generation with ISR support

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Writing Blog Posts

Create a new MDX file in `content/posts/`:

```mdx
---
title: "My First Post"
date: "2025-01-15"
category: "tutorial"
tags: ["nextjs", "react", "mdx"]
excerpt: "Learn how to build a blog with Next.js and MDX"
author: "Your Name"
---

# My First Post

Your content here...
```

## Project Structure

```
nextjs-blog-mdx/
├── app/                    # Next.js App Router
│   ├── page.tsx           # Home page (post list)
│   ├── blog/[slug]/       # Individual blog post pages
│   ├── category/[name]/   # Category pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── PostCard.tsx      # Post preview card
│   ├── Header.tsx        # Site header
│   └── MDXContent.tsx    # MDX renderer
├── content/posts/        # Your MDX blog posts
├── lib/                  # Utility functions
│   ├── posts.ts         # Post fetching logic
│   └── rss.ts           # RSS feed generation
└── public/              # Static assets
```

## Customization

### Change Site Info

Edit `app/layout.tsx` to update site name, description, and metadata.

### Styling

This template uses Tailwind CSS. Customize `tailwind.config.ts` and `app/globals.css`.

### Add Categories

Categories are automatically extracted from post frontmatter. Just add `category: "your-category"` to any post.

## Deployment

Deploy to Vercel, Netlify, or any platform supporting Next.js:

```bash
npm run build
npm start
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [MDX Documentation](https://mdxjs.com/)
- [Tailwind CSS](https://tailwindcss.com/)
